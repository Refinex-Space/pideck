import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LspStatusPayload, Project, Workspace } from "@thinkrail/contracts";
import { lspManager, resetLspConfig, updateLspConfig } from "../lsp";
import { saveProjects } from "../persistence";
import { lspStatusPayload, publishLspStatus, workspaceTrustsLsp } from "./lspHost";

const FAKE = new URL("../lsp/fixtures/fakeServer.ts", import.meta.url).pathname;
const saved = process.env.THINKRAIL_DATA_DIR;
let dataDir: string;
let work: string;

const project = (extra: Partial<Project> = {}): Project => ({
	id: "p1",
	name: "p",
	path: "/p",
	slug: "p",
	lastOpened: 0,
	...extra,
});

function workspaceAt(worktreePath: string, projectId = "p1"): Workspace {
	return {
		id: `w-${projectId}`,
		projectId,
		name: "w",
		branch: "b",
		worktreePath,
		baseBranch: "main",
	};
}

beforeEach(() => {
	dataDir = realpathSync(mkdtempSync(join(tmpdir(), "lsp-host-data-")));
	work = realpathSync(mkdtempSync(join(tmpdir(), "lsp-host-work-")));
	writeFileSync(join(work, "a.fake"), "ERROR_MARK\n");
	process.env.THINKRAIL_DATA_DIR = dataDir;
	resetLspConfig();
});

afterEach(async () => {
	await lspManager.disposeAll();
	if (saved === undefined) delete process.env.THINKRAIL_DATA_DIR;
	else process.env.THINKRAIL_DATA_DIR = saved;
	resetLspConfig();
	rmSync(dataDir, { recursive: true, force: true });
	rmSync(work, { recursive: true, force: true });
});

test("a workspace trusts language servers only when Pi trusts its project", () => {
	saveProjects([project({ piResourceTrust: "granted" }), project({ id: "p2", trusted: true })]);
	expect(workspaceTrustsLsp({ projectId: "p1" })).toBe(true);
	expect(workspaceTrustsLsp({ projectId: "p2" })).toBe(false);
	expect(workspaceTrustsLsp({ projectId: "gone" })).toBe(false);
});

test("a change in a workspace's servers is pushed for that workspace only", async () => {
	saveProjects([project({ piResourceTrust: "granted" })]);
	const mine = workspaceAt(work);
	const other = { ...workspaceAt(tmpdir(), "p1"), id: "elsewhere" };
	const pushed: LspStatusPayload[] = [];
	const publishing = publishLspStatus(
		() => [mine, other],
		(payload) => pushed.push(payload),
	);
	try {
		await updateLspConfig({
			enabled: true,
			servers: { fake: { command: [process.execPath, FAKE], extensions: [".fake"] } },
		});
		pushed.length = 0;
		await lspManager.touch({ directory: work, file: "a.fake", trusted: true, wait: true });
		await new Promise((resolve) => setTimeout(resolve, 250));
		expect(pushed.length).toBeGreaterThan(0);
		expect(new Set(pushed.map((payload) => payload.workspaceId))).toEqual(new Set([mine.id]));
		const last = pushed.at(-1);
		expect(last).toMatchObject({ workspaceId: mine.id, enabled: true, trusted: true });
		expect(last?.servers).toMatchObject([{ id: "fake", state: "ready", errors: 1 }]);
		expect(lspStatusPayload(mine).servers).toHaveLength(1);
	} finally {
		publishing.stop();
	}
});

test("a settings change and a trust change reach every affected workspace", async () => {
	saveProjects([project({ piResourceTrust: "granted" }), project({ id: "p2" })]);
	const a = workspaceAt(work, "p1");
	const b = workspaceAt(tmpdir(), "p2");
	const pushed: LspStatusPayload[] = [];
	const publishing = publishLspStatus(
		() => [a, b],
		(payload) => pushed.push(payload),
	);
	try {
		await updateLspConfig({ enabled: true });
		expect(pushed.map((payload) => payload.workspaceId)).toEqual([a.id, b.id]);
		expect(pushed.map((payload) => payload.trusted)).toEqual([true, false]);
		pushed.length = 0;
		publishing.forProject("p2");
		expect(pushed.map((payload) => payload.workspaceId)).toEqual([b.id]);
	} finally {
		publishing.stop();
	}
	pushed.length = 0;
	await updateLspConfig({ enabled: false });
	expect(pushed).toHaveLength(0);
});
