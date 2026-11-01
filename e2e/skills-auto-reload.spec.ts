import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { createWorkspaceViaDialog, openFixtureProject, openStatusDock } from "./fixtures/app";

/** Counts the `session.reloadResources` requests this page sends to the host. */
function trackReloads(page: Page): () => number {
	let count = 0;
	page.on("websocket", (socket) =>
		socket.on("framesent", ({ payload }) => {
			if (String(payload).includes('"session.reloadResources"')) count += 1;
		}),
	);
	return () => count;
}

test("a skill changed on disk is applied to the chat in front without pressing Reload", async ({
	page,
}) => {
	const reloads = trackReloads(page);
	await openFixtureProject(page);
	const workspace = await createWorkspaceViaDialog(page);
	const skill = join(workspace.worktreePath, ".claude", "skills", "demo", "SKILL.md");
	await expect(page.locator('[data-testid="editor-tab"][data-kind="chat"]')).toHaveCount(1);
	const stale = (await openStatusDock(page)).getByTestId("status-skills-stale");

	writeFileSync(join(workspace.worktreePath, "notes.txt"), "not a skill\n");
	await page.waitForTimeout(1_500);
	expect(reloads()).toBe(0);
	await expect(stale).toHaveCount(0);

	mkdirSync(join(workspace.worktreePath, ".claude", "skills", "demo"), { recursive: true });
	writeFileSync(skill, "---\nname: demo\ndescription: first\n---\n\nFirst version.\n");
	await expect.poll(reloads, { timeout: 15_000 }).toBe(1);
	await expect(stale).toHaveCount(0);

	writeFileSync(skill, "---\nname: demo\ndescription: second\n---\n\nSecond version.\n");
	await expect.poll(reloads, { timeout: 15_000 }).toBe(2);
	await expect(stale).toHaveCount(0);
});
