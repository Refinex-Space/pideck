import { expect, test } from "@playwright/test";
import { defaultWorkspaceRow, enterDefaultWorkspace, openFixtureProject } from "./fixtures/app";

test("navigation aligns labels and keeps the application menu at the foot of its column", async ({
	page,
}) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await openFixtureProject(page);
	await enterDefaultWorkspace(page);
	const project = page.getByTestId("project-name").first();
	const workspace = defaultWorkspaceRow(page).getByTestId("workspace-name");
	const [projectBox, workspaceBox, sidebarBox, footerBox, contextBox] = await Promise.all([
		project.boundingBox(),
		workspace.boundingBox(),
		page.getByTestId("left-stack").boundingBox(),
		page.getByTestId("navigation-footer").boundingBox(),
		page.getByTestId("topbar").boundingBox(),
	]);
	if (!projectBox || !workspaceBox || !sidebarBox || !footerBox || !contextBox)
		throw new Error("Missing navigation geometry");
	// Workspace names start on the same text edge as the project name above them.
	expect(projectBox.x - workspaceBox.x).toBe(0);
	expect(workspaceBox.x - sidebarBox.x).toBe(40);
	expect(footerBox.y + footerBox.height).toBe(900);
	expect(contextBox.x).toBeGreaterThanOrEqual(sidebarBox.x + sidebarBox.width);
	expect(contextBox.y).toBe(0);
	await expect(page.getByTestId("workspace-shell-layout")).toHaveCSS("height", "900px");
	await expect(page.getByTestId("left-layout-rail")).toHaveAttribute(
		"aria-orientation",
		"horizontal",
	);
	await expect(defaultWorkspaceRow(page).locator("button").first().locator("svg")).toHaveCount(0);
	await page.getByTestId("app-menu").click();
	await expect
		.poll(() =>
			page
				.getByTestId("app-menu-content")
				.evaluate(
					(element) =>
						element.getAnimations().filter((animation) => animation.playState === "running").length,
				),
		)
		.toBe(0);
	const menuBox = await page.getByTestId("app-menu-content").boundingBox();
	if (!menuBox) throw new Error("Missing application menu");
	expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(footerBox.y + 8);
	await page.getByTestId("open-settings").click();
	await expect(page.getByTestId("settings-dialog")).toBeVisible();
	await page.keyboard.press("Escape");
	await page.getByTestId("tool-rail-projects").click();
	await expect(page.getByTestId("left-stack")).toHaveCount(0);
	await expect(page.getByTestId("left-layout-rail")).toHaveAttribute(
		"aria-orientation",
		"horizontal",
	);
	await page.mouse.move(640, 450);
	await page.getByTestId("tool-rail-projects").hover();
	await page.getByTestId("app-menu").click();
	await expect(page.getByTestId("open-settings")).toBeVisible();
});

test("workspace details support keyboard disclosure and preserve existing controls", async ({
	page,
}) => {
	await openFixtureProject(page);
	await enterDefaultWorkspace(page);
	const toggle = page.getByTestId("open-workspace-details");
	await expect(page.getByTestId("workspace-details")).toBeHidden();
	await toggle.focus();
	await page.keyboard.press("Enter");
	await expect(page.getByTestId("workspace-details")).toBeVisible();
	await expect(page.getByTestId("scope-project-name")).toHaveText("sample-project");
	await expect(page.getByTestId("scope-branch")).toHaveText("main");
	await page.keyboard.press("Tab");
	await expect(page.getByTestId("scope-project")).toBeFocused();
	await page.keyboard.press("Escape");
	await expect(page.getByTestId("workspace-details")).toBeHidden();
	await expect(toggle).toBeFocused();
});
