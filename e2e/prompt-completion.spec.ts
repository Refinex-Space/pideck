import { expect, type Page, test } from "@playwright/test";
import { openFixtureProject, openNewSessionPage, openWorkspaceChat } from "./fixtures/app";

const sentPromptTexts = new WeakMap<Page, string[]>();

function readPromptText(payload: string | Buffer): string | null {
	try {
		const frame = JSON.parse(typeof payload === "string" ? payload : payload.toString()) as {
			method?: unknown;
			params?: { text?: unknown };
		};
		return frame.method === "session.prompt" && typeof frame.params?.text === "string"
			? frame.params.text
			: null;
	} catch {
		return null;
	}
}

test.beforeEach(({ page }) => {
	const prompts: string[] = [];
	sentPromptTexts.set(page, prompts);
	page.on("websocket", (socket) => {
		socket.on("framesent", ({ payload }) => {
			const text = readPromptText(payload);
			if (text !== null) prompts.push(text);
		});
	});
});

test.describe("prompt completion and tokens", () => {
	test("a slash after a space opens a skills-only menu and the pick becomes a coloured token", async ({
		page,
	}) => {
		await openWorkspaceChat(page);
		const input = page.getByTestId("chat-input");

		await input.fill("polish this with /skill:spec");
		const rows = page.getByTestId("slash-command");
		await expect(rows).toHaveCount(1);
		await expect(rows).toHaveAttribute("data-source", "skill");
		await expect(page.getByTestId("completion-detail")).toContainText("/skill:spec-graph");

		await input.press("Enter");
		await expect(input).toHaveValue("polish this with /skill:spec-graph ");
		await expect(page.getByTestId("slash-menu")).toHaveCount(0);
		const token = page.getByTestId("prompt-token");
		await expect(token).toHaveCount(1);
		await expect(token).toHaveText("/skill:spec-graph");
		await expect(token).toHaveAttribute("data-token-kind", "skill");
	});

	test("a slash that does not start a token, or is followed by a space, stays plain text", async ({
		page,
	}) => {
		await openWorkspaceChat(page);
		const input = page.getByTestId("chat-input");

		await input.fill("open src/sk");
		await expect(page.getByTestId("slash-menu")).toHaveCount(0);

		await input.fill("so /");
		await expect(page.getByTestId("slash-menu")).toBeVisible();
		await page.keyboard.type(" ");
		await expect(page.getByTestId("slash-menu")).toHaveCount(0);
		await expect(page.getByTestId("prompt-token")).toHaveCount(0);
	});

	test("an unknown slash name is not coloured", async ({ page }) => {
		await openWorkspaceChat(page);
		await page.getByTestId("chat-input").fill("ls /usr/bin and /skill:nothing-here");
		await expect(page.getByTestId("prompt-token")).toHaveCount(0);
	});

	test("a skill named mid-text is moved to the front on send, keeping the request in order", async ({
		page,
	}) => {
		await openWorkspaceChat(page);
		const input = page.getByTestId("chat-input");
		const prompts = sentPromptTexts.get(page);
		if (!prompts) throw new Error("prompt frame capture was not initialized");

		await input.fill("explain this /skill:spec-graph briefly");
		await page.getByTestId("chat-send").click();
		await expect.poll(() => prompts.at(-1)).toBe("/skill:spec-graph explain this briefly");
	});

	test("@ searches the whole workspace by name and the pick becomes a token", async ({ page }) => {
		await openWorkspaceChat(page);
		const input = page.getByTestId("chat-input");

		await input.fill("check @notes");
		const items = page.getByTestId("mention-item");
		await expect(items.filter({ hasText: "notes.txt" })).toHaveCount(1);

		await input.press("Enter");
		await expect(input).toHaveValue("check @notes.txt ");
		const token = page.getByTestId("prompt-token");
		await expect(token).toHaveText("@notes.txt");
		await expect(token).toHaveAttribute("data-token-kind", "mention");
	});

	test("an @ mention of a missing file is not coloured", async ({ page }) => {
		await openWorkspaceChat(page);
		await page.getByTestId("chat-input").fill("see @definitely-missing.ts please");
		await expect(page.getByTestId("prompt-token")).toHaveCount(0);
	});

	test("hovering a token explains it in a card without moving the caret", async ({ page }) => {
		await openWorkspaceChat(page);
		const input = page.getByTestId("chat-input");
		await input.fill("use /skill:spec-graph now");
		await input.evaluate((el) => (el as HTMLTextAreaElement).setSelectionRange(3, 3));

		const token = page.getByTestId("prompt-token");
		const box = await token.boundingBox();
		if (!box) throw new Error("token has no box");
		await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
		const card = page.getByTestId("prompt-token-card");
		await expect(card).toBeVisible();
		await expect(card).toContainText("/skill:spec-graph");

		await page.mouse.move(box.x + box.width + 120, box.y - 120);
		await expect(card).toHaveCount(0);
		await expect(input).toBeFocused();
		expect(await input.evaluate((el) => (el as HTMLTextAreaElement).selectionStart)).toBe(3);
	});

	test("a sent @mention renders as a chip that opens the file", async ({ page }) => {
		await openWorkspaceChat(page);
		const input = page.getByTestId("chat-input");
		await input.fill("look at @notes.txt");
		await page.getByTestId("chat-send").click();

		const chip = page.getByTestId("user-mention");
		await expect(chip).toHaveText("@notes.txt");
		await expect(chip).toHaveAttribute("data-path", "notes.txt");
		await expect(page.getByTestId("user-message-body").last()).toContainText("look at @notes.txt");
	});
});

test.describe("new session page", () => {
	test("@ searches the project folder and a mid-text skill is offered", async ({ page }) => {
		await openFixtureProject(page);
		await openNewSessionPage(page, "default");
		const prompt = page.getByTestId("new-workspace-page").getByTestId("ws-prompt");

		await prompt.fill("check @notes");
		await expect(page.getByTestId("mention-item").filter({ hasText: "notes.txt" })).toHaveCount(1);
		await prompt.press("Enter");
		await expect(prompt).toHaveValue("check @notes.txt ");
		await expect(page.getByTestId("prompt-token")).toHaveText("@notes.txt");
	});
});
