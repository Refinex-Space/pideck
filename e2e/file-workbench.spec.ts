import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { devices, expect, type Page, test } from "@playwright/test";
import { FILE_WORKBENCH_PROTOCOL_VERSION, WS_CHANNELS } from "@thinkrail/contracts";
import {
	createWorkspaceViaDialog,
	openAppSettings,
	openFixtureProject,
	revealWorkbenchTool,
	startNewChat,
} from "./fixtures/app";

const desktopAgent = devices["Desktop Chrome"].userAgent;
test.use({
	userAgent:
		process.platform === "darwin"
			? desktopAgent.replace("Windows NT 10.0; Win64; x64", "Macintosh; Intel Mac OS X 10_15_7")
			: process.platform === "linux"
				? desktopAgent.replace("Windows NT 10.0; Win64; x64", "X11; Linux x86_64")
				: desktopAgent,
});

async function pressSourceShortcut(page: Page, key: string) {
	const apple = await page.evaluate(() => navigator.userAgent.includes("Macintosh"));
	await page.keyboard.press(`${apple ? "Meta" : "Control"}+${key}`);
}

function fileRow(page: Page, name: string) {
	return page.getByTestId("file-node").filter({ has: page.getByText(name, { exact: true }) });
}
async function editSource(page: Page, text: string) {
	await page.getByTestId("file-edit").click();
	await page.getByRole("textbox", { name: "edit-me.ts", exact: true }).focus();
	await pressSourceShortcut(page, "a");
	await page.keyboard.insertText(text);
	await expect(page.getByTestId("file-pane")).toHaveAttribute("data-dirty", "true");
}

test("file tree menus create, rename and move real files; search reaches collapsed directories", async ({
	page,
}) => {
	await openFixtureProject(page);
	const workspace = await createWorkspaceViaDialog(page);
	await revealWorkbenchTool(page, "files");
	await page.getByTestId("files-mode-toggle").getByTestId("file-actions-trigger").click();
	await page.getByTestId("file-new-file").click();
	await page.getByTestId("file-operation-input").fill("created.ts");
	await page.getByTestId("file-operation-confirm").click();
	await expect(page.getByTestId("file-operation-dialog")).toBeHidden();
	await expect.poll(() => existsSync(join(workspace.worktreePath, "created.ts"))).toBe(true);
	await expect(page.getByRole("textbox", { name: "created.ts", exact: true })).toBeFocused();
	await page.keyboard.insertText("export const created = 1;\n");
	await page.getByTestId("file-save").click();
	await expect
		.poll(() => readFileSync(join(workspace.worktreePath, "created.ts"), "utf8"))
		.toBe("export const created = 1;\n");
	await page.getByTestId("file-finish-edit").click();

	await fileRow(page, "created.ts").click({ button: "right" });
	await page.getByTestId("file-rename").click();
	await page.getByTestId("file-operation-input").fill("renamed.ts");
	await page.getByTestId("file-operation-confirm").click();
	await expect(fileRow(page, "renamed.ts")).toBeVisible();
	await expect(page.getByTestId("editor-tab").filter({ hasText: "renamed.ts" })).toBeVisible();
	await expect(page.getByTestId("file-toolbar")).toContainText("renamed.ts");
	await page.getByTestId("files-mode-toggle").getByTestId("file-actions-trigger").click();
	await page.getByTestId("file-new-folder").click();
	await page.getByTestId("file-operation-input").fill("target");
	await page.getByTestId("file-operation-confirm").click();
	await expect(fileRow(page, "target")).toBeVisible();
	await fileRow(page, "renamed.ts").click({ button: "right" });
	await page.getByTestId("file-move").click();
	await page.getByTestId("file-operation-input").fill("target/renamed.ts");
	await page.getByTestId("file-operation-confirm").click();
	await expect(page.getByTestId("file-toolbar")).toContainText("target");
	await expect.poll(() => existsSync(join(workspace.worktreePath, "target/renamed.ts"))).toBe(true);
	await fileRow(page, "target").click({ button: "right" });
	await page.getByTestId("file-rename").click();
	await page.getByTestId("file-operation-input").fill("moved-target");
	await page.getByTestId("file-operation-confirm").click();
	await expect(page.getByTestId("file-toolbar")).toContainText("moved-target");
	await page.getByTestId("file-search-input").fill("moved-target renamed");
	await expect(page.getByTestId("file-search-row")).toHaveCount(1);
	await expect(page.getByTestId("file-search-row")).toContainText("moved-target/renamed.ts");
	await page.getByTestId("file-search-row").click({ button: "right" });
	await page.getByTestId("file-trash").click();
	await expect(page.getByTestId("file-operation-dialog")).toContainText("system Trash");
	await page.getByTestId("file-operation-dialog").getByRole("button", { name: "Cancel" }).click();
	expect(existsSync(join(workspace.worktreePath, "moved-target/renamed.ts"))).toBe(true);
});

