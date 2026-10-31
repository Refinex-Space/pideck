import { realpathSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import {
	enterDefaultWorkspace,
	openFixtureProject,
	openPersistedChat,
	openSettingsSection,
} from "./fixtures/app";
import { E2E_FIXTURE_REPO } from "./fixtures/paths";
import { shot } from "./fixtures/screenshots";
import { seedWorkspaceSession } from "./fixtures/sessions";

const BASE_TS = 1_700_970_000_000;
const SUGGESTION = "run the whole test suite";

interface PredictionRequest {
	sessionId: string;
	completionId: string;
}

const SUCCEEDED = { completionId: "completion:e2e-finished-run", outcome: "succeeded" };

interface WireFrame {
	id?: string;
	channel?: string;
	data?: { state?: { completion?: unknown } };
	result?: unknown;
}

/**
 * A chat reopened from disk has no run the host saw finish, so its completion is `interrupted` and nothing is
 * suggested. The e2e host also has no model to guess with. The wire therefore presents the chat as a freshly
 * succeeded run and answers `prediction.request` itself; everything else passes through untouched.
 */
async function finishedRunWire(page: Page): Promise<PredictionRequest[]> {
	const requests: PredictionRequest[] = [];
	await page.routeWebSocket(/\/ws(\?|$)/, (browser) => {
		const server = browser.connectToServer();
		const methods = new Map<string, string>();
		browser.onMessage((message) => {
			const frame = JSON.parse(String(message));
			if (frame.method !== "prediction.request") {
				if (frame.method) methods.set(frame.id, frame.method);
				server.send(message);
				return;
			}
			requests.push(frame.params);
			browser.send(JSON.stringify({ id: frame.id, ok: true, result: { text: SUGGESTION } }));
		});
		server.onMessage((message) => {
			const frame: WireFrame = JSON.parse(String(message));
			const method = frame.id ? methods.get(frame.id) : undefined;
			if (frame.channel === "session.state" && frame.data?.state) {
				frame.data.state.completion = SUCCEEDED;
			} else if (method === "session.stateList" && Array.isArray(frame.result)) {
				for (const record of frame.result) record.state.completion = SUCCEEDED;
			} else if (method === "session.getMessages") {
				const summary = (frame.result as { summary?: { state?: { completion?: unknown } } })
					?.summary;
				if (summary?.state) summary.state.completion = SUCCEEDED;
			}
			browser.send(JSON.stringify(frame));
		});
	});
	return requests;
}

function seedFinishedChat(name: string) {
	return seedWorkspaceSession(realpathSync(E2E_FIXTURE_REPO), {
		name,
		messages: [
			{ role: "user", text: "Add a retry to the upload client", timestamp: BASE_TS },
			{
				role: "assistant",
				text: "Added the retry with backoff. Want me to run the tests?",
				stopReason: "stop",
				timestamp: BASE_TS + 1_000,
			},
		],
	});
}

async function openFinishedChat(page: Page, name: string) {
	seedFinishedChat(name);
	await enterDefaultWorkspace(page);
	await openPersistedChat(page, name);
	return page.getByTestId("chat-input");
}

test.describe.configure({ mode: "serial" });

test("a finished run offers a grey suggestion; Tab fills it in and nothing is sent", async ({
	page,
}) => {
	const requests = await finishedRunWire(page);
	await openFixtureProject(page);
	const input = await openFinishedChat(page, "Prediction accept");

	await expect(input).toHaveAttribute("placeholder", SUGGESTION);
	const hint = page.getByTestId("chat-prediction-accept");
	await expect(hint).toBeVisible();
	await expect(hint).toHaveText("Tab");
	expect(requests).toHaveLength(1);
	expect(requests[0]?.completionId).toBe(SUCCEEDED.completionId);
	await shot(page.getByTestId("chat-view"), "composer-predictions", "suggestion");

	await input.focus();
	await page.keyboard.press("Tab");
	await expect(input).toHaveValue(SUGGESTION);
	await expect(hint).toHaveCount(0);
	await expect(input).toBeFocused();
	await expect(page.getByTestId("chat-abort")).toHaveCount(0);

	await input.fill("");
	await expect(input).not.toHaveAttribute("placeholder", SUGGESTION);
	await expect(hint).toHaveCount(0);
	expect(requests).toHaveLength(1);
});

test("typing, Escape and the Tab hint each deal with the suggestion", async ({ page }) => {
	const requests = await finishedRunWire(page);
	await openFixtureProject(page);
	const input = await openFinishedChat(page, "Prediction dismiss");
	const hint = page.getByTestId("chat-prediction-accept");

	await expect(input).toHaveAttribute("placeholder", SUGGESTION);
	await input.focus();
	await page.keyboard.type("n");
	await expect(hint).toHaveCount(0);
	await expect(input).toHaveValue("n");
	await page.keyboard.press("Backspace");
	await expect(input).toHaveAttribute("placeholder", SUGGESTION);

	await page.keyboard.press("Escape");
	await expect(hint).toHaveCount(0);
	await expect(input).not.toHaveAttribute("placeholder", SUGGESTION);
	await expect(input).toHaveValue("");

	await page.reload();
	await openPersistedChat(page, "Prediction dismiss");
	await expect(input).toHaveAttribute("placeholder", SUGGESTION);
	await page.getByTestId("chat-prediction-accept").click();
	await expect(input).toHaveValue(SUGGESTION);
	expect(requests.length).toBeGreaterThanOrEqual(2);
});

test("switching the setting off stops the host from being asked", async ({ page }) => {
	const requests = await finishedRunWire(page);
	await openFixtureProject(page);
	await openSettingsSection(page, "chat");
	const toggle = page.getByTestId("composer-predictions-toggle");
	await expect(toggle).toHaveAttribute("aria-checked", "true");
	await toggle.click();
	await expect(toggle).toHaveAttribute("aria-checked", "false");
	await page.keyboard.press("Escape");

	try {
		const input = await openFinishedChat(page, "Prediction off");
		await expect(input).toBeVisible();
		await expect(page.getByTestId("chat-view")).toBeVisible();
		await page.waitForTimeout(1_000);
		await expect(page.getByTestId("chat-prediction-accept")).toHaveCount(0);
		expect(requests).toHaveLength(0);
	} finally {
		await openSettingsSection(page, "chat");
		const again = page.getByTestId("composer-predictions-toggle");
		if ((await again.getAttribute("aria-checked")) === "false") await again.click();
		await expect(again).toHaveAttribute("aria-checked", "true");
	}
});
