import { expect, test } from "bun:test";
import { webmDurationPatch } from "./webm";

const header = Buffer.from(
	"1a45dfa39f4286810142f7810142f2810442f381084282847765626d42878104428581021853806701ffffffffffffff1549a966992ad7b1830f42404d80864368726f6d655741864368726f6d651654ae6b80",
	"hex",
);
test("Chromium live WebM receives duration without moving any encoded frame or changing the default time scale", () => {
	const patch = webmDurationPatch(header, 2372.5);
	expect(patch.offset).toBe(53);
	expect(patch.bytes.length).toBe(7);
	const changed = Buffer.from(header);
	patch.bytes.copy(changed, patch.offset);
	expect(changed.subarray(0, 53)).toEqual(header.subarray(0, 53));
	expect(changed.subarray(60)).toEqual(header.subarray(60));
	expect(changed.readFloatBE(56)).toBe(2372.5);
	expect(webmDurationPatch(changed, 4000).offset).toBe(56);
});
test("invalid recording headers and unknown timing layouts are rejected", () => {
	expect(() => webmDurationPatch(Buffer.from("bad"), 1000)).toThrow();
	expect(() => webmDurationPatch(header, Number.POSITIVE_INFINITY)).toThrow();
	const different = Buffer.from(header);
	different[59] = 0x41;
	expect(() => webmDurationPatch(different, 1000)).toThrow("timestamp");
});
