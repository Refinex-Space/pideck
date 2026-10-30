export type PromptTriggerKind = "slash" | "mention";

export interface PromptTrigger {
	kind: PromptTriggerKind;
	/** The text after the sigil, up to the caret. */
	query: string;
	/** The whole token, including any part after the caret: picking replaces `[start, end)`. */
	start: number;
	end: number;
	/** A `/` token that opens the draft: the only place Pi dispatches a command. */
	leading: boolean;
}

/**
 * The completion token under the caret. A sigil only counts at the start of a whitespace-delimited token,
 * so `src/a`, `https://x`, `a@b.com` and `1/2` never open a menu, and a space after `/` makes it plain text.
 */
export function detectPromptTrigger(value: string, caret: number): PromptTrigger | null {
	const before = /\S+$/.exec(value.slice(0, caret))?.[0];
	if (!before) return null;
	const start = caret - before.length;
	const sigil = value[start];
	if (sigil !== "/" && sigil !== "@") return null;
	const after = /^\S*/.exec(value.slice(caret))?.[0] ?? "";
	return {
		kind: sigil === "/" ? "slash" : "mention",
		query: before.slice(1),
		start,
		end: caret + after.length,
		leading: sigil === "/" && value.slice(0, start).trim() === "",
	};
}

/**
 * Replaces the trigger token with `insert`. With `space`, a single space follows it unless one is already
 * there; the caret lands after that space.
 */
export function applyPromptCompletion(
	value: string,
	trigger: Pick<PromptTrigger, "start" | "end">,
	insert: string,
	space = false,
): { value: string; caret: number } {
	const head = value.slice(0, trigger.start);
	const tail = value.slice(trigger.end);
	const gap = space && !/^\s/.test(tail) ? " " : "";
	return {
		value: `${head}${insert}${gap}${tail}`,
		caret: head.length + insert.length + (space ? 1 : 0),
	};
}
