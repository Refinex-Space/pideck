import { expect, type Page, test } from "@playwright/test";
import type {
	BrowserPageState,
	BrowserRecordingState,
	NativeBrowserBridge,
} from "@thinkrail/contracts";
import { pickerScript } from "../apps/desktop/src/browserPicker";
import {
	createWorkspaceViaDialog,
	enterDefaultWorkspace,
	openFixtureProject,
} from "./fixtures/app";

async function browserFixture(page: Page) {
	await page.addInitScript(() => {
		const events: string[] = [];
		Reflect.set(window, "__browserEvents", events);
		let handler: Parameters<NativeBrowserBridge["registerWorkbench"]>[0] | undefined;
		const bridge: NativeBrowserBridge = {
			registerWorkbench(next) {
				handler = next;
				return () => {
					handler = undefined;
				};
			},
			async command(workspaceId, command) {
				events.push(`command:${command.action}`);
				const recording: BrowserRecordingState = {
					id: "record-fixture",
					tabId: command.tabId ?? "",
					phase:
						command.action === "recordingStart"
							? "capturing"
							: command.action === "recordingCancel"
								? "cancelled"
								: "completed",
					startedAt: Date.now(),
					...(command.action === "recordingStop"
						? {
								artifact: {
									path: ".thinkrail/browser/demo.webm",
									mimeType: "video/webm" as const,
									bytes: 100,
									width: 640,
									height: 480,
									durationMs: 1500,
								},
							}
						: {}),
				};
				await handler?.({ action: "recording", workspaceId, tabId: recording.tabId, recording });
				return { recording };
			},
			create({ id, onEvent }) {
				const history: string[] = [];
				let index = -1;
				const state: BrowserPageState = {
					url: "",
					title: "",
					loading: false,
					canGoBack: false,
					canGoForward: false,
					error: null,
				};
				const publish = () => {
					state.url = history[index] ?? "";
					state.title = state.url ? new URL(state.url).pathname : "";
					state.canGoBack = index > 0;
					state.canGoForward = index < history.length - 1;
					onEvent({ type: "state", state: { ...state } });
				};
				return {
					async nativeId() {
						return 1;
					},
					async setCapture() {},
					setVisible() {},
					isVisible() {
						return true;
					},
					setActive() {},
					attach(slot) {
						events.push(`${id}:attach:${!!slot}`);
					},
					navigate(url) {
						events.push(`navigate:${url}`);
						history.splice(index + 1);
						history.push(url);
						index++;
						publish();
					},
					back() {
						index--;
						publish();
					},
					forward() {
						index++;
						publish();
					},
					reload() {
						publish();
					},
					stop() {},
					find(text) {
						events.push(`find:${text}`);
					},
					stopFind() {},
					openDevTools() {
						events.push("devtools");
					},
					async openExternal() {
						events.push(`external:${state.url}`);
					},
					pick() {
						onEvent({
							type: "selection",
							selection: {
								pageUrl: state.url,
								pageTitle: "Fixture",
								tagName: "button",
								selector: "#save",
								xpath: "/html/body/button",
								text: "Save",
								accessibleName: "Save",
								role: "button",
								html: "<button id=save>Save</button>",
								attributes: { id: "save" },
								style: {},
								rect: { x: 0, y: 0, width: 80, height: 32 },
							},
						});
					},
					cancelPick() {
						onEvent({ type: "picker-cancelled" });
					},
					async setViewport(viewport) {
						events.push(`viewport:${JSON.stringify(viewport)}`);
					},
					async copyScreenshot() {
						events.push("copy-screenshot");
					},
					async screenshot() {
						return "data:image/png;base64,";
					},
					dispose() {
						events.push(`${id}:dispose`);
					},
				};
			},
		};
		Reflect.set(window, "__THINKRAIL_NATIVE_BROWSER__", bridge);
	});
}

