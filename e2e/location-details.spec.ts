import { expect, test } from "@playwright/test";
import { enterDefaultWorkspace, openFixtureProject } from "./fixtures/app";

test("Project Home has no workspace pill and no status toggle", async ({ page }) => {
	await openFixtureProject(page);
	await expect(page.getByTestId("scope-workspace")).toHaveCount(0);
	await expect(page.getByTestId("scope-name")).toHaveCount(0);
	await expect(page.getByTestId("open-status-panel")).toHaveCount(0);
	await expect(page.getByTestId("workspace-details")).toHaveCount(0);
	await enterDefaultWorkspace(page);
	await expect(page.getByTestId("center-tabs")).toBeVisible();
	await expect(page.getByTestId("open-status-panel")).toBeVisible();
});

test("the environment block stays inside the viewport and keeps the branch picker working", async ({
	page,
}, testInfo) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	await openFixtureProject(page);
	await enterDefaultWorkspace(page);
	await page.getByTestId("open-status-panel").click();
	const details = page.getByTestId("workspace-details");
	await expect(details).toBeVisible();
	await expect(page.getByTestId("scope-branch")).toHaveText("main");
	for (const width of [1280, 900, 700]) {
		await page.setViewportSize({ width, height: 800 });
		await expect
			.poll(() =>
				details.evaluate((content) => {
					const rect = content.getBoundingClientRect();
					return Math.max(0, -rect.left, rect.right - innerWidth, rect.bottom - innerHeight);
				}),
			)
			.toBeLessThanOrEqual(1);
	}
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.getByTestId("scope-diff-base").click();
	await expect(page.getByTestId("branch-option").first()).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(page.getByTestId("branch-option")).toHaveCount(0);
	await expect(details).toBeVisible();
	await testInfo.attach("environment-block", {
		body: await page.screenshot(),
		contentType: "image/png",
	});
});
