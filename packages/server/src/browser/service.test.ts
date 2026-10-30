import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BrowserEngine, BrowserScope, BrowserTabInfo } from "@thinkrail/contracts";
import { materializeBrowserArtifact, resolveBrowserUpload } from "./artifacts";
import { BrowserService } from "./service";

const roots: string[] = [];
afterEach(async () => {
	for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture() {
	const root = await mkdtemp(join(tmpdir(), "pideck-browser-service-"));
	roots.push(root);
	const tabs: BrowserTabInfo[] = [{ id: "human", title: "Fixture", url: "http://localhost" }];
	const executed: string[] = [];
	const engine: BrowserEngine = {
		async workbench(request) {
			if (request.action === "new") tabs.push({ id: "created", title: "", url: "" });
			if (request.action === "close")
				tabs.splice(
					tabs.findIndex((t) => t.id === request.tabId),
					1,
				);
			const tabId = request.action === "new" ? "created" : request.tabId;
			return { tabs: [...tabs], ...(tabId ? { tabId } : {}), viewId: 7 };
		},
		async execute(scope, command) {
			executed.push(scope.sessionId);
			return { data: command.action };
		},
		async release() {},
	};
	const scope = (sessionId: string): BrowserScope => ({
		sessionId,
		workspaceId: "workspace",
		workspacePath: root,
	});
	const service = new BrowserService(
		engine,
		(id) => (id.startsWith("chat") ? scope(id) : undefined),
		() => root,
	);
	return { root, service, tabs, executed, engine };
}

test("top-level Pi identity is authoritative; a claimed human tab is exclusive", async () => {
	const { service, executed } = await fixture();
	await expect(service.executeSession("child", { action: "list" })).rejects.toThrow("top-level");
	await expect(
		service.executeSession("chat-a", { action: "click", tabId: "human" }),
	).rejects.toThrow("claim");
	await service.executeSession("chat-a", { action: "claimTab", tabId: "human" });
	await expect(
		service.executeSession("chat-b", { action: "claimTab", tabId: "human" }),
	).rejects.toThrow("another");
	await expect(
		service.executeSession("chat-b", { action: "click", tabId: "human" }),
	).rejects.toThrow("claim");
	await service.executeSession("chat-a", { action: "click", tabId: "human" });
	expect(executed).toEqual(["chat-a"]);
	await service.releaseSession("chat-a");
	await service.executeSession("chat-b", { action: "claimTab", tabId: "human" });
});

test("finalize closes only agent-created pages; human claims survive and are released", async () => {
	const { service, tabs } = await fixture();
	await service.executeSession("chat-a", { action: "claimTab", tabId: "human" });
	await service.executeSession("chat-a", { action: "newTab" });
	await service.executeSession("chat-a", { action: "finalize" });
	expect(tabs.map((t) => t.id)).toEqual(["human"]);
	await service.executeSession("chat-b", { action: "claimTab", tabId: "human" });
});

test("artifacts cannot escape or replace workspace files; uploads reject symlink escape", async () => {
	const { root } = await fixture();
	const temporaryPath = join(root, "source.webm");
	await writeFile(temporaryPath, "video");
	const artifact = { temporaryPath, mimeType: "video/webm" as const, bytes: 5 };
	await mkdir(join(root, "workspace"));
	const workspace = join(root, "workspace");
	await expect(materializeBrowserArtifact(workspace, artifact, "../escape.webm")).rejects.toThrow();
	await symlink(root, join(workspace, "escape"));
	await expect(
		materializeBrowserArtifact(workspace, artifact, "escape/out.webm"),
	).rejects.toThrow();
	await expect(resolveBrowserUpload(workspace, "escape/source.webm")).rejects.toThrow();
	const result = await materializeBrowserArtifact(workspace, artifact, "recordings/demo.webm");
	expect(await readFile(join(workspace, result.path), "utf8")).toBe("video");
	await expect(materializeBrowserArtifact(workspace, artifact, result.path)).rejects.toThrow();
});

test("catalog creation reserves ownership before another chat can discover the new tab", async () => {
	const { service, engine, tabs } = await fixture();
	const base = engine.workbench;
	let resume: () => void = () => {};
	const gate = new Promise<void>((resolve) => {
		resume = resolve;
	});
	engine.workbench = async (request) => {
		const result = await base(request);
		if (request.action === "new") await gate;
		return result;
	};
	const creating = service.executeSession("chat-a", { action: "newTab" });
	while (!tabs.some((tab) => tab.id === "created")) await Bun.sleep(1);
	let listed = false;
	const listing = service.executeSession("chat-b", { action: "list" }).then((result) => {
		listed = true;
		return result;
	});
	await Bun.sleep(5);
	expect(listed).toBe(false);
	resume();
	await creating;
	expect((await listing).data).toEqual([
		{ id: "human", title: "Fixture", url: "http://localhost" },
	]);
});

test("recording status can choose an output path after automatic delivery and preserves that receipt", async () => {
	const { root, service, engine } = await fixture();
	await writeFile(join(root, "automatic.webm"), "video");
	engine.execute = async () => ({
		recording: {
			id: "recording",
			tabId: "human",
			phase: "completed",
			startedAt: 1,
			artifact: { path: "automatic.webm", bytes: 5, mimeType: "video/webm" },
		},
	});
	await service.executeSession("chat-a", { action: "claimTab", tabId: "human" });
	const command = { action: "recordingStatus" as const, tabId: "human", recordingId: "recording" };
	const saved = await service.executeSession("chat-a", {
		...command,
		outputPath: "chosen/demo.webm",
	});
	expect(saved.recording?.artifact?.path).toBe("chosen/demo.webm");
	expect(await readFile(join(root, "chosen/demo.webm"), "utf8")).toBe("video");
	expect((await service.executeSession("chat-a", command)).recording?.artifact?.path).toBe(
		"chosen/demo.webm",
	);
	await expect(
		service.executeSession("chat-a", { ...command, outputPath: "../escape.webm" }),
	).rejects.toThrow();
	expect((await service.executeSession("chat-a", command)).artifact?.path).toBe("chosen/demo.webm");
});

test("settling a chat also cancels a tab operation still waiting for native readiness", async () => {
	const { service, engine, tabs, executed } = await fixture();
	const base = engine.workbench;
	let resume: () => void = () => {};
	const gate = new Promise<void>((resolve) => {
		resume = resolve;
	});
	engine.workbench = async (request) => {
		const result = await base(request);
		if (request.action === "new") await gate;
		return result;
	};
	const creating = service.executeSession("chat-a", { action: "newTab", url: "http://localhost" });
	creating.catch(() => {});
	while (!tabs.some((tab) => tab.id === "created")) await Bun.sleep(1);
	await service.settled("chat-a");
	resume();
	await expect(creating).rejects.toThrow();
	expect(executed).toEqual([]);
	await service.executeSession("chat-b", { action: "claimTab", tabId: "created" });
});
