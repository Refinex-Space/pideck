import { writeFileSync } from "node:fs";
import { expect, type Locator, type Page, test } from "@playwright/test";
import type {
	NativeUpdateBridge,
	NativeUpdateState,
	NativeWindowControlsBridge,
	NativeWindowState,
} from "@thinkrail/contracts";
import {
	enterDefaultWorkspace,
	expandDisclosure,
	openAppFresh,
	openAppSettings,
	openFixtureProject,
	PHONE_VIEWPORT,
} from "./fixtures/app";
import { connectCentral, openProviders, waitForCentralState } from "./fixtures/jbcentral";
import { E2E_CENTRAL_STATE } from "./fixtures/paths";

interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
	right: number;
	bottom: number;
}

async function bounds(locator: Locator): Promise<Rect> {
	return locator.evaluate((element) => {
		const { x, y, width, height, right, bottom } = element.getBoundingClientRect();
		return { x, y, width, height, right, bottom };
	});
}

async function setInsets(page: Page, left: number, right: number): Promise<void> {
	await page.evaluate(
		(insets) => {
			for (const [side, value] of Object.entries(insets)) {
				document.documentElement.style.setProperty(`--window-chrome-inset-${side}`, `${value}px`);
			}
		},
		{ left, right },
	);
	const navigation = page.getByTestId("navigation-chrome");
	const expanded = await navigation.isVisible();
	await expect(page.getByTestId("window-chrome-inset-left")).toHaveCSS(
		"width",
		expanded ? "0px" : `${left}px`,
	);
	if (expanded)
		await expect(page.getByTestId("navigation-window-inset-left")).toHaveCSS("width", `${left}px`);
	await expect(page.getByTestId("window-chrome-inset-right")).toHaveCSS("width", `${right}px`);
}

async function expectUsableHeader(
	page: Page,
	buttonIds: string[] = ["app-menu"],
	dragRegion: "drag" | "no-drag" = "no-drag",
): Promise<void> {
	const header = page.getByTestId("topbar").or(page.getByTestId("center-tab-strip")).first();
	const actions = page.getByTestId("navigation-footer");
	await expect(header).toHaveCSS("height", "40px");
	await expect(header).toHaveCSS("-webkit-app-region", dragRegion);
	const headerBox = await bounds(header);
	const leftInsetBox = await bounds(page.getByTestId("window-chrome-inset-left"));
	const rightInsetBox = await bounds(page.getByTestId("window-chrome-inset-right"));
	expect(headerBox.x).toBeGreaterThanOrEqual(0);
	expect(headerBox.y).toBe(0);
	expect(headerBox.right).toBeLessThanOrEqual(page.viewportSize()?.width ?? 0);
	expect(leftInsetBox.width).toBeGreaterThanOrEqual(0);
	expect(rightInsetBox.right).toBeLessThanOrEqual(headerBox.right);
	// A collapsed sidebar leaves no footer behind (it peeks in on hover), so only check it when shown.
	if ((await actions.count()) === 0 || (await page.getByTestId("left-peek").count()) > 0) return;
	await expect(actions).toHaveCSS("-webkit-app-region", "no-drag");
	for (const id of buttonIds) await expect(actions.getByTestId(id)).toBeVisible();
	const actionsBox = await bounds(actions);
	const logoBox = await bounds(page.getByTestId("brand-logo"));
	expect(logoBox.width).toBe(20);
	expect(logoBox.height).toBe(20);
	expect(actionsBox.bottom).toBeCloseTo(page.viewportSize()?.height ?? 0, 0);
	expect(logoBox.x).toBeGreaterThanOrEqual(actionsBox.x);
	expect(logoBox.right).toBeLessThanOrEqual(actionsBox.right);

	for (const testId of buttonIds) {
		const button = actions.getByTestId(testId);
		await expect(button).toBeInViewport({ ratio: 1 });
		const box = await bounds(button);
		expect(box.x).toBeGreaterThanOrEqual(actionsBox.x);
		expect(box.right).toBeLessThanOrEqual(actionsBox.right);
		expect(box.y).toBeGreaterThanOrEqual(actionsBox.y);
		expect(box.bottom).toBeLessThanOrEqual(actionsBox.bottom);
	}
}

