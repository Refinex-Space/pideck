import { expect, type Page, test } from "@playwright/test";
import { openFixtureProject } from "./fixtures/app";

async function hintOpacity(page: Page, testId: string): Promise<string> {
	return page
		.getByTestId(testId)
		.locator("kbd")
		.evaluate((node) => getComputedStyle(node).opacity);
}

test("New and Search show their shortcut only while hovered or focused", async ({ page }) => {
	await openFixtureProject(page);
	for (const testId of ["new-session", "open-session-switcher"]) {
		const row = page.getByTestId(testId);
		await expect(row.locator("kbd")).toHaveCount(1);
		await page.mouse.move(600, 500);
		expect(await hintOpacity(page, testId)).toBe("0");
		await row.hover();
		await expect.poll(() => hintOpacity(page, testId)).toBe("1");
		await page.mouse.move(600, 500);
		await row.focus();
		await page.keyboard.press("Tab");
		await row.focus();
		await expect.poll(() => hintOpacity(page, testId)).toBe("1");
	}
	await page.getByTestId("new-session").hover();
	await expect(page.getByTestId("new-session").locator("kbd")).toHaveText(/N$/);
});

test("New starts a session for the current project; opening a project lives on the Projects heading", async ({
	page,
}) => {
	await openFixtureProject(page);
	await expect(page.getByTestId("new-session")).toContainText("New session");
	const heading = page.getByTestId("projects-heading");
	await expect(heading).toContainText("Projects");
	const controls = page.getByTestId("project-tree").locator("button");
	const order = await controls.evaluateAll((nodes) =>
		nodes.map((node) => node.getAttribute("data-testid")),
	);
	expect(order.slice(0, 4)).toEqual([
		"new-session",
		"open-session-switcher",
		"projects-menu",
		"add-project-menu",
	]);

	await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
	await page.mouse.move(600, 500);
	const plusOpacity = () =>
		page.getByTestId("add-project-menu").evaluate((node) => getComputedStyle(node).opacity);
	expect(await plusOpacity()).toBe("0");
	await heading.hover();
	await expect.poll(plusOpacity).toBe("1");

	await page.getByTestId("new-session").click();
	const form = page.getByTestId("new-workspace-page");
	await expect(form).toBeVisible();
	await expect(form.getByTestId("ws-greeting")).toContainText("sample-project");
	await expect(form.getByTestId("ws-project-picker")).toContainText("sample-project");
	await page.keyboard.press("Escape");
	await expect(form).toBeHidden();

	await heading.hover();
	await page.getByTestId("add-project-menu").click();
	await expect(page.getByTestId("menu-open-project")).toBeVisible();
	await expect(page.getByTestId("menu-enter-host-path")).toBeVisible();
});

test("the Projects heading's menu collapses and expands every project", async ({ page }) => {
	await openFixtureProject(page);
	const expander = page.getByTestId("project-expand").first();
	const state = async () =>
		(await expander.getAttribute("aria-expanded")) === "true" ? "open" : "closed";
	const openMenu = async () => {
		await page.getByTestId("projects-heading").hover();
		await page.getByTestId("projects-menu").click();
	};

	await expect.poll(state).toBe("open");
	await openMenu();
	await expect(page.getByTestId("projects-expand-all")).toBeDisabled();
	await page.getByTestId("projects-collapse-all").click();
	await expect.poll(state).toBe("closed");

	await openMenu();
	await expect(page.getByTestId("projects-collapse-all")).toBeDisabled();
	await page.getByTestId("projects-expand-all").click();
	await expect.poll(state).toBe("open");
});

test("a project's plus goes straight to the page, and the where-to-run choice is remembered per project", async ({
	page,
}, testInfo) => {
	await page.setViewportSize({ width: 1400, height: 900 });
	await openFixtureProject(page);
	const plus = page.getByTestId("add-workspace").first();
	await plus.click();
	const form = page.getByTestId("new-workspace-page");
	await expect(form).toBeVisible();
	await expect(page.getByTestId("new-session-menu")).toHaveCount(0);
	await expect(form.getByTestId("ws-target-worktree")).toHaveAttribute("data-active", "true");
	await expect(form.getByTestId("ws-branch-picker")).toBeVisible();
	await expect(form.getByTestId("ws-target-default")).toContainText("Current branch · main");
	await page.getByTestId("new-session").hover();
	await testInfo.attach("new-session-worktree", {
		body: await page.screenshot({ path: testInfo.outputPath("new-session-worktree.png") }),
		contentType: "image/png",
	});

	await form.getByTestId("ws-target-default").click();
	await expect(form.getByTestId("ws-target-default")).toHaveAttribute("data-active", "true");
	await expect(form.getByTestId("ws-branch-picker")).toHaveCount(0);
	await expect(form.getByTestId("ws-target-default")).toContainText("Current branch");
	await page.keyboard.press("Escape");
	await expect(form).toBeHidden();

	await page.getByTestId("new-session").click();
	await expect(form.getByTestId("ws-target-default")).toHaveAttribute("data-active", "true");
	await page.keyboard.press("Escape");

	await page.reload();
	await expect(page.getByTestId("connection-status")).toHaveAttribute("data-status", "connected");
	await page.getByTestId("add-workspace").first().click();
	await expect(page.getByTestId("ws-target-default")).toHaveAttribute("data-active", "true");
});

test("the project picker offers to open another project without leaving the page", async ({
	page,
}) => {
	await openFixtureProject(page);
	await page.getByTestId("new-session").click();
	await page.getByTestId("ws-project-picker").click();
	await expect(page.getByTestId("ws-project-option").first()).toBeVisible();
	await expect(page.getByTestId("ws-project-open")).toBeVisible();
	await expect(page.getByTestId("ws-project-host-path")).toBeVisible();
	await page.getByTestId("ws-project-host-path").click();
	await expect(page.getByRole("dialog")).toBeVisible();
});
