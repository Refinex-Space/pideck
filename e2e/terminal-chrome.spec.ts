import { expect, test } from "@playwright/test";
import {
	enterDefaultWorkspace,
	openCenterTerminal,
	openFixtureProject,
	openWorkbenchPanels,
	waitTerminalReady,
} from "./fixtures/app";
import { shot } from "./fixtures/screenshots";
import { E2eWire } from "./fixtures/wire";

test("terminal chrome has one header create button and a terminal-only context menu", async ({
	page,
}) => {
	await openFixtureProject(page);
	await enterDefaultWorkspace(page);
	await openWorkbenchPanels(page);
	await waitTerminalReady(page);
	const bottom = page.getByTestId("bottom-group").first();
	await expect(bottom.getByTestId("terminal-add")).toHaveCount(1);
	await expect(page.getByTestId("side-group-menu")).toHaveCount(0);
	await expect(page.getByTestId("terminal-panel").getByTestId("terminal-add")).toHaveCount(0);
	await bottom.getByTestId("terminal-tab").click({ button: "right" });
	await expect(page.getByRole("menuitem")).toHaveText(["Focus tab", "Hide bottom panel", "Close"]);
	await shot(page.getByRole("menu"), "terminal-chrome", "context-menu");
	await page.keyboard.press("Escape");
	await bottom.getByTestId("terminal-add").click();
	await expect(bottom.getByTestId("terminal-tab")).toHaveCount(2);
	await waitTerminalReady(page);
	await bottom.getByTestId("terminal-tab").last().click({ button: "right" });
	await page.getByRole("menuitem", { name: "Move left", exact: true }).click();
	await expect(bottom.getByTestId("terminal-tab").first()).toContainText("Terminal 2");
	await bottom.getByTestId("terminal-tab").first().click({ button: "right" });
	await page.getByTestId("tab-menu-close").click();
	await expect(bottom.getByTestId("terminal-tab")).toHaveCount(1);

	const wire = await E2eWire.connect(Number(new URL(page.url()).port));
	try {
		for (const theme of ["light", "dark"]) {
			await wire.request("settings.update", { config: { theme } });
			await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
			const canvas = await page.evaluate(() => {
				const probe = document.createElement("div");
				probe.className = "bg-container-workspace-bg";
				document.body.append(probe);
				const color = getComputedStyle(probe).backgroundColor;
				probe.remove();
				return color;
			});
			await expect(bottom.getByTestId("terminal-panel")).toHaveCSS("background-color", canvas);
			await expect(bottom.locator(".xterm-scrollable-element")).toHaveCSS(
				"background-color",
				canvas,
			);
			await shot(bottom, "terminal-chrome", theme);
		}
	} finally {
		wire.close();
	}
});

test("a terminal moved into the center creates new terminals from its own header", async ({
	page,
}) => {
	await openFixtureProject(page);
	await enterDefaultWorkspace(page);
	await openWorkbenchPanels(page);
	await waitTerminalReady(page);
	await openCenterTerminal(page);
	const center = page.getByTestId("center-group").filter({ has: page.getByTestId("terminal-tab") });
	await expect(center.getByTestId("terminal-instance")).toHaveAttribute("data-ready", "true");
	await expect(center.getByTestId("terminal-add")).toHaveCount(1);
	await center.getByTestId("terminal-add").click();
	await expect(center.getByTestId("terminal-tab")).toHaveCount(2);
	await expect(center.getByTestId("terminal-instance")).toHaveAttribute("data-ready", "true");
	await center.getByTestId("terminal-tab").last().click({ button: "right" });
	await expect(page.getByRole("menuitem")).toHaveText([
		"Focus tab",
		"Move left",
		"Move right — already last",
		"Close",
	]);
});
