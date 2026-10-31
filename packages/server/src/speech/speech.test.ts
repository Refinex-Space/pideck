import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SpeechModel, SpeechStatus } from "@thinkrail/contracts";
import { normalizeTranscript, pcm16ToFloat } from "./engine";
import { createFakeSpeechService, fakeCatalog, fakeEngine, fakeFetch } from "./fake";
import { SpeechService } from "./service";
import { createSherpaEngine } from "./sherpaEngine";

let root: string;
beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "pideck-speech-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const model = (status: SpeechStatus, id: string): SpeechModel => {
	const found = status.models.find((candidate) => candidate.id === id);
	if (!found) throw new Error(`missing ${id}`);
	return found;
};

async function settled(service: SpeechService, id: string): Promise<SpeechModel> {
	for (let i = 0; i < 200; i++) {
		const current = model(await service.status(), id);
		if (current.state !== "downloading") return current;
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
	throw new Error("download did not settle");
}

const chunk = (samples: number): string => Buffer.alloc(samples * 2, 1).toString("base64");

test("downloads, verifies and activates a model, then dictation returns the recognizer's text", async () => {
	const service = createFakeSpeechService(root);
	const pushed: SpeechStatus[] = [];
	service.setPublisher((status) => pushed.push(status));
	expect((await service.status()).activeModelId).toBeNull();

	await service.download("fake-en");
	expect((await settled(service, "fake-en")).state).toBe("ready");
	const status = await service.status();
	expect(status.activeModelId).toBe("fake-en");
	expect(model(status, "fake-en").downloadedBytes).toBe(model(status, "fake-en").sizeBytes);
	expect(pushed.some((entry) => model(entry, "fake-en").state === "downloading")).toBe(true);
	expect(pushed.at(-1)?.models[0]?.state).toBe("ready");

	const { dictationId, sampleRate } = await service.dictationStart();
	expect(sampleRate).toBe(16_000);
	service.dictationAudio(dictationId, chunk(1600));
	expect(service.dictationStop(dictationId)).toEqual({ text: "hello from the fake recognizer" });
	await expect(
		service.dictationStart().then((s) => service.dictationCancel(s.dictationId)),
	).resolves.toBeUndefined();
	service.dispose();
});

test("an installed model survives a new service instance and a choice persists", async () => {
	const first = createFakeSpeechService(root);
	await first.download("fake-en");
	await first.download("fake-zh-en");
	await settled(first, "fake-en");
	await settled(first, "fake-zh-en");
	await first.select("fake-zh-en");

	const second = createFakeSpeechService(root);
	expect((await second.status()).activeModelId).toBe("fake-zh-en");
	await second.delete("fake-zh-en");
	const afterDelete = await second.status();
	expect(model(afterDelete, "fake-zh-en").state).toBe("absent");
	expect(afterDelete.activeModelId).toBe("fake-en");
	expect(existsSync(join(root, "models", "speech", "fake-zh-en"))).toBe(false);
});

test("cancelling a download removes the staged bytes and returns to absent", async () => {
	const service = createFakeSpeechService(root);
	await service.download("fake-en");
	await new Promise((resolve) => setTimeout(resolve, 80));
	await service.cancelDownload("fake-en");
	const state = await settled(service, "fake-en");
	expect(state.state).toBe("absent");
	expect(
		readdirSync(join(root, "models", "speech")).filter((name) => name.endsWith(".partial")),
	).toEqual([]);
});

test("a checksum mismatch fails the download without installing anything", async () => {
	const catalog = fakeCatalog().map((entry) => ({
		...entry,
		files: entry.files.map((file) => ({ ...file, sha256: "0".repeat(64) })),
	}));
	const service = new SpeechService({
		root: () => join(root, "models", "speech"),
		catalog,
		fetch: fakeFetch,
		engine: fakeEngine,
	});
	await service.download("fake-en");
	const state = await settled(service, "fake-en");
	expect(state.state).toBe("failed");
	expect(state.failure).toBe("integrity");
	expect((await service.status()).activeModelId).toBeNull();
});

test("an HTTP error is reported as a network failure and can be retried", async () => {
	const failing = (async () => new Response("nope", { status: 503 })) as unknown as typeof fetch;
	const service = new SpeechService({
		root: () => join(root, "models", "speech"),
		catalog: fakeCatalog(),
		fetch: failing,
		engine: fakeEngine,
	});
	await service.download("fake-en");
	expect((await settled(service, "fake-en")).failure).toBe("network");
	await service.download("fake-en");
	expect((await settled(service, "fake-en")).state).toBe("failed");
});

test("dictation needs a model, one session at a time, and rejects unknown ids", async () => {
	const service = createFakeSpeechService(root);
	await expect(service.dictationStart()).rejects.toMatchObject({ code: "SPEECH_MODEL_MISSING" });
	await service.download("fake-en");
	await settled(service, "fake-en");
	const { dictationId } = await service.dictationStart();
	await expect(service.dictationStart()).rejects.toMatchObject({ code: "SPEECH_BUSY" });
	expect(() => service.dictationAudio("other", chunk(10))).toThrow();
	service.dictationCancel(dictationId);
	expect(() => service.dictationStop(dictationId)).toThrow();
	await expect(service.select("fake-zh-en")).rejects.toMatchObject({
		code: "SPEECH_MODEL_MISSING",
	});
	await expect(service.download("nope")).rejects.toThrow("Unknown speech model");
	service.dispose();
});

test("an engine that cannot start reports the runtime as unavailable", async () => {
	const broken = {
		available: async () => false,
		load: async () => Promise.reject(new Error("no wasm")),
	};
	const service = new SpeechService({
		root: () => join(root, "models", "speech"),
		catalog: fakeCatalog(),
		fetch: fakeFetch,
		engine: broken,
	});
	expect((await service.status()).engine).toBe("unavailable");
	await service.download("fake-en");
	await settled(service, "fake-en");
	await expect(service.dictationStart()).rejects.toMatchObject({
		code: "SPEECH_ENGINE_UNAVAILABLE",
	});
});

test("normalizeTranscript fixes upper-case Latin text and CJK gaps only", () => {
	expect(normalizeTranscript("THE YELLOW LAMPS WOULD LIGHT UP")).toBe(
		"The yellow lamps would light up",
	);
	expect(normalizeTranscript("I THINK I AM")).toBe("I think I am");
	expect(normalizeTranscript("你 好 世 界 HELLO")).toBe("你好世界 hello");
	expect(normalizeTranscript("Already Mixed case")).toBe("Already Mixed case");
	expect(normalizeTranscript("  ")).toBe("");
});

test("pcm16ToFloat decodes little-endian samples and ignores a dangling byte", () => {
	const bytes = Uint8Array.from([0x00, 0x80, 0xff, 0x7f, 0x00, 0x00, 0x01]);
	const samples = pcm16ToFloat(bytes);
	expect(samples.length).toBe(3);
	expect(samples[0]).toBe(-1);
	expect(samples[1]).toBeCloseTo(32767 / 32768, 6);
	expect(samples[2]).toBe(0);
});

test("the sherpa-onnx WASM runtime loads in this process", async () => {
	expect(await createSherpaEngine().available()).toBe(true);
});
