import { realpathSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import {
	CHAT_RESOURCES_PROTOCOL_VERSION,
	type SessionResources,
	type WsClientMessage,
	type WsParams,
	type WsResult,
} from "@thinkrail/contracts";
import {
	enterDefaultWorkspace,
	openFixtureProject,
	openPersistedChat,
	openStatusDock,
} from "./fixtures/app";
import { E2E_FIXTURE_REPO } from "./fixtures/paths";
import { shot } from "./fixtures/screenshots";
import { seedWorkspaceSession } from "./fixtures/sessions";

async function openResourceChat(page: Page) {
	await openFixtureProject(page);
	seedWorkspaceSession(realpathSync(E2E_FIXTURE_REPO), {
		name: "Resource UI",
		messages: [{ role: "user", text: "Inspect this chat's resources.", timestamp: Date.now() }],
	});
	await enterDefaultWorkspace(page);
	await openPersistedChat(page, "Resource UI");
	await expect(page.getByTestId("chat-input")).toBeVisible();
}

async function observeResourceWire(
	page: Page,
	options: {
		protocolVersion?: number;
		completedChildId?: string;
		mcpServers?: SessionResources["mcpServers"];
	} = {},
) {
	let protocolVersion = options.protocolVersion;
	let reads = 0;
	let welcomes = 0;
	let resourceScope: WsParams<"session.resources"> | undefined;
	const transcriptRequests: WsParams<"subagent.getTranscript">[] = [];
	let disconnect = () => {};
	await page.routeWebSocket(/\/ws(\?|$)/, (browser) => {
		const server = browser.connectToServer();
		disconnect = () => browser.close({ code: 1012, reason: "Reconnect probe" });
		browser.onMessage((message) => {
			const frame = JSON.parse(message.toString()) as WsClientMessage;
			if ("method" in frame && frame.method === "session.resources") {
				reads++;
				resourceScope = frame.params as WsParams<"session.resources">;
				if (options.mcpServers) {
					const result: SessionResources = {
						...resourceScope,
						commands: [],
						subagents: [],
						mcpServers: options.mcpServers,
					};
					browser.send(JSON.stringify({ id: frame.id, ok: true, result }));
					return;
				}
				if (options.completedChildId) {
					const result: SessionResources = {
						...resourceScope,
						commands: [],
						subagents: [
							{
								childSessionId: options.completedChildId,
								parentSessionId: resourceScope.sessionId,
								task: "Focus fixture",
								status: "completed",
								createdAt: "2026-01-01T00:00:00.000Z",
								model: "acme/reviewer-1",
								thinkingLevel: "high",
								durationMs: 7 * 60_000,
							},
						],
					};
					browser.send(JSON.stringify({ id: frame.id, ok: true, result }));
					return;
				}
			}
			if (
				"method" in frame &&
				frame.method === "subagent.getTranscript" &&
				options.completedChildId
			) {
				transcriptRequests.push(frame.params as WsParams<"subagent.getTranscript">);
				const result: WsResult<"subagent.getTranscript"> = {
					messages: [
						{
							role: "user",
							content: [{ type: "text", text: "FOCUS_CHILD" }],
							timestamp: 1_700_000_000_000,
						},
					],
					status: "completed",
				};
				browser.send(JSON.stringify({ id: frame.id, ok: true, result }));
				return;
			}
			server.send(message);
		});
		server.onMessage((message) => {
			const frame = JSON.parse(message.toString()) as {
				channel?: string;
				data?: Record<string, unknown>;
			};
			if (frame.channel === "server.welcome") welcomes++;
			if (protocolVersion !== undefined && frame.channel === "server.welcome") {
				browser.send(JSON.stringify({ ...frame, data: { ...frame.data, protocolVersion } }));
			} else {
				browser.send(message);
			}
		});
	});
	return {
		get reads() {
			return reads;
		},
		get welcomes() {
			return welcomes;
		},
		get resourceScope() {
			return resourceScope;
		},
		transcriptRequests,
		setProtocolVersion: (version: number) => {
			protocolVersion = version;
		},
		disconnect: () => disconnect(),
	};
}

test("an empty status dock lists no background work, hides the task strip and stays usable in a narrow pane", async ({
	page,
}) => {
	await openResourceChat(page);
	await expect(page.getByTestId("chat-toolbar")).toHaveCount(0);
	await expect(page.getByTestId("resources-dock")).toHaveCount(0);
	const toggle = page.getByTestId("open-status-panel");
	await expect(toggle).not.toHaveAttribute("data-signal");
	const panel = await openStatusDock(page);
	const tasks = panel.getByTestId("status-block-tasks");
	await expect(tasks.getByTestId("resources-active")).toBeVisible();
	await expect(
		tasks.getByText("Nothing is running in the background.", { exact: true }),
	).toBeVisible();
	await expect(tasks.getByTestId("resources-finished-toggle")).toHaveAttribute(
		"aria-expanded",
		"false",
	);
	await tasks.getByTestId("resources-finished-toggle").click();
	await expect(tasks.getByText("No finished resources yet.", { exact: true })).toBeVisible();
	await expect(tasks.getByTestId("resource-stop")).toHaveCount(0);
	await expect(tasks.getByTestId("resources-stop-all")).toHaveCount(0);
	await expect(page.getByTestId("chat-input")).toBeVisible();
	await shot(panel, "chat-resources", "empty-dock");

	await page.setViewportSize({ width: 390, height: 844 });
	await expect(toggle).toBeInViewport({ ratio: 1 });
	await expect(page.getByTestId("status-dock")).toBeInViewport({ ratio: 1 });
	await shot(page, "chat-resources", "mobile-dock");
	await toggle.click();
	await expect(page.getByTestId("status-panel")).toHaveCount(0);
});

test("Resources rehydrates on welcome after a real socket reconnect and browser reload", async ({
	page,
}) => {
	const wire = await observeResourceWire(page);
	await openResourceChat(page);
	const panel = await openStatusDock(page);
	const empty = panel.getByText("Nothing is running in the background.", { exact: true });
	await expect(empty).toBeVisible();
	await expect.poll(() => wire.reads).toBeGreaterThan(0);
	const initial = wire.reads;
	wire.disconnect();
	await expect.poll(() => wire.reads).toBeGreaterThan(initial);
	await expect(page.getByTestId("connection-status")).toHaveAttribute("data-status", "connected");
	await expect(empty).toBeVisible();
	const reconnected = wire.reads;
	await page.reload();
	await expect.poll(() => wire.reads).toBeGreaterThan(reconnected);
	await expect(page.getByTestId("status-panel")).toBeVisible();
	await expect(
		page
			.getByTestId("status-panel")
			.getByText("Nothing is running in the background.", { exact: true }),
	).toBeVisible();
});

test("an older host says background tasks are unavailable without issuing unsupported resource reads", async ({
	page,
}) => {
	const wire = await observeResourceWire(page, {
		protocolVersion: CHAT_RESOURCES_PROTOCOL_VERSION - 1,
	});
	await openResourceChat(page);
	await expect(page.getByTestId("connection-status")).toHaveAttribute("data-status", "connected");
	const panel = await openStatusDock(page);
	await expect(panel.getByTestId("status-tasks-empty")).toHaveText(
		"This host does not report background tasks.",
	);
	await expect(page.getByTestId("resources-dock")).toHaveCount(0);
	expect(wire.reads).toBe(0);
});

test("a finished subagent opens its detail from the dock, and an older welcome retires the dialog", async ({
	page,
}) => {
	const childSessionId = "resource-focus-child";
	const wire = await observeResourceWire(page, { completedChildId: childSessionId });
	await openResourceChat(page);
	const panel = await openStatusDock(page);
	const tasks = panel.getByTestId("status-block-tasks");
	await tasks.getByTestId("resources-finished-toggle").click();
	const row = tasks.getByTestId("resource-subagent");
	await expect(row).toHaveAttribute("data-resource-id", childSessionId);
	await expect(row).toContainText("7 min");
	await row.getByTestId("resource-inspect").click();

	const detail = page.getByTestId("resources-detail");
	await expect(detail).toBeVisible();
	await expect(detail).toContainText("Duration7 min");
	await expect(detail.getByTestId("resource-detail-model")).toContainText("acme/reviewer-1");
	await expect(detail.getByTestId("resource-detail-model")).toContainText("high");
	await expect(detail.getByTestId("subagent-transcript")).toContainText("FOCUS_CHILD");
	expect(wire.transcriptRequests).toEqual([
		{
			workspaceId: wire.resourceScope?.workspaceId,
			parentSessionId: wire.resourceScope?.sessionId,
			childSessionId,
		},
	]);
	await page.keyboard.press("Escape");
	await expect(detail).toHaveCount(0);
	await row.getByTestId("resource-inspect").click();
	await expect(detail).toBeVisible();

	const initialWelcomes = wire.welcomes;
	wire.setProtocolVersion(CHAT_RESOURCES_PROTOCOL_VERSION - 1);
	wire.disconnect();
	await expect.poll(() => wire.welcomes).toBeGreaterThan(initialWelcomes);
	await expect(page.getByTestId("connection-status")).toHaveAttribute("data-status", "connected");
	await expect(detail).toHaveCount(0);
	await expect(panel.getByTestId("status-tasks-empty")).toHaveText(
		"This host does not report background tasks.",
	);
});

test("connector rows share one right edge and the Manage row lines up with them", async ({
	page,
}, testInfo) => {
	await page.setViewportSize({ width: 1400, height: 900 });
	await observeResourceWire(page, {
		mcpServers: [
			{ name: "context7", state: "connected", toolCount: 2, transport: "http" },
			{ name: "github", state: "connected", toolCount: 46, transport: "http" },
			{ name: "playwright", state: "connected", toolCount: 25, transport: "stdio" },
			{ name: "linear", state: "needs-sign-in", transport: "http" },
			{ name: "quiet", state: "disabled-in-chat", transport: "stdio" },
			{ name: "ext", state: "connected", toolCount: 1, transport: "http", registered: true },
		],
	});
	await openResourceChat(page);
	const panel = await openStatusDock(page);
	const block = panel.getByTestId("status-block-connectors");
	const rows = block.getByTestId("resource-mcp");
	await expect(rows).toHaveCount(6);
	// Measure only once the dock has finished sliding in (24rem).
	await expect
		.poll(async () => (await page.getByTestId("status-dock").boundingBox())?.width ?? 0)
		.toBeGreaterThanOrEqual(380);

	// Every row ends in the same column: the menu (or its placeholder) never appears only on hover.
	const rights = await rows.evaluateAll((nodes) =>
		nodes.map((node) => {
			const line = node.firstElementChild;
			const last = line?.lastElementChild;
			return last ? Math.round(last.getBoundingClientRect().right) : -1;
		}),
	);
	expect(rights).toEqual(Array(6).fill(rights[0]));
	await expect(block.getByTestId("resource-mcp-menu")).toHaveCount(4);
	await expect(block.getByTestId("resource-mcp-menu").first()).toBeVisible();
	const opacity = await block
		.getByTestId("resource-mcp-menu")
		.first()
		.evaluate((node) => getComputedStyle(node).opacity);
	expect(opacity).toBe("1");

	// Linear needs sign-in and Quiet is off for this chat: each carries its one inline action.
	await expect(
		block.locator('[data-name="linear"]').getByTestId("resource-mcp-settings"),
	).toBeVisible();
	await expect(
		block.locator('[data-name="quiet"]').getByTestId("resource-mcp-enable"),
	).toBeVisible();

	// The Manage row starts at the icon column of the rows above and tints on hover.
	const manage = block.getByTestId("status-connectors-manage");
	const plug = await rows.first().locator("svg").first().boundingBox();
	const manageIcon = await manage.locator("svg").first().boundingBox();
	const manageBox = await manage.boundingBox();
	const rowsBox = await block.getByTestId("resources-mcp").boundingBox();
	if (!plug || !manageIcon || !manageBox || !rowsBox) throw new Error("Missing connector geometry");
	expect(
		Math.abs(manageIcon.x + manageIcon.width / 2 - (plug.x + plug.width / 2)),
	).toBeLessThanOrEqual(1);
	expect(manageBox.x).toBeLessThanOrEqual(rowsBox.x);
	const resting = await manage.evaluate((node) => getComputedStyle(node).backgroundColor);
	await manage.hover();
	await expect
		.poll(() => manage.evaluate((node) => getComputedStyle(node).backgroundColor))
		.not.toBe(resting);
	await testInfo.attach("connectors", {
		body: await block.screenshot({ path: testInfo.outputPath("connectors.png") }),
		contentType: "image/png",
	});
});
