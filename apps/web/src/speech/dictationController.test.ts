import { expect, test } from "bun:test";
import { MicrophoneError, type StartCapture } from "./capture";
import {
	DictationController,
	type DictationProblem,
	type DictationRequester,
	type DictationSnapshot,
} from "./dictationController";

interface Call {
	method: string;
	params: Record<string, unknown>;
}

function setup(options: { startFails?: unknown; capture?: StartCapture } = {}) {
	const calls: Call[] = [];
	const texts: string[] = [];
	const problems: DictationProblem[] = [];
	const snapshots: DictationSnapshot[] = [];
	let emit: (samples: Float32Array, rate: number) => void = () => {};
	let micStopped = 0;
	const requester: DictationRequester = {
		request: (async (method: string, params: Record<string, unknown>) => {
			calls.push({ method, params });
			if (method === "speech.dictationStart") {
				if (options.startFails) throw options.startFails;
				return { dictationId: "d1", sampleRate: 16_000 };
			}
			if (method === "speech.dictationStop") return { text: "spoken words" };
			return { ok: true };
		}) as DictationRequester["request"],
	};
	const startCapture: StartCapture =
		options.capture ??
		(async (onChunk) => {
			emit = onChunk;
			return {
				stop: async () => {
					micStopped++;
				},
			};
		});
	const controller = new DictationController({
		requester,
		startCapture,
		onText: (text) => texts.push(text),
		onProblem: (problem) => problems.push(problem),
		onChange: (snapshot) => snapshots.push(snapshot),
	});
	return {
		controller,
		calls,
		texts,
		problems,
		snapshots,
		emit: (s: Float32Array, rate = 16_000) => emit(s, rate),
		mic: () => micStopped,
	};
}

const tone = (length: number, amplitude: number) =>
	Float32Array.from({ length }, (_, i) => amplitude * Math.sin(i / 4));
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

test("listens, ships 100 ms frames with live levels, and returns the host's text on stop", async () => {
	const t = setup();
	await t.controller.start();
	expect(t.controller.state.phase).toBe("listening");
	t.emit(tone(4800, 0.5), 48_000);
	t.emit(tone(4800, 0.0001), 48_000);
	t.emit(tone(4800, 0.5), 48_000);
	expect(t.controller.state.levels).toHaveLength(3);
	expect(t.controller.state.levels[0]).toBeGreaterThan(0.5);
	expect(t.controller.state.levels[1]).toBe(0);

	await t.controller.stop();
	await flush();
	const audio = t.calls.filter((call) => call.method === "speech.dictationAudio");
	expect(audio.length).toBe(3);
	expect(audio[0]?.params.dictationId).toBe("d1");
	expect(t.calls.map((call) => call.method)).toEqual([
		"speech.dictationStart",
		"speech.dictationAudio",
		"speech.dictationAudio",
		"speech.dictationAudio",
		"speech.dictationStop",
	]);
	expect(t.texts).toEqual(["spoken words"]);
	expect(t.controller.state.phase).toBe("idle");
	expect(t.mic()).toBe(1);
});

test("audio spoken before the host answers is queued and sent in order", async () => {
	const t = setup();
	let release: () => void = () => {};
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	const slow = t.controller as unknown as { deps: { requester: DictationRequester } };
	const original = slow.deps.requester.request.bind(slow.deps.requester);
	slow.deps.requester.request = (async (method: string, params: never) => {
		if (method === "speech.dictationStart") await gate;
		return original(method as never, params);
	}) as DictationRequester["request"];

	const started = t.controller.start();
	await flush();
	t.emit(tone(1600, 0.4));
	t.emit(tone(1600, 0.4));
	expect(t.calls.some((call) => call.method === "speech.dictationAudio")).toBe(false);
	release();
	await started;
	await flush();
	expect(t.calls.filter((call) => call.method === "speech.dictationAudio")).toHaveLength(2);
});

test("a denied microphone reports the problem and never reaches the host", async () => {
	const t = setup({
		capture: async () => {
			throw new MicrophoneError("denied");
		},
	});
	await t.controller.start();
	expect(t.problems).toEqual(["denied"]);
	expect(t.controller.state.phase).toBe("idle");
	expect(t.calls).toEqual([]);
});

test("host errors map to problems and release the microphone", async () => {
	const t = setup({
		startFails: Object.assign(new Error("no model"), { errorCode: "SPEECH_MODEL_MISSING" }),
	});
	await t.controller.start();
	expect(t.problems).toEqual(["modelMissing"]);
	expect(t.mic()).toBe(1);
	expect(t.controller.state.phase).toBe("idle");
});

test("cancel discards the utterance: nothing inserted, host session cancelled, microphone released", async () => {
	const t = setup();
	await t.controller.start();
	t.emit(tone(1600, 0.4));
	t.controller.cancel();
	await flush();
	expect(t.texts).toEqual([]);
	expect(t.calls).toContainEqual({
		method: "speech.dictationCancel",
		params: { dictationId: "d1" },
	});
	expect(t.mic()).toBe(1);
	expect(t.controller.state.phase).toBe("idle");
	t.emit(tone(1600, 0.4));
	expect(t.controller.state.levels).toEqual([]);
});

test("an empty transcript inserts nothing", async () => {
	const t = setup();
	const originalStop = t.calls;
	await t.controller.start();
	(t.controller as unknown as { deps: { requester: DictationRequester } }).deps.requester.request =
		(async (method: string) =>
			method === "speech.dictationStop"
				? { text: "" }
				: { dictationId: "d1", sampleRate: 16_000 }) as DictationRequester["request"];
	await t.controller.stop();
	expect(t.texts).toEqual([]);
	expect(originalStop.length).toBeGreaterThan(0);
});

test("level history is bounded", async () => {
	const t = setup();
	await t.controller.start();
	for (let i = 0; i < 80; i++) t.emit(tone(160, 0.3));
	expect(t.controller.state.levels.length).toBeLessThanOrEqual(26);
	t.controller.cancel();
});
