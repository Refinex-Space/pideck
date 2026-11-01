import { expect, test } from "bun:test";
import type { SessionStats } from "@thinkrail/contracts";
import { contextTone, formatPercent, summarizeContext } from "./contextUsage";

function stats(overrides: Partial<SessionStats> = {}): SessionStats {
	return {
		sessionId: "s1",
		totalMessages: 12,
		tokens: { input: 133_000, output: 15_200, cacheRead: 373_000, cacheWrite: 0, total: 521_200 },
		cost: 0,
		...overrides,
	};
}

test("context tone escalates at 80 and 95 percent and stays calm without an estimate", () => {
	expect(contextTone(null)).toBe("info");
	expect(contextTone(79.9)).toBe("info");
	expect(contextTone(80)).toBe("warning");
	expect(contextTone(95)).toBe("error");
});

test("percentages keep one decimal only when it carries information", () => {
	expect(formatPercent(8.04, "en")).toBe("8%");
	expect(formatPercent(83.26, "en")).toBe("83.3%");
	expect(formatPercent(100, "en")).toBe("100%");
});

test("the context summary is the engine's usage, clamped, and absent without one", () => {
	expect(summarizeContext(null)).toBeNull();
	expect(summarizeContext(stats())).toBeNull();
	expect(
		summarizeContext(
			stats({ contextUsage: { tokens: 80_400, contextWindow: 1_000_000, percent: 8.04 } }),
		),
	).toEqual({ percent: 8.04, tokens: 80_400, contextWindow: 1_000_000, tone: "info" });
	expect(
		summarizeContext(
			stats({ contextUsage: { tokens: null, contextWindow: 200_000, percent: null } }),
		),
	).toEqual({ percent: null, tokens: null, contextWindow: 200_000, tone: "info" });
	expect(
		summarizeContext(stats({ contextUsage: { tokens: 1, contextWindow: 10, percent: 140 } }))
			?.percent,
	).toBe(100);
});