test("browser panel keeps address drafts, navigation and pages across tab and panel switches", async ({
	page,
}, testInfo) => {
	await browserFixture(page);
	await openFixtureProject(page);
	await enterDefaultWorkspace(page);
	await page.getByTestId("tool-rail-browser").click();
	const panel = page.getByTestId("right-column");
	const address = panel.getByTestId("browser-address");
	await expect(panel.getByText("Paste or enter a URL to open a page.")).toBeVisible();
	await address.fill("localhost:3000/one");
	await expect(panel.getByText("Paste or enter a URL to open a page.")).toBeVisible();
	await address.press("Enter");
	await expect(address).toHaveValue("http://localhost:3000/one");
	await address.fill("localhost:3000/two");
	await address.press("Enter");
	await panel.getByRole("button", { name: "Back", exact: true }).click();
	await expect(address).toHaveValue("http://localhost:3000/one");
	await panel.getByRole("button", { name: "Forward", exact: true }).click();
	await address.fill("unsubmitted.example");
	await address.press("Escape");
	await expect(address).toHaveValue("http://localhost:3000/two");
	await panel.getByRole("button", { name: "New tab", exact: true }).click();
	await expect(panel.getByRole("tab")).toHaveCount(2);
	await panel.getByRole("tab", { name: "/two" }).click();
	await expect(address).toHaveValue("http://localhost:3000/two");
	await panel.getByRole("button", { name: "Responsive viewport" }).click();
	await expect(panel.getByRole("spinbutton", { name: "Viewport width" })).toHaveValue("1280");
	await panel.getByRole("button", { name: "Select an element" }).click();
	await expect(panel.getByRole("button", { name: "Add to chat" })).toBeVisible();
	await page.screenshot({ path: testInfo.outputPath("browser-panel.png"), animations: "disabled" });
	await page.getByTestId("tool-rail-browser").click();
	await page.getByTestId("tool-rail-browser").click();
	await expect(address).toHaveValue("http://localhost:3000/two");
	const events = await page.evaluate(() => Reflect.get(window, "__browserEvents") as string[]);
	expect(events.filter((event) => event.endsWith(":dispose"))).toHaveLength(0);
	await panel.getByRole("button", { name: "Close tab", exact: true }).first().click();
	await expect(panel.getByRole("tab")).toHaveCount(1);
	expect(
		await page.evaluate(
			() =>
				(Reflect.get(window, "__browserEvents") as string[]).filter((event) =>
					event.endsWith(":dispose"),
				).length,
		),
	).toBe(1);
});

test("web clients do not advertise a native browser", async ({ page }) => {
	await openFixtureProject(page);
	await enterDefaultWorkspace(page);
	await expect(page.getByTestId("tool-rail-browser")).toHaveCount(0);
});

test("screenshot copies directly; recording exposes stop, discard, playback and restores viewport controls", async ({
	page,
}, testInfo) => {
	await browserFixture(page);
	await openFixtureProject(page);
	await enterDefaultWorkspace(page);
	await page.getByTestId("tool-rail-browser").click();
	const panel = page.getByTestId("right-column");
	const address = panel.getByTestId("browser-address");
	await address.fill("localhost:3000/demo");
	await address.press("Enter");
	await panel.getByRole("button", { name: "Copy screenshot", exact: true }).click();
	await expect
		.poll(() =>
			page.evaluate(() => Reflect.get(window, "__browserEvents").includes("copy-screenshot")),
		)
		.toBe(true);
	await expect(
		page
			.getByTestId("toast")
			.getByText("Screenshot copied. Paste with Ctrl+V / Command+V.", { exact: true }),
	).toBeVisible();
	await panel.getByRole("button", { name: "Responsive viewport" }).click();
	await panel.getByRole("button", { name: "Start recording", exact: true }).click();
	await expect(panel.getByTestId("browser-recording-status")).toContainText("Recording");
	await expect(panel.getByRole("spinbutton", { name: "Viewport width" })).toBeDisabled();
	await expect(panel.getByRole("combobox", { name: "Preview zoom" })).toHaveValue("1");
	await panel.getByRole("button", { name: "Finish recording", exact: true }).first().click();
	await expect(panel.getByRole("spinbutton", { name: "Viewport width" })).toBeEnabled();
	await expect(panel.getByRole("combobox", { name: "Preview zoom" })).toHaveValue("fit");
	await panel.getByRole("button", { name: "Play recording", exact: true }).click();
	await expect(page.getByRole("dialog")).toContainText(".thinkrail/browser/demo.webm");
	await page.screenshot({
		path: testInfo.outputPath("browser-recording.png"),
		animations: "disabled",
	});
	await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
	await panel.getByRole("button", { name: "Start recording", exact: true }).click();
	await panel.getByRole("button", { name: "Discard recording", exact: true }).click();
	await expect(panel.getByTestId("browser-recording-status")).toContainText(
		"Recording saved to workspace",
	);
	await expect(panel.getByRole("button", { name: "Play recording", exact: true })).toBeVisible();
});

