export const DICTATION_SAMPLE_RATE = 16_000;

/** Linear resampling of mono float samples; `carry` keeps one sample so chunk seams stay continuous. */
export function createResampler(fromRate: number, toRate: number) {
	const step = fromRate / toRate;
	let position = 0;
	let previous: number | null = null;
	return (input: Float32Array): Float32Array => {
		if (fromRate === toRate) return input;
		const out: number[] = [];
		const last = input.length - 1;
		// `position` is measured from the last sample of the previous chunk (index -1 here).
		while (position <= last) {
			const index = Math.floor(position);
			const frac = position - index;
			const a = index < 0 ? (previous ?? input[0] ?? 0) : (input[index] ?? 0);
			const b = input[index + 1] ?? a;
			out.push(a + (b - a) * frac);
			position += step;
		}
		position -= input.length;
		previous = input[last] ?? previous;
		return Float32Array.from(out);
	};
}

export function floatToPcm16(samples: Float32Array): Int16Array {
	const out = new Int16Array(samples.length);
	for (let i = 0; i < samples.length; i++) {
		const clamped = Math.max(-1, Math.min(1, samples[i] ?? 0));
		out[i] = clamped < 0 ? Math.round(clamped * 32768) : Math.round(clamped * 32767);
	}
	return out;
}

export function pcm16ToBase64(samples: Int16Array): string {
	const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
	let binary = "";
	for (let i = 0; i < bytes.length; i += 0x8000)
		binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	return btoa(binary);
}

const FLOOR_DB = -60;

/** RMS of a chunk mapped from [-60, -10] dBFS onto 0..1, so quiet rooms stay flat and speech fills the range. */
export function levelOf(samples: Float32Array): number {
	if (samples.length === 0) return 0;
	let sum = 0;
	for (let i = 0; i < samples.length; i++) sum += (samples[i] ?? 0) ** 2;
	const db = 20 * Math.log10(Math.sqrt(sum / samples.length) || 1e-6);
	return Math.min(1, Math.max(0, (db - FLOOR_DB) / (-10 - FLOOR_DB)));
}
