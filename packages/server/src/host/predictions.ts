import { getPredictionSource, type PredictionSource } from "../agent";
import { suggestNextPrompt } from "../assist";
import { getConfig } from "../settings";

const ANSWERS_KEPT = 64;

export interface PredictionDeps {
	enabled: () => boolean;
	source: (sessionId: string, completionId: string) => PredictionSource | null;
	suggest: (source: PredictionSource) => Promise<string | null>;
}

/**
 * Next-prompt guesses per finished run. The answer, including "nothing to suggest", is remembered per chat's
 * latest run, so a remounted view or a second window never pays for the same run twice.
 */
export function createPredictions(deps: PredictionDeps) {
	const answers = new Map<string, { completionId: string; text: Promise<string | null> }>();
	return {
		request(sessionId: string, completionId: string): Promise<string | null> {
			if (!deps.enabled()) return Promise.resolve(null);
			const known = answers.get(sessionId);
			if (known?.completionId === completionId) return known.text;
			const source = deps.source(sessionId, completionId);
			const text = source ? deps.suggest(source) : Promise.resolve(null);
			answers.delete(sessionId);
			answers.set(sessionId, { completionId, text });
			if (answers.size > ANSWERS_KEPT) {
				const oldest = answers.keys().next().value;
				if (oldest !== undefined) answers.delete(oldest);
			}
			return text;
		},
	};
}

const predictions = createPredictions({
	enabled: () => getConfig().composerPredictions,
	source: getPredictionSource,
	suggest: suggestNextPrompt,
});

export const requestPrediction = predictions.request;
