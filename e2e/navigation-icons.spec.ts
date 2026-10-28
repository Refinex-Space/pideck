import { expect, test } from "@playwright/test";
import { defaultWorkspaceRow, openAppFresh, openWorkspaceChat } from "./fixtures/app";

test("a fresh surface disables app history controls without leaving the app", async ({ page }) => {
	await openAppFresh(page);
	await expect(page.getByTestId("navigate-back")).toBeDisabled();
	await expect(page.getByTestId("navigate-forward")).toBeDisabled();
	await expect(page.getByTestId("navigate-back").locator("svg.lucide-chevron-left")).toHaveCount(1);
	await expect(
		page.getByTestId("navigate-forward").locator("svg.lucide-chevron-right"),
	).toHaveCount(1);
});

test("specified navigation icons retain their controls and default workspace has no decoration", async ({
	page,
}, testInfo) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await openWorkspaceChat(page);
	const projectToggle = page.getByTestId("project-expand").first();
	await expect(projectToggle).toHaveAttribute("aria-expanded", "true");
	await expect(projectToggle.locator("svg.lucide-folder-open")).toHaveCount(1);
	await projectToggle.click();
	await expect(projectToggle.locator("svg.lucide-folder-closed")).toHaveCount(1);
	await projectToggle.click();
	await expect(defaultWorkspaceRow(page).locator("button").first().locator("svg")).toHaveCount(0);
	const sidebar = page.getByTestId("tool-rail-projects");
	await expect(sidebar.locator("svg.lucide-panel-left")).toHaveCount(1);
	for (const [control, icon] of [
		["terminal-rail-group", "terminal"],
		["tool-rail-specs", "book-open"],
		["tool-rail-files", "folder"],
		["tool-rail-plan", "square-check-big"],
		["open-skills", "blocks"],
		["resources-trigger", "package-2"],
	]) {
		const svg = page.getByTestId(control).first().locator(`svg.lucide-${icon}`);
		await expect(svg).toHaveCount(1);
		await expect(svg).toHaveAttribute("stroke-width", "1.75");
		await expect(svg).toHaveAttribute("fill", "none");
	}
	const [toggleBox, backBox, forwardBox] = await Promise.all([
		sidebar.boundingBox(),
		page.getByTestId("navigate-back").boundingBox(),
		page.getByTestId("navigate-forward").boundingBox(),
	]);
	if (!toggleBox || !backBox || !forwardBox)
		throw new Error("Navigation controls have no geometry");
	expect(backBox.x).toBeGreaterThanOrEqual(toggleBox.x + toggleBox.width);
	expect(forwardBox.x).toBeGreaterThanOrEqual(backBox.x + backBox.width);
	await testInfo.attach("lucide-navigation", {
		body: await page.screenshot(),
		contentType: "image/png",
	});
	await sidebar.click();
	await expect(sidebar.locator("svg.lucide-panel-right")).toHaveCount(1);
	const collapsedSidebar = await sidebar.boundingBox();
	const collapsedBack = await page.getByTestId("navigate-back").boundingBox();
	if (!collapsedSidebar || !collapsedBack) throw new Error("Missing collapsed navigation controls");
	expect(collapsedBack.x).toBeGreaterThanOrEqual(collapsedSidebar.x + collapsedSidebar.width);
	expect(Math.abs(collapsedBack.y - collapsedSidebar.y)).toBeLessThan(1);
	await expect(page.getByTestId("navigation-history")).toHaveCount(1);
	await sidebar.click();
	await expect(sidebar.locator("svg.lucide-panel-left")).toHaveCount(1);
	await page.getByTestId("resources-trigger").click();
	await expect(page.getByTestId("resources-trigger").locator("svg.lucide-package-2")).toHaveCount(
		1,
	);
});
