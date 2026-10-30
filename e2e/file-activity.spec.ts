import { mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { type PiEvent, WS_CHANNELS, type WsPush } from "@thinkrail/contracts";
import {
	enterDefaultWorkspace,
	openFixtureProject,
	openPersistedChat,
	openSettingsSection,
	revealWorkbenchTool,
} from "./fixtures/app";
import { E2E_FIXTURE_REPO } from "./fixtures/paths";
import { seedWorkspaceSession } from "./fixtures/sessions";
import { interceptAppWire } from "./fixtures/streamReplay";

const DIR = join(E2E_FIXTURE_REPO, "activity-fixture");

async function closeSettings(page: Page): Promise<void> {
	await page.keyboard.press("Escape");
	await expect(page.getByTestId("settings-dialog")).toBeHidden();
}

function seedTree(): void {
	mkdirSync(join(DIR, "inner"), { recursive: true });
	writeFileSync(join(DIR, "inner", "deep.md"), "# deep\n");
	writeFileSync(join(DIR, "top.md"), "# top\n");
}

interface Agent {
	send: (event: PiEvent) => void;
}

/** A chat open in the default workspace, its Files tree showing, and a hand on its event stream. */
async function openAgent(page: Page, name: string, showFiles = true): Promise<Agent> {
	const wire = await interceptAppWire(page);
	await openFixtureProject(page);
	const seeded = seedWorkspaceSession(realpathSync(E2E_FIXTURE_REPO), {
		name,
		messages: [{ role: "user", text: "Look around.", timestamp: Date.now() }],
	});
	await enterDefaultWorkspace(page);
	await openPersistedChat(page, name);
	if (showFiles) {
		await revealWorkbenchTool(page, "files");
		await expect(page.getByTestId("file-tree")).toBeVisible();
	}
	return {
		send: (event) =>
			wire().send(
				JSON.stringify({
					channel: WS_CHANNELS.piEvent,
					data: { sessionId: seeded.id, event },
				} satisfies WsPush),
			),
	};
}

const started = (toolCallId: string, toolName: string, args: unknown): PiEvent => ({
	type: "tool_execution_start",
	toolCallId,
	toolName,
	args,
});

const ended = (
	toolCallId: string,
	toolName: string,
	result: unknown = { content: [] },
	isError = false,
): PiEvent => ({ type: "tool_execution_end", toolCallId, toolName, result, isError });

/** A tree row's wrapper, which carries the activity marks, found by its file name. */
function row(page: Page, name: string, kind?: string): Locator {
	return page
		.locator(kind ? `[data-agent-activity="${kind}"]` : "[data-agent-activity]")
		.filter({ has: page.getByTestId("file-node").filter({ hasText: name }) });
}

function treeFile(page: Page, name: string): Locator {
	return page.getByTestId("file-node").filter({ hasText: name });
}

test.beforeEach(() => seedTree());
test.afterEach(() => rmSync(DIR, { recursive: true, force: true }));

test("a read lights its file while the tool runs, opens its folders, and fades when done", async ({
	page,
}) => {
	test.setTimeout(90_000);
	const agent = await openAgent(page, "activity read");
	await expect(treeFile(page, "deep.md")).toHaveCount(0);

	agent.send(
		started("t1", "read", { path: "activity-fixture/inner/deep.md", offset: 3, limit: 10 }),
	);
	const lit = row(page, "deep.md", "read");
	await expect(lit).toBeVisible();
	await expect(lit).toHaveAttribute("data-agent-phase", "running");
	await expect(lit.getByTestId("file-agent-badge")).toHaveText("Reading · L3–12");
	await expect(row(page, "activity-fixture", "within")).toBeVisible();

	agent.send(ended("t1", "read"));
	await expect(lit).toHaveAttribute("data-agent-phase", "done");
	await expect(lit.getByTestId("file-agent-badge")).toHaveText("Read · L3–12");

	await expect(row(page, "deep.md")).toHaveCount(0, { timeout: 15_000 });
	await expect(treeFile(page, "deep.md")).toHaveCount(0, { timeout: 30_000 });
});

test("an edit lights amber, a failed edit leaves nothing, and a write beside it lights too", async ({
	page,
}) => {
	const agent = await openAgent(page, "activity write");
	agent.send(started("t1", "edit", { path: "README.md", edits: [{}, {}] }));
	await expect(row(page, "README.md", "write")).toBeVisible();
	agent.send(ended("t1", "edit", {}, true));
	await expect(row(page, "README.md")).toHaveCount(0);

	agent.send(started("t2", "edit", { path: "README.md", edits: [{}, {}] }));
	agent.send(started("t3", "write", { path: "notes.txt", content: "x" }));
	await expect(row(page, "README.md", "write").getByTestId("file-agent-badge")).toHaveText(
		"Editing",
	);
	await expect(row(page, "notes.txt", "write").getByTestId("file-agent-badge")).toHaveText(
		"Writing",
	);
	agent.send(ended("t2", "edit"));
	await expect(row(page, "README.md", "write").getByTestId("file-agent-badge")).toHaveText(
		"Edited ×2",
	);
});

test("a search lights the files it matched and counts the matches", async ({ page }) => {
	const agent = await openAgent(page, "activity search");
	agent.send(started("t1", "grep", { pattern: "deep", path: "activity-fixture" }));
	await expect(row(page, "activity-fixture", "search")).toBeVisible();
	agent.send(
		ended("t1", "grep", {
			content: [
				{ type: "text", text: "inner/deep.md:1: # deep\ninner/deep.md:4: deep\ntop.md:2: deep" },
			],
		}),
	);
	await expect(row(page, "deep.md", "search").getByTestId("file-agent-badge")).toHaveText(
		"Matched ×2",
	);
	await expect(row(page, "top.md", "search").getByTestId("file-agent-badge")).toHaveText(
		"Matched ×1",
	);
});

test("the activity list keeps settled work, opens a file from it, and clears", async ({ page }) => {
	const agent = await openAgent(page, "activity list");
	await expect(page.getByTestId("agent-activity-list")).toHaveCount(0);
	agent.send(started("t1", "read", { path: "notes.txt" }));
	agent.send(ended("t1", "read"));
	agent.send(started("t2", "edit", { path: "README.md", edits: [{}] }));
	agent.send(ended("t2", "edit"));

	const list = page.getByTestId("agent-activity-list");
	const rows = list.getByTestId("agent-activity-row");
	await expect(rows).toHaveCount(2);
	await expect(rows.first()).toHaveAttribute("data-path", "README.md");
	await expect(row(page, "README.md")).toHaveCount(0, { timeout: 15_000 });
	await expect(rows).toHaveCount(2);

	await rows.last().click();
	await expect(
		page.locator('[data-testid="editor-tab"][data-kind="file"]').filter({ hasText: "notes.txt" }),
	).toBeVisible();

	await list.getByTestId("agent-activity-toggle").click();
	await expect(rows).toHaveCount(0);
	await list.getByTestId("agent-activity-toggle").click();
	await list.getByTestId("agent-activity-clear").click();
	await expect(list).toHaveCount(0);
});

test("a subagent's tool lights its file with the role's name", async ({ page }) => {
	const agent = await openAgent(page, "activity subagent");
	agent.send({
		type: "subagent_activity",
		childSessionId: "child-1",
		roleName: "explorer",
		toolName: "read",
		args: { path: "README.md" },
	});
	await expect(row(page, "README.md", "read").getByTestId("file-agent-badge")).toHaveText(
		"Subagent explorer · Read",
	);
});

test("shell reads stay dark until the preference allows them", async ({ page }) => {
	const agent = await openAgent(page, "activity shell");
	agent.send(started("t1", "bash", { command: "cat README.md" }));
	agent.send(ended("t1", "bash"));
	await expect(page.getByTestId("agent-activity-list")).toHaveCount(0);
	await expect(row(page, "README.md")).toHaveCount(0);

	await openSettingsSection(page, "chat");
	await page.getByTestId("file-activity-shell").click();
	await closeSettings(page);
	agent.send(started("t2", "bash", { command: "cat README.md" }));
	await expect(row(page, "README.md", "read")).toBeVisible();
});

test("the master switch and its choices persist and silence the tree", async ({ page }) => {
	const agent = await openAgent(page, "activity settings");
	await openSettingsSection(page, "chat");
	const master = page.getByTestId("file-activity-enabled");
	await expect(master).toHaveAttribute("aria-checked", "true");
	await expect(page.getByTestId("file-activity-shell")).toHaveAttribute("aria-checked", "false");
	await page.getByTestId("file-activity-reads").click();
	await expect(page.getByTestId("file-activity-reads")).toHaveAttribute("aria-checked", "false");
	await closeSettings(page);
	agent.send(started("t1", "read", { path: "README.md" }));
	agent.send(started("t2", "edit", { path: "notes.txt", edits: [{}] }));
	await expect(row(page, "notes.txt", "write")).toBeVisible();
	await expect(row(page, "README.md")).toHaveCount(0);

	await page.reload();
	await expect(page.getByTestId("connection-status")).toHaveAttribute("data-status", "connected");
	await openSettingsSection(page, "chat");
	await expect(page.getByTestId("file-activity-reads")).toHaveAttribute("aria-checked", "false");
	await master.click();
	await expect(master).toHaveAttribute("aria-checked", "false");
	await expect(page.getByTestId("file-activity-writes")).toBeDisabled();
	await page.reload();
	await expect(page.getByTestId("connection-status")).toHaveAttribute("data-status", "connected");
	await openSettingsSection(page, "chat");
	await expect(page.getByTestId("file-activity-enabled")).toHaveAttribute("aria-checked", "false");
	await page.getByTestId("file-activity-enabled").click();
	await page.getByTestId("file-activity-reads").click();
});

test("the tree scrolls to the file the agent is on", async ({ page }) => {
	for (let index = 0; index < 60; index++)
		mkdirSync(join(DIR, `pad-${String(index).padStart(2, "0")}`), { recursive: true });
	mkdirSync(join(DIR, "zz"), { recursive: true });
	writeFileSync(join(DIR, "zz", "last.md"), "# last\n");
	const agent = await openAgent(page, "activity follow");
	agent.send(started("t1", "read", { path: "activity-fixture/zz/last.md" }));
	await expect(row(page, "last.md", "read")).toBeInViewport();
});

test("Files opens by itself when the agent starts, if asked to", async ({ page }) => {
	const agent = await openAgent(page, "activity open", false);
	await expect(page.getByTestId("file-tree")).toHaveCount(0);
	await openSettingsSection(page, "chat");
	await page.getByTestId("file-activity-openFiles").click();
	await closeSettings(page);
	agent.send(started("t1", "read", { path: "README.md" }));
	await expect(page.getByTestId("file-tree")).toBeVisible();
	await expect(row(page, "README.md", "read")).toBeVisible();
});
