import type { FileNode } from "@thinkrail/contracts";
import { normalizePath } from "@/lib";
import type { MentionCandidate } from "./completionItems";
import { mentionLookup } from "./fileTargets";

export const MENTION_LIMIT = 40;
const TRAILING_PUNCTUATION = /[.,;:!?)\]}'"，。；：！？）】」』、]+$/u;

export type MentionPlan =
	| { kind: "none" }
	| { kind: "browse"; dir: string; prefix: string }
	| { kind: "search"; query: string };

/**
 * How a `@` query finds candidates: the bare `@` and any query holding a separator browse one folder (so a
 * typed `src/` drills down), and a bare name searches the whole workspace.
 */
export function planMention(query: string | null): MentionPlan {
	if (query === null) return { kind: "none" };
	if (query === "" || /[\\/]/.test(query)) return { kind: "browse", ...mentionLookup(query) };
	return { kind: "search", query: query.trim().toLowerCase() };
}

function depth(path: string): number {
	return path.split("/").length;
}

function score(node: FileNode, query: string): number {
	const name = node.name.toLowerCase();
	if (name === query) return 0;
	if (name.startsWith(query)) return 1;
	if (name.includes(query)) return 2;
	return 3;
}

/** Best name match first, then the shallower path, then folders before files. */
export function rankMentionNodes(
	nodes: readonly FileNode[],
	query: string,
	limit = MENTION_LIMIT,
): MentionCandidate[] {
	return nodes
		.map((node) => ({ node, score: score(node, query) }))
		.sort(
			(a, b) =>
				a.score - b.score ||
				depth(a.node.path) - depth(b.node.path) ||
				Number(b.node.kind === "dir") - Number(a.node.kind === "dir") ||
				a.node.path.localeCompare(b.node.path),
		)
		.slice(0, limit)
		.map(({ node }) => ({ path: node.path, name: node.name, kind: node.kind }));
}

export function browseMentionNodes(
	nodes: readonly FileNode[],
	prefix: string,
	limit = MENTION_LIMIT,
): MentionCandidate[] {
	return nodes
		.filter((node) => node.name.toLowerCase().startsWith(prefix))
		.slice(0, limit)
		.map((node) => ({ path: node.path, name: node.name, kind: node.kind }));
}

/** The workspace-relative paths a draft mentions, without trailing sentence punctuation. */
export function mentionedPaths(draft: string): string[] {
	const paths = new Set<string>();
	for (const match of draft.matchAll(/(?:^|\s)@(\S+)/g)) {
		const full = normalizePath(match[1] as string);
		paths.add(full);
		paths.add(full.replace(TRAILING_PUNCTUATION, ""));
	}
	paths.delete("");
	return [...paths];
}

export function splitPath(path: string): { dir: string; name: string } {
	const trimmed = normalizePath(path).replace(/\/+$/, "");
	const slash = trimmed.lastIndexOf("/");
	return slash >= 0
		? { dir: trimmed.slice(0, slash), name: trimmed.slice(slash + 1) }
		: { dir: "", name: trimmed };
}
