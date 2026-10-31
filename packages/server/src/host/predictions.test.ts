import { expect, test } from "bun:test";
import type { PredictionSource } from "../agent";
import { createPredictions } from "./predictions";

const source: PredictionSource = {
	prompts: ["fix it"],
	reply: "Fixed. Run the tests?",
	tools: [],
	model: { provider: "p", id: "m" },
};

function harness(overrides: { enabled?: boolean; source?: PredictionSource | null } = {}) {
	const calls = { source: 0, suggest: 0 };
	const predictions = createPredictions({
		enabled: () => overrides.enabled ?? true,
		source: () => {
			calls.source += 1;
			return overrides.source === undefined ? source : overrides.source;
		},
		suggest: async () => {
			calls.suggest += 1;
			return "run the tests";
		},
	});
	return { predictions, calls };
}

test("a finished run is guessed once; a repeated request for it is free", async () => {
	const { predictions, calls } = harness();
	const [first, second] = await Promise.all([
		predictions.request("s1", "completion:a"),
		predictions.request("s1", "completion:a"),
	]);
	expect(first).toBe("run the tests");
	expect(second).toBe("run the tests");
	expect(await predictions.request("s1", "completion:a")).toBe("run the tests");
	expect(calls).toEqual({ source: 1, suggest: 1 });
});

test("the next run of the same chat is guessed again, and chats do not share answers", async () => {
	const { predictions, calls } = harness();
	await predictions.request("s1", "completion:a");
	await predictions.request("s1", "completion:b");
	await predictions.request("s2", "completion:b");
	expect(calls.suggest).toBe(3);
});

test("nothing is asked of the model while the setting is off or the run has no usable source", async () => {
	const off = harness({ enabled: false });
	expect(await off.predictions.request("s1", "completion:a")).toBeNull();
	expect(off.calls).toEqual({ source: 0, suggest: 0 });

	const stale = harness({ source: null });
	expect(await stale.predictions.request("s1", "completion:a")).toBeNull();
	expect(await stale.predictions.request("s1", "completion:a")).toBeNull();
	expect(stale.calls).toEqual({ source: 1, suggest: 0 });
});

test("only the most recent chats' answers are kept", async () => {
	const { predictions, calls } = harness();
	for (let index = 0; index < 70; index += 1)
		await predictions.request(`s${index}`, "completion:a");
	await predictions.request("s0", "completion:a");
	expect(calls.suggest).toBe(71);
});
