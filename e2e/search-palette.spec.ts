import { realpathSync, rmSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import {
	type AskUserQuestionArgs,
	SEARCH_PROTOCOL_VERSION,
	WS_CHANNELS,
} from "@thinkrail/contracts";
import {
	defaultWorkspaceRow,
	enterDefaultWorkspace,
	openFixtureProject,
	pressPlatformShortcut,
} from "./fixtures/app";
import { E2E_FIXTURE_REPO } from "./fixtures/paths";
import { seedWorkspaceSession } from "./fixtures/sessions";

const BASE_TS = 1_704_000_000_000;
const askArgs: AskUserQuestionArgs = {
	questions: [
		{
			question: "Which?",
			header: "Pick",
			options: [
				{ label: "A", description: "a" },
				{ label: "B", description: "b" },
			],
		},
	],
};

function palette(page: Page) {
	return page.getByTestId("search-palette");
}

async function openPalette(page: Page): Promise<void> {
	await pressPlatformShortcut(page, "k");
	await expect(palette(page)).toBeVisible();
	await expect(page.getByTestId("search-input")).toBeFocused();
}

async function doubleShift(page: Page): Promise<void> {
	await page.keyboard.press("Shift");
	await page.keyboard.press("Shift");
}

function seedAttention(repo: string) {
	return [
		seedWorkspaceSession(repo, {
			name: "Needs input chat",
			messages: [
				{ role: "user", text: "ask", timestamp: BASE_TS },
				{
					role: "assistant",
					content: [{ type: "toolCall", id: "q", name: "ask_user_question", arguments: askArgs }],
					stopReason: "toolUse",
					timestamp: BASE_TS + 1,
				},
			],
		}),
		seedWorkspaceSession(repo, {
			name: "Unread result chat",
			messages: [
				{ role: "user", text: "do", timestamp: BASE_TS + 10 },
				{ role: "assistant", text: "done", timestamp: BASE_TS + 11 },
			],
		}),
	];
}

test("the empty palette lists the chats waiting for you; arrows, Enter, click and Esc resolve them", async ({
	page,
}) => {
	const repo = realpathSync(E2E_FIXTURE_REPO);
	await openFixtureProject(page);
	const seeded = seedAttention(repo);
	try {
		await page.reload();
		await expect(page.getByTestId("connection-status")).toHaveAttribute("data-status", "connected");
		await expect(defaultWorkspaceRow(page)).toHaveAttribute("data-attention", "true");

		await openPalette(page);
		const waiting = page.locator('[data-testid="search-section"][data-section="waiting"]');
		const rows = waiting.getByTestId("search-row");
		await expect(rows).toHaveCount(2);
		await expect(rows.nth(0)).toHaveAttribute("aria-selected", "true");
		await expect(rows.nth(0)).toContainText("Needs input chat");

		await page.keyboard.press("ArrowDown");
		await expect(rows.nth(1)).toHaveAttribute("aria-selected", "true");
		await expect(rows.nth(0)).toHaveAttribute("aria-selected", "false");

		await page.keyboard.press("Enter");
		await expect(palette(page)).toBeHidden();
		await expect(defaultWorkspaceRow(page)).toHaveAttribute("data-active", "true");

		await openPalette(page);
		await waiting.getByTestId("search-row").first().click();
		await expect(palette(page)).toBeHidden();

		await openPalette(page);
		await page.keyboard.press("Escape");
		await expect(palette(page)).toBeHidden();

		await page.getByTestId("open-search").click();
		await expect(palette(page)).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(palette(page)).toBeHidden();
	} finally {
		for (const s of seeded) rmSync(s.path, { force: true });
	}
});

test("typing finds chats by title and Escape clears before it closes", async ({ page }) => {
	const repo = realpathSync(E2E_FIXTURE_REPO);
	await openFixtureProject(page);
	const seeded = seedAttention(repo);
	try {
		await page.reload();
		await expect(defaultWorkspaceRow(page)).toHaveAttribute("data-attention", "true");
		await openPalette(page);
		await page.getByTestId("search-input").fill("unread result");
		const chats = page.locator('[data-testid="search-row"][data-kind="chat"]');
		await expect(chats.first()).toContainText("Unread result chat");
		await expect(page.locator("mark").first()).toBeVisible();

		await page.keyboard.press("Escape");
		await expect(page.getByTestId("search-input")).toHaveValue("");
		await expect(palette(page)).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(palette(page)).toBeHidden();
	} finally {
		for (const s of seeded) rmSync(s.path, { force: true });
	}
});

test("commands run from the palette and show their shortcut", async ({ page }) => {
	await openFixtureProject(page);
	await enterDefaultWorkspace(page);
	const bottom = page.getByTestId("bottom-panel");
	const before = await bottom.count();

	await openPalette(page);
	await page.getByTestId("search-input").fill(">bottom");
	await expect(page.locator('[data-testid="search-chip"][data-scope="commands"]')).toHaveAttribute(
		"data-active",
		"true",
	);
	const row = page.locator('[data-testid="search-row"][data-item-id="command:view.toggleBottom"]');
	await expect(row).toBeVisible();
	await expect(row.locator("kbd")).not.toHaveCount(0);
	await page.keyboard.press("Enter");
	await expect(palette(page)).toBeHidden();
	await expect(bottom).toHaveCount(before === 0 ? 1 : 0);
});

test("a Settings section row opens that section, and Mod+K inside the palette closes it", async ({
	page,
}) => {
	await openFixtureProject(page);
	await openPalette(page);
	await pressPlatformShortcut(page, "k");
	await expect(palette(page)).toBeHidden();

	await openPalette(page);
	await page.getByTestId("search-input").fill(">appearance");
	await expect(
		page.locator('[data-testid="search-row"][data-item-id="setting:appearance"]'),
	).toBeVisible();
	await page.keyboard.press("Enter");
	await expect(palette(page)).toBeHidden();
	await expect(page.getByTestId("settings-dialog")).toBeVisible();
	await expect(page.getByTestId("settings-nav-appearance")).toHaveAttribute("data-active", "true");
});

test("double Shift toggles the palette and can be turned off in Settings › Keyboard", async ({
	page,
}) => {
	await openFixtureProject(page);
	await doubleShift(page);
	await expect(palette(page)).toBeVisible();
	await doubleShift(page);
	await expect(palette(page)).toBeHidden();

	await page.getByTestId("open-settings").click();
	await page.getByTestId("settings-nav-keyboard").click();
	const toggle = page.getByTestId("settings-double-shift");
	await expect(toggle).toHaveAttribute("aria-checked", "true");
	await toggle.click();
	await expect(toggle).toHaveAttribute("aria-checked", "false");
	await page.keyboard.press("Escape");
	await expect(page.getByTestId("settings-dialog")).toBeHidden();

	await doubleShift(page);
	await page.waitForTimeout(400);
	await expect(palette(page)).toBeHidden();

	await page.reload();
	await expect(page.getByTestId("connection-status")).toHaveAttribute("data-status", "connected");
	await doubleShift(page);
	await page.waitForTimeout(400);
	await expect(palette(page)).toBeHidden();
});

test("the double-Shift row opens Settings › Keyboard, and Ctrl+R stays inert under the palette", async ({
	page,
}) => {
	await openFixtureProject(page);
	await enterDefaultWorkspace(page);
	await openPalette(page);
	await page.keyboard.press("Control+r");
	await expect(palette(page)).toBeVisible();
	await expect(page.getByTestId("history-overlay")).toHaveCount(0);

	await page.getByTestId("search-input").fill("double shift");
	await page.locator('[data-testid="search-row"][data-item-id="setting:double-shift"]').click();
	await expect(palette(page)).toBeHidden();
	await expect(page.getByTestId("settings-dialog")).toBeVisible();
	await expect(page.getByTestId("settings-nav-keyboard")).toHaveAttribute("data-active", "true");
	await expect(page.getByTestId("settings-double-shift")).toBeVisible();
});

test("host search: a file by name opens as a tab, a spec section by its words opens in the Specs tool", async ({
	page,
}) => {
	await openFixtureProject(page);
	await enterDefaultWorkspace(page);
	await openPalette(page);
	await page.getByTestId("search-input").fill("/notes");
	await expect(page.locator('[data-testid="search-chip"][data-scope="files"]')).toHaveAttribute(
		"data-active",
		"true",
	);
	const file = page.locator('[data-testid="search-row"][data-kind="file"]', {
		hasText: "notes.txt",
	});
	await expect(file).toBeVisible({ timeout: 15_000 });
	await expect(page.getByTestId("search-host-pending")).toHaveCount(0);
	await pressPlatformShortcut(page, "i");
	const preview = page.getByTestId("search-file-preview");
	await expect(preview).toContainText("plain-text-fixture");
	await pressPlatformShortcut(page, "i");
	await file.click();
	await expect(palette(page)).toBeHidden();
	await expect(
		page.locator('[data-testid="editor-tab"][data-kind="file"]', { hasText: "notes.txt" }),
	).toBeVisible();

	await openPalette(page);
	await page.getByTestId("search-input").fill("#SPECGRAPHPROBE");
	const section = page.locator('[data-testid="search-row"][data-kind="section"]');
	await expect(section).toHaveCount(1, { timeout: 15_000 });
	await expect(section).toContainText("Sample Project › Goal");
	await expect(section).toContainText("SPECGRAPHPROBE");
	await pressPlatformShortcut(page, "i");
	await expect(preview.getByRole("heading", { name: "Goal" })).toBeVisible();
	await pressPlatformShortcut(page, "i");
	await page.keyboard.press("Enter");
	await expect(palette(page)).toBeHidden();
	await expect(
		page.locator('[data-testid="editor-tab"][data-kind="file"]', { hasText: "SPEC.md" }),
	).toBeVisible();
});

test("host search: an image and an HTML file render in the preview pane, and from Project Home a hit enters the project's workspace", async ({
	page,
}) => {
	await openFixtureProject(page);
	await expect(defaultWorkspaceRow(page)).not.toHaveAttribute("data-active", "true");
	await openPalette(page);
	await page.getByTestId("search-input").fill("/RENDERERS.png");
	const image = page.locator('[data-testid="search-row"][data-kind="file"]', {
		hasText: "RENDERERS.png",
	});
	await expect(image).toBeVisible({ timeout: 15_000 });
	await pressPlatformShortcut(page, "i");
	const preview = page.getByTestId("search-file-preview");
	await expect(preview.getByTestId("image-resource")).toBeVisible();

	await page.getByTestId("search-input").fill("/sample.html");
	await expect(
		page.locator('[data-testid="search-row"][data-kind="file"]', { hasText: "sample.html" }),
	).toBeVisible({ timeout: 15_000 });
	await expect(preview.getByTestId("html-view")).toBeVisible();
	const frame = preview.frameLocator("iframe");
	await expect(frame.getByRole("heading", { name: "HTML fixture" })).toBeVisible();
	await expect(frame.locator("body")).not.toContainText("script-ran");
	await pressPlatformShortcut(page, "i");

	await page.getByTestId("search-input").fill("/notes");
	const file = page.locator('[data-testid="search-row"][data-kind="file"]', {
		hasText: "notes.txt",
	});
	await expect(file).toBeVisible({ timeout: 15_000 });
	await page.keyboard.press("Enter");
	await expect(palette(page)).toBeHidden();
	await expect(defaultWorkspaceRow(page)).toHaveAttribute("data-active", "true");
	await expect(
		page.locator('[data-testid="editor-tab"][data-kind="file"]', { hasText: "notes.txt" }),
	).toBeVisible();
});

test("host search: a transcript hit jumps to its message and the preview shows the window around it", async ({
	page,
}) => {
	const repo = realpathSync(E2E_FIXTURE_REPO);
	await openFixtureProject(page);
	const seeded = seedWorkspaceSession(repo, {
		name: "Watcher chat",
		messages: [
			{ role: "user", text: "first question", timestamp: BASE_TS },
			{ role: "assistant", text: "first answer", timestamp: BASE_TS + 1 },
			{ role: "user", text: "where is the quantum banana", timestamp: BASE_TS + 2 },
			{
				role: "assistant",
				text: "The quantum banana lives in the fridge.",
				timestamp: BASE_TS + 3,
			},
		],
	});
	try {
		await page.reload();
		await expect(page.getByTestId("connection-status")).toHaveAttribute("data-status", "connected");
		await enterDefaultWorkspace(page);
		await openPalette(page);
		await page.getByTestId("search-input").fill("quantum banana");
		const transcripts = page.locator('[data-testid="search-row"][data-kind="transcript"]');
		await expect(transcripts).toHaveCount(2, { timeout: 15_000 });
		await expect(transcripts.first()).toContainText("quantum banana");
		await expect(transcripts.first().locator("mark").first()).toBeVisible();

		await pressPlatformShortcut(page, "i");
		await transcripts.first().hover();
		const preview = page.getByTestId("search-host-preview");
		await expect(preview).toHaveAttribute("data-state", "transcript");
		await expect(preview).toContainText("first question");
		await expect(preview.locator("[data-focus='true']")).toContainText("quantum banana");
		await pressPlatformShortcut(page, "i");

		await transcripts.first().click();
		await expect(palette(page)).toBeHidden();
		const flashed = page.locator("[data-flash]");
		await expect(flashed).toBeVisible({ timeout: 15_000 });
		await expect(flashed).toContainText("quantum banana");
	} finally {
		rmSync(seeded.path, { force: true });
	}
});

test("start from the typed text: the Start work row and Mod+Enter open the Create-workspace dialog prefilled", async ({
	page,
}) => {
	await openFixtureProject(page);
	await openPalette(page);
	await page.getByTestId("search-input").fill("Refactor the auth module");
	const startRow = page.locator('[data-testid="search-row"][data-item-id="start"]');
	await expect(startRow).toContainText("Start work with “Refactor the auth module”");
	await startRow.click();
	await expect(palette(page)).toBeHidden();
	const dialog = page.getByTestId("new-workspace-dialog");
	await expect(dialog).toBeVisible();
	await expect(dialog.getByTestId("ws-prompt")).toHaveValue("Refactor the auth module");
	await page.keyboard.press("Escape");
	await expect(dialog).toBeHidden();

	await openPalette(page);
	await page.getByTestId("search-input").fill(">Write release notes");
	await expect(startRow).toHaveCount(0);
	await page.getByTestId("search-input").fill("Write release notes");
	await pressPlatformShortcut(page, "Enter");
	await expect(palette(page)).toBeHidden();
	await expect(dialog).toBeVisible();
	await expect(dialog.getByTestId("ws-prompt")).toHaveValue("Write release notes");
	await page.keyboard.press("Escape");
	await expect(dialog).toBeHidden();
});

test("an older host gets the local scopes only, with a notice, and never a search.query", async ({
	page,
}) => {
	const hostRequests: string[] = [];
	await page.routeWebSocket(/\/ws(\?|$)/, (socket) => {
		const server = socket.connectToServer();
		socket.onMessage((message) => {
			const frame = JSON.parse(String(message)) as { method?: string };
			if (frame.method?.startsWith("search.")) hostRequests.push(frame.method);
			server.send(message);
		});
		server.onMessage((message) => {
			const frame = JSON.parse(String(message)) as {
				channel?: string;
				data: { protocolVersion: number };
			};
			if (frame.channel === WS_CHANNELS.serverWelcome) {
				frame.data.protocolVersion = SEARCH_PROTOCOL_VERSION - 1;
				socket.send(JSON.stringify(frame));
			} else socket.send(message);
		});
	});
	await openFixtureProject(page);
	await enterDefaultWorkspace(page);
	await openPalette(page);
	await expect(page.getByTestId("search-notice")).toContainText("doesn't search files");
	await expect(page.locator('[data-testid="search-chip"][data-scope="files"]')).toHaveCount(0);
	await page.getByTestId("search-input").fill("/notes");
	await expect(page.getByTestId("search-input")).toHaveValue("/notes");
	await expect(page.locator('[data-testid="search-row"][data-kind="file"]')).toHaveCount(0);
	await page.waitForTimeout(500);
	expect(hostRequests).toEqual([]);
});
