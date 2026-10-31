import type { SessionEntry } from "@earendil-works/pi-coding-agent";

/** What a next-prompt guess is made from: the exchange the finished run was part of. */
export interface PredictionSource {
	prompts: string[];
	reply: string;
	tools: string[];
	model: { provider: string; id: string };
}

/** A guess about a run older than this is stale: the provider's prompt cache is cold and the user has moved on. */
export const PREDICTION_FRESH_MS = 5 * 60_000;

const PROMPTS_KEPT = 4;

interface Part {
	type?: string;
	text?: string;
	name?: string;
}

interface MessageView {
	role?: string;
	content?: unknown;
	timestamp?: number;
}

function parts(message: MessageView): Part[] {
	return Array.isArray(message.content) ? (message.content as Part[]) : [];
}

function textOf(message: MessageView): string {
	if (typeof message.content === "string") return message.content;
	return parts(message)
		.filter((part) => part?.type === "text" && typeof part.text === "string")
		.map((part) => part.text)
		.join("");
}

/**
 * The input for guessing the user's next message after the run that ended at `entries`' tip, or `null` when
 * the run left nothing worth guessing from (no closing reply, a stale run). Pure: the caller has already
 * established that the chat is idle and the run succeeded.
 */
export function predictionSourceOf(
	entries: readonly SessionEntry[],
	model: PredictionSource["model"],
	now: number,
): PredictionSource | null {
	const messages = entries.flatMap((entry) =>
		entry.type === "message" ? [entry.message as MessageView] : [],
	);
	const lastUser = messages.findLastIndex((message) => message.role === "user");
	if (lastUser < 0) return null;
	const run = messages.slice(lastUser + 1);
	const closing = run.findLast((message) => message.role === "assistant");
	if (!closing) return null;
	const reply = textOf(closing).trim();
	if (!reply) return null;
	if (typeof closing.timestamp === "number" && now - closing.timestamp > PREDICTION_FRESH_MS) {
		return null;
	}
	const prompts = messages
		.filter((message) => message.role === "user")
		.slice(-PROMPTS_KEPT)
		.map((message) => textOf(message).trim())
		.filter(Boolean);
	const tools = run
		.filter((message) => message.role === "assistant")
		.flatMap((message) => parts(message))
		.flatMap((part) => (part?.type === "toolCall" && part.name ? [part.name] : []));
	return { prompts, reply, tools, model };
}
