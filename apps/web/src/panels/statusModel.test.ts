import { expect, test } from "bun:test";
import type { SessionStats } from "@thinkrail/contracts";
import {
	contextTone,
	formatPercent,
	ledgerRows,
	summarizeChanges,
	summarizeContext,
} from "./statusModel";

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

test("the ledger leaves out counters the engine reports as zero", () => {
	expect(ledgerRows(stats()).map((row) => row.key)).toEqual([
		"input",
		"output",
		"cacheRead",
		"messages",
	]);
	const priced = ledgerRows(stats({ cost: 1.2346 }));
	expect(priced.find((row) => row.key === "cost")?.text).toBe("$1.235");
	expect(priced.at(-1)).toEqual({ key: "messages", text: "12" });
});

test("changes are summed, treating a missing line count as zero", () => {
	expect(summarizeChanges([])).toEqual({ files: 0, added: 0, removed: 0 });
	expect(
		summarizeChanges([
			{ path: "a.ts", status: "modified", added: 10, removed: 2 },
			{ path: "b.png", status: "added" },
			{ path: "c.ts", status: "deleted", removed: 7 },
		]),
	).toEqual({ files: 3, added: 10, removed: 9 });
});
