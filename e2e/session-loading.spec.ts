import { realpathSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import type { WsRequest } from "@thinkrail/contracts";
import {
	enterDefaultWorkspace,
	openAppSettings,
	openFixtureProject,
	sessionRow,
} from "./fixtures/app";
import { E2E_FIXTURE_REPO } from "./fixtures/paths";
import { seedWorkspaceSession } from "./fixtures/sessions";

const BASE = 1_700_800_000_000;

for (const order of ["oldest-first", "newest-first"] as const) {
	test(`${order}: cold opens show feedback, repeated clicks share a read, warm switches avoid transcript requests`, async ({
		page,
	}, testInfo) => {
		let coldId = "";
		let reads = 0;
		let blockedReads = 0;
		let block = false;
		let release = () => {};
		await page.routeWebSocket(/\/ws(\?|$)/, (browser) => {
			const server = browser.connectToServer();
			browser.onMessage((message) => {
				const frame = JSON.parse(message.toString()) as WsRequest;
				if (frame.method === "session.getMessages") {
					if (block) {
						blockedReads++;
						return;
					}
					if (frame.params.sessionId === coldId) {
						reads++;
						release = () => server.send(message);
						return;
					}
				}
				server.send(message);
			});
			server.onMessage((message) => browser.send(message));
		});
		await openFixtureProject(page);
		const cold = seedWorkspaceSession(realpathSync(E2E_FIXTURE_REPO), {
			name: "Cold long conversation",
			messages: Array.from({ length: 400 }, (_, i) => ({
				role: "user" as const,
				text: `History ${i}: ${"sample text ".repeat(80)}`,
				timestamp: BASE + i,
			})),
		});
		coldId = cold.id;
		seedWorkspaceSession(realpathSync(E2E_FIXTURE_REPO), {
			name: "Warm conversation",
			messages: [{ role: "user", text: "Current conversation marker", timestamp: BASE + 10000 }],
		});
		await openAppSettings(page);
		await page.getByTestId("settings-nav-chat").click();
		await page.getByTestId(`chat-order-${order}`).click();
		await page.keyboard.press("Escape");
		await enterDefaultWorkspace(page);
		await expect(page.getByTestId("chat-scroll")).toContainText("Current conversation marker");
		const target = sessionRow(page, "Cold long conversation");
		await target.getByRole("button").first().click();
		await expect(target).toHaveAttribute("aria-busy", "true");
		await expect(target.getByTestId("session-opening")).toBeVisible();
		await target.getByRole("button").first().click();
		expect(reads).toBe(1);
		await page.screenshot({ path: testInfo.outputPath("01-cold-loading.png") });
		release();
		await expect(target).toHaveAttribute("data-active", "true");
		await expect(target).toHaveAttribute("aria-busy", "false");
		await expect(page.getByTestId("chat-scroll")).toContainText("History 399:");
		await page.screenshot({ path: testInfo.outputPath("02-long-loaded.png") });
		block = true;
		const timings: number[] = [];
		for (let i = 0; i < 4; i++) {
			const title = i % 2 === 0 ? "Warm conversation" : "Cold long conversation";
			const start = performance.now();
			await sessionRow(page, title).getByRole("button").first().click();
			await expect(sessionRow(page, title)).toHaveAttribute("data-active", "true");
			timings.push(Math.round(performance.now() - start));
		}
		expect(blockedReads).toBe(0);
		const scroll = page.getByTestId("chat-scroll");
		const scroller = scroll.locator("[data-virtuoso-scroller]");
		await expect(scroll).toHaveAttribute("data-scroll-moving", "false");
		await scroller.evaluate(async (element) => {
			let stable = 0;
			let previous = element.scrollTop;
			for (let i = 0; i < 120 && stable < 8; i++) {
				await new Promise(requestAnimationFrame);
				stable = Math.abs(previous - element.scrollTop) < 1 ? stable + 1 : 0;
				previous = element.scrollTop;
			}
		});
		await scroller.press(order === "oldest-first" ? "PageUp" : "PageDown");
		await expect(scroll).toHaveAttribute("data-follow-state", "detached");

		await scroller.evaluate(async (element) => {
			let stable = 0;
			let previous = element.scrollTop;
			for (let i = 0; i < 120 && stable < 8; i++) {
				await new Promise(requestAnimationFrame);
				stable = Math.abs(previous - element.scrollTop) < 1 ? stable + 1 : 0;
				previous = element.scrollTop;
			}
		});
		const anchor = await scroller.evaluate((element) => {
			const top = element.getBoundingClientRect().top;
			const row = [...element.querySelectorAll<HTMLElement>("[data-chat-row-id]")].find(
				(candidate) => candidate.getBoundingClientRect().bottom > top + 1,
			);
			if (!row) throw new Error("Missing reading anchor");
			return { id: row.dataset.chatRowId, top: row.getBoundingClientRect().top - top };
		});
		await sessionRow(page, "Warm conversation").getByRole("button").first().click();
		await expect(sessionRow(page, "Warm conversation")).toHaveAttribute("data-active", "true");
		await target.getByRole("button").first().click();
		await expect(scroll).toHaveAttribute("data-follow-state", "detached");
		await expect
			.poll(() =>
				scroller.evaluate((element, saved) => {
					const row = [...element.querySelectorAll<HTMLElement>("[data-chat-row-id]")].find(
						(candidate) => candidate.dataset.chatRowId === saved.id,
					);
					return row
						? Math.abs(
								row.getBoundingClientRect().top - element.getBoundingClientRect().top - saved.top,
							)
						: 100000;
				}, anchor),
			)
			.toBeLessThan(8);

		writeFileSync(
			testInfo.outputPath("metrics.json"),
			JSON.stringify({ coldMessages: 400, coldReads: reads, blockedReads, timingsMs: timings }),
		);
		await testInfo.attach("warm-switch-observations", {
			body: JSON.stringify({
				coldMessages: 400,
				coldReads: reads,
				blockedReads,
				timingsMs: timings,
			}),
			contentType: "application/json",
		});
	});
}

test("session catalog errors offer retry instead of silently hiding history", async ({ page }) => {
	let fail = true;
	await page.routeWebSocket(/\/ws(\?|$)/, (browser) => {
		const server = browser.connectToServer();
		browser.onMessage((message) => {
			const frame = JSON.parse(message.toString()) as WsRequest;
			if (fail && frame.method === "session.list")
				browser.send(
					JSON.stringify({ id: frame.id, ok: false, error: "fixture catalog unavailable" }),
				);
			else server.send(message);
		});
		server.onMessage((message) => browser.send(message));
	});
	await openFixtureProject(page);
	seedWorkspaceSession(realpathSync(E2E_FIXTURE_REPO), {
		name: "Recoverable history",
		messages: [{ role: "user", text: "Saved history", timestamp: BASE }],
	});
	await enterDefaultWorkspace(page);
	const error = page.getByTestId("workspace-sessions-error").first();
	await expect(error).toBeVisible();
	fail = false;
	await error.getByRole("button", { name: "Retry", exact: true }).click();
	await expect(sessionRow(page, "Recoverable history")).toBeVisible();
	await expect(page.getByTestId("workspace-sessions-error")).toHaveCount(0);
});
