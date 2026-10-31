import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { createWorkspaceViaDialog, openFixtureProject, openSettingsSection } from "./fixtures/app";
import { E2E_SCREENSHOT_DIR } from "./fixtures/paths";
import { E2eWire } from "./fixtures/wire";

test.use({
	permissions: ["microphone"],
	launchOptions: {
		args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
	},
});

const FAKE_TEXT = "hello from the fake recognizer";
const SCREENSHOTS = join(E2E_SCREENSHOT_DIR, "speech-dictation");

async function withWire<T>(
	page: import("@playwright/test").Page,
	run: (wire: E2eWire) => Promise<T>,
) {
	const wire = await E2eWire.connect(Number(new URL(page.url()).port));
	try {
		return await run(wire);
	} finally {
		wire.close();
	}
}

async function resetModels(wire: E2eWire): Promise<void> {
	for (const id of ["fake-en", "fake-zh-en"]) await wire.request("speech.delete", { modelId: id });
}

async function installModel(wire: E2eWire, id: string): Promise<void> {
	await wire.request("speech.download", { modelId: id });
	await expect
		.poll(async () => {
			const status = await wire.request("speech.get", {});
			return status.models.find((model) => model.id === id)?.state;
		})
		.toBe("ready");
}

test.describe("voice model settings", () => {
	test("downloads with progress, switches the active model, and deletes after confirmation", async ({
		page,
	}) => {
		await openFixtureProject(page);
		await withWire(page, resetModels);
		try {
			await openSettingsSection(page, "speech");
			await expect(page.getByTestId("settings-speech")).toBeVisible();
			const english = page.getByTestId("speech-model-fake-en");
			const bilingual = page.getByTestId("speech-model-fake-zh-en");
			await expect(english.getByTestId("speech-download")).toBeVisible();

			await english.getByTestId("speech-download").click();
			await expect(english.getByTestId("speech-progress")).toBeVisible();
			await expect(english.getByTestId("speech-cancel")).toBeVisible();
			await expect(english.getByTestId("speech-active")).toBeVisible();
			await expect(bilingual.getByTestId("speech-download")).toBeVisible();

			await bilingual.getByTestId("speech-download").click();
			await expect(bilingual.getByTestId("speech-use")).toBeVisible();
			await bilingual.getByTestId("speech-use").click();
			await expect(bilingual.getByTestId("speech-active")).toBeVisible();
			await expect(english.getByTestId("speech-use")).toBeVisible();
			mkdirSync(SCREENSHOTS, { recursive: true });
			await page
				.getByTestId("settings-dialog")
				.screenshot({ path: join(SCREENSHOTS, "settings.png") });

			await english.getByTestId("speech-delete").click();
			await page.getByTestId("speech-delete-confirm").click();
			await expect(english.getByTestId("speech-download")).toBeVisible();
			await expect(bilingual.getByTestId("speech-active")).toBeVisible();
		} finally {
			await withWire(page, resetModels);
		}
	});

	test("cancelling a download returns the model to a downloadable state", async ({ page }) => {
		await openFixtureProject(page);
		await withWire(page, resetModels);
		try {
			await openSettingsSection(page, "speech");
			const english = page.getByTestId("speech-model-fake-en");
			await english.getByTestId("speech-download").click();
			await english.getByTestId("speech-cancel").click();
			await expect(english.getByTestId("speech-download")).toBeVisible();
			await expect(english.getByTestId("speech-active")).toHaveCount(0);
		} finally {
			await withWire(page, resetModels);
		}
	});
});