async function headerColors(page: Page): Promise<{ actual: string; expected: string }> {
	return page.getByTestId("topbar").evaluate((header) => {
		const probe = document.createElement("div");
		probe.style.backgroundColor = "var(--container-content-bg)";
		document.body.append(probe);
		const expected = getComputedStyle(probe).backgroundColor;
		probe.remove();
		return { actual: getComputedStyle(header).backgroundColor, expected };
	});
}

async function setQuotaInterval(page: Page, seconds: number): Promise<void> {
	const interval = page.getByTestId("jbcentral-quota-interval");
	await interval.fill(String(seconds));
	await interval.press("Enter");
	await expect(interval).toHaveValue(String(seconds));
}

async function selectOppositeAppearanceTheme(page: Page): Promise<string> {
	await expandDisclosure(page.getByTestId("theme-toggle"));
	const selected = page.locator('[data-testid^="theme-option-"][data-active="true"]');
	const originalTheme = await selected.getAttribute("data-theme-id");
	const appearance = await selected.getAttribute("data-appearance");
	if (!originalTheme) throw new Error("No selected theme");
	await page
		.locator(
			`[data-testid^="theme-option-"][data-appearance="${appearance === "light" ? "dark" : "light"}"]`,
		)
		.first()
		.click();
	return originalTheme;
}

test("ordinary browsers have a fixed themed header with zero native insets", async ({ page }) => {
	await openAppFresh(page);
	const header = page.getByTestId("topbar");
	for (const side of ["left", "right"] as const) {
		const inset = page.getByTestId(`window-chrome-inset-${side}`);
		await expect(inset).toHaveAttribute("aria-hidden", "true");
		await expect(inset).toHaveCSS("width", "0px");
	}
	await expect(page.getByTestId("update-ready")).toHaveCount(0);
	await expect(page.getByTestId("window-controls")).toHaveCount(0);
	await expectUsableHeader(page);
	expect((await bounds(page.getByTestId("welcome-shell-layout"))).y).toBe(0);
	const initialColors = await headerColors(page);
	expect(initialColors.actual).toBe(initialColors.expected);

	await openAppSettings(page);
	await expect(page.getByTestId("settings-dialog")).toBeVisible();
	await expect(page.getByTestId("settings-nav-updates")).toHaveCount(0);
	await page.getByTestId("settings-nav-appearance").click();
	const originalTheme = await selectOppositeAppearanceTheme(page);
	await expect(header).not.toHaveCSS("background-color", initialColors.actual);
	const changedColors = await headerColors(page);
	expect(changedColors.actual).toBe(changedColors.expected);
	await expect(header).toHaveCSS("height", "40px");
	await page.getByTestId(`theme-option-${originalTheme}`).click();
	await expect(header).toHaveCSS("background-color", initialColors.actual);
	await page.keyboard.press("Escape");
	await expect(page.getByTestId("settings-dialog")).toBeHidden();

	await page.setViewportSize(PHONE_VIEWPORT);
	if ((await page.getByTestId("tool-rail-projects").getAttribute("aria-pressed")) === "true")
		await page.getByTestId("tool-rail-projects").click();
	await expectUsableHeader(page);
	await openAppSettings(page);
	await expect(page.getByTestId("settings-dialog")).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(page.getByTestId("settings-dialog")).toBeHidden();
});

