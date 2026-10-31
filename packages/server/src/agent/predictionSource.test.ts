import { expect, test } from "bun:test";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { PREDICTION_FRESH_MS, predictionSourceOf } from "./predictionSource";

const MODEL = { provider: "anthropic", id: "claude-opus-faux" };
const NOW = 2_000_000_000_000;

function entry(id: string, message: Record<string, unknown>): SessionEntry {
	return { type: "message", id, parentId: null, timestamp: "", message } as unknown as SessionEntry;
}

const user = (id: string, content: unknown) =>
	entry(id, { role: "user", content, timestamp: NOW - 9000 });
const assistant = (id: string, content: unknown[], at = NOW - 1000) =>
	entry(id, { role: "assistant", content, timestamp: at });

test("the source is the recent prompts, the closing reply's text and the tools the run called", () => {
	const source = predictionSourceOf(
		[
			user("u1", "first"),
			assistant("a1", [{ type: "text", text: "ok" }]),
			user("u2", [{ type: "text", text: "add a retry" }]),
			assistant("a2", [
				{ type: "thinking", thinking: "hmm" },
				{ type: "toolCall", id: "t1", name: "edit", arguments: {} },
			]),
			entry("r1", { role: "toolResult", content: [{ type: "text", text: "done" }] }),
			assistant("a3", [
				{ type: "toolCall", id: "t2", name: "bash", arguments: {} },
				{ type: "text", text: "Added it. " },
				{ type: "text", text: "Run the tests?" },
			]),
		],
		MODEL,
		NOW,
	);
	expect(source).toEqual({
		prompts: ["first", "add a retry"],
		reply: "Added it. Run the tests?",
		tools: ["edit", "bash"],
		model: MODEL,
	});
});

test("only the last four user prompts are kept, and tools come from the latest run only", () => {
	const entries = [
		...["1", "2", "3", "4", "5"].map((n) => user(`u${n}`, `prompt ${n}`)),
		assistant("a", [
			{ type: "toolCall", id: "t", name: "read", arguments: {} },
			{ type: "text", text: "done" },
		]),
	];
	const source = predictionSourceOf(entries, MODEL, NOW);
	expect(source?.prompts).toEqual(["prompt 2", "prompt 3", "prompt 4", "prompt 5"]);
	expect(source?.tools).toEqual(["read"]);
});

test("a run with no closing text, no user prompt or only a stale reply has nothing to guess from", () => {
	expect(
		predictionSourceOf(
			[
				user("u", "go"),
				assistant("a", [{ type: "toolCall", id: "t", name: "bash", arguments: {} }]),
			],
			MODEL,
			NOW,
		),
	).toBeNull();
	expect(
		predictionSourceOf([assistant("a", [{ type: "text", text: "hi" }])], MODEL, NOW),
	).toBeNull();
	expect(predictionSourceOf([user("u", "go")], MODEL, NOW)).toBeNull();
	const stale = [
		user("u", "go"),
		assistant("a", [{ type: "text", text: "hi" }], NOW - PREDICTION_FRESH_MS - 1),
	];
	expect(predictionSourceOf(stale, MODEL, NOW)).toBeNull();
	const fresh = [
		user("u", "go"),
		assistant("a", [{ type: "text", text: "hi" }], NOW - PREDICTION_FRESH_MS),
	];
	expect(predictionSourceOf(fresh, MODEL, NOW)?.reply).toBe("hi");
});
