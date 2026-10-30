import { expect, type Page, test } from "@playwright/test";
import {
	type LspServerStatus,
	type LspWorkspaceStatus,
	WS_CHANNELS,
	type WsPush,
} from "@thinkrail/contracts";
import {
	openFixtureProject,
	openSettingsSection,
	openStatusDock,
	openWorkspaceChat,
} from "./fixtures/app";
import { interceptAppWire } from "./fixtures/streamReplay";

async function closeSettings(page: Page): Promise<void> {
	await page.keyboard.press("Escape");
	await expect(page.getByTestId("settings-dialog")).toBeHidden();
}

async function openLspSettings(page: Page): Promise<void> {
	await openSettingsSection(page, "lsp");
	await expect(page.getByTestId("settings-lsp")).toBeVisible();
}

const checked = (page: Page, testId: string, value: boolean) =>
	expect(page.getByTestId(testId)).toHaveAttribute("aria-checked", String(value));

/** Leaves the host's language server settings as a fresh install has them. */
async function resetLspSettings(page: Page): Promise<void> {
	await openLspSettings(page);
	for (const row of await page.locator('[data-testid^="lsp-remove-"]').all()) await row.click();
	await expect(page.locator('[data-testid^="lsp-remove-"]')).toHaveCount(0);
	if ((await page.getByTestId("lsp-server-go").getAttribute("aria-checked")) === "false")
		await page.getByTestId("lsp-server-go").click();
	if ((await page.getByTestId("lsp-tool").getAttribute("aria-checked")) === "false")
		await page.getByTestId("lsp-tool").click();
	if ((await page.getByTestId("lsp-diagnostics").getAttribute("aria-checked")) === "false")
		await page.getByTestId("lsp-diagnostics").click();
	await page.getByTestId("lsp-idle").fill("15");
	await page.getByTestId("lsp-idle").press("Enter");
	if ((await page.getByTestId("lsp-enabled").getAttribute("aria-checked")) === "true")
		await page.getByTestId("lsp-enabled").click();
	await checked(page, "lsp-enabled", false);
	await closeSettings(page);
}

test("language servers are off until switched on, and the choices survive a reload", async ({
	page,
}, testInfo) => {
	test.setTimeout(90_000);
	await openFixtureProject(page);
	try {
		await openLspSettings(page);
		await checked(page, "lsp-enabled", false);
		await expect(page.getByTestId("lsp-diagnostics")).toBeDisabled();
		await expect(page.getByTestId("lsp-tool")).toBeDisabled();
		await expect(page.getByTestId("lsp-builtin-typescript")).toBeVisible();
		await expect(page.getByTestId("lsp-custom-empty")).toBeVisible();
		await testInfo.attach("lsp-settings-off", {
			body: await page.getByTestId("settings-dialog").screenshot({
				path: testInfo.outputPath("lsp-settings-off.png"),
			}),
			contentType: "image/png",
		});

		await page.getByTestId("lsp-enabled").click();
		await checked(page, "lsp-enabled", true);
		await expect(page.getByTestId("lsp-tool")).toBeEnabled();
		await page.getByTestId("lsp-tool").click();
		await checked(page, "lsp-tool", false);
		await page.getByTestId("lsp-idle").fill("30");
		await page.getByTestId("lsp-idle").press("Enter");
		await page.getByTestId("lsp-server-go").click();
		await checked(page, "lsp-server-go", false);

		await page.getByTestId("lsp-add-name").fill("mine");
		await page.getByTestId("lsp-add-command").fill("mine-ls --stdio");
		await page.getByTestId("lsp-add-extensions").fill("mine, .mine2");
		await page.getByTestId("lsp-add").click();
		const mine = page.getByTestId("lsp-custom-mine");
		await expect(mine).toBeVisible();
		await expect(mine).toContainText("mine-ls --stdio");
		await expect(mine).toContainText(".mine .mine2");
		await expect(page.getByTestId("lsp-add-name")).toHaveValue("");
		await testInfo.attach("lsp-settings", {
			body: await page.getByTestId("settings-dialog").screenshot({
				path: testInfo.outputPath("lsp-settings.png"),
			}),
			contentType: "image/png",
		});

		await page.reload();
		await expect(page.getByTestId("connection-status")).toHaveAttribute("data-status", "connected");
		await openLspSettings(page);
		await checked(page, "lsp-enabled", true);
		await checked(page, "lsp-tool", false);
		await checked(page, "lsp-server-go", false);
		await expect(page.getByTestId("lsp-idle")).toHaveValue("30");
		await expect(page.getByTestId("lsp-custom-mine")).toBeVisible();
		await closeSettings(page);
	} finally {
		await resetLspSettings(page);
	}
});

test("a bad custom server is refused where it was entered", async ({ page }) => {
	test.setTimeout(60_000);
	await openFixtureProject(page);
	try {
		await openLspSettings(page);
		await page.getByTestId("lsp-add").click();
		await expect(page.getByTestId("lsp-add-error")).toContainText("lowercase letters");

		await page.getByTestId("lsp-add-name").fill("go");
		await page.getByTestId("lsp-add-command").fill("x");
		await page.getByTestId("lsp-add-extensions").fill(".x");
		await page.getByTestId("lsp-add").click();
		await expect(page.getByTestId("lsp-add-error")).toContainText("already exists");

		await page.getByTestId("lsp-add-name").fill("longext");
		await page.getByTestId("lsp-add-extensions").fill(".abcdefghijklmnopqrstuvwxyz");
		await page.getByTestId("lsp-add").click();
		await expect(page.getByTestId("lsp-add-error")).toBeVisible();
		await expect(page.getByTestId("lsp-custom-longext")).toHaveCount(0);
		await expect(page.getByTestId("lsp-custom-empty")).toBeVisible();
	} finally {
		await closeSettings(page).catch(() => {});
	}
});

