import { expect, test } from "@playwright/test";
import { openAppFresh } from "./fixtures/app";
import { openProviders } from "./fixtures/jbcentral";

test("Central leaves configuring when status reads exceed the polling interval", async ({
	page,
}) => {
	let settled = false;
	const timers = new Set<ReturnType<typeof setTimeout>>();
	await page.routeWebSocket(/\/ws(\?|$)/, (browser) => {
		const server = browser.connectToServer();
		const statusReads = new Set<string>();
		browser.onMessage((message) => {
			const frame = JSON.parse(String(message));
			if (frame.method === "provider.status") statusReads.add(frame.id);
			server.send(message);
		});
		server.onMessage((message) => {
			const frame = JSON.parse(String(message));
			if (!statusReads.delete(frame.id) || !frame.result) {
				browser.send(message);
				return;
			}
			frame.result.jbcentral = settled
				? { state: "configured", version: "1.7.0", signedOut: false, proxyStopped: false }
				: { state: "configuring", action: "connect" };
			const response = JSON.stringify(frame);
			if (!settled) {
				browser.send(response);
				return;
			}
			const timer = setTimeout(() => {
				timers.delete(timer);
				if (!page.isClosed()) browser.send(response);
			}, 1_000);
			timers.add(timer);
		});
	});
	try {
		await openAppFresh(page);
		const card = await openProviders(page);
		await expect(card).toHaveAttribute("data-state", "configuring");
		settled = true;
		await expect(card).toHaveAttribute("data-state", "configured", { timeout: 10_000 });
		await expect(page.getByTestId("jetbrains-disconnect")).toBeVisible();
	} finally {
		for (const timer of timers) clearTimeout(timer);
	}
});
