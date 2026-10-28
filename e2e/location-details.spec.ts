import { expect, test } from "@playwright/test";
import { openFixtureProject } from "./fixtures/app";

test("Project Home has one workspace menu and no redundant information card", async ({ page }) => {
	await openFixtureProject(page);
	await expect(page.getByTestId("scope-name")).toHaveText("Project home");
	await expect(page.getByTestId("open-workspace-details")).toHaveCount(0);
	await expect(page.getByTestId("workspace-details")).toHaveCount(0);
	await page.getByTestId("scope-workspace").click();
	const menu = page.getByTestId("scope-workspace-menu");
	await expect(menu).toBeVisible();
	await menu.getByTestId("scope-workspace-option").filter({ hasText: "Default" }).click();
	await expect(page.getByTestId("center-tabs")).toBeVisible();
	await expect(page.getByTestId("open-workspace-details")).toBeVisible();
});

test("workspace details follow their trigger and stay inside resized viewports", async ({
	page,
}, testInfo) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	await openFixtureProject(page);
	await page.getByTestId("scope-workspace").click();
	await page.getByTestId("scope-workspace-option").filter({ hasText: "Default" }).click();
	const toggle = page.getByTestId("open-workspace-details");
	await toggle.click();
	const details = page.getByTestId("workspace-details");
	await expect(details).toBeVisible();
	await expect(page.getByTestId("scope-branch")).toHaveText("main");
	for (const width of [1280, 800, 390]) {
		await page.setViewportSize({ width, height: 800 });
		await expect
			.poll(() =>
				details.evaluate((content) => {
					const panel = content.parentElement;
					const trigger = document.querySelector('[data-testid="open-workspace-details"]');
					if (!panel || !trigger) throw new Error("Missing details anchor");
					const card = panel.getBoundingClientRect();
					const button = trigger.getBoundingClientRect();
					const gap = Number.parseFloat(getComputedStyle(panel).getPropertyValue("--space-8"));
					const expectedLeft = Math.max(gap, Math.min(button.left, innerWidth - card.width - gap));
					return Math.max(
						Math.abs(card.top - button.bottom - gap),
						Math.abs(card.left - expectedLeft),
						Math.abs(card.width - Math.min(384, innerWidth - 2 * gap)),
						Math.max(
							0,
							gap - card.left,
							card.right + gap - innerWidth,
							card.bottom + gap - innerHeight,
						),
					);
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
	await testInfo.attach("anchored-workspace-details", {
		body: await page.screenshot(),
		contentType: "image/png",
	});
	await toggle.focus();
	await page.keyboard.press("Escape");
	await expect(details).toBeHidden();
	await expect(toggle).toBeFocused();
});