test("source editing keeps undo and protects against external writes and accidental tab close", async ({
	page,
}) => {
	await openFixtureProject(page);
	const workspace = await createWorkspaceViaDialog(page);
	const file = join(workspace.worktreePath, "edit-me.ts");
	writeFileSync(file, "const initial = 1;\n");
	await revealWorkbenchTool(page, "files");
	await fileRow(page, "edit-me.ts").click();
	await editSource(page, "const draft = 2;");
	await expect(page.getByRole("textbox", { name: "edit-me.ts", exact: true })).toBeFocused();
	for (
		let step = 0;
		step < 20 && (await page.getByTestId("file-pane").getAttribute("data-dirty")) === "true";
		step++
	)
		await pressSourceShortcut(page, "z");
	await expect(page.getByTestId("file-pane")).not.toHaveAttribute("data-dirty", "true");
	await expect(page.locator(".monaco-editor .view-lines")).toContainText("const initial = 1;");
	await page.keyboard.insertText("const draft = 2;\n");
	await expect(page.getByTestId("file-pane")).toHaveAttribute("data-dirty", "true");
	await page
		.getByTestId("editor-tab")
		.filter({ hasText: "edit-me.ts" })
		.getByTestId("editor-tab-close")
		.click();
	await expect(page.getByTestId("file-unsaved-dialog")).toBeVisible();
	await page.getByTestId("file-unsaved-dialog").getByRole("button", { name: "Cancel" }).click();
	writeFileSync(file, "external change\n");
	await page.getByTestId("file-save").click();
	await expect(
		page.getByRole("alert").filter({ hasText: "changed on disk" }).first(),
	).toBeVisible();
	expect(readFileSync(file, "utf8")).toBe("external change\n");
	await expect(page.getByTestId("file-pane")).toHaveAttribute("data-dirty", "true");
	await expect
		.poll(() => page.evaluate(() => sessionStorage.getItem("pideck:file-drafts:v1")))
		.toContain("const draft");
});

test("file and selected-source references preserve the current chat draft and never send it", async ({
	page,
}) => {
	let prompts = 0;
	page.on("websocket", (socket) =>
		socket.on("framesent", ({ payload }) => {
			if (JSON.parse(String(payload)).method === "session.prompt") prompts += 1;
		}),
	);
	await openFixtureProject(page);
	const workspace = await createWorkspaceViaDialog(page);
	const source = "const sourceReference = 7;\n";
	writeFileSync(join(workspace.worktreePath, "reference.ts"), source);
	const input = page.getByTestId("chat-input");
	await input.fill("before after");
	await input.press("Home");
	for (let i = 0; i < 7; i++) await input.press("ArrowRight");
	await revealWorkbenchTool(page, "files");
	await fileRow(page, "reference.ts").click({ button: "right" });
	await page.getByTestId("file-add-to-chat").click();
	await expect(input).toHaveValue("before @reference.ts after");
	await expect(input).toBeFocused();
	await fileRow(page, "reference.ts").click();
	await page.getByTestId("file-select-all").click();
	await page.getByTestId("file-reference-chat").click();
	await expect(input).toHaveValue(/sourceReference = 7/);
	await expect(input).toHaveValue(/^before @reference.ts /);
	expect(prompts).toBe(0);
});

