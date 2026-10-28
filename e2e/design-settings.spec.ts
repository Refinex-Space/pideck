import { expect, test } from "@playwright/test";
import { openAppFresh, openAppSettings, openWorkspaceChat } from "./fixtures/app";

test("settings search filters navigation without switching the current section and Escape clears it", async ({
	page,
}) => {
	await openAppFresh(page);
	await openAppSettings(page);
	const dialog = page.getByTestId("settings-dialog");
	const search = dialog.getByTestId("settings-search");
	await expect(page.getByTestId("settings-providers")).toBeVisible();
	await search.fill("Templates");
	await expect(dialog.getByTestId("settings-nav-templates")).toBeVisible();
	await expect(dialog.getByTestId("settings-nav-providers")).toHaveCount(0);
	await expect(page.getByTestId("settings-providers")).toBeVisible();
	await search.fill("no-such-setting");
	await expect(
		dialog.getByRole("status").filter({ hasText: "No matching settings" }),
	).toBeVisible();
	await expect(page.getByTestId("settings-providers")).toBeVisible();
	await search.press("Escape");
	await expect(dialog).toBeVisible();
	await expect(search).toHaveValue("");
	await expect(dialog.getByTestId("settings-nav-providers")).toBeVisible();
	await search.press("Escape");
	await expect(dialog).toBeHidden();
});

test("opening a project template as a file clears settings search on the next open", async ({
	page,
}) => {
	await openWorkspaceChat(page);
	await openAppSettings(page);
	const dialog = page.getByTestId("settings-dialog");
	const search = dialog.getByTestId("settings-search");
	await search.fill("Templates");
	await dialog.getByTestId("settings-nav-templates").click();
	await page.getByTestId("template-new-project").click();
	const editor = page.getByTestId("template-editor-dialog");
	await expect(editor).toBeVisible();
	await editor.getByTestId("template-name-input").fill("settings-navigation");
	await editor.getByTestId("template-body-input").fill("Project template for settings navigation");
	await editor.getByTestId("template-save").click();
	await expect(editor).toBeHidden();
	const row = page.locator(
		'[data-testid="template-row"][data-name="settings-navigation"][data-scope="project"]',
	);
	await row.getByTestId("template-open-file").click();
	await expect(dialog).toBeHidden();
	await expect(
		page.getByTestId("editor-tab").filter({ hasText: "settings-navigation.md" }),
	).toBeVisible();
	await openAppSettings(page);
	await expect(search).toHaveValue("");
	await expect(dialog.getByTestId("settings-nav-providers")).toHaveAttribute("data-active", "true");
	await expect(dialog.getByTestId("settings-nav-providers")).toBeVisible();
});
