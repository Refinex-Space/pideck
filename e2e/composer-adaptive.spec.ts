import { expect, test } from "@playwright/test";
import {
	hideAuxiliaryWorkbench,
	openAppSettings,
	openWorkspaceChat,
	PHONE_VIEWPORT,
} from "./fixtures/app";

async function box(locator: import("@playwright/test").Locator) {
	const value = await locator.boundingBox();
	if (!value) throw new Error("composer element has no layout box");
	return value;
}

test("the text-input surface follows the transcript measure and shrinks with its pane", async ({
	page,
}) => {
	await page.setViewportSize({ width: 2316, height: 1000 });
	await openWorkspaceChat(page);
	for (const width of [2316, 1440, 700]) {
		await page.setViewportSize({ width, height: 1000 });
		await expect
			.poll(() =>
				page.getByTestId("chat-view").evaluate((chat) => {
					const input = chat.querySelector('[data-testid="chat-input-surface"]');
					if (!input) throw new Error("Input surface missing");
					const probe = document.createElement("div");
					probe.style.position = "absolute";
					probe.style.width = "var(--chat-transcript-width)";
					chat.append(probe);
					const measure = probe.getBoundingClientRect().width;
					probe.remove();
					const gutter = Number.parseFloat(
						getComputedStyle(chat).getPropertyValue("--chat-gutter"),
					);
					const pane = chat.getBoundingClientRect();
					const surface = input.getBoundingClientRect();
					return Math.max(
						Math.abs(surface.width - (Math.min(measure, pane.width) - 2 * gutter)),
						Math.abs(surface.x + surface.width / 2 - (pane.x + pane.width / 2)),
					);
				}),
			)
			.toBeLessThanOrEqual(1);
	}
});

test("zoomed history keeps the full chat width above the measured composer", async ({ page }) => {
	await page.setViewportSize({ width: 2316, height: 1000 });
	await openWorkspaceChat(page);
	await page.getByTestId("chat-input").press("Control+r");
	const overlay = page.getByTestId("history-overlay");
	await expect(overlay).toHaveAttribute("data-stage", "compact");
	await page.getByTestId("history-query").press("Tab");
	await expect(overlay).toHaveAttribute("data-stage", "zoomed");
	await expect(page.getByTestId("history-preview")).toBeVisible();
	const chatBox = await box(page.getByTestId("chat-view"));
	const shellBox = await box(page.getByTestId("chat-composer-shell"));
	const overlayBox = await box(overlay);
	expect(overlayBox.width).toBeGreaterThan(shellBox.width + 200);
	expect(overlayBox.width).toBeGreaterThanOrEqual(chatBox.width - 18);
	await page.getByTestId("history-query").press("Escape");
	await expect(overlay).toBeHidden();
	await expect(page.getByTestId("chat-input")).toBeFocused();
});

