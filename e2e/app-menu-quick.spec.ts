import { expect, test } from "@playwright/test";
import { openFixtureProject } from "./fixtures/app";

test("the application menu switches theme mode and language without opening settings", async ({
	page,
}) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await openFixtureProject(page);
	const html = page.locator("html");

	await page.getByTestId("app-menu").click();
	await page.getByTestId("app-menu-appearance").click();
	await page.getByTestId("app-menu-theme-dark").click();
	await expect(html).toHaveAttribute("data-theme", /dark/);
	await expect(page.getByTestId("settings-dialog")).toHaveCount(0);

	await page.getByTestId("app-menu").click();
	await page.getByTestId("app-menu-appearance").click();
	await page.getByTestId("app-menu-theme-light").click();
	await expect(html).toHaveAttribute("data-theme", /light/);

	await page.getByTestId("app-menu").click();
	await page.getByTestId("app-menu-language").click();
	const trigger = page.getByTestId("app-menu-language");
	const sub = page.getByTestId("app-menu-language-content");
	const [triggerBox, subBox] = await Promise.all([
		page.getByTestId("app-menu-content").boundingBox(),
		sub.boundingBox(),
	]);
	if (!triggerBox || !subBox) throw new Error("Missing menu geometry");
	expect(subBox.x - (triggerBox.x + triggerBox.width)).toBeGreaterThanOrEqual(6);
	await sub.getByTestId("app-menu-language-ja").click();
	await expect(html).toHaveAttribute("lang", /^ja/);
	await expect(trigger).toHaveCount(0);

	await page.getByTestId("app-menu").click();
	await page.getByTestId("app-menu-language").click();
	await page.getByTestId("app-menu-language-en").click();
	await expect(html).toHaveAttribute("lang", /^en/);
});
