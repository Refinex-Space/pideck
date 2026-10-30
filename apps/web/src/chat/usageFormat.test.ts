import { describe, expect, it } from "bun:test";
import { applyLocale, currentTranslator } from "@thinkrail/locales/react";
import { formatCost, formatElapsed, formatTokens } from "./usageFormat";

describe("usage formatting", () => {
	it("matches pi's compact token thresholds", () => {
		expect([999, 1_200, 12_345, 1_200_000, 10_400_000].map(formatTokens)).toEqual([
			"999",
			"1.2k",
			"12k",
			"1.2M",
			"10M",
		]);
	});

	it("switches units by the rounded value so no label reads 10.0k or 1000k", () => {
		expect(
			[9_949, 9_950, 9_999, 999_499, 999_500, 999_999, 9_949_999, 9_950_000].map(formatTokens),
		).toEqual(["9.9k", "10k", "10k", "999k", "1.0M", "1.0M", "9.9M", "10M"]);
		expect(
			[999_499_999, 999_500_000, 1_200_000_000, 9_950_000_000, 12_400_000_000].map(formatTokens),
		).toEqual(["999M", "1.0B", "1.2B", "10B", "12B"]);
	});

	it("prints cost with three decimals", () => {
		expect(formatCost(6.85)).toBe("$6.850");
	});
});

it("formats a turn's elapsed time with the interface language's units", () => {
	expect(formatElapsed(currentTranslator(), 5_000)).toBe("5s");
	expect(formatElapsed(currentTranslator(), 65_000)).toBe("1m 5s");
	applyLocale("ru", { ru: { "chat.elapsed.minutesSeconds": "{{minutes}} мин {{seconds}} с" } });
	try {
		expect(formatElapsed(currentTranslator(), 65_000)).toBe("1 мин 5 с");
	} finally {
		applyLocale("en", {});
	}
});