test("idle composer keeps one message line above a stable controls row", async ({ page }) => {
	await openWorkspaceChat(page);

	const composer = page.getByTestId("chat-composer");
	const shell = page.getByTestId("chat-composer-shell");
	const surface = page.getByTestId("chat-input-surface");
	const input = page.getByTestId("chat-input");
	const model = page.getByTestId("model-selector");
	const send = page.getByTestId("chat-send");

	const compactShell = await box(shell);
	const compactSurface = await box(surface);
	const compactInput = await box(input);
	const compactWrapMeasure = await box(page.getByTestId("chat-input-sizer"));
	const compactModel = await box(model);
	expect(compactInput.height).toBeGreaterThanOrEqual(32);
	expect(compactInput.height).toBeLessThanOrEqual(48);
	await expect(composer).toHaveAttribute("data-expanded", "false");
	expect(compactShell.height).toBeGreaterThanOrEqual(compactInput.height + compactModel.height);
	// The send button lives inside the card, so the card may be a few px taller than the text row.
	expect(compactSurface.height).toBeGreaterThanOrEqual(compactInput.height);
	expect(compactSurface.height - compactInput.height).toBeLessThanOrEqual(12);
	expect(Math.abs(compactSurface.width - compactShell.width)).toBeLessThanOrEqual(0.5);
	expect(compactSurface.height).toBeLessThan(compactShell.height - compactModel.height);
	const paint = await shell.evaluate((element) => {
		const inputSurface = element.querySelector<HTMLElement>('[data-testid="chat-input-surface"]');
		if (!inputSurface) throw new Error("input surface missing");
		const outer = getComputedStyle(element);
		const inner = getComputedStyle(inputSurface);
		return {
			outerFill: outer.backgroundColor,
			outerShadow: outer.boxShadow,
			outerBorder: outer.borderTopWidth,
			inputFill: inner.backgroundColor,
			inputShadow: inner.boxShadow,
		};
	});
	expect(paint.outerFill).toBe("rgba(0, 0, 0, 0)");
	expect(paint.outerShadow).toBe("none");
	expect(paint.outerBorder).toBe("0px");
	expect(paint.inputFill).not.toBe("rgba(0, 0, 0, 0)");
	expect(paint.inputShadow).not.toBe("none");
	expect(compactInput.x).toBeLessThanOrEqual(compactShell.x + 8);
	expect(compactSurface.x + compactSurface.width).toBeGreaterThanOrEqual(
		compactShell.x + compactShell.width - 8,
	);
	const compactSend = await box(send);
	expect(compactSend.x).toBeGreaterThanOrEqual(compactInput.x + compactInput.width - 1);
	expect(compactSend.x + compactSend.width).toBeLessThanOrEqual(
		compactSurface.x + compactSurface.width,
	);
	expect(compactSend.y).toBeGreaterThanOrEqual(compactSurface.y);
	expect(compactSend.y + compactSend.height).toBeLessThanOrEqual(
		compactSurface.y + compactSurface.height,
	);
	expect(Math.abs(compactWrapMeasure.x - compactInput.x)).toBeLessThanOrEqual(0.5);
	expect(Math.abs(compactWrapMeasure.width - compactInput.width)).toBeLessThanOrEqual(0.5);

	const compactFooterBottom = compactModel.y + compactModel.height;
	for (const control of [model]) {
		const controlBox = await box(control);
		expect(controlBox.y).toBeGreaterThanOrEqual(compactSurface.y + compactSurface.height);
		expect(controlBox.y).toBeGreaterThanOrEqual(compactInput.y + compactInput.height);
		expect(Math.abs(controlBox.y + controlBox.height - compactFooterBottom)).toBeLessThanOrEqual(4);
	}

	await input.fill("Inspect the retry flow.\nThen add focused coverage.");
	await expect(composer).toHaveAttribute("data-expanded", "true");
	const expandedInput = await box(input);
	const expandedModel = await box(model);
	expect(expandedInput.height).toBeGreaterThan(compactInput.height);
	expect(expandedModel.y).toBeGreaterThanOrEqual(expandedInput.y + expandedInput.height);
	expect(Math.abs(expandedModel.y - compactModel.y)).toBeLessThanOrEqual(2);

	await input.fill("Short follow-up");
	await expect(composer).toHaveAttribute("data-expanded", "false");
	expect((await box(input)).height).toBeLessThanOrEqual(48);
	expect(Math.abs((await box(model)).y - compactModel.y)).toBeLessThanOrEqual(2);
});

test("panel width changes expand and collapse the same textarea", async ({ page }) => {
	await page.setViewportSize({ width: 1920, height: 900 });
	await openWorkspaceChat(page);

	const composer = page.getByTestId("chat-composer");
	const input = page.getByTestId("chat-input");
	const initialElement = await input.elementHandle();
	if (!initialElement) throw new Error("composer textarea missing");
	await input.fill(
		"Keep the same focused draft and selection while a narrower mounted chat panel makes this line wrap.",
	);
	await expect(composer).toHaveAttribute("data-expanded", "false");
	await input.evaluate((element) => element.setSelectionRange(18, 18));

	await page.setViewportSize({ width: 700, height: 900 });
	await expect(composer).toHaveAttribute("data-expanded", "true");
	expect(await input.evaluate((element, initial) => element === initial, initialElement)).toBe(
		true,
	);
	expect(await input.evaluate((element) => element.selectionStart)).toBe(18);

	await page.setViewportSize({ width: 1920, height: 900 });
	await expect(composer).toHaveAttribute("data-expanded", "false");
	expect(await input.evaluate((element, initial) => element === initial, initialElement)).toBe(
		true,
	);
});

