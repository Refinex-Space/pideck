import { expect, test } from "@playwright/test";
import {
	enterDefaultWorkspace,
	openAppSettings,
	openFixtureProject,
	openWorkspaceChat,
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

test("pointer tool selection has only a fill and pane close buttons have an edge gutter", async ({
	page,
}, testInfo) => {
	await openWorkspaceChat(page);
	for (const tool of ["specs", "files", "review", "plan"] as const) {
		const button = page.getByTestId(`tool-rail-${tool}`);
		// A focused text field makes native focus-visible inheritance observable on programmatic focus.
		await page.getByTestId("chat-input").focus();
		await revealWorkbenchTool(page, tool);
		await expect(button).toHaveAttribute("aria-pressed", "true");
		await expect(button).toHaveCSS("outline-style", "none");
		await expect(button).not.toHaveCSS("box-shadow", /0px 0px 0px [1-9]/);
		await expect(button).toHaveCSS("border-color", "rgba(0, 0, 0, 0)");
		const column = page.getByTestId("right-column");
		const close = column.getByTestId("side-group-fold").first();
		await close.hover();
		const [columnBox, closeBox] = await Promise.all([column.boundingBox(), close.boundingBox()]);
		if (!columnBox || !closeBox) throw new Error("Missing panel controls");
		expect(columnBox.x + columnBox.width - closeBox.x - closeBox.width).toBeGreaterThanOrEqual(8);
		if (tool === "files")
			await column.screenshot({ path: testInfo.outputPath("close-gutter.png") });
		await close.click();
	}
	for (const id of ["open-status-panel", "terminal-rail-group"]) {
		const button = page.getByTestId(id).first();
		if ((await button.getAttribute("aria-pressed")) === "true") await button.click();
		await page.getByTestId("chat-input").focus();
		await button.click();
		await expect(button).toHaveAttribute("aria-pressed", "true");
		await expect(button).toHaveCSS("outline-style", "none");
		await expect(button).not.toHaveCSS("box-shadow", /0px 0px 0px [1-9]/);
	}

	const files = page.getByTestId("tool-rail-files");
	const specs = page.getByTestId("tool-rail-specs");
	await files.focus();
	await page.keyboard.press("ArrowLeft");
	await expect(specs).toBeFocused();
	await expect(specs).toHaveCSS("outline-style", "solid");
	await specs.click();
	await expect(specs).toHaveAttribute("aria-pressed", "true");
	await expect(specs).toHaveCSS("outline-style", "none");
	await expect(specs).not.toHaveCSS("box-shadow", /0px 0px 0px [1-9]/);
});
