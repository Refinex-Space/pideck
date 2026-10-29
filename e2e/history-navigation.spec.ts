import { expect, type Locator, type Page, test } from "@playwright/test";
import {
	closeTabViaMenu,
	createWorkspaceViaDialog,
	goProjectHome,
	openFixtureProject,
} from "./fixtures/app";

// The strip shows only the current chat; the sidebar's session rows are the open chats.
const currentChat = (page: Page) => page.locator('[data-testid="editor-tab"][data-kind="chat"]');
const chatTabs = (page: Page) =>
	page.locator('[data-testid="workspace-session"][data-open="true"]');
const rowFor = (page: Page, hash: string) =>
	page.locator(`[data-testid="workspace-session"][data-session-id="${hash.split("/chats/")[1]}"]`);
const switchToChat = (row: Locator) => row.locator("button").first().click();
const currentHash = (page: Page) => page.evaluate(() => window.location.hash);

async function openTwoChats(page: Page): Promise<{ chat1Hash: string; chat2Hash: string }> {
	await openFixtureProject(page);
	await createWorkspaceViaDialog(page);
	await expect(currentChat(page)).toHaveCount(1);
	await expect.poll(() => currentHash(page)).toContain("/chats/");
	const chat1Hash = await currentHash(page);

	await page.getByTestId("new-chat").first().click();
	await expect(chatTabs(page)).toHaveCount(2);
	await expect.poll(() => currentHash(page)).not.toBe(chat1Hash);
	const chat2Hash = await currentHash(page);
	expect(chat2Hash).toContain("/chats/");
	return { chat1Hash, chat2Hash };
}

test("Back and Forward step through chat switches and scope moves", async ({ page }) => {
	const { chat1Hash, chat2Hash } = await openTwoChats(page);

	await switchToChat(chatTabs(page).first());
	await expect(chatTabs(page).first()).toHaveAttribute("data-active", "true");
	await expect.poll(() => currentHash(page)).toBe(chat1Hash);

	await page.getByTestId("navigate-back").click();
	await expect.poll(() => currentHash(page)).toBe(chat2Hash);
	await expect(chatTabs(page).last()).toHaveAttribute("data-active", "true");

	await page.getByTestId("navigate-back").click();
	await expect.poll(() => currentHash(page)).toBe(chat1Hash);
	await expect(chatTabs(page).first()).toHaveAttribute("data-active", "true");

	await page.getByTestId("navigate-forward").click();
	await expect.poll(() => currentHash(page)).toBe(chat2Hash);
	await expect(chatTabs(page).last()).toHaveAttribute("data-active", "true");
	await page.getByTestId("navigate-forward").click();
	await expect.poll(() => currentHash(page)).toBe(chat1Hash);
	await expect(chatTabs(page).first()).toHaveAttribute("data-active", "true");

	await goProjectHome(page);
	await expect.poll(() => currentHash(page)).not.toContain("/workspaces/");
	await page.getByTestId("navigate-back").click();
	await expect.poll(() => currentHash(page)).toBe(chat1Hash);
	await expect(chatTabs(page).first()).toHaveAttribute("data-active", "true");
});

test("Back returns to a deep-linked chat entry", async ({ page }) => {
	const { chat1Hash, chat2Hash } = await openTwoChats(page);

	await page.goto("about:blank");
	await page.goto(`/${chat1Hash}`);
	await expect(page.getByTestId("connection-status")).toHaveAttribute("data-status", "connected");
	await expect.poll(() => currentHash(page)).toBe(chat1Hash);
	await expect(rowFor(page, chat1Hash)).toHaveAttribute("data-active", "true");

	await switchToChat(rowFor(page, chat2Hash));
	await expect.poll(() => currentHash(page)).toBe(chat2Hash);
	await page.goBack();
	await expect.poll(() => currentHash(page)).toBe(chat1Hash);
	await expect(rowFor(page, chat1Hash)).toHaveAttribute("data-active", "true");
});