test("source wrap, comments, breadcrumbs and tab search stay available", async ({
	page,
}, testInfo) => {
	await openFixtureProject(page);
	const workspace = await createWorkspaceViaDialog(page);
	writeFileSync(
		join(workspace.worktreePath, "commands.ts"),
		"const source = 1;\nconst other = 2;\n",
	);
	await revealWorkbenchTool(page, "files");
	await fileRow(page, "commands.ts").dblclick();
	await expect(page.getByTestId("file-toolbar")).toContainText("commands.ts");
	await page.getByTestId("file-word-wrap").click();
	await expect(page.getByTestId("file-word-wrap")).toHaveAttribute("aria-pressed", "false");
	await page.getByTestId("file-find").click();
	await expect(page.locator(".monaco-editor .find-widget").first()).toBeVisible();
	await page.keyboard.press("Escape");
	await page.getByTestId("file-select-all").click();
	await page.getByTestId("file-comment-selection").click();
	await expect(page.getByTestId("review-composer")).toBeVisible();
	await page.getByTestId("review-composer-input").fill("Review the selected source.");
	await page.getByTestId("review-composer-save").click();
	await expect(page.getByTestId("review-composer")).toBeHidden();
	await page.getByTestId("file-workbench").getByTestId("open-tabs-search").click();
	await page.getByPlaceholder("Find an open tab…").fill("commands");
	await expect(page.getByRole("option").filter({ hasText: "commands.ts" })).toBeVisible();
	await page.keyboard.press("Escape");
	await openAppSettings(page);
	await page.getByTestId("settings-nav-appearance").click();
	await page.getByTestId("theme-mode-light").click();
	await page.keyboard.press("Escape");
	await expect(page.locator("html")).toHaveAttribute("data-theme-appearance", "light");
	await page.screenshot({
		path: testInfo.outputPath("file-workbench-light.png"),
		animations: "disabled",
	});
	await openAppSettings(page);
	await page.getByTestId("settings-nav-appearance").click();
	await page.getByTestId("theme-mode-dark").click();
	await page.keyboard.press("Escape");
	await fileRow(page, "commands.ts").click({ button: "right" });
	await expect(page.getByTestId("file-actions-menu")).toBeVisible();
	await expect(page.locator("html")).toHaveAttribute("data-theme-appearance", "dark");
	await page.screenshot({
		path: testInfo.outputPath("file-workbench-dark.png"),
		animations: "disabled",
	});
});

test("dirty source survives reload and Save as preserves the externally changed original", async ({
	page,
}) => {
	page.on("dialog", (dialog) => void dialog.accept());
	await openFixtureProject(page);
	const workspace = await createWorkspaceViaDialog(page);
	const original = join(workspace.worktreePath, "recover.ts");
	writeFileSync(original, "original\n");
	await revealWorkbenchTool(page, "files");
	await fileRow(page, "recover.ts").dblclick();
	await page.getByTestId("file-edit").click();
	await expect(page.getByRole("textbox", { name: "recover.ts", exact: true })).toBeFocused();
	await pressSourceShortcut(page, "a");
	await page.keyboard.insertText("local recovery draft");
	await expect
		.poll(() => page.evaluate(() => sessionStorage.getItem("pideck:file-drafts:v1")))
		.toContain("local recovery draft");
	await page.reload();
	await expect(page.getByTestId("file-pane")).toHaveAttribute("data-dirty", "true");
	await expect(page.locator(".monaco-editor .view-lines")).toContainText("local recovery draft");
	writeFileSync(original, "external wins\n");
	await page.getByTestId("file-save").click();
	await expect(
		page.getByRole("alert").filter({ hasText: "changed on disk" }).first(),
	).toBeVisible();
	await page.getByRole("button", { name: "Save as…", exact: true }).click();
	await page.getByTestId("file-operation-input").fill("recovered-copy.ts");
	await page.getByTestId("file-operation-confirm").click();
	await expect(page.getByTestId("file-operation-dialog")).toBeHidden();
	await expect
		.poll(() => readFileSync(join(workspace.worktreePath, "recovered-copy.ts"), "utf8"))
		.toBe("local recovery draft");
	expect(readFileSync(original, "utf8")).toBe("external wins\n");
	await expect(page.getByTestId("file-pane")).not.toHaveAttribute("data-dirty", "true");
});