test("half-chat growth caps the editor shell and scrolls the textarea", async ({ page }) => {
	await openWorkspaceChat(page);

	const chat = page.getByTestId("chat-view");
	const composer = page.getByTestId("chat-composer");
	const shell = page.getByTestId("chat-composer-shell");
	const input = page.getByTestId("chat-input");
	await input.fill(Array.from({ length: 80 }, (_, index) => `line ${index + 1}`).join("\n"));
	await expect(composer).toHaveAttribute("data-expanded", "true");

	const chatBox = await box(chat);
	const shellBox = await box(shell);
	expect(shellBox.height).toBeLessThanOrEqual(chatBox.height * 0.5 + 2);
	const overflow = await input.evaluate((element) => ({
		clientHeight: element.clientHeight,
		scrollHeight: element.scrollHeight,
		overflowY: getComputedStyle(element).overflowY,
	}));
	expect(overflow.scrollHeight).toBeGreaterThan(overflow.clientHeight);
	expect(overflow.overflowY).toBe("auto");
});

test("chat growth setting persists and compact means six visual lines", async ({ page }) => {
	await page.goto("/");
	await expect(page.getByTestId("connection-status")).toHaveAttribute("data-status", "connected");
	await openAppSettings(page);
	await page.getByTestId("settings-nav-chat").click();

	const compact = page.getByTestId("composer-growth-compact");
	const roomy = page.getByTestId("composer-growth-roomy");
	const half = page.getByTestId("composer-growth-half-chat");
	await expect(compact).toBeVisible();
	await expect(roomy).toBeVisible();
	await expect(half).toHaveAttribute("data-active", "true");
	await compact.click();
	await expect(compact).toHaveAttribute("data-active", "true");

	await page.reload();
	await expect(page.getByTestId("connection-status")).toHaveAttribute("data-status", "connected");
	await openAppSettings(page);
	await page.getByTestId("settings-nav-chat").click();
	await expect(compact).toHaveAttribute("data-active", "true");
	await page.keyboard.press("Escape");

	await openWorkspaceChat(page);
	const input = page.getByTestId("chat-input");
	await input.fill(Array.from({ length: 20 }, (_, index) => `line ${index + 1}`).join("\n"));
	const lines = await input.evaluate((element) => {
		const styles = getComputedStyle(element);
		return (
			(element.clientHeight -
				Number.parseFloat(styles.paddingTop) -
				Number.parseFloat(styles.paddingBottom)) /
			Number.parseFloat(styles.lineHeight)
		);
	});
	expect(lines).toBeGreaterThanOrEqual(5.9);
	expect(lines).toBeLessThanOrEqual(6.1);

	await openAppSettings(page);
	await page.getByTestId("settings-nav-chat").click();
	await half.click();
	await expect(half).toHaveAttribute("data-active", "true");
});

test("compact phone controls remain inside the chat viewport", async ({ page }) => {
	await openWorkspaceChat(page);
	await hideAuxiliaryWorkbench(page);
	await page.setViewportSize(PHONE_VIEWPORT);

	const composer = page.getByTestId("chat-composer");
	await expect(composer).toHaveAttribute("data-expanded", "false");
	const shellBox = await box(page.getByTestId("chat-composer-shell"));
	const idleTextMetrics = await page.getByTestId("chat-input").evaluate((element) => ({
		clientHeight: element.clientHeight,
		scrollHeight: element.scrollHeight,
	}));
	expect(idleTextMetrics.scrollHeight).toBeLessThanOrEqual(idleTextMetrics.clientHeight);
	expect(shellBox.x).toBeGreaterThanOrEqual(0);
	expect(shellBox.x + shellBox.width).toBeLessThanOrEqual(PHONE_VIEWPORT.width);
	for (const control of [page.getByTestId("model-selector"), page.getByTestId("chat-send")]) {
		const controlBox = await box(control);
		expect(controlBox.x).toBeGreaterThanOrEqual(0);
		expect(controlBox.x + controlBox.width).toBeLessThanOrEqual(PHONE_VIEWPORT.width);
	}
	const inputBox = await box(page.getByTestId("chat-input"));
	expect(inputBox.height).toBeLessThanOrEqual(48);
	expect(inputBox.x).toBeLessThanOrEqual(shellBox.x + 8);
	const phoneSurface = await box(page.getByTestId("chat-input-surface"));
	expect(phoneSurface.x + phoneSurface.width).toBeGreaterThanOrEqual(
		shellBox.x + shellBox.width - 8,
	);
	expect((await box(page.getByTestId("model-selector"))).y).toBeGreaterThanOrEqual(
		inputBox.y + inputBox.height,
	);
});
