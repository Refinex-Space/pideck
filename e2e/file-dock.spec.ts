import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import {
	createWorkspaceViaDialog,
	openAppSettings,
	openFixtureProject,
	revealWorkbenchTool,
	startNewChat,
} from "./fixtures/app";

test("file viewing stays beside the chat and shares the right workspace toolbar", async ({
	page,
}, testInfo) => {
	await openFixtureProject(page);
	const workspace = await createWorkspaceViaDialog(page);
	await page.getByTestId("chat-input").fill("Keep this conversation draft");
	await revealWorkbenchTool(page, "files");
	await page.getByTestId("file-node").filter({ hasText: "notes.txt" }).dblclick();
	const dock = page.getByTestId("file-workbench");
	await expect(dock.getByTestId("file-pane")).toBeVisible();
	await expect(page.getByTestId("center-tabs").getByTestId("chat-input")).toHaveValue(
		"Keep this conversation draft",
	);
	await expect(page.getByTestId("center-tabs").getByTestId("file-pane")).toHaveCount(0);
	const header = dock.getByTestId("center-tab-strip");
	await expect(header.getByTestId("file-find")).toBeVisible();
	await expect(dock.getByTestId("file-toolbar").getByTestId("file-find")).toHaveCount(0);
	for (const theme of ["light", "dark"]) {
		await openAppSettings(page);
		await page.getByTestId("settings-nav-appearance").click();
		await page.getByTestId(`theme-mode-${theme}`).click();
		await page.keyboard.press("Escape");
		await page.screenshot({
			path: testInfo.outputPath(`file-dock-${theme}.png`),
			animations: "disabled",
		});
	}
	await page.getByTestId("tool-rail-files").click();
	await expect(dock).toHaveCount(0);
	await expect(page.getByTestId("chat-input")).toHaveValue("Keep this conversation draft");
	await page.getByTestId("tool-rail-files").click();
	await expect(dock.getByTestId("file-pane")).toContainText("plain-text-fixture");
	await startNewChat(page);
	await expect(page.getByTestId("center-tabs").getByTestId("chat-input")).toHaveValue("");
	await expect(dock.getByTestId("file-pane")).toContainText("plain-text-fixture");
	await page.reload();
	await expect(page.getByTestId("center-tabs").getByTestId("chat-input")).toBeVisible();
	await expect(dock.getByTestId("file-pane")).toContainText("plain-text-fixture");
	appendFileSync(join(workspace.worktreePath, "notes.txt"), "changed in the file workbench\n");
	await revealWorkbenchTool(page, "changes");
	await page.getByTestId("change-item").filter({ hasText: "notes.txt" }).dblclick();
	await expect(dock.getByTestId("diff-pane")).toBeVisible();
	await expect(page.getByTestId("center-tabs").getByTestId("chat-input")).toBeVisible();
	await expect(dock.getByTestId("center-tab-strip").getByTestId("diff-view-toggle")).toBeVisible();
});