test("tree keyboard actions and breadcrumbs share the same file operations and reveal state", async ({
	page,
}) => {
	await openFixtureProject(page);
	const workspace = await createWorkspaceViaDialog(page);
	mkdirSync(join(workspace.worktreePath, "keyboard"));
	writeFileSync(join(workspace.worktreePath, "keyboard/one.ts"), "one\n");
	writeFileSync(join(workspace.worktreePath, "keyboard/two.ts"), "two\n");
	await revealWorkbenchTool(page, "files");
	await fileRow(page, "keyboard").focus();
	await page.keyboard.press("ArrowRight");
	await expect(fileRow(page, "one.ts")).toBeVisible();
	await page.keyboard.press("ArrowRight");
	await expect(fileRow(page, "one.ts")).toBeFocused();
	await page.keyboard.press("F2");
	await expect(page.getByTestId("file-operation-input")).toBeFocused();
	await page.keyboard.insertText("renamed");
	await page.getByTestId("file-operation-input").press("Enter");
	await expect(fileRow(page, "renamed.ts")).toBeVisible();
	await fileRow(page, "renamed.ts").focus();
	await page.keyboard.press("Delete");
	await expect(page.getByTestId("file-operation-dialog")).toContainText("system Trash");
	await page.getByTestId("file-operation-dialog").getByRole("button", { name: "Cancel" }).click();
	await expect(fileRow(page, "renamed.ts")).toBeFocused();
	await page.getByTestId("file-search-input").fill("keyboard renamed");
	await expect(page.getByTestId("file-search-row")).toBeVisible();
	await page.getByTestId("file-search-input").press("ArrowDown");
	await expect(page.getByTestId("file-search-row")).toBeFocused();
	await page.keyboard.press("Enter");
	await page
		.getByTestId("file-toolbar")
		.getByRole("button", { name: "keyboard", exact: true })
		.click();
	await expect(page.getByTestId("file-search-input")).toHaveValue("");
	await expect(fileRow(page, "renamed.ts")).toBeVisible();
});

test("old hosts retain browsing and reference actions without offering unsupported file writes", async ({
	page,
}) => {
	await page.routeWebSocket(/\/ws(\?|$)/, (socket) => {
		const server = socket.connectToServer();
		server.onMessage((message) => {
			const frame = JSON.parse(String(message)) as {
				channel?: string;
				data: { protocolVersion: number };
			};
			if (frame.channel === WS_CHANNELS.serverWelcome) {
				frame.data.protocolVersion = FILE_WORKBENCH_PROTOCOL_VERSION - 1;
				socket.send(JSON.stringify(frame));
			} else socket.send(message);
		});
	});
	await openFixtureProject(page);
	const workspace = await createWorkspaceViaDialog(page);
	writeFileSync(join(workspace.worktreePath, "legacy.ts"), "const legacy = true;\n");
	await revealWorkbenchTool(page, "files");
	await expect(page.getByTestId("file-search-input")).toHaveCount(0);
	await fileRow(page, "legacy.ts").click();
	await expect(page.getByTestId("file-edit")).toBeDisabled();
	await fileRow(page, "legacy.ts").click({ button: "right" });
	await expect(page.getByTestId("file-add-to-chat")).toBeVisible();
	await expect(page.getByTestId("file-copy-relative")).toBeVisible();
	await expect(page.getByTestId("file-new-file")).toHaveCount(0);
	await expect(page.getByTestId("file-trash")).toHaveCount(0);
});

test("two browser tabs keep independent recovery drafts and a stale save cannot overwrite its peer", async ({
	page,
	context,
}) => {
	await openFixtureProject(page);
	const workspace = await createWorkspaceViaDialog(page);
	writeFileSync(join(workspace.worktreePath, "shared.ts"), "initial\n");
	await revealWorkbenchTool(page, "files");
	await fileRow(page, "shared.ts").dblclick();
	await page.getByTestId("file-edit").click();
	await expect(page.getByRole("textbox", { name: "shared.ts", exact: true })).toBeFocused();
	await pressSourceShortcut(page, "a");
	await page.keyboard.insertText("first window draft");
	const second = await context.newPage();
	try {
		await second.goto(page.url());
		await revealWorkbenchTool(second, "files");
		await fileRow(second, "shared.ts").dblclick();
		await second.getByTestId("file-edit").click();
		await expect(second.getByRole("textbox", { name: "shared.ts", exact: true })).toBeFocused();
		await pressSourceShortcut(second, "a");
		await second.keyboard.insertText("second window draft");
		await expect
			.poll(() => page.evaluate(() => sessionStorage.getItem("pideck:file-drafts:v1")))
			.toContain("first window draft");
		await expect
			.poll(() => second.evaluate(() => sessionStorage.getItem("pideck:file-drafts:v1")))
			.toContain("second window draft");
		await page.getByTestId("file-save").click();
		await expect
			.poll(() => readFileSync(join(workspace.worktreePath, "shared.ts"), "utf8"))
			.toBe("first window draft");
		await second.getByTestId("file-save").click();
		await expect(
			second.getByRole("alert").filter({ hasText: "changed on disk" }).first(),
		).toBeVisible();
		expect(readFileSync(join(workspace.worktreePath, "shared.ts"), "utf8")).toBe(
			"first window draft",
		);
	} finally {
		await second.close();
	}
});

