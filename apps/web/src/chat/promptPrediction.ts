import { PREDICTION_PROTOCOL_VERSION, type SessionState } from "@thinkrail/contracts";

export interface PredictionGate {
	enabled: boolean;
	protocolVersion: number | null;
	/** Only the chat in front is worth a guess: a background chat's run is not read until the user returns to it. */
	isCurrentChat: boolean;
	hostState: SessionState | null;
}

/**
 * The finished run worth asking the host to guess a next message for, or `null`. The same facts the host
 * re-checks: the chat is idle with nothing waiting on the user, and its latest run succeeded.
 */
export function predictionTarget(gate: PredictionGate): string | null {
	const { hostState } = gate;
	if (!gate.enabled || !gate.isCurrentChat || !hostState) return null;
	if (gate.protocolVersion === null || gate.protocolVersion < PREDICTION_PROTOCOL_VERSION) {
		return null;
	}
	if (hostState.execution !== "idle" || hostState.needsInput !== null) return null;
	if (hostState.completion?.outcome !== "succeeded") return null;
	return hostState.completion.completionId;
}

export interface PredictionView {
	/** The run the guess was made for. */
	completionId: string;
	text: string;
}

/** What the composer shows: the guess for the run the chat is still sitting at, while nothing is typed. */
export function visiblePrediction(
	prediction: PredictionView | null,
	target: string | null,
	dismissed: string | null,
	draft: string,
): string | null {
	if (!prediction || target === null || prediction.completionId !== target) return null;
	if (dismissed === target || draft !== "") return null;
	return prediction.text;
}