test("live safe areas on either edge preserve header and workbench geometry", async ({
	page,
}, testInfo) => {
	await openFixtureProject(page);
	await enterDefaultWorkspace(page);
	await page.evaluate(() => document.fonts.ready);
	const logo = page.getByTestId("brand-logo");
	const actions = page.getByTestId("navigation-footer");
	const workbench = page.getByTestId("workspace-shell-layout");

	for (const viewport of [{ width: 1280, height: 720 }, PHONE_VIEWPORT]) {
		await page.setViewportSize(viewport);
		if (
			viewport.width < 640 &&
			(await page.getByTestId("tool-rail-projects").getAttribute("aria-pressed")) === "true"
		)
			await page.getByTestId("tool-rail-projects").click();
		await setInsets(page, 0, 0);
		const footerShown = (await actions.count()) > 0;
		const baselineLogo = footerShown ? await bounds(logo) : null;
		const baselineActions = footerShown ? await bounds(actions) : null;
		const baselineWorkbench = await bounds(workbench);
		for (const [left, right] of [
			[80, 138],
			[96, 0],
			[0, 112],
			[0, 0],
		] as const) {
			await setInsets(page, left, right);
			await expectUsableHeader(page);
			if (baselineLogo && baselineActions) {
				expect((await bounds(logo)).x).toBeCloseTo(baselineLogo.x, 1);
				expect((await bounds(actions)).right).toBeCloseTo(baselineActions.right, 1);
			}
			const workbenchBox = await bounds(workbench);
			expect(workbenchBox).toEqual(baselineWorkbench);
			expect(workbenchBox.y).toBe(0);
			await expect(page.getByTestId("open-status-panel")).toBeVisible();
			await expect(page.getByTestId("center-tabs")).toBeVisible();
			if (left === 80 && right === 138) {
				await testInfo.attach(`injected-insets-${viewport.width}`, {
					body: await page.getByTestId("topbar").screenshot({
						path: testInfo.outputPath(`injected-insets-${viewport.width}.png`),
					}),
					contentType: "image/png",
				});
			}
		}
	}
});

test("native updates progress from explicit download through install and restart", async ({
	page,
}) => {
	await page.addInitScript(() => {
		let state: NativeUpdateState = {
			revision: 1,
			status: "available",
			version: "0.1.0",
			channel: "stable",
			availableVersion: "0.1.1",
			progress: null,
			error: null,
			failedPhase: null,
			installStep: null,
			log: [],
			lastInstall: null,
		};
		const listeners = new Set<(next: NativeUpdateState) => void>();
		const publish = (next: Partial<NativeUpdateState>) => {
			state = { ...state, ...next, revision: state.revision + 1 };
			for (const listener of listeners) listener(state);
		};
		const bridge: NativeUpdateBridge = {
			getState: async () => state,
			checkForUpdates: async () => {},
			downloadUpdate: async () => publish({ status: "downloading", progress: 37 }),
			restartToUpdate: async () =>
				publish({ status: "installing", progress: null, installStep: "stopping" }),
			dismissInstallResult: async () => {},
			subscribe: (listener) => {
				listeners.add(listener);
				return () => listeners.delete(listener);
			},
		};
		Object.defineProperty(globalThis, "__THINKRAIL_NATIVE_UPDATES__", { value: bridge });
		Object.defineProperty(globalThis, "__THINKRAIL_TEST_UPDATE__", { value: publish });
	});
	await openAppFresh(page);

	// The collapsed sidebar peeks in while its toggle is hovered; the footer lives there.
	await page.mouse.move(640, 450);
	await page.getByTestId("tool-rail-projects").hover();
	await page.getByTestId("update-ready").click();
	await expect(page.getByTestId("settings-updates")).toBeVisible();
	await expect(page.getByTestId("update-download")).toHaveText("Download");
	await page.getByTestId("update-download").click();
	await expect(page.getByText("Downloading update — 37%")).toBeVisible();
	await page.evaluate(() => {
		(
			globalThis as typeof globalThis & {
				__THINKRAIL_TEST_UPDATE__: (next: Partial<NativeUpdateState>) => void;
			}
		).__THINKRAIL_TEST_UPDATE__({ status: "preparing", progress: 100 });
	});
	await expect(page.getByText("Preparing update…")).toBeVisible();
	await page.evaluate(() => {
		(
			globalThis as typeof globalThis & {
				__THINKRAIL_TEST_UPDATE__: (next: Partial<NativeUpdateState>) => void;
			}
		).__THINKRAIL_TEST_UPDATE__({ status: "ready" });
	});
	await expect(page.getByTestId("update-restart")).toHaveText("Install & Restart");
	await page.keyboard.press("Escape");
	await expect(page.getByTestId("settings-dialog")).toBeHidden();
	await expect(page.getByTestId("update-ready")).toBeVisible();
	await page.getByTestId("update-ready").click();
	await page.getByTestId("update-restart").click();
	await expect(page.getByTestId("update-status")).toContainText("Installing update");
	await expect(page.getByTestId("update-install-dialog")).toBeVisible();
});

