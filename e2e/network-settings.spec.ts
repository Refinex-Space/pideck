import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { openAppFresh, openAppSettings } from "./fixtures/app";
import { E2E_SCREENSHOT_DIR } from "./fixtures/paths";
import { E2eWire } from "./fixtures/wire";

test("network settings save privately, require restart, and survive reload", async ({ page }) => {
	await openAppFresh(page);
	const wire = await E2eWire.connect(Number(new URL(page.url()).port));
	const original = await wire.request("network.get", {});
	try {
		await openAppSettings(page);
		await page.getByTestId("settings-nav-network").click();
		await expect(page.getByTestId("settings-network")).toBeVisible();
		await page.getByTestId("network-mode-manual").click();
		await page.getByTestId("network-host").fill("127.0.0.1");
		await page.getByTestId("network-port").fill("7897");
		await page.getByTestId("network-bypass").fill("10.0.0.0/8");
		await page.getByTestId("network-save").click();
		await expect(page.getByTestId("network-error")).toBeVisible();
		await page.getByTestId("network-bypass").fill("localhost,127.0.0.1,::1");
		await page.getByTestId("network-save").click();
		await expect(page.getByTestId("network-restart")).toBeVisible();
		await expect(page.getByTestId("network-save")).toBeDisabled();
		await expect(page.getByTestId("network-diagnose")).toBeDisabled();
		const screenshotDir = join(E2E_SCREENSHOT_DIR, "network-settings");
		mkdirSync(screenshotDir, { recursive: true });
		await page
			.getByTestId("settings-dialog")
			.screenshot({ path: join(screenshotDir, "network.png") });
		await page.getByTestId("network-detected").scrollIntoViewIfNeeded();
		await page
			.getByTestId("settings-dialog")
			.screenshot({ path: join(screenshotDir, "network-status.png") });
		await page.setViewportSize({ width: 390, height: 844 });
		await page.getByTestId("network-detected").scrollIntoViewIfNeeded();
		expect(
			await page
				.getByTestId("settings-network")
				.evaluate((element) => element.scrollWidth <= element.clientWidth),
		).toBe(true);
		await page
			.getByTestId("settings-dialog")
			.screenshot({ path: join(screenshotDir, "network-mobile.png") });
		await page.setViewportSize({ width: 1280, height: 720 });
		await page.reload();
		await openAppSettings(page);
		await page.getByTestId("settings-nav-network").click();
		await expect(page.getByTestId("network-host")).toHaveValue("127.0.0.1");
		await expect(page.getByTestId("network-password")).toHaveValue("");
		await expect(page.getByTestId("network-restart")).toBeVisible();
	} finally {
		await wire.request("network.update", { config: original.config, password: null });
		wire.close();
	}
});