test("the status dock follows the master switch, and its link opens the settings page", async ({
	page,
}, testInfo) => {
	test.setTimeout(90_000);
	await page.setViewportSize({ width: 1400, height: 900 });
	await openWorkspaceChat(page);
	const panel = await openStatusDock(page);
	const block = panel.getByTestId("status-block-lsp");
	try {
		await expect(block.getByTestId("status-lsp-off")).toBeVisible();
		await block.getByTestId("status-lsp-manage").click();
		await expect(page.getByTestId("settings-lsp")).toBeVisible();
		await page.getByTestId("lsp-enabled").click();
		await checked(page, "lsp-enabled", true);
		await closeSettings(page);

		await expect(block.getByTestId("status-lsp-off")).toHaveCount(0);
		await expect(
			block.locator('[data-testid="status-lsp-untrusted"], [data-testid="status-lsp-idle"]'),
		).toHaveCount(1);
		await testInfo.attach("lsp-block-enabled", {
			body: await block.screenshot({ path: testInfo.outputPath("lsp-block-enabled.png") }),
			contentType: "image/png",
		});
	} finally {
		await resetLspSettings(page);
	}
	await expect(block.getByTestId("status-lsp-off")).toBeVisible();
});

function server(extra: Partial<LspServerStatus>): LspServerStatus {
	return {
		id: "typescript",
		name: "TypeScript",
		root: ".",
		state: "ready",
		files: 4,
		errors: 0,
		warnings: 0,
		custom: false,
		...extra,
	};
}

test("each server shows its state, its findings and a way to try again", async ({
	page,
}, testInfo) => {
	test.setTimeout(90_000);
	await page.setViewportSize({ width: 1400, height: 900 });
	const wire = await interceptAppWire(page);
	const sent: string[] = [];
	page.on("websocket", (socket) =>
		socket.on("framesent", (frame) => {
			if (typeof frame.payload === "string") sent.push(frame.payload);
		}),
	);
	const workspace = await openWorkspaceChat(page);
	const panel = await openStatusDock(page);
	const block = panel.getByTestId("status-block-lsp");
	await expect(block.getByTestId("status-lsp-off")).toBeVisible();

	const push = (status: LspWorkspaceStatus) =>
		wire().send(
			JSON.stringify({
				channel: WS_CHANNELS.lspStatus,
				data: { workspaceId: workspace.id, ...status },
			} satisfies WsPush),
		);
	push({
		enabled: true,
		trusted: true,
		servers: [
			server({ errors: 3, warnings: 1 }),
			server({ id: "python", name: "Python", root: "services/api", warnings: 2 }),
			server({ id: "go", name: "Go", state: "starting", files: 0 }),
			server({
				id: "rust",
				name: "Rust",
				state: "missing",
				files: 0,
				message: "rustup component add rust-analyzer",
			}),
			server({
				id: "lua",
				name: "Lua",
				state: "error",
				files: 0,
				message: "The language server exited with code 1",
			}),
			server({ id: "json", name: "JSON" }),
		],
	});

	const row = (id: string) => block.locator(`[data-testid="status-lsp-server"][data-id="${id}"]`);
	await expect(row("typescript").getByTestId("status-lsp-verdict")).toHaveText("3 errors");
	await expect(row("python").getByTestId("status-lsp-verdict")).toHaveText("2 warnings");
	await expect(row("python")).toContainText("services/api");
	await expect(row("go").getByTestId("status-lsp-verdict")).toHaveText("Starting");
	await expect(row("rust").getByTestId("status-lsp-verdict")).toHaveText("Not installed");
	await expect(row("rust")).toContainText("rustup component add rust-analyzer");
	await expect(row("lua").getByTestId("status-lsp-verdict")).toHaveText("Failed");
	await expect(row("lua")).toContainText("exited with code 1");
	await expect(row("json").getByTestId("status-lsp-verdict")).toHaveText("Ready");
	await expect(row("typescript").getByTestId("status-lsp-restart")).toHaveCount(0);
	await testInfo.attach("lsp-block-servers", {
		body: await block.screenshot({ path: testInfo.outputPath("lsp-block-servers.png") }),
		contentType: "image/png",
	});

	await row("lua").getByTestId("status-lsp-restart").click();
	await expect
		.poll(() =>
			sent.some((payload) => {
				const frame = JSON.parse(payload) as { method?: string; params?: Record<string, unknown> };
				return (
					frame.method === "lsp.restart" &&
					frame.params?.serverId === "lua" &&
					frame.params?.workspaceId === workspace.id
				);
			}),
		)
		.toBe(true);

	push({ enabled: true, trusted: false, servers: [] });
	await expect(block.getByTestId("status-lsp-untrusted")).toBeVisible();
	await expect(block.getByTestId("status-lsp-server")).toHaveCount(0);
});