test("selected page context is inserted at the composer cursor without sending", async ({
	page,
}) => {
	await browserFixture(page);
	let prompts = 0;
	page.on("websocket", (socket) =>
		socket.on("framesent", ({ payload }) => {
			if (JSON.parse(String(payload)).method === "session.prompt") prompts++;
		}),
	);
	await openFixtureProject(page);
	await createWorkspaceViaDialog(page);
	const input = page.getByTestId("chat-input");
	await input.fill("before after");
	await input.press("Home");
	for (let i = 0; i < 7; i++) await input.press("ArrowRight");
	await page.getByTestId("tool-rail-browser").click();
	const address = page.getByTestId("browser-address");
	await address.fill("localhost:3000/example");
	await address.press("Enter");
	await page.getByRole("button", { name: "Select an element" }).click();
	await page.getByRole("button", { name: "Add to chat" }).click();
	await expect(input).toHaveValue(
		/^before \n<web-page-element>[\s\S]*"selector": "#save"[\s\S]*<\/web-page-element>\nafter$/,
	);
	await expect(input).toBeFocused();
	expect(prompts).toBe(0);
});

test("real picker suppresses actions, captures bounded DOM and excludes form values", async ({
	page,
}) => {
	await page.goto("about:blank");
	await page.setContent(
		'<main><section id="fixture"><button id="save" onclick="window.clicked=true">Save</button><input type="password" value="secret-value"><textarea>private-draft</textarea><script>window.privateData="do-not-copy"</script></section></main>',
	);
	await page.evaluate(() =>
		Reflect.set(window, "__pideckSendToHost", (value: unknown) =>
			Reflect.set(window, "__selection", value),
		),
	);
	const script = pickerScript(
		{ instruction: "Click · Esc", background: "Background", color: "Color", font: "Font" },
		{ accent: "blue", surface: "white", text: "black", border: "gray" },
		"test-run",
	);
	await page.evaluate(script);
	await page.locator("#save").click();
	const result = await page.evaluate(() => ({
		selection: Reflect.get(window, "__selection"),
		clicked: Reflect.get(window, "clicked"),
	}));
	expect(result.clicked).toBeUndefined();
	expect(result.selection.value.selection.selector).toBe("#save");
	await page.evaluate(script);
	await page.locator("#fixture").click({ position: { x: 2, y: 2 } });
	const captured = await page.evaluate(() => JSON.stringify(Reflect.get(window, "__selection")));
	expect(captured).not.toContain("secret-value");
	expect(captured).not.toContain("private-draft");
	expect(captured).not.toContain("do-not-copy");
	await page.evaluate(script);
	await page.keyboard.press("Escape");
	expect(await page.evaluate(() => Reflect.get(window, "__selection").value)).toEqual({
		cancelled: true,
	});
	await expect(page.locator("[data-pideck-picker]")).toHaveCount(0);
});