test("references follow the last selected chat when a file temporarily owns the center", async ({
	page,
}) => {
	await openFixtureProject(page);
	const workspace = await createWorkspaceViaDialog(page);
	writeFileSync(join(workspace.worktreePath, "chat-target.ts"), "const target = 1;\n");
	await page.getByTestId("chat-input").fill("draft A");
	const firstChatUrl = page.url();
	await startNewChat(page);
	await expect(page).not.toHaveURL(firstChatUrl);
	await page.getByTestId("chat-input").fill("draft B");
	const secondChatUrl = page.url();
	await page.evaluate((url) => {
		window.location.hash = new URL(url).hash;
	}, firstChatUrl);
	await expect(page.getByTestId("chat-input")).toHaveValue("draft A");
	await revealWorkbenchTool(page, "files");
	await fileRow(page, "chat-target.ts").click();
	await page.getByTestId("file-reference-chat").click();
	await expect(page.getByTestId("chat-input")).toHaveValue("draft A @chat-target.ts ");
	await page.evaluate((url) => {
		window.location.hash = new URL(url).hash;
	}, secondChatUrl);
	await expect(page.getByTestId("chat-input")).toHaveValue("draft B");
});

test("the recovery menu reopens an unsaved buffer after its disk file was moved externally", async ({
	page,
}) => {
	page.on("dialog", (dialog) => void dialog.accept());
	await openFixtureProject(page);
	const workspace = await createWorkspaceViaDialog(page);
	writeFileSync(join(workspace.worktreePath, "lost.ts"), "on disk\n");
	await revealWorkbenchTool(page, "files");
	await fileRow(page, "lost.ts").dblclick();
	await page.getByTestId("file-edit").click();
	await expect(page.getByRole("textbox", { name: "lost.ts", exact: true })).toBeFocused();
	await pressSourceShortcut(page, "a");
	await page.keyboard.insertText("recover this text");
	await expect
		.poll(() => page.evaluate(() => sessionStorage.getItem("pideck:file-drafts:v1")))
		.toContain("recover this text");
	renameSync(
		join(workspace.worktreePath, "lost.ts"),
		join(workspace.worktreePath, "external-name.ts"),
	);
	await page.reload();
	await revealWorkbenchTool(page, "files");
	await page.getByTestId("files-mode-toggle").getByTestId("file-actions-trigger").click();
	await page.getByTestId("file-recover-draft").click();
	await expect(page.getByTestId("file-pane")).toHaveAttribute("data-dirty", "true");
	await expect(page.locator(".monaco-editor .view-lines")).toContainText("recover this text");
	await page.getByRole("button", { name: "Save as…", exact: true }).click();
	await page.getByTestId("file-operation-input").fill("rescued.ts");
	await page.getByTestId("file-operation-confirm").click();
	await expect
		.poll(() => readFileSync(join(workspace.worktreePath, "rescued.ts"), "utf8"))
		.toBe("recover this text");
	expect(readFileSync(join(workspace.worktreePath, "external-name.ts"), "utf8")).toBe("on disk\n");
});

test("trash requires confirmation and a host failure keeps the dialog and file recoverable", async ({
	page,
}) => {
	let trashRequests = 0;
	await page.routeWebSocket(/\/ws(\?|$)/, (socket) => {
		const server = socket.connectToServer();
		socket.onMessage((message) => {
			const frame = JSON.parse(String(message)) as { id: string; method?: string };
			if (frame.method === "fs.trash") {
				trashRequests += 1;
				socket.send(JSON.stringify({ id: frame.id, ok: false, error: "Test Trash unavailable" }));
			} else server.send(message);
		});
	});
	await openFixtureProject(page);
	const workspace = await createWorkspaceViaDialog(page);
	writeFileSync(join(workspace.worktreePath, "keep.txt"), "keep this file");
	await revealWorkbenchTool(page, "files");
	await fileRow(page, "keep.txt").click({ button: "right" });
	await page.getByTestId("file-trash").click();
	await expect(page.getByTestId("file-operation-dialog")).toBeVisible();
	expect(trashRequests).toBe(0);
	await page.getByTestId("file-operation-confirm").click();
	await expect(page.getByTestId("file-operation-dialog")).toContainText("Test Trash unavailable");
	expect(trashRequests).toBe(1);
	expect(readFileSync(join(workspace.worktreePath, "keep.txt"), "utf8")).toBe("keep this file");
	await page.getByTestId("file-operation-dialog").getByRole("button", { name: "Cancel" }).click();
	await expect(page.getByTestId("file-operation-dialog")).toBeHidden();
});
