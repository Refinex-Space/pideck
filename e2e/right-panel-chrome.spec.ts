import { expect, test } from "@playwright/test";
import {
	enterDefaultWorkspace,
	openAppSettings,
	openFixtureProject,
	revealWorkbenchTool,
} from "./fixtures/app";

test("right tools align with the workspace toolbar and share its canvas in both themes", async ({
	page,
}, testInfo) => {
	await openFixtureProject(page);
	await enterDefaultWorkspace(page);
	for (const theme of ["light", "dark"] as const) {
		await openAppSettings(page);
		await page.getByTestId("settings-nav-appearance").click();
		await page.getByTestId(`theme-mode-${theme}`).click();
		await page.keyboard.press("Escape");
		for (const tool of ["specs", "files", "review", "plan"] as const) {
			await revealWorkbenchTool(page, tool);
			const column = page.getByTestId("right-column");
			const header = column.getByTestId("auxiliary-pane-header").first();
			const topbar = page.getByTestId("topbar");
			await expect(header).toHaveCSS("height", "40px");
			const [headerBox, toolbarBox] = await Promise.all([
				header.boundingBox(),
				topbar.boundingBox(),
			]);
			if (!headerBox || !toolbarBox) throw new Error("Missing workbench chrome");
			expect(headerBox.y).toBeCloseTo(toolbarBox.y, 0);
			const canvas = await page
				.getByTestId("center-group")
				.first()
				.evaluate((element) => getComputedStyle(element).backgroundColor);
			await expect(column).toHaveCSS("background-color", canvas);
			await expect(column.locator("[data-side=right]").first()).toHaveCSS(
				"background-color",
				canvas,
			);
			if (tool === "files") {
				await expect(
					column.getByTestId("file-node").filter({ hasText: "README.md" }),
				).toBeVisible();
				const curtain = column.getByTestId("quiet-scroll-top").first();
				await expect(curtain).toHaveCSS(
					"background-image",
					new RegExp(canvas.replace(/[()]/g, "\\$&")),
				);
				await page.screenshot({ path: testInfo.outputPath(`right-panel-${theme}.png`) });
			}
			await page.getByTestId(`tool-rail-${tool}`).click();
		}
	}

	await revealWorkbenchTool(page, "files");
	await page.evaluate(() =>
		document.documentElement.style.setProperty("--window-chrome-inset-right", "138px"),
	);
	const inset = page.getByTestId("window-chrome-inset-right");
	await expect(inset).toHaveCSS("width", "138px");
	const [insetBox, hideBox] = await Promise.all([
		inset.boundingBox(),
		page.getByTestId("right-column").getByTestId("side-group-fold").first().boundingBox(),
	]);
	if (!insetBox || !hideBox) throw new Error("Missing caption safety space");
	expect(hideBox.x + hideBox.width).toBeLessThanOrEqual(insetBox.x);
	expect(insetBox.y).toBe(0);
});
