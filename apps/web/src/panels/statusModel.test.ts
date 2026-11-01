import { expect, test } from "bun:test";
import type { SessionStats } from "@thinkrail/contracts";
import { ledgerRows, summarizeChanges } from "./statusModel";

function stats(overrides: Partial<SessionStats> = {}): SessionStats {
	return {
		sessionId: "s1",
		totalMessages: 12,
		tokens: { input: 133_000, output: 15_200, cacheRead: 373_000, cacheWrite: 0, total: 521_200 },
		cost: 0,
		...overrides,
	};
}

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
