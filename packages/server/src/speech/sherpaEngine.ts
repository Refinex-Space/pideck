/// <reference path="./sherpa.d.ts" />
import { join } from "node:path";
import { logger } from "../log";
import {
	normalizeTranscript,
	type Recognizer,
	SPEECH_SAMPLE_RATE,
	type SpeechEngine,
} from "./engine";

const log = logger("speech");

const TAIL_SECONDS = 0.5;

/**
 * The sherpa-onnx WebAssembly build: no native addon, so the same package runs under every launcher
 * and platform. The module is imported lazily because it instantiates ~15 MB of WASM.
 */
export function createSherpaEngine(): SpeechEngine {
	const runtime = import("sherpa-onnx").then(
		(module) => module,
		(error: unknown) => {
			log.warn("sherpa-onnx runtime failed to load", error);
			return null;
		},
	);
	return {
		available: async () => (await runtime) !== null,
		load: async (dir) => {
			const sherpa = await runtime;
			if (!sherpa) throw new Error("sherpa-onnx runtime is unavailable");
			const engine = sherpa.createOnlineRecognizer({
				featConfig: { sampleRate: SPEECH_SAMPLE_RATE, featureDim: 80 },
				modelConfig: {
					transducer: {
						encoder: join(dir, "encoder-epoch-99-avg-1.int8.onnx"),
						decoder: join(dir, "decoder-epoch-99-avg-1.int8.onnx"),
						joiner: join(dir, "joiner-epoch-99-avg-1.int8.onnx"),
					},
					tokens: join(dir, "tokens.txt"),
					numThreads: 1,
					provider: "cpu",
					debug: 0,
				},
				decodingMethod: "greedy_search",
				enableEndpoint: 0,
			});
			const recognizer: Recognizer = {
				createStream: () => {
					const stream = engine.createStream();
					const drain = () => {
						while (engine.isReady(stream)) engine.decode(stream);
					};
					return {
						accept: (samples) => {
							stream.acceptWaveform(SPEECH_SAMPLE_RATE, samples);
							drain();
						},
						finish: () => {
							stream.acceptWaveform(
								SPEECH_SAMPLE_RATE,
								new Float32Array(SPEECH_SAMPLE_RATE * TAIL_SECONDS),
							);
							stream.inputFinished();
							drain();
							const { text } = engine.getResult(stream);
							stream.free();
							return normalizeTranscript(text);
						},
						discard: () => stream.free(),
					};
				},
				dispose: () => engine.free(),
			};
			return recognizer;
		},
	};
}
