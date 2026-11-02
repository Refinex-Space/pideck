import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@playwright/test";
import {
	MCP_CONFIGURATION_PROTOCOL_VERSION,
	type WsPush,
	type WsRequest,
} from "@thinkrail/contracts";
import { openAppFresh, openFixtureProject, openSettingsSection } from "./fixtures/app";
import { E2E_FIXTURE_REPO, E2E_PI_AGENT_DIR } from "./fixtures/paths";
import { shot } from "./fixtures/screenshots";

const USER_CONFIG = join(E2E_PI_AGENT_DIR, "mcp.json");
const PROJECT_CONFIG = join(E2E_FIXTURE_REPO, ".pi", "mcp.json");

function seedConfig(path: string, name: string) {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(
		path,
		JSON.stringify({ mcpServers: { [name]: { command: "pideck-mcp-must-not-run" } } }),
	);
}

test.beforeEach(() => {
	for (const path of [USER_CONFIG, PROJECT_CONFIG]) rmSync(path, { force: true });
});
test.afterEach(() => {
	for (const path of [USER_CONFIG, PROJECT_CONFIG]) rmSync(path, { force: true });
});

test("MCP settings list user configuration without a project or workspace and reread it on reopen", async ({
	page,
}) => {
	await openAppFresh(page);
	seedConfig(USER_CONFIG, "global-fixture");
	await openSettingsSection(page, "mcp");
	const row = page.locator('[data-testid="mcp-server-row"][data-name="global-fixture"]');
	await expect(row.getByTestId("mcp-server-scope")).toHaveText("User");
	await expect(row.getByTestId("mcp-server-status")).toHaveText("Configured");
	await expect(row.getByTestId("mcp-server-toggle")).toBeDisabled();
	await row.getByTestId("mcp-server-menu").click();
	await page.getByTestId("mcp-menu-details").click();
	await expect(page.getByTestId("mcp-details-dialog")).toContainText(USER_CONFIG);
	await page.keyboard.press("Escape");
	await shot(page.getByTestId("settings-mcp"), "mcp-configuration", "global");
	await page.keyboard.press("Escape");
	seedConfig(USER_CONFIG, "updated-fixture");
	await openSettingsSection(page, "mcp");
	await expect(row).toHaveCount(0);
	await expect(
		page.locator('[data-testid="mcp-server-row"][data-name="updated-fixture"]'),
	).toBeVisible();
});

test("MCP settings add the selected project's configuration without entering a workspace and respect trust", async ({
	page,
}) => {
	seedConfig(PROJECT_CONFIG, "project-fixture");
	await openFixtureProject(page);
	seedConfig(USER_CONFIG, "global-fixture");
	await openSettingsSection(page, "mcp");
	await expect(page.getByTestId("mcp-server-row")).toHaveCount(1);
	await expect(page.getByTestId("mcp-untrusted")).toBeVisible();
	await page.keyboard.press("Escape");
	const notice = page.getByTestId("project-trust-notice");
	await notice.getByTestId("project-trust-button").click();
	await expect(notice).toHaveAttribute("data-state", "trusted");
	await openSettingsSection(page, "mcp");
	await expect(page.getByTestId("mcp-server-row")).toHaveCount(2);
	const local = page.locator('[data-testid="mcp-server-row"][data-name="project-fixture"]');
	await expect(local.getByTestId("mcp-server-scope")).toHaveText("Project");
	await expect(local.getByTestId("mcp-server-status")).toHaveText("Pending approval");
	await expect(local.getByTestId("mcp-server-action")).toBeDisabled();
	await shot(page.getByTestId("settings-mcp"), "mcp-configuration", "project");
	await page.keyboard.press("Escape");
	await expect(page.getByTestId("welcome")).toBeVisible();
	await notice.getByTestId("project-untrust-button").click();
	await page.getByTestId("project-untrust-confirm").click();
	await expect(notice).toHaveAttribute("data-state", "untrusted");
	await openSettingsSection(page, "mcp");
	await expect(local).toHaveCount(0);
	await expect(page.getByTestId("mcp-server-row")).toHaveCount(1);
});

test("MCP configuration shows file errors and an empty state without a workspace", async ({
	page,
}) => {
	await openAppFresh(page);
	mkdirSync(E2E_PI_AGENT_DIR, { recursive: true });
	writeFileSync(USER_CONFIG, "{");
	await openSettingsSection(page, "mcp");
	await expect(page.getByTestId("mcp-config-error")).toContainText(USER_CONFIG);
	await expect(page.getByTestId("mcp-empty")).toBeVisible();
	await page.keyboard.press("Escape");
	writeFileSync(USER_CONFIG, '{"mcpServers":{}}');
	await openSettingsSection(page, "mcp");
	await expect(page.getByTestId("mcp-empty")).toBeVisible();
	await expect(page.getByTestId("mcp-config-error")).toHaveCount(0);
});

test("older hosts keep the workspace hint without receiving configuration requests", async ({
	page,
}) => {
	let reads = 0;
	await page.routeWebSocket(/\/ws(\?|$)/, (browser) => {
		const server = browser.connectToServer();
		browser.onMessage((message) => {
			const frame = JSON.parse(message.toString()) as WsRequest;
			if (frame.method === "mcp.listConfiguration") reads++;
			server.send(message);
		});
		server.onMessage((message) => {
			const frame = JSON.parse(message.toString()) as WsPush;
			if (frame.channel === "server.welcome") {
				browser.send(
					JSON.stringify({
						...frame,
						data: { ...frame.data, protocolVersion: MCP_CONFIGURATION_PROTOCOL_VERSION - 1 },
					}),
				);
			} else browser.send(message);
		});
	});
	await openAppFresh(page);
	await openSettingsSection(page, "mcp");
	await expect(page.getByTestId("mcp-no-workspace")).toHaveText(
		"Open a workspace to manage its MCP servers.",
	);
	await expect(page.getByTestId("mcp-server-row")).toHaveCount(0);
	expect(reads).toBe(0);
});

test("a failed MCP configuration read can be retried without a workspace", async ({ page }) => {
	let reads = 0;
	await page.routeWebSocket(/\/ws(\?|$)/, (browser) => {
		const server = browser.connectToServer();
		browser.onMessage((message) => {
			const frame = JSON.parse(message.toString()) as WsRequest;
			if (frame.method === "mcp.listConfiguration" && ++reads === 1) {
				browser.send(JSON.stringify({ id: frame.id, ok: false, error: "fixture read failure" }));
			} else server.send(message);
		});
		server.onMessage((message) => browser.send(message));
	});
	await openAppFresh(page);
	seedConfig(USER_CONFIG, "retry-fixture");
	await openSettingsSection(page, "mcp");
	await expect(page.getByTestId("mcp-error")).toContainText("fixture read failure");
	await page.getByTestId("mcp-retry").click();
	await expect(page.getByTestId("mcp-server-row")).toContainText("retry-fixture");
	await expect(page.getByTestId("mcp-error")).toHaveCount(0);
	expect(reads).toBe(2);
});