test("the action cluster keeps Update, quota Retry and Settings out of the drag region", async ({
	page,
}) => {
	await page.addInitScript(() => {
		const state: NativeUpdateState = {
			revision: 1,
			status: "ready",
			version: "0.1.0",
			channel: "stable",
			availableVersion: "0.1.1",
			progress: null,
			error: null,
			failedPhase: null,
			installStep: null,
			log: [],
			lastInstall: null,
		};
		const bridge: NativeUpdateBridge = {
			getState: async () => state,
			checkForUpdates: async () => {},
			downloadUpdate: async () => {},
			restartToUpdate: async () => {},
			dismissInstallResult: async () => {},
			subscribe: () => () => {},
		};
		Object.defineProperty(globalThis, "__THINKRAIL_NATIVE_UPDATES__", { value: bridge });
	});
	await openFixtureProject(page);
	await enterDefaultWorkspace(page);
	await openProviders(page);
	await waitForCentralState(page, "supported");
	await setQuotaInterval(page, 3600);
	writeFileSync(E2E_CENTRAL_STATE, "quota-error");
	await connectCentral(page);
	await waitForCentralState(page, "configured");
	const quota = page.getByTestId("jbcentral-quota");
	await expect(quota).toHaveAttribute("data-state", "unavailable");
	await page.keyboard.press("Escape");
	await expect(page.getByTestId("settings-dialog")).toBeHidden();

	const buttons = ["update-ready", "jbcentral-quota", "app-menu"];
	await page.evaluate(() =>
		document.documentElement.style.setProperty("--window-chrome-drag-region", "drag"),
	);
	await setInsets(page, 80, 138);
	await expectUsableHeader(page, buttons, "drag");

	await setInsets(page, 0, 0);
	await page.setViewportSize(PHONE_VIEWPORT);
	if ((await page.getByTestId("tool-rail-projects").getAttribute("aria-pressed")) === "true")
		await page.getByTestId("tool-rail-projects").click();
	await expectUsableHeader(page, buttons, "drag");

	// The collapsed sidebar peeks in while its toggle is hovered; the footer lives there.
	await page.mouse.move(200, 400);
	await page.getByTestId("tool-rail-projects").hover();
	await page.getByTestId("update-ready").click();
	await expect(page.getByTestId("settings-updates")).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(page.getByTestId("settings-dialog")).toBeHidden();

	await openProviders(page);
	await setQuotaInterval(page, 30);
	writeFileSync(E2E_CENTRAL_STATE, "");
	await page.getByTestId("jetbrains-disconnect").click();
	await waitForCentralState(page, "supported");
});

