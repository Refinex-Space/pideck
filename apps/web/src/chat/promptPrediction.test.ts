import { expect, test } from "bun:test";
import { PREDICTION_PROTOCOL_VERSION, type SessionState } from "@thinkrail/contracts";
import { type PredictionGate, predictionTarget, visiblePrediction } from "./promptPrediction";

function state(overrides: Partial<SessionState> = {}): SessionState {
	return {
		execution: "idle",
		runId: "u1",
		needsInput: null,
		completion: { completionId: "completion:a1", outcome: "succeeded" },
		completionUnread: false,
		queuedCount: 0,
		backgroundWork: false,
		...overrides,
	};
}

function gate(overrides: Partial<PredictionGate> = {}): PredictionGate {
	return {
		enabled: true,
		protocolVersion: PREDICTION_PROTOCOL_VERSION,
		isCurrentChat: true,
		hostState: state(),
		...overrides,
	};
}

test("the chat in front, idle after a successful run, is asked about that run", () => {
	expect(predictionTarget(gate())).toBe("completion:a1");
});

test("nothing is asked when the setting is off, the host is too old or the chat is in the background", () => {
	expect(predictionTarget(gate({ enabled: false }))).toBeNull();
	expect(predictionTarget(gate({ protocolVersion: PREDICTION_PROTOCOL_VERSION - 1 }))).toBeNull();
	expect(predictionTarget(gate({ protocolVersion: null }))).toBeNull();
	expect(predictionTarget(gate({ isCurrentChat: false }))).toBeNull();
	expect(predictionTarget(gate({ hostState: null }))).toBeNull();
});

test("nothing is asked while the run is going, waiting on the user, or did not succeed", () => {
	expect(predictionTarget(gate({ hostState: state({ execution: "running" }) }))).toBeNull();
	expect(
		predictionTarget(
			gate({
				hostState: state({
					needsInput: { interactionId: "tool:t", kind: "tool-response", toolCallId: "t" },
				}),
			}),
		),
	).toBeNull();
	for (const outcome of ["interrupted", "cancelled"] as const) {
		expect(
			predictionTarget(
				gate({ hostState: state({ completion: { completionId: "completion:a1", outcome } }) }),
			),
		).toBeNull();
	}
	expect(
		predictionTarget(
			gate({
				hostState: state({
					completion: { completionId: "completion:a1", outcome: "failed", failure: "error" },
				}),
			}),
		),
	).toBeNull();
	expect(predictionTarget(gate({ hostState: state({ completion: null }) }))).toBeNull();
});

test("a guess is shown only for the run the chat still sits at, while the draft is empty and not waved away", () => {
	const prediction = { completionId: "completion:a1", text: "run the tests" };
	expect(visiblePrediction(prediction, "completion:a1", null, "")).toBe("run the tests");
	expect(visiblePrediction(prediction, "completion:a1", null, "r")).toBeNull();
	expect(visiblePrediction(prediction, "completion:a1", "completion:a1", "")).toBeNull();
	expect(visiblePrediction(prediction, "completion:a2", null, "")).toBeNull();
	expect(visiblePrediction(prediction, null, null, "")).toBeNull();
	expect(visiblePrediction(null, "completion:a1", null, "")).toBeNull();
	expect(visiblePrediction(prediction, "completion:a1", "completion:old", "")).toBe(
		"run the tests",
	);
});
