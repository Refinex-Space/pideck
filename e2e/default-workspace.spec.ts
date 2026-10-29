import { expect, test } from "@playwright/test";
import {
	activateDefaultWorkspace,
	createWorkspaceViaDialog,
	defaultWorkspaceRow,
	enterDefaultWorkspace,
	goProjectHome,
	openFixtureProject,
	openWorkspaceMenu,
	revealWorkbenchTerminal,
	revealWorkbenchTool,
	runInTerminal,
	visibleTerminalScreen,
	waitTerminalReady,
	workspaceDetail,
	worktreeRows,
} from "./fixtures/app";

test("the Welcome fork's “Work in project folder” enters the Default workspace — the project folder itself", async ({
	page,
}) => {
	await openFixtureProject(page);

	await enterDefaultWorkspace(page);

	await expect(page.getByTestId("center-tabs")).toBeVisible();
	await expect(page.getByTestId("scope-workspace")).toHaveCount(0);
	await expect(await workspaceDetail(page, "scope-branch")).toHaveText("main");
	await expect(await workspaceDetail(page, "scope-base")).toHaveCount(0);

	// A project folder with no chats has no rail row; it is reached through Project Home.
	await expect(defaultWorkspaceRow(page)).toHaveCount(0);

	const ready = page.getByTestId("workspace-ready");
	await expect(ready).toContainText("Default workspace");
	await expect(ready).toContainText("sample-project");
	await expect(ready).toContainText("on main");
	await expect(ready).toContainText("run directly in your project folder");

	await revealWorkbenchTool(page, "files");
	await expect(page.getByTestId("file-node").filter({ hasText: "README.md" })).toBeVisible();

	await revealWorkbenchTool(page, "changes");
	await expect(page.getByTestId("changes-empty")).toBeVisible();

	await revealWorkbenchTerminal(page);
	await page.getByTestId("terminal-tab").click();
	await waitTerminalReady(page);
	await runInTerminal(page, 'basename "$(pwd)"');
	await expect(visibleTerminalScreen(page)).toContainText("sample-project");
});

test("a terminal branch switch converges every Default branch label live", async ({ page }) => {
	await openFixtureProject(page);
	await enterDefaultWorkspace(page);

	await expect(await workspaceDetail(page, "scope-branch")).toHaveText("main");

	await revealWorkbenchTerminal(page);
	await runInTerminal(page, "git switch -c live-branch");

	await expect(await workspaceDetail(page, "scope-branch")).toHaveText("live-branch");
	await expect(page.getByTestId("workspace-ready")).toContainText("on live-branch");
});

test("the Default workspace has no rail row while it holds no chats; project home stays reachable", async ({
	page,
}) => {
	await openFixtureProject(page);

	await createWorkspaceViaDialog(page);
	await expect(defaultWorkspaceRow(page)).toHaveCount(0);
	await openWorkspaceMenu(worktreeRows(page).first());
	await expect(page.getByTestId("workspace-remove")).toBeVisible();
	await page.keyboard.press("Escape");

	await page.getByTestId("add-project-menu").click();
	await page.getByTestId("menu-open-project").click();
	await expect(page.getByTestId("welcome")).toBeVisible();
	await expect(defaultWorkspaceRow(page)).toHaveCount(0);

	await activateDefaultWorkspace(page);
	await expect(page.getByTestId("center-tabs")).toBeVisible();
	await expect(page.getByTestId("scope-workspace")).toHaveCount(0);
	await goProjectHome(page);
	await expect(page.getByTestId("center-tabs")).toHaveCount(0);
});
