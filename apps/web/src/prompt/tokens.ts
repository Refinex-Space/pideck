import type { SlashCommandItem } from "./SlashCommandCompletion";
import type { SlotHighlightState, SlotSegment } from "./slotSession";

export type PromptTokenKind = "command" | "skill" | "mention";

export interface PromptToken {
	kind: PromptTokenKind;
	start: number;
	end: number;
	/** The catalog entry behind a command or skill token. */
	command?: SlashCommandItem;
	/** The workspace-relative path behind a mention token. */
	path?: string;
}

export interface PromptTokenSources {
	commands: readonly SlashCommandItem[];
	/** Whether a mentioned path exists. Omitted, every `@` mention is accepted. */
	hasPath?: (path: string) => boolean;
	/** Also accept any `/skill:name`, for text already sent, where no catalog is at hand. */
	anySkill?: boolean;
}

export interface PromptSegment {
	text: string;
	start: number;
	token?: PromptToken;
	slot: SlotHighlightState;
}

const TRAILING_PUNCTUATION = /[.,;:!?)\]}'"，。；：！？）】」』、]+$/u;

function mentionPath(text: string, hasPath: PromptTokenSources["hasPath"]): string | null {
	const full = text.slice(1);
	const trimmed = full.replace(TRAILING_PUNCTUATION, "");
	if (!hasPath) return trimmed || null;
	for (const candidate of new Set([full, trimmed])) {
		if (candidate && hasPath(candidate)) return candidate;
	}
	return null;
}

/**
 * Derives the recognised tokens from the draft text; the text stays the only source of truth. Only a leading
 * `/` may name any command (Pi dispatches it); mid-text, only a skill is recognised. A name outside the
 * catalog, like `/usr/bin`, stays plain text, so a coloured token also means "this resolves".
 */
export function scanPromptTokens(value: string, sources: PromptTokenSources): PromptToken[] {
	const tokens: PromptToken[] = [];
	for (const match of value.matchAll(/\S+/g)) {
		const text = match[0];
		const start = match.index;
		if (text.startsWith("/")) {
			const leading = value.slice(0, start).trim() === "";
			const name = text.slice(1);
			const command = sources.commands.find(
				(item) => item.name === name && (leading || item.source === "skill"),
			);
			if (command) {
				tokens.push({
					kind: command.source === "skill" ? "skill" : "command",
					start,
					end: start + text.length,
					command,
				});
			} else if (sources.anySkill && /^skill:\S+$/.test(name)) {
				tokens.push({ kind: "skill", start, end: start + text.length });
			}
		} else if (text.startsWith("@") && text.length > 1) {
			const path = mentionPath(text, sources.hasPath);
			if (path) tokens.push({ kind: "mention", start, end: start + 1 + path.length, path });
		}
	}
	return tokens;
}

/** Splits the draft at every token and slot boundary; the segment texts always join back to `value`. Tokens must be in draft order and not overlap, as `scanPromptTokens` returns them. */
export function promptSegments(
	value: string,
	tokens: readonly PromptToken[],
	slotSegments?: readonly SlotSegment[],
): PromptSegment[] {
	const slots: { start: number; end: number; state: SlotHighlightState }[] = [];
	let offset = 0;
	for (const segment of slotSegments ?? []) {
		slots.push({ start: offset, end: offset + segment.text.length, state: segment.state });
		offset += segment.text.length;
	}
	const cuts = new Set([0, value.length]);
	for (const token of tokens) {
		cuts.add(token.start);
		cuts.add(token.end);
	}
	for (const slot of slots) cuts.add(slot.start);
	const ordered = [...cuts].filter((cut) => cut >= 0 && cut <= value.length).sort((a, b) => a - b);
	const segments: PromptSegment[] = [];
	let tokenIndex = 0;
	let slotIndex = 0;
	for (let i = 0; i < ordered.length - 1; i++) {
		const start = ordered[i] as number;
		const end = ordered[i + 1] as number;
		if (end === start) continue;
		while (tokenIndex < tokens.length && (tokens[tokenIndex] as PromptToken).end <= start)
			tokenIndex++;
		while (slotIndex < slots.length && (slots[slotIndex] as { end: number }).end <= start)
			slotIndex++;
		const token = tokens[tokenIndex];
		const slot = slots[slotIndex];
		segments.push({
			text: value.slice(start, end),
			start,
			slot: slot && slot.start <= start && end <= slot.end ? slot.state : "plain",
			...(token && token.start <= start && end <= token.end ? { token } : {}),
		});
	}
	return segments.length ? segments : [{ text: value, start: 0, slot: "plain" }];
}

/**
 * Pi runs a skill only as the first token (`/skill:name request`). A skill named mid-text moves to the front
 * so it still loads; the request keeps its order, any further skill stays as plain text, and a draft that
 * already opens with a `/` token is left alone.
 */
export function hoistSkillReference(text: string, commands: readonly SlashCommandItem[]): string {
	if (/^\s*\//.test(text)) return text;
	const skill = scanPromptTokens(text, { commands }).find((token) => token.kind === "skill");
	if (!skill) return text;
	const left = text.slice(0, skill.start);
	const right = text.slice(skill.end);
	const trimmedLeft = left.replace(/[ \t]+$/, "");
	const trimmedRight = right.replace(/^[ \t]+/, "");
	const glue = /\S$/.test(trimmedLeft) && /^\S/.test(trimmedRight) ? " " : "";
	const rest = `${trimmedLeft}${glue}${trimmedRight}`.trim();
	const reference = text.slice(skill.start, skill.end);
	return rest ? `${reference} ${rest}` : reference;
}
