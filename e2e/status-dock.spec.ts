import { expect, type Locator, type Page, test } from "@playwright/test";
import { enterDefaultWorkspace, openFixtureProject, openWorkspaceChat } from "./fixtures/app";

const BLOCK_IDS = ["environment", "context", "tasks", "connectors", "changes"];

async function blockOrder(page: Page): Promise<string[]> {
	return page
		.getByTestId("status-panel")
		.locator("[data-block-id]")
		.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-block-id") ?? ""));
}

async function box(locator: Locator) {
	const rect = await locator.boundingBox();
	if (!rect) throw new Error("Missing bounding box");
	return rect;
}

test("the status toggle sits left of the terminal entry and opens a dock beside the chat", async ({
	page,
}, testInfo) => {
	await page.setViewportSize({ width: 1400, height: 900 });
	await openWorkspaceChat(page);
	const toggle = page.getByTestId("open-status-panel");
	await expect(toggle).toBeVisible();
	await expect(toggle).toHaveAttribute("aria-pressed", "false");
	const terminalEntry = page.getByTestId("bottom-tool-rail");
	expect((await box(toggle)).x + (await box(toggle)).width).toBeLessThanOrEqual(
		(await box(terminalEntry)).x,
	);

	const input = page.getByTestId("chat-input");
	const closedInput = await box(input);
	await expect(page.getByTestId("status-panel")).toHaveCount(0);
	await toggle.click();
	await expect(toggle).toHaveAttribute("aria-pressed", "true");
	const dock = page.getByTestId("status-dock");
	await expect(page.getByTestId("status-panel")).toBeVisible();
	await expect
		.poll(async () => (await box(dock)).width, { message: "the dock finishes sliding in" })
		.toBeGreaterThan(300);

	// The conversation narrows and slides left; the dock takes the freed width on the right.
	await expect.poll(async () => (await box(input)).width).toBeLessThan(closedInput.width);
	const pane = await box(page.getByTestId("chat-pane"));
	const dockBox = await box(dock);
	expect(dockBox.x + dockBox.width).toBeCloseTo(pane.x + pane.width, 0);
	expect(dockBox.width).toBeLessThanOrEqual(Math.min(384, pane.width * 0.45) + 1);
	expect((await box(input)).x + (await box(input)).width).toBeLessThanOrEqual(dockBox.x + 1);
	expect(await blockOrder(page)).toEqual(BLOCK_IDS);
	await expect(page.getByTestId("scope-branch")).toBeVisible();
	await testInfo.attach("status-dock-open", {
		body: await page.screenshot({ path: testInfo.outputPath("status-dock-open.png") }),
		contentType: "image/png",
	});

	await toggle.click();
	await expect(toggle).toHaveAttribute("aria-pressed", "false");
	await expect(page.getByTestId("status-panel")).toHaveCount(0);
	await expect.poll(async () => (await box(input)).width).toBeCloseTo(closedInput.width, 0);
});

test("blocks fold, reorder by keyboard and by drag, and keep that across a reload", async ({
	page,
}) => {
	await page.setViewportSize({ width: 1400, height: 900 });
	await openWorkspaceChat(page);
	await page.getByTestId("open-status-panel").click();
	await expect(page.getByTestId("status-panel")).toBeVisible();

	const body = page.getByTestId("status-block-body-context");
	await expect(body).toBeVisible();
	await page.getByTestId("status-block-toggle-context").click();
	await expect(body).toBeHidden();
	await expect(page.getByTestId("status-block-toggle-context")).toHaveAttribute(
		"aria-expanded",
		"false",
	);

	const handle = page.getByTestId("status-block-handle-changes");
	await page.getByTestId("status-block-changes").hover();
	await handle.focus();
	await page.keyboard.press("Alt+ArrowUp");
	await expect
		.poll(() => blockOrder(page))
		.toEqual(["environment", "context", "tasks", "changes", "connectors"]);
	await expect(handle).toBeFocused();

	// Dragging the Context grip down until the block's centre passes Tasks lands it after Tasks.
	const grip = page.getByTestId("status-block-handle-context");
	await page.getByTestId("status-block-context").hover();
	const from = await box(grip);
	const context = await box(page.getByTestId("status-block-context"));
	const tasks = await box(page.getByTestId("status-block-tasks"));
	const dy = tasks.y + tasks.height - (context.y + context.height / 2);
	await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
	await page.mouse.down();
	await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + dy / 2, { steps: 6 });
	await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + dy, { steps: 6 });
	await page.mouse.up();
	await expect
		.poll(() => blockOrder(page))
		.toEqual(["environment", "tasks", "context", "changes", "connectors"]);

	await page.reload();
	await expect(page.getByTestId("status-panel")).toBeVisible();
	expect(await blockOrder(page)).toEqual([
		"environment",
		"tasks",
		"context",
		"changes",
		"connectors",
	]);
	await expect(page.getByTestId("status-block-body-context")).toBeHidden();
	await expect(page.getByTestId("open-status-panel")).toHaveAttribute("aria-pressed", "true");
});

test("a workspace without a chat still shows its environment and changes beside the empty state", async ({
	page,
}) => {
	await page.setViewportSize({ width: 1400, height: 900 });
	await openFixtureProject(page);
	await enterDefaultWorkspace(page);
	await page.getByTestId("open-status-panel").click();
	const panel = page.getByTestId("status-panel");
	await expect(panel).toBeVisible();
	await expect(page.getByTestId("workspace-ready")).toBeVisible();
	await expect(panel.getByTestId("scope-branch")).toHaveText("main");
	await expect(panel.getByTestId("status-context-empty")).toBeVisible();
	await expect(panel.getByTestId("status-tasks-empty")).toBeVisible();
	await expect(panel.getByTestId("status-connectors-empty")).toBeVisible();
	await expect(panel.getByTestId("status-changes-state")).toBeVisible();
});

test("a chat's context, connectors and tasks read the engine's report for that chat", async ({
	page,
}) => {
	await page.setViewportSize({ width: 1400, height: 900 });
	await openWorkspaceChat(page);
	await page.getByTestId("open-status-panel").click();
	const panel = page.getByTestId("status-panel");
	await expect(panel.getByTestId("status-block-context")).toBeVisible();
	await expect(panel.getByTestId("resources-active")).toBeVisible();
	await expect(panel.getByTestId("status-connectors-manage")).toBeVisible();
	await panel.getByTestId("status-connectors-manage").click();
	await expect(page.getByRole("dialog")).toBeVisible();
});
