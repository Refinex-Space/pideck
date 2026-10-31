export const SPEECH_SAMPLE_RATE = 16_000;

/** One utterance. Samples are mono floats in [-1, 1] at `SPEECH_SAMPLE_RATE`. */
export interface RecognitionStream {
	accept(samples: Float32Array): void;
	/** Flush the tail and return the final text; the stream is unusable afterwards. */
	finish(): string;
	/** Release the stream without a result (cancelled or abandoned dictation). */
	discard(): void;
}

export interface Recognizer {
	createStream(): RecognitionStream;
	dispose(): void;
}

/** Loads one installed model directory into memory. `null` means the runtime itself cannot start. */
export interface SpeechEngine {
	available(): Promise<boolean>;
	load(modelDir: string): Promise<Recognizer>;
}

/** PCM16LE → floats. Odd trailing bytes are dropped; the caller sends whole samples. */
export function pcm16ToFloat(bytes: Uint8Array): Float32Array {
	const count = bytes.byteLength >> 1;
	const view = new DataView(bytes.buffer, bytes.byteOffset, count * 2);
	const out = new Float32Array(count);
	for (let i = 0; i < count; i++) out[i] = view.getInt16(i * 2, true) / 32768;
	return out;
}

const CJK = "\\u3400-\\u9fff\\uf900-\\ufaff";
const CJK_GAP = new RegExp(`([${CJK}])\\s+(?=[${CJK}])`, "gu");

/**
 * The streaming transducers emit upper-case Latin text without punctuation. Lower-case it when nothing
 * else carries case, restore the pronoun "I" and a leading capital, and drop the gaps their tokenizer
 * leaves between CJK characters. Text that already mixes case is left alone.
 */
export function normalizeTranscript(raw: string): string {
	let text = raw.replace(CJK_GAP, "$1").replace(/\s+/g, " ").trim();
	if (/[A-Z]/.test(text) && !/[a-z]/.test(text)) {
		text = text.toLowerCase().replace(/\bi\b/g, "I");
		text = text.replace(/^[a-z]/, (letter) => letter.toUpperCase());
	}
	return text;
}
