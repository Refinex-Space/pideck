import { expect, test } from "bun:test";
import { createResampler, floatToPcm16, levelOf, pcm16ToBase64 } from "./pcm";

test("downsampling 48 kHz to 16 kHz keeps a third of the samples across chunk seams", () => {
	const resample = createResampler(48_000, 16_000);
	const ramp = Float32Array.from({ length: 960 }, (_, i) => i / 960);
	const a = resample(ramp.subarray(0, 480));
	const b = resample(ramp.subarray(480));
	expect(a.length + b.length).toBe(320);
	for (let i = 1; i < b.length; i++) expect(b[i]).toBeGreaterThan(b[i - 1] ?? 0);
	expect(a.at(-1)).toBeLessThan(b[0] ?? 0);
});

test("equal rates pass samples through untouched", () => {
	const input = Float32Array.from([0.1, -0.2]);
	expect(createResampler(16_000, 16_000)(input)).toBe(input);
});

test("float samples clamp into the 16-bit range", () => {
	expect([...floatToPcm16(Float32Array.from([-2, -1, 0, 1, 2]))]).toEqual([
		-32768, -32768, 0, 32767, 32767,
	]);
});

test("pcm16 base64 is little-endian bytes", () => {
	expect(atob(pcm16ToBase64(Int16Array.from([1, -2])))).toBe("\u0001\u0000þÿ");
});

test("level maps silence to 0, loud speech to 1 and stays monotonic", () => {
	const tone = (amplitude: number) =>
		Float32Array.from({ length: 800 }, (_, i) => amplitude * Math.sin(i / 3));
	expect(levelOf(new Float32Array(800))).toBe(0);
	expect(levelOf(tone(0.0005))).toBe(0);
	expect(levelOf(tone(0.9))).toBe(1);
	expect(levelOf(tone(0.02))).toBeGreaterThan(levelOf(tone(0.005)));
	expect(levelOf(tone(0.1))).toBeLessThan(levelOf(tone(0.3)));
});
