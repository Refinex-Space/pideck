import { expect, type Page, test } from "@playwright/test";
import { hideAuxiliaryWorkbench, openWorkspaceChat, PHONE_VIEWPORT } from "./fixtures/app";
import { shot } from "./fixtures/screenshots";

const PIXEL_PNG = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMCAoGB9x0AAAAASUVORK5CYII=",
	"base64",
);

async function box(locator: import("@playwright/test").Locator) {
	const value = await locator.boundingBox();
	if (!value) throw new Error("composer element has no layout box");
	return value;
}

/** Answers every `session.getStats` with a fixed context usage so the ring has a share to draw. */
async function fixContextUsage(
	page: Page,
	usage: { tokens: number; contextWindow: number; percent: number },
) {
	await page.routeWebSocket(/\/ws(\?|$)/, (socket) => {
		const server = socket.connectToServer();
		const statsRequests = new Set<string>();
		socket.onMessage((message) => {
			try {
				const request = JSON.parse(typeof message === "string" ? message : message.toString()) as {
					id?: string;
					method?: string;
				};
				if (request.method === "session.getStats" && request.id) statsRequests.add(request.id);
			} catch {}
			server.send(message);
		});
		server.onMessage((message) => {
			try {
				const frame = JSON.parse(typeof message === "string" ? message : message.toString()) as {
					id?: string;
					ok?: boolean;
					result?: object;
				};
				if (frame.id && statsRequests.has(frame.id) && frame.ok) {
					socket.send(
						JSON.stringify({ ...frame, result: { ...frame.result, contextUsage: usage } }),
					);
					return;
				}
			} catch {}
			socket.send(message);
		});
	});
}

test("the model, context ring, dictation and send sit in one toolbar inside the composer", async ({
	page,
}) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	await openWorkspaceChat(page);

	const surface = await box(page.getByTestId("chat-input-surface"));
	const toolbar = await box(page.getByTestId("chat-composer-toolbar"));
	const input = await box(page.getByTestId("chat-input"));
	const add = await box(page.getByTestId("composer-add"));
	const model = await box(page.getByTestId("model-selector"));
	const ring = await box(page.getByTestId("context-ring"));
	const send = await box(page.getByTestId("chat-send"));

	const inside = (value: { x: number; y: number; width: number; height: number }) =>
		value.x >= surface.x - 0.5 &&
		value.y >= surface.y - 0.5 &&
		value.x + value.width <= surface.x + surface.width + 0.5 &&
		value.y + value.height <= surface.y + surface.height + 0.5;
	for (const part of [toolbar, add, model, ring, send]) expect(inside(part)).toBe(true);

	// The text sits above the toolbar; the toolbar is one row, plus on the left, then model → ring → send.
	expect(toolbar.y).toBeGreaterThanOrEqual(input.y + input.height - 1);
	expect(add.x).toBeLessThan(model.x);
	expect(model.x + model.width).toBeLessThanOrEqual(ring.x + 1);
	expect(ring.x + ring.width).toBeLessThanOrEqual(send.x + 1);
	for (const part of [model, ring, send])
		expect(Math.abs(part.y + part.height / 2 - (add.y + add.height / 2))).toBeLessThanOrEqual(2);
	expect(surface.x + surface.width - (send.x + send.width)).toBeLessThanOrEqual(16);

	// Nothing hangs below the card any more: the picker used to sit under it.
	await expect(page.getByTestId("chat-composer-shell")).toHaveCSS(
		"background-color",
		"rgba(0, 0, 0, 0)",
	);
	const shell = await box(page.getByTestId("chat-composer-shell"));
	expect(Math.abs(shell.height - surface.height)).toBeLessThanOrEqual(1);
	await shot(page.getByTestId("chat-composer"), "composer-toolbar", "idle");

	await page.getByTestId("model-selector").click();
	const list = page.locator('[data-testid="model-option"], [cmdk-input]').first();
	await expect(list).toBeVisible();
	const listBox = await box(page.locator("[cmdk-root]").first());
	// Opened from the right edge, upward: it ends at the trigger's right side and stays above the toolbar.
	expect(listBox.y + listBox.height).toBeLessThanOrEqual(toolbar.y + 1);
	expect(Math.abs(listBox.x + listBox.width - (model.x + model.width))).toBeLessThanOrEqual(24);
	await shot(page, "composer-toolbar", "model-picker");
});

