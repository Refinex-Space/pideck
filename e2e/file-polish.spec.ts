import { expect, test } from "@playwright/test";
import {
	createWorkspaceViaDialog,
	openAppSettings,
	openFixtureProject,
	revealWorkbenchTool,
} from "./fixtures/app";

test.use({ reducedMotion: "reduce" });

test.afterEach(async ({ page }) => {
	if (page.isClosed()) return;
	await page.keyboard.press("Escape");
	await openAppSettings(page);
	await page.getByTestId("settings-nav-language").click();
	await page.getByTestId("language-system").click();
	await page.keyboard.press("Escape");
});

test("file rows share hover chrome, retain gaps, and anchor context menus at the pointer", async ({
	page,
}, testInfo) => {
	await openFixtureProject(page);
	await createWorkspaceViaDialog(page);
	await revealWorkbenchTool(page, "files");
	const rows = page.getByTestId("file-node");
	const first = rows.first();
	await expect
		.poll(() =>
			rows.evaluateAll((nodes) => {
				const a = nodes[0]?.getBoundingClientRect();
				const b = nodes[1]?.getBoundingClientRect();
				return a && b ? b.top - a.bottom : 0;
			}),
		)
		.toBeGreaterThanOrEqual(1.9);
	const a = await first.boundingBox();
	if (!a) throw new Error("Missing row");
	await first.hover();
	const wrapper = first.locator("..");
	const more = wrapper.getByTestId("file-actions-trigger");
	await more.hover();
	await expect(more).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
	await first.click({ button: "right", position: { x: 24, y: a.height / 2 } });
	const menu = page.getByTestId("file-actions-menu");
	await expect(menu).toBeVisible();
	await page.screenshot({ path: testInfo.outputPath("file-menu.png"), animations: "disabled" });
	const box = await menu.boundingBox();
	if (!box) throw new Error("Missing menu");
	expect(Math.abs(box.x - (a.x + 24))).toBeLessThan(12);
	await page.keyboard.press("Escape");
	await expect(menu).toBeHidden();
	await more.click();
	await expect(menu).toBeVisible();
});

test("Chinese source menus and find buttons use application chrome", async ({ page }, testInfo) => {
	await openFixtureProject(page);
	await createWorkspaceViaDialog(page);
	await openAppSettings(page);
	await page.getByTestId("settings-nav-language").click();
	await page.getByTestId("language-zh-CN").click();
	await page.keyboard.press("Escape");
	await page.reload();
	await revealWorkbenchTool(page, "files");
	await page.getByTestId("file-node").filter({ hasText: "notes.txt" }).dblclick();
	await page.getByTestId("file-select-all").click();
	await page.locator(".monaco-editor .view-lines").click({ button: "right" });
	await expect(page.getByText("复制", { exact: true })).toBeVisible();
	await expect(page.getByText("命令面板", { exact: true })).toBeVisible();
	await expect(page.locator(".monaco-menu").first()).not.toHaveCSS("border-radius", "0px");
	await page.screenshot({ path: testInfo.outputPath("source-menu.png"), animations: "disabled" });
	await page.keyboard.press("Escape");
	await page.getByTestId("file-find").click();
	const close = page.locator(".find-widget .codicon-widget-close");
	const next = page.locator(".find-widget .codicon-find-next-match");
	const c = await close.boundingBox();
	const n = await next.boundingBox();
	if (!c || !n) throw new Error("Missing find controls");
	expect(Math.abs(c.y + c.height / 2 - n.y - n.height / 2)).toBeLessThanOrEqual(2);
	await close.hover();
	await page.waitForTimeout(1000);
	await expect(page.locator(".monaco-hover:visible")).toHaveCount(0);
	await page.screenshot({ path: testInfo.outputPath("source-find.png"), animations: "disabled" });
	await close.click();
	await expect(page.locator(".find-widget")).not.toHaveClass(/visible/);
});
