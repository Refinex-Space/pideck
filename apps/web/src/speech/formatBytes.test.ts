import { expect, test } from "bun:test";
import { formatBytes } from "./formatBytes";

test("formats model sizes in decimal units", () => {
	expect(formatBytes(5_048)).toBe("0.0 MB");
	expect(formatBytes(4_400_000)).toBe("4.4 MB");
	expect(formatBytes(198_000_000)).toBe("198 MB");
	expect(formatBytes(1_500_000_000)).toBe("1.5 GB");
});
