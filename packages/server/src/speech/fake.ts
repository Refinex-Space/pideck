import { createHash } from "node:crypto";
import { join } from "node:path";
import type { CatalogModel } from "./catalog";
import type { SpeechEngine } from "./engine";
import { SpeechService } from "./service";

const FAKE_TEXT = "hello from the fake recognizer";

function fakeBody(name: string): Buffer {
	return Buffer.from(`fake speech model file ${name}\n`.repeat(8 * 1024));
}

/** A tiny two-model catalog whose "downloads" are served in-process and verified like real ones. */
export function fakeCatalog(): CatalogModel[] {
	const files = ["encoder.onnx", "tokens.txt"].map((name) => {
		const body = fakeBody(name);
		return { name, size: body.byteLength, sha256: createHash("sha256").update(body).digest("hex") };
	});
	return [
		{
			id: "fake-en",
			name: "Fake English",
			languages: ["en"],
			baseUrl: "https://fake.invalid/en",
			files,
		},
		{
			id: "fake-zh-en",
			name: "Fake Chinese + English",
			languages: ["zh", "en"],
			baseUrl: "https://fake.invalid/zh",
			files,
		},
	];
}

export const fakeFetch = (async (input: Request | URL | string, init?: RequestInit) => {
	const name = String(input).split("/").pop() ?? "";
	const body = fakeBody(name);
	if (init?.signal?.aborted) throw new DOMException("aborted", "AbortError");
	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			const slice = Math.ceil(body.byteLength / 8);
			for (let offset = 0; offset < body.byteLength; offset += slice) {
				if (init?.signal?.aborted)
					return controller.error(new DOMException("aborted", "AbortError"));
				controller.enqueue(body.subarray(offset, offset + slice));
				await new Promise((resolve) => setTimeout(resolve, 60));
			}
			controller.close();
		},
	});
	return new Response(stream, { status: 200 });
}) as typeof fetch;

/** Reports how much audio it heard so a test can prove the pipeline moved real samples. */
export const fakeEngine: SpeechEngine = {
	available: async () => true,
	load: async () => ({
		createStream: () => {
			let heard = 0;
			return {
				accept: (samples) => {
					heard += samples.length;
				},
				finish: () => (heard > 0 ? FAKE_TEXT : ""),
				discard: () => {},
			};
		},
		dispose: () => {},
	}),
};

export function createFakeSpeechService(root: string): SpeechService {
	return new SpeechService({
		root: () => join(root, "models", "speech"),
		catalog: fakeCatalog(),
		fetch: fakeFetch,
		engine: fakeEngine,
	});
}
