import { expect, test } from "@playwright/test";
import {
	createWorkspaceViaDialog,
	expandDisclosure,
	hideAuxiliaryWorkbench,
	openFixtureProject,
	openNewSessionPage,
	PHONE_VIEWPORT,
	revealModelGroups,
	worktreeRows,
} from "./fixtures/app";

async function openChat(page: import("@playwright/test").Page): Promise<void> {
	await openFixtureProject(page);
	await openNewSessionPage(page);
	const trustDialog = page.getByTestId("new-workspace-page");
	await expect(trustDialog).toBeVisible();
	await trustDialog.getByTestId("ws-trust-project").click();
	await expect(trustDialog.getByTestId("ws-trust-notice")).toBeHidden();
	await createWorkspaceViaDialog(page);
	await expect(worktreeRows(page).first()).toHaveAttribute("data-active", "true");
	await expect(page.locator('[data-testid="editor-tab"][data-kind="chat"]')).toHaveCount(1);
	await expect(page.getByTestId("chat-input")).toBeVisible();
}

test("streaming unfolds the one-line draft into a complete action rail", {
	tag: "@agent",
}, async ({ page }) => {
	test.setTimeout(90_000);
	await openChat(page);
	await hideAuxiliaryWorkbench(page);
	await page.setViewportSize(PHONE_VIEWPORT);

	const input = page.getByTestId("chat-input");
	await input.fill("Use the bash tool to run `sleep 8`, then reply with done.");
	await page.getByTestId("chat-send").click();

	const composer = page.getByTestId("chat-composer");
	await expect(page.getByTestId("chat-abort")).toBeVisible();
	await expect(page.getByTestId("send-menu")).toBeVisible();
	await expect(composer).toHaveAttribute("data-expanded", "true");
	const inputBox = await input.boundingBox();
	const modelBox = await page.getByTestId("model-selector").boundingBox();
	if (!inputBox || !modelBox) throw new Error("Composer layout boxes were not measurable");
	expect(inputBox.height).toBeLessThanOrEqual(40);
	expect(modelBox.y).toBeGreaterThanOrEqual(inputBox.y + inputBox.height);
	const shellBox = await page.getByTestId("chat-composer-shell").boundingBox();
	if (!shellBox) throw new Error("Composer shell was not measurable");
	expect(shellBox.x).toBeGreaterThanOrEqual(0);
	expect(shellBox.x + shellBox.width).toBeLessThanOrEqual(PHONE_VIEWPORT.width);
	for (const control of [
		page.getByTestId("chat-abort"),
		page.getByTestId("send-menu"),
		page.getByTestId("chat-send"),
	]) {
		const controlBox = await control.boundingBox();
		if (!controlBox) throw new Error("Streaming composer control was not measurable");
		expect(controlBox.x).toBeGreaterThanOrEqual(0);
		expect(controlBox.x + controlBox.width).toBeLessThanOrEqual(PHONE_VIEWPORT.width);
	}

	await page.getByTestId("chat-abort").click();
	await expect(page.getByTestId("chat-abort")).toBeHidden();
});

test("model picker plus file and portable-skill completion use the live session catalog", {
	tag: "@agent",
}, async ({ page }) => {
	await openChat(page);

	const modelSelector = page.getByTestId("model-selector");
	await expect(modelSelector).toBeEnabled();
	await modelSelector.click();
	// Provider groups other than the current model's start collapsed; open one so it lists options.
	await revealModelGroups(page);
	await expandDisclosure(page.getByTestId("model-group-toggle").first());
	await expect(page.getByTestId("model-option").first()).toBeVisible();
	expect(await page.getByTestId("model-option").count()).toBeGreaterThan(0);
	await page.keyboard.press("Escape");
	await expect(page.getByTestId("model-option")).toHaveCount(0);

	await expect(page.getByTestId("thinking-selector")).toBeVisible();

	const panel = await openStatusDock(page);
	await expect(panel.getByTestId("status-context")).toBeVisible();
	await expect(panel.getByTestId("status-context-window")).toContainText(/[?\d]\s*\/\s*\d/);

	const input = page.getByTestId("chat-input");
	await input.fill("/e2e");
	const portableSkill = page
		.getByTestId("slash-command")
		.filter({ hasText: "/skill:e2e-portable" });
	await expect(portableSkill).toBeVisible();
	await expect(portableSkill).toContainText("Project");
	await input.press("Tab");
	await expect(input).toHaveValue("/skill:e2e-portable ");
	await input.evaluate(
		() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
	);

	await input.fill("@RE");
	const mention = page.getByTestId("mention-item").filter({ hasText: "README.md" });
	await expect(mention).toBeVisible();
	await mention.click();
	await expect(input).toHaveValue(/@README\.md/);
});

test("stats refresh after a turn completes (cheap win #3)", { tag: "@agent" }, async ({ page }) => {
	test.setTimeout(90_000);
	await openChat(page);

	await page.getByTestId("chat-input").fill("Reply with the single word: pong");
	await page.getByTestId("chat-send").click();

	await expect(
		page.locator('[data-testid="chat-message"][data-role="system"]').filter({ hasText: "Done" }),
	).toBeVisible({ timeout: 80_000 });
	const context = (await openStatusDock(page)).getByTestId("status-context");
	await expect(context).toBeVisible();
	await expect(context.getByTestId("status-context-messages")).toBeVisible();
	await expect(context.getByTestId("status-context-input")).toBeVisible();

	await hideAuxiliaryWorkbench(page);
	await page.setViewportSize(PHONE_VIEWPORT);
	await expect
		.poll(async () => {
			const chatBox = await page.getByTestId("chat-view").boundingBox();
			return chatBox ? chatBox.x + chatBox.width : Number.POSITIVE_INFINITY;
		})
		.toBeLessThanOrEqual(PHONE_VIEWPORT.width);
	const toggleBox = await page.getByTestId("open-status-panel").boundingBox();
	if (!toggleBox) throw new Error("status toggle has no bounding box");
	expect(toggleBox.x).toBeGreaterThanOrEqual(0);
	expect(toggleBox.x + toggleBox.width).toBeLessThanOrEqual(PHONE_VIEWPORT.width);
});