test("HTML window controls appear only with the native bridge and drive it", async ({ page }) => {
	await page.addInitScript(() => {
		const actions: string[] = [];
		const listeners = new Set<(state: NativeWindowState) => void>();
		let state: NativeWindowState = { maximized: false, fullScreen: false };
		const bridge: NativeWindowControlsBridge = {
			getState: async () => state,
			minimize: async () => {
				actions.push("minimize");
			},
			toggleMaximize: async () => {
				actions.push("toggleMaximize");
				state = { ...state, maximized: !state.maximized };
				for (const listener of listeners) listener(state);
			},
			close: async () => {
				actions.push("close");
			},
			subscribe: (listener) => {
				listeners.add(listener);
				return () => {
					listeners.delete(listener);
				};
			},
		};
		Object.defineProperty(globalThis, "__THINKRAIL_NATIVE_WINDOW_CONTROLS__", { value: bridge });
		Object.defineProperty(globalThis, "__TEST_WINDOW_ACTIONS__", { value: actions });
		Object.defineProperty(globalThis, "__TEST_WINDOW_LISTENERS__", { value: listeners });
	});
	await openAppFresh(page);
	await page.evaluate(() =>
		document.documentElement.style.setProperty("--window-chrome-drag-region", "drag"),
	);
	await setInsets(page, 0, 138);

	const controls = page.getByTestId("window-controls");
	await expect(controls).toHaveCSS("-webkit-app-region", "no-drag");
	await expect(controls.locator("button")).toHaveCount(3);
	const minimize = controls.getByTestId("window-minimize");
	const maximize = controls.getByTestId("window-maximize");
	const close = controls.getByTestId("window-close");
	await expect(minimize).toHaveAttribute("aria-label", "Minimize");
	await expect(maximize).toHaveAttribute("aria-label", "Maximize");
	await expect(close).toHaveAttribute("aria-label", "Close");

	const header = page.getByTestId("topbar");
	const spacer = page.getByTestId("window-chrome-inset-right");
	const headerBox = await bounds(header);
	const spacerBox = await bounds(spacer);
	const controlsBox = await bounds(controls);
	expect(controlsBox.right).toBe(page.viewportSize()?.width);
	expect(controlsBox.y).toBe(headerBox.y);
	expect(controlsBox.height).toBe(40);
	expect(controlsBox.x).toBeGreaterThanOrEqual(spacerBox.x);
	await expectUsableHeader(page, ["app-menu"], "drag");

	const getActions = () => page.evaluate(() => Reflect.get(globalThis, "__TEST_WINDOW_ACTIONS__"));

	await maximize.click();
	await expect.poll(getActions).toEqual(["toggleMaximize"]);
	await expect(maximize).toHaveAttribute("aria-label", "Restore");
	await expect(maximize).toHaveAttribute("data-maximized", "true");

	await maximize.click();
	await expect.poll(getActions).toEqual(["toggleMaximize", "toggleMaximize"]);
	await expect(maximize).toHaveAttribute("aria-label", "Maximize");
	await expect(maximize).toHaveAttribute("data-maximized", "false");

	await minimize.click();
	await expect.poll(getActions).toEqual(["toggleMaximize", "toggleMaximize", "minimize"]);

	await close.click();
	await expect.poll(getActions).toEqual(["toggleMaximize", "toggleMaximize", "minimize", "close"]);

	await page.evaluate(() => {
		const listeners = Reflect.get(globalThis, "__TEST_WINDOW_LISTENERS__") as Set<
			(state: NativeWindowState) => void
		>;
		const next: NativeWindowState = { maximized: false, fullScreen: true };
		for (const listener of listeners) listener(next);
	});
	await setInsets(page, 0, 0);
	await expect(controls).toHaveCount(0);
	await expectUsableHeader(page, ["app-menu"], "drag");

	await page.evaluate(() => {
		const listeners = Reflect.get(globalThis, "__TEST_WINDOW_LISTENERS__") as Set<
			(state: NativeWindowState) => void
		>;
		const next: NativeWindowState = { maximized: false, fullScreen: false };
		for (const listener of listeners) listener(next);
	});
	await setInsets(page, 0, 138);
	await expect(controls).toHaveCount(1);
});
