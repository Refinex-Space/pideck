import { expect, type Locator, test } from "@playwright/test";
import {
	createWorkspaceViaDialog,
	openFixtureProject,
	revealWorkbenchTool,
	selectSessionRow,
	startNewChat,
	worktreeRow,
} from "./fixtures/app";

function expectTabFocusRing(tab: Locator, visible: boolean) {
	return expect(tab.locator("..")).toHaveCSS(
		"box-shadow",
		visible ? /0px 0px 0px 1px inset/ : "none",
	);
}

test("pointer selection and restored workspaces keep chat tabs free of keyboard focus rings", async ({
	page,
}) => {
	await openFixtureProject(page);
	await createWorkspaceViaDialog(page);
	const tab = page.getByTestId("center-tab-strip").getByRole("tab").first();
	await expectTabFocusRing(tab, false);
	// The sole chat chip renames on click; pointer chat selection happens from the sidebar row.
	const chatId = await page
		.locator('[data-testid="editor-tab"][data-kind="chat"]')
		.getAttribute("data-session-id");
	if (!chatId) throw new Error("The workspace chat has no session id");
	await startNewChat(page);
	await selectSessionRow(page, chatId);
	await expectTabFocusRing(tab, false);

	await createWorkspaceViaDialog(page);
	await expect(worktreeRow(page, "workspace-2")).toHaveAttribute("data-active", "true");
	await expectTabFocusRing(tab, false);
	await worktreeRow(page, "workspace-1").getByRole("button").first().click();
	await expect(worktreeRow(page, "workspace-1")).toHaveAttribute("data-active", "true");
	await expectTabFocusRing(tab, false);

	await page.reload();
	await expect(page.getByTestId("connection-status")).toHaveAttribute("data-status", "connected");
	await expect(page.getByTestId("workspace-workbench")).toHaveAttribute(
		"data-layout-status",
		"settled",
	);
	await expect(tab).toHaveAttribute("aria-selected", "true");
	await expectTabFocusRing(tab, false);
});

test("keyboard tab navigation and close recovery retain a thin visible focus ring", async ({
	page,
}) => {
	await openFixtureProject(page);
	await createWorkspaceViaDialog(page);
	// The main strip holds one chat; the file dock's strip carries several resource tabs.
	await revealWorkbenchTool(page, "files");
	for (const name of ["README.md", "notes.txt"])
		await page.getByTestId("file-node").filter({ hasText: name }).dblclick();
	const tabs = page.getByTestId("file-workbench").getByTestId("center-tab-strip").getByRole("tab");
	await expect(tabs).toHaveCount(2);
	const first = tabs.nth(0);
	const second = tabs.nth(1);
	await second.click();
	await expectTabFocusRing(second, false);

	await page.keyboard.press("Home");
	await expect(first).toBeFocused();
	await expect(first).toHaveAttribute("aria-selected", "true");
	await expect(second).toHaveAttribute("tabindex", "-1");
	await expectTabFocusRing(first, true);
	await page.keyboard.press("End");
	await expect(second).toBeFocused();
	await expectTabFocusRing(second, true);
	await page.keyboard.press("ArrowLeft");
	await expect(first).toBeFocused();
	await expectTabFocusRing(first, true);
	await page.keyboard.press("ArrowRight");
	await expect(second).toBeFocused();
	await expectTabFocusRing(second, true);
	await page.keyboard.press("Delete");
	await expect(tabs).toHaveCount(1);
	await expect(first).toBeFocused();
	await expectTabFocusRing(first, true);

	await page.keyboard.press("Tab");
	await expect(first).not.toBeFocused();
	await page.keyboard.press("Shift+Tab");
	await expect(first).toBeFocused();
	await expectTabFocusRing(first, true);
	await first.click();
	await expectTabFocusRing(first, false);
});

test("keyboard file opens preserve focus intent across the shell layout request", async ({
	page,
}) => {
	await openFixtureProject(page);
	await createWorkspaceViaDialog(page);
	await revealWorkbenchTool(page, "files");
	const readme = page.getByTestId("file-node").filter({ hasText: "README.md" });
	const tab = page.getByTestId("center-tab-strip").getByRole("tab", { name: /README\.md/ });
	await expect(tab).toHaveCount(0);
	await readme.focus();
	await page.keyboard.press("Enter");
	await expect(tab).toBeFocused();
	await expectTabFocusRing(tab, true);
});