test("the ring draws the used share, names it on hover, and opens the status dock on click", async ({
	page,
}) => {
	await fixContextUsage(page, { tokens: 474_000, contextWindow: 828_000, percent: 57 });
	await openWorkspaceChat(page);

	const ring = page.getByTestId("context-ring");
	await expect(ring).toHaveAttribute("data-percent", "57");
	await expect(ring).toHaveAttribute("data-tone", "info");
	await expect(ring).toHaveAttribute("aria-label", "57% (474k / 828k) context used");
	const arc = await page.getByTestId("context-ring-progress").getAttribute("stroke-dasharray");
	const [filled, whole] = (arc ?? "").split(" ").map(Number);
	expect((filled ?? 0) / (whole ?? 1)).toBeCloseTo(0.57, 2);

	await ring.hover();
	await expect(page.getByRole("tooltip").first()).toContainText("57% (474k / 828k) context used");
	await shot(page.getByTestId("chat-composer"), "composer-toolbar", "context-ring");

	await ring.click();
	await expect(page.getByTestId("status-panel")).toBeVisible();
	await expect(page.getByTestId("status-context-used")).toContainText("57%");
});

test("a high share turns the ring to the warning colour", async ({ page }) => {
	await fixContextUsage(page, { tokens: 700_000, contextWindow: 828_000, percent: 84.5 });
	await openWorkspaceChat(page);
	const ring = page.getByTestId("context-ring");
	await expect(ring).toHaveAttribute("data-tone", "warning");
	await expect(page.getByTestId("context-ring-progress")).toHaveClass(/stroke-feedback-warning/);
});

test("the plus menu puts files, commands and images into the message", async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	await openWorkspaceChat(page);
	const input = page.getByTestId("chat-input");
	const add = page.getByTestId("composer-add");

	await add.click();
	const menu = page.getByTestId("composer-add-menu");
	await expect(menu).toBeVisible();
	for (const action of ["images", "files", "skills", "templates", "commands"])
		await expect(menu.getByTestId(`composer-add-${action}`)).toBeVisible();
	await shot(page, "composer-toolbar", "add-menu");

	await menu.getByTestId("composer-add-files").click();
	await expect(menu).toBeHidden();
	await expect(input).toHaveValue("@");
	await expect(input).toBeFocused();
	await expect(page.getByTestId("mention-menu")).toBeVisible();
	await input.fill("");

	await add.click();
	await page.getByTestId("composer-add-commands").click();
	await expect(input).toHaveValue("/");
	await expect(page.getByTestId("slash-menu")).toBeVisible();
	await input.fill("hello");

	// Once the draft has text, commands and templates are unavailable — only the start of a message dispatches them.
	await add.click();
	await expect(page.getByTestId("composer-add-templates")).toHaveAttribute("data-disabled", "");
	await expect(page.getByTestId("composer-add-commands")).toHaveAttribute("data-disabled", "");
	await page.getByTestId("composer-add-files").click();
	await expect(input).toHaveValue("hello @");
});

test("the plus menu's image row opens a picker and attaches the file to the draft", async ({
	page,
}) => {
	await openWorkspaceChat(page);
	await page.getByTestId("composer-add").click();
	const chooser = page.waitForEvent("filechooser");
	await page.getByTestId("composer-add-images").click();
	(await chooser).setFiles({ name: "pixel.png", mimeType: "image/png", buffer: PIXEL_PNG });
	await expect(page.getByTestId("composer-image")).toHaveCount(1);
});

test("on a phone-width window the toolbar stays inside the card", async ({ page }) => {
	await openWorkspaceChat(page);
	await hideAuxiliaryWorkbench(page);
	await page.setViewportSize(PHONE_VIEWPORT);
	const surface = await box(page.getByTestId("chat-input-surface"));
	for (const id of ["composer-add", "model-selector", "context-ring", "chat-send"]) {
		const part = await box(page.getByTestId(id));
		expect(part.x).toBeGreaterThanOrEqual(surface.x - 0.5);
		expect(part.x + part.width).toBeLessThanOrEqual(surface.x + surface.width + 0.5);
	}
	const sidewaysScroll = await page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth,
	);
	expect(sidewaysScroll).toBeLessThanOrEqual(0);
});