test.describe("composer dictation", () => {
	test("without a model the microphone guides to the voice settings", async ({ page }) => {
		await openFixtureProject(page);
		await withWire(page, resetModels);
		await createWorkspaceViaDialog(page);
		await page.getByTestId("chat-dictate").click();
		await expect(page.getByTestId("settings-speech")).toBeVisible();
	});

	test("dictation lights the microphone, draws live levels, and inserts text without replacing the draft", async ({
		page,
	}) => {
		await openFixtureProject(page);
		await withWire(page, async (wire) => {
			await resetModels(wire);
			await installModel(wire, "fake-en");
		});
		try {
			await createWorkspaceViaDialog(page);
			const input = page.getByTestId("chat-input");
			const mic = page.getByTestId("chat-dictate");
			await input.fill("existing draft");
			await expect(mic).toHaveAttribute("data-phase", "idle");
			await expect(mic).toHaveAccessibleName("Start dictation");

			await mic.click();
			await expect(mic).toHaveAttribute("data-phase", "listening");
			await expect(mic).toHaveAccessibleName("Stop dictation");
			await expect(mic).toHaveAttribute("aria-pressed", "true");
			const wave = page.getByTestId("dictation-waveform");
			await expect(wave).toBeVisible();
			// The fake device emits a periodic beep; the strip must rise above silence on those real samples.
			await expect
				.poll(async () => Number(await wave.getAttribute("data-peak")), { timeout: 8_000 })
				.toBeGreaterThan(0);
			const sendBox = await page.getByTestId("chat-send").boundingBox();
			const micBox = await mic.boundingBox();
			const waveBox = await wave.boundingBox();
			expect(micBox && sendBox && micBox.x).toBeGreaterThan(
				(sendBox?.x ?? 0) + (sendBox?.width ?? 0) - 1,
			);
			expect(waveBox && sendBox && waveBox.x + waveBox.width).toBeLessThanOrEqual(
				(sendBox?.x ?? 0) + 1,
			);
			mkdirSync(SCREENSHOTS, { recursive: true });
			await page
				.getByTestId("chat-composer")
				.screenshot({ path: join(SCREENSHOTS, "listening.png") });

			await page.mouse.move(5, 5);
			await mic.hover();
			await expect(page.getByRole("tooltip")).toContainText("Stop dictation");
			await mic.click();
			await expect(input).toHaveValue(`existing draft ${FAKE_TEXT}`);
			await expect(mic).toHaveAttribute("data-phase", "idle");
			await expect(wave).toHaveCount(0);
			await expect(input).toBeFocused();
		} finally {
			await withWire(page, resetModels);
		}
	});

	test("Escape cancels dictation and inserts nothing", async ({ page }) => {
		await openFixtureProject(page);
		await withWire(page, async (wire) => {
			await resetModels(wire);
			await installModel(wire, "fake-en");
		});
		try {
			await createWorkspaceViaDialog(page);
			const input = page.getByTestId("chat-input");
			await input.fill("keep me");
			await page.getByTestId("chat-dictate").click();
			await expect(page.getByTestId("chat-dictate")).toHaveAttribute("data-phase", "listening");
			await input.press("Escape");
			await expect(page.getByTestId("chat-dictate")).toHaveAttribute("data-phase", "idle");
			await expect(input).toHaveValue("keep me");
		} finally {
			await withWire(page, resetModels);
		}
	});

	test("reduced motion keeps the listening state but stills the waveform", async ({ page }) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await openFixtureProject(page);
		await withWire(page, async (wire) => {
			await resetModels(wire);
			await installModel(wire, "fake-en");
		});
		try {
			await createWorkspaceViaDialog(page);
			await page.getByTestId("chat-dictate").click();
			await expect(page.getByTestId("chat-dictate")).toHaveAttribute("aria-pressed", "true");
			await expect(page.getByTestId("dictation-waveform")).toHaveAttribute(
				"data-reduced-motion",
				"true",
			);
			await page.getByTestId("chat-input").press("Escape");
		} finally {
			await withWire(page, resetModels);
		}
	});
});

test.describe("microphone permission", () => {
	test("a blocked microphone explains itself and leaves the draft alone", async ({ page }) => {
		await page.addInitScript(() => {
			navigator.mediaDevices.getUserMedia = () =>
				Promise.reject(new DOMException("blocked", "NotAllowedError"));
		});
		await openFixtureProject(page);
		await withWire(page, async (wire) => {
			await resetModels(wire);
			await installModel(wire, "fake-en");
		});
		try {
			await createWorkspaceViaDialog(page);
			const input = page.getByTestId("chat-input");
			await input.fill("draft stays");
			await page.getByTestId("chat-dictate").click();
			await expect(page.getByTestId("toast")).toContainText("Microphone access was blocked");
			await expect(page.getByTestId("chat-dictate")).toHaveAttribute("data-phase", "idle");
			await expect(input).toHaveValue("draft stays");
		} finally {
			await withWire(page, resetModels);
		}
	});
});
