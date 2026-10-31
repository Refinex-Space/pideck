import { useEffect, useRef, useState } from "react";
import { useAppStore } from "@/store";
import { getTransport } from "@/transport";
import { type PredictionView, predictionTarget, visiblePrediction } from "./promptPrediction";

export interface PromptPrediction {
	/** The grey suggestion to show while the draft is empty, or `null`. */
	text: string | null;
	/** The user took it or waved it away: do not offer this run's guess again. */
	dismiss: () => void;
}

/**
 * Asks the host once per finished run of the chat in front for a guess at the user's next message. The guess
 * belongs to that run: a new run, a failed run or a chat that needs input hides it without any bookkeeping.
 */
export function usePromptPrediction(
	sessionId: string,
	isCurrentChat: boolean,
	draft: string,
): PromptPrediction {
	const enabled = useAppStore((state) => state.composerPredictions);
	const protocolVersion = useAppStore((state) => state.protocolVersion);
	const hostState = useAppStore((state) => state.sessions[sessionId]?.hostState ?? null);
	const target = predictionTarget({ enabled, protocolVersion, isCurrentChat, hostState });
	const [prediction, setPrediction] = useState<PredictionView | null>(null);
	const [dismissed, setDismissed] = useState<string | null>(null);
	const asked = useRef<string | null>(null);
	useEffect(() => {
		if (target === null || asked.current === target) return;
		asked.current = target;
		getTransport()
			.request("prediction.request", { sessionId, completionId: target })
			.then(({ text }) => {
				if (text && asked.current === target) setPrediction({ completionId: target, text });
			})
			.catch(() => {});
	}, [target, sessionId]);
	return {
		text: visiblePrediction(prediction, target, dismissed, draft),
		dismiss: () => setDismissed(target),
	};
}