test("Back reopens a just-closed local chat without a current-layout wire write", async ({
	page,
}) => {
	const methods: string[] = [];
	await page.routeWebSocket(/\/ws(\?|$)/, (ws) => {
		const server = ws.connectToServer();
		ws.onMessage((message) => {
			const raw = typeof message === "string" ? message : message.toString();
			try {
				const frame = JSON.parse(raw) as { method?: string };
				if (frame.method) methods.push(frame.method);
			} catch {}
			server.send(raw);
		});
		server.onMessage((message) => ws.send(message));
	});

	const { chat1Hash, chat2Hash } = await openTwoChats(page);
	methods.length = 0;
	await closeTabViaMenu(page, currentChat(page));
	await expect(chatTabs(page)).toHaveCount(1);
	await expect.poll(() => currentHash(page)).toBe(chat1Hash);
	expect(methods).not.toContain("layout.replace");

	await page.goBack();
	await expect.poll(() => currentHash(page)).toBe(chat2Hash);
	await expect(chatTabs(page)).toHaveCount(2);
	await expect(chatTabs(page).last()).toHaveAttribute("data-active", "true");
});

test("a closed chat's entry survives Back; a deleted chat's entry falls back", async ({ page }) => {
	const { chat1Hash, chat2Hash } = await openTwoChats(page);

	await closeTabViaMenu(page, currentChat(page));
	await expect(chatTabs(page)).toHaveCount(1);
	await expect.poll(() => currentHash(page)).toBe(chat1Hash);

	await page.goBack();
	await expect.poll(() => currentHash(page)).toBe(chat2Hash);
	await expect(chatTabs(page)).toHaveCount(2);
	await expect(chatTabs(page).last()).toHaveAttribute("data-active", "true");

	await closeTabViaMenu(page, currentChat(page));
	await expect(chatTabs(page)).toHaveCount(1);
	await expect.poll(() => currentHash(page)).toBe(chat1Hash);
	await page.getByTestId("chat-history").first().click();
	await page.getByTestId("closed-chat-row").first().getByTestId("closed-chat-delete").click();
	await expect(page.getByTestId("closed-chat-row")).toHaveCount(0);
	await page.keyboard.press("Escape");

	await page.goBack();
	await expect.poll(() => currentHash(page)).toBe(chat1Hash);
	await expect(currentChat(page)).toHaveCount(1);
	await expect(currentChat(page)).toHaveAttribute("data-active", "true");
});

test("toolbar history survives reload, truncates Forward after a new route and follows sidebar folding", async ({
	page,
}) => {
	const { chat1Hash, chat2Hash } = await openTwoChats(page);
	await expect(page.getByTestId("navigate-forward")).toBeDisabled();
	await page.getByTestId("navigate-back").click();
	await expect.poll(() => currentHash(page)).toBe(chat1Hash);
	await page.reload();
	await expect(page.getByTestId("connection-status")).toHaveAttribute("data-status", "connected");
	await expect(page.getByTestId("navigate-forward")).toBeEnabled();
	await page.getByTestId("navigate-forward").click();
	await expect.poll(() => currentHash(page)).toBe(chat2Hash);
	await page.getByTestId("navigate-back").click();
	await expect.poll(() => currentHash(page)).toBe(chat1Hash);
	await page.getByTestId("new-chat").first().click();
	await expect.poll(() => currentHash(page)).not.toBe(chat1Hash);
	await expect(page.getByTestId("navigate-forward")).toBeDisabled();
	await page.getByTestId("tool-rail-projects").click();
	await expect(page.getByTestId("left-stack")).toHaveCount(0);
	await expect(page.getByTestId("navigation-history")).toHaveCount(1);
	await expect(page.getByTestId("navigate-back")).toBeVisible();
	await page.getByTestId("navigate-back").click();
	await expect.poll(() => currentHash(page)).toBe(chat1Hash);
});
