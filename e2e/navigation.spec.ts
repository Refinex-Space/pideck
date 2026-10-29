import { realpathSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { enterDefaultWorkspace, openFixtureProject } from "./fixtures/app";
import { E2E_FIXTURE_REPO } from "./fixtures/paths";
import { seedWorkspaceSession } from "./fixtures/sessions";

test("navigation aligns labels and keeps the application menu at the foot of its column", async ({
	page,
}) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await openFixtureProject(page);
	// The project folder is listed only through its chats, so give it one.
	seedWorkspaceSession(realpathSync(E2E_FIXTURE_REPO), {
		name: "alignment chat",
		messages: [{ role: "user", text: "Align the navigation.", timestamp: 1_700_910_000_000 }],
	});
	await enterDefaultWorkspace(page);
	const project = page.getByTestId("project-name").first();
	const session = page.getByTestId("workspace-session").first();
	await expect(session).toBeVisible();
	const workspace = session.locator("[data-title-source]");
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
	await expect(session.locator("button").first().locator("svg")).toHaveCount(0);
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
