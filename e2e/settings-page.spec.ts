import { expect, type Page, test } from "@playwright/test";
import { openAppSettings, openFixtureProject } from "./fixtures/app";
import { shot } from "./fixtures/screenshots";

async function openSettings(page: Page) {
	await openFixtureProject(page);
	await openAppSettings(page);
	const settings = page.getByTestId("settings-page");
	await expect(settings).toBeVisible();
	return settings;
}

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
	await shot(settings, "settings-page", "providers");

	await page.getByTestId("settings-back").click();
	await expect(settings).toHaveCount(0);
	await expect(page.locator("[inert]")).toHaveCount(0);

	await openAppSettings(page);
	await expect(settings).toBeVisible();
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
