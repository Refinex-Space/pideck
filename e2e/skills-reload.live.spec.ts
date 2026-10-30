import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import {
	createWorkspaceViaDialog,
	openFixtureProject,
	openStatusDock,
	revealWorkbenchTool,
	startNewChat,
} from "./fixtures/app";

test("skills notice: ignores capped build churn, flags a skill change, and clears per chat", {
	tag: "@agent",
}, async ({ page }) => {
	test.setTimeout(120_000);
	await openFixtureProject(page);
	const workspace = await createWorkspaceViaDialog(page);
	const worktree = workspace.worktreePath;

	await expect(page.locator('[data-testid="editor-tab"][data-kind="chat"]')).toHaveCount(1);
	const panel = await openStatusDock(page);
	const stale = panel.getByTestId("status-skills-stale");

	await revealWorkbenchTool(page, "files");
	await expect(page.getByTestId("file-node").filter({ hasText: "README.md" })).toBeVisible();
	await page.waitForTimeout(1200);
	await expect(stale).toHaveCount(0);

	const generated = join(worktree, "generated-build");
	mkdirSync(generated, { recursive: true });
	for (let i = 0; i < 150; i += 1) {
		writeFileSync(join(generated, `chunk-${i}.js`), `export const chunk = ${i};\n`);
	}
	await expect(page.getByTestId("file-node").filter({ hasText: "generated-build" })).toBeVisible({
		timeout: 15_000,
	});
	await expect(stale).toHaveCount(0);

	mkdirSync(join(worktree, ".claude", "skills", "demo"), { recursive: true });
	writeFileSync(
		join(worktree, ".claude", "skills", "demo", "SKILL.md"),
		"---\nname: demo\ndescription: e2e demo skill\n---\n\nDemo skill written mid-session by the e2e suite.\n",
	);
	await expect(stale).toBeVisible({ timeout: 15_000 });

	await stale.getByTestId("status-skills-reload").click();
	await expect(stale).toHaveCount(0, { timeout: 15_000 });

	await startNewChat(page);
	await expect(page.locator('[data-testid="editor-tab"][data-kind="chat"]')).toHaveCount(2);
	await expect(page.getByTestId("status-skills-stale")).toHaveCount(0);

	await page
		.locator('[data-testid="editor-tab"][data-kind="chat"]')
		.first()
		.locator("button")
		.first()
		.click();
	await expect(page.getByTestId("status-skills-stale")).toHaveCount(0);
});
