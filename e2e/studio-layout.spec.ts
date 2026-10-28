import { expect, type Locator, type Page, test } from "@playwright/test";
import {
	applyWorkbenchPreset,
	createWorkspaceViaDialog,
	openAppSettings,
	openFixtureProject,
	revealWorkbenchTool,
	runInTerminal,
	visibleTerminalScreen,
	waitTerminalReady,
} from "./fixtures/app";

async function navigationWidth(pane: Locator, rail: Locator): Promise<number> {
	const [paneBox, railBox] = await Promise.all([pane.boundingBox(), rail.boundingBox()]);
	if (!paneBox || !railBox) throw new Error("navigation geometry is not visible");
	return (
		Math.max(paneBox.x + paneBox.width, railBox.x + railBox.width) - Math.min(paneBox.x, railBox.x)
	);
}

function savedLeftRatio(page: Page): Promise<number | null> {
	return page.evaluate(() => {
		const key = Object.keys(localStorage).find((candidate) =>
			candidate.startsWith("thinkrail:workbench:"),
		);
		if (!key) return null;
		const value = JSON.parse(localStorage.getItem(key) ?? "null") as {
			frame?: { left?: { width?: number } };
		} | null;
		return value?.frame?.left?.width ?? null;
	});
}

test("Studio starts with a bounded navigation width and reapplies it only on explicit choice", async ({
	page,
}) => {
	await page.setViewportSize({ width: 2316, height: 1325 });
	await openFixtureProject(page);
	const rail = page.getByTestId("left-layout-rail");
	await expect
		.poll(async () =>
			Math.abs((await navigationWidth(page.locator("#project-home-projects"), rail)) - 288),
		)
		.toBeLessThan(2);
	await expect(page.getByTestId("add-project-menu")).toHaveText("Add project");
	await createWorkspaceViaDialog(page);
	const pane = page.getByTestId("left-stack");
	await expect
		.poll(async () => Math.abs((await navigationWidth(pane, rail)) - 288))
		.toBeLessThan(2);
	await expect.poll(() => savedLeftRatio(page)).toBeCloseTo(288 / 2316, 10);
	const savedRatio = await savedLeftRatio(page);
	await page.setViewportSize({ width: 1440, height: 900 });
	await expect.poll(() => savedLeftRatio(page)).toBe(savedRatio);
	await expect
		.poll(async () => Math.abs((await navigationWidth(pane, rail)) - (288 * 1440) / 2316))
		.toBeLessThan(2);
	await page.reload();
	await expect(page.getByTestId("connection-status")).toHaveAttribute("data-status", "connected");
	await expect.poll(() => savedLeftRatio(page)).toBe(savedRatio);
	await expect
		.poll(async () => Math.abs((await navigationWidth(pane, rail)) - (288 * 1440) / 2316))
		.toBeLessThan(2);
	await applyWorkbenchPreset(page, "Studio");
	await expect.poll(() => savedLeftRatio(page)).toBeCloseTo(288 / 1440, 10);
	await expect
		.poll(async () => Math.abs((await navigationWidth(pane, rail)) - 288))
		.toBeLessThan(2);
	await openAppSettings(page);
	await page.getByTestId("settings-nav-layout").click();
	await expect(
		page.getByTestId("layout-preset").filter({ has: page.getByText("Studio", { exact: true }) }),
	).toHaveAttribute("data-applied", "true");
});

test("Studio keeps tools and the reserved terminal available without opening them", async ({
	page,
}) => {
	let attaches = 0;
	page.on("websocket", (socket) => {
		socket.on("framesent", ({ payload }) => {
			const frame = JSON.parse(String(payload)) as { method?: string };
			if (frame.method === "terminal.attach") attaches += 1;
		});
	});
	await openFixtureProject(page);
	await createWorkspaceViaDialog(page);
	const terminalRail = page.getByTestId("terminal-rail-group");
	await expect(terminalRail).toBeVisible();
	await expect(terminalRail).toHaveAttribute("aria-pressed", "false");
	await expect(page.getByTestId("workspace-workbench")).toHaveAttribute(
		"data-layout-status",
		"settled",
	);
	await expect(page.getByTestId("left-nav")).toBeVisible();
	await expect(page.getByTestId("right-stack")).toBeHidden();
	await expect(page.getByTestId("bottom-panel")).toBeHidden();
	expect(attaches).toBe(0);

	await revealWorkbenchTool(page, "files");
	await expect(page.getByTestId("right-stack")).toBeVisible();
	await terminalRail.click();
	await waitTerminalReady(page);
	await runInTerminal(page, "TR_STUDIO_SESSION=preserved");
	await runInTerminal(page, "echo STUDIO_READY_$TR_STUDIO_SESSION");
	await expect(visibleTerminalScreen(page)).toContainText("STUDIO_READY_preserved");
	await terminalRail.click();
	await expect(page.getByTestId("bottom-panel")).toBeHidden();
	const beforeReload = attaches;
	await page.reload();
	await expect(page.getByTestId("connection-status")).toHaveAttribute("data-status", "connected");
	await expect(terminalRail).toHaveAttribute("aria-pressed", "false");
	await expect(page.getByTestId("bottom-panel")).toBeHidden();
	await expect(page.getByTestId("right-stack")).toBeVisible();
	expect(attaches).toBe(beforeReload);
	await terminalRail.click();
	await waitTerminalReady(page);
	await runInTerminal(page, "echo STUDIO_RESTORED_$TR_STUDIO_SESSION");
	await expect(visibleTerminalScreen(page)).toContainText("STUDIO_RESTORED_preserved");
});

test("a saved Balanced frame survives reload instead of being replaced by Studio", async ({
	page,
}) => {
	await openFixtureProject(page);
	await createWorkspaceViaDialog(page);
	await applyWorkbenchPreset(page, "Balanced");
	await waitTerminalReady(page);
	await expect(page.getByTestId("right-stack")).toBeVisible();
	await page.reload();
	await expect(page.getByTestId("connection-status")).toHaveAttribute("data-status", "connected");
	await expect(page.getByTestId("right-stack")).toBeVisible();
	await waitTerminalReady(page);
	await openAppSettings(page);
	await page.getByTestId("settings-nav-layout").click();
	await expect(
		page.getByTestId("layout-preset").filter({ has: page.getByText("Balanced", { exact: true }) }),
	).toHaveAttribute("data-applied", "true");
});
