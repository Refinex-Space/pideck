import { getStablePreferenceAdapter } from "../clientPreferences";

export interface FileDraft {
	workspaceId: string;
	path: string;
	baseHash: string;
	baseContent: string;
	text: string;
	saving?: boolean;
	error?: string;
}
export type FileDrafts = Record<string, FileDraft>;
export const fileDraftKey = (workspaceId: string, path: string): string =>
	JSON.stringify([workspaceId, path]);
const STORAGE_KEY = "pideck:file-drafts:v1";

function storage(forDrafts = false) {
	if (forDrafts) return typeof sessionStorage === "undefined" ? null : sessionStorage;
	const stable = getStablePreferenceAdapter();
	if (stable) return stable;
	return typeof localStorage === "undefined" ? null : localStorage;
}

export function readFileDrafts(): FileDrafts {
	try {
		const raw: unknown = JSON.parse(storage(true)?.getItem(STORAGE_KEY) ?? "null");
		if (!Array.isArray(raw)) return {};
		return Object.fromEntries(
			raw.flatMap((value) => {
				if (!value || typeof value !== "object") return [];
				const { workspaceId, path, baseHash, baseContent, text } = value;
				if (
					[workspaceId, path, baseHash, baseContent, text].some(
						(field) => typeof field !== "string",
					) ||
					text.length > 8 * 1024 * 1024
				)
					return [];
				return [
					[fileDraftKey(workspaceId, path), { workspaceId, path, baseHash, baseContent, text }],
				];
			}),
		);
	} catch {
		return {};
	}
}

export function persistFileDrafts(drafts: FileDrafts): void {
	const values = Object.values(drafts)
		.filter((draft) => draft.saving || draft.text !== draft.baseContent)
		.map(({ workspaceId, path, baseHash, baseContent, text }) => ({
			workspaceId,
			path,
			baseHash,
			baseContent,
			text,
		}));
	const target = storage(true);
	if (values.length) {
		if (!target) throw new Error("Draft recovery storage is unavailable");
		target.setItem(STORAGE_KEY, JSON.stringify(values));
	} else target?.removeItem(STORAGE_KEY);
}

export interface ComposerCursor {
	draft: string;
	start: number;
	end: number;
}
export function insertAtCursor(draft: string, text: string, cursor?: ComposerCursor) {
	const valid = cursor?.draft === draft;
	const start = valid ? Math.max(0, Math.min(draft.length, cursor.start)) : draft.length;
	const end = valid ? Math.max(start, Math.min(draft.length, cursor.end)) : start;
	const prefix = start > 0 && !/\s$/.test(draft.slice(0, start)) && !/^\s/.test(text) ? " " : "";
	const suffix =
		end < draft.length && !/^\s/.test(draft.slice(end)) && !/\s$/.test(text) ? " " : "";
	const inserted = prefix + text + suffix;
	return {
		text: draft.slice(0, start) + inserted + draft.slice(end),
		caret: start + inserted.length,
	};
}

export function readFileWordWrap(): boolean {
	try {
		return storage()?.getItem("pideck:file-word-wrap") !== "false";
	} catch {
		return true;
	}
}
export function persistFileWordWrap(value: boolean): void {
	storage()?.setItem("pideck:file-word-wrap", String(value));
}
