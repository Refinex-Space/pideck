import { expect, type Page, test } from "@playwright/test";
import { openAppSettings, openFixtureProject, openWorkspaceChat } from "./fixtures/app";
import { shot } from "./fixtures/screenshots";

async function openSettings(page: Page) {
	await openFixtureProject(page);
	await openAppSettings(page);
	const settings = page.getByTestId("settings-page");
	await expect(settings).toBeVisible();
	return settings;
}

async function surfaceColor(page: Page, utility: string): Promise<string> {
	return page.evaluate((className) => {
		const probe = document.createElement("span");
		probe.className = className;
		document.body.append(probe);
		const color = getComputedStyle(probe).backgroundColor;
		probe.remove();
		return color;
	}, utility);
}

test("the navigation sidebar and the settings sidebar sit on the same surface as the content", async ({
	page,
}) => {
	await openWorkspaceChat(page);
	const canvas = await surfaceColor(page, "bg-container-workspace-bg");
	const left = page.getByTestId("left-column");
	await expect(left).toHaveCSS("background-color", canvas);
	await shot(left, "settings-page", "navigation-sidebar");

	await openAppSettings(page);
	const settings = page.getByTestId("settings-page");
	await expect(settings).toHaveCSS(
		"background-color",
		await surfaceColor(page, "bg-container-content-bg"),
	);
	// No fill of its own: the sidebar is the page surface, divided from the content by a hairline.
	await expect(page.getByTestId("settings-sidebar")).toHaveCSS(
		"background-color",
		"rgba(0, 0, 0, 0)",
	);
	await shot(settings, "settings-page", "sidebar-surface");
});

test("Settings is a full page: Back and Escape leave it, and the app underneath is inert", async ({
	page,
}) => {
	const settings = await openSettings(page);

	const viewport = page.viewportSize();
	const box = await settings.boundingBox();
	expect(box?.width).toBe(viewport?.width);
	expect(box?.height).toBe(viewport?.height);
	await expect(page.locator("[inert]")).toHaveCount(1);
	await expect(page.getByTestId("settings-back")).toBeVisible();
	await expect(page.getByTestId("settings-nav-models")).toHaveAttribute("data-active", "true");
	await expect(page.getByTestId("settings-page-title")).toHaveText("Models");
	await expect(page.getByTestId("settings-models")).toBeVisible();
	await shot(settings, "settings-page", "models");

	await page.getByTestId("settings-nav-providers").click();
	await expect(page.getByTestId("settings-providers")).toBeVisible();

	await page.getByTestId("settings-back").click();
	await expect(settings).toHaveCount(0);
	await expect(page.locator("[inert]")).toHaveCount(0);

	await openAppSettings(page);
	await expect(settings).toBeVisible();
	await expect(page.getByTestId("settings-nav-models")).toHaveAttribute("data-active", "true");
	await expect(page.getByTestId("settings-page-title")).toHaveText("Models");
	await expect(page.getByTestId("settings-models")).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(settings).toHaveCount(0);
});

test("the page title follows the section, and search filters the sidebar before Escape leaves", async ({
	page,
}) => {
	const settings = await openSettings(page);
	const title = page.getByTestId("settings-page-title");

	await page.getByTestId("settings-nav-chat").click();
	await expect(title).toHaveText("Chat");
	await page.getByTestId("settings-nav-terminal").click();
	await expect(title).toHaveText("Terminal");

	const search = page.getByTestId("settings-search");
	await search.fill("terminal");
	await expect(page.getByTestId("settings-nav-terminal")).toBeVisible();
	await expect(page.getByTestId("settings-nav-chat")).toHaveCount(0);

	await search.press("Escape");
	await expect(search).toHaveValue("");
	await expect(settings).toBeVisible();
	await expect(page.getByTestId("settings-nav-chat")).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(settings).toHaveCount(0);
});

test("a dialog opened from a section takes Escape first and leaves Settings open", async ({
	page,
}) => {
	const settings = await openSettings(page);
	await page.getByTestId("settings-nav-providers").click();
	await page.getByTestId("custom-endpoints-add").click();
	// While the nested dialog is open, Radix hides the page from the accessibility tree.
	const nested = page.getByRole("dialog");
	await expect(nested).toHaveCount(1);
	await expect(nested).not.toHaveAttribute("data-testid", "settings-page");

	await page.keyboard.press("Escape");
	await expect(settings).toBeVisible();
	await expect(page.getByRole("dialog")).toHaveAttribute("data-testid", "settings-page");
});

test("on a phone-width window the sections become a strip and nothing scrolls sideways", async ({
	page,
}) => {
	await page.setViewportSize({ width: 390, height: 800 });
	const settings = await openSettings(page);
	await page.getByTestId("settings-nav-chat").click();
	await expect(page.getByTestId("settings-page-title")).toHaveText("Chat");

	const overflow = await settings.evaluate((el) => el.scrollWidth - el.clientWidth);
	expect(overflow).toBeLessThanOrEqual(0);
	const content = await page.getByTestId("settings-content").boundingBox();
	expect(content?.width).toBe(390);
	await shot(settings, "settings-page", "narrow");
});
