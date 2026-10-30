import type { FileNode } from "@thinkrail/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { getTransport } from "@/transport";
import type { MentionCandidate } from "./completionItems";
import {
	browseMentionNodes,
	mentionedPaths,
	planMention,
	rankMentionNodes,
	splitPath,
} from "./mentionSearch";

const DEBOUNCE_MS = 120;
const LISTING_TTL_MS = 10_000;

interface Listing {
	at: number;
	entries: ReadonlyMap<string, FileNode["kind"]>;
}

export interface MentionSource {
	candidates: MentionCandidate[];
	/** The host cut the search short, so a better match may exist. */
	truncated: boolean;
	/** Whether a drafted `@path` names a real file or folder, from the folder listings read so far. */
	hasPath: (path: string) => boolean;
}

const listingKey = (workspaceId: string, dir: string) => `${workspaceId}\0${dir}`;

/**
 * Feeds the `@` menu and the "does this mention resolve" check from one workspace. A bare name searches
 * the whole tree; a typed separator browses that folder. `workspaceId` is null where no workspace exists
 * yet, which leaves the menu closed and every mention unresolved.
 */
export function useMentionSource(
	workspaceId: string | null,
	draft: string,
	query: string | null,
): MentionSource {
	const [found, setFound] = useState<{ candidates: MentionCandidate[]; truncated: boolean }>({
		candidates: [],
		truncated: false,
	});
	const [listings, setListings] = useState<ReadonlyMap<string, Listing>>(new Map());
	const inFlight = useRef(new Set<string>());

	useEffect(() => {
		const plan = planMention(workspaceId === null ? null : query);
		if (plan.kind === "none" || workspaceId === null) {
			setFound((prev) => (prev.candidates.length ? { candidates: [], truncated: false } : prev));
			return;
		}
		let cancelled = false;
		const timer = setTimeout(() => {
			const transport = getTransport();
			const work =
				plan.kind === "browse"
					? transport.request("fs.readDir", { workspaceId, path: plan.dir }).then((nodes) => ({
							candidates: browseMentionNodes(nodes, plan.prefix),
							truncated: false,
						}))
					: transport.request("fs.search", { workspaceId, query: plan.query }).then((result) => ({
							candidates: rankMentionNodes(result.entries, plan.query),
							truncated: result.truncated,
						}));
			work
				.then((next) => {
					if (!cancelled) setFound(next);
				})
				.catch(() => {
					if (!cancelled) setFound({ candidates: [], truncated: false });
				});
		}, DEBOUNCE_MS);
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, [workspaceId, query]);

	useEffect(() => {
		if (workspaceId === null) return;
		const now = Date.now();
		const wanted = new Set(mentionedPaths(draft).map((path) => splitPath(path).dir));
		for (const dir of wanted) {
			const key = listingKey(workspaceId, dir);
			const cached = listings.get(key);
			if ((cached && now - cached.at < LISTING_TTL_MS) || inFlight.current.has(key)) continue;
			inFlight.current.add(key);
			getTransport()
				.request("fs.readDir", { workspaceId, path: dir })
				.then((nodes) => {
					const entries = new Map(nodes.map((node) => [node.name, node.kind] as const));
					setListings((prev) => new Map(prev).set(key, { at: Date.now(), entries }));
				})
				.catch(() => {})
				.finally(() => inFlight.current.delete(key));
		}
	}, [workspaceId, draft, listings]);

	const hasPath = useCallback(
		(path: string) => {
			if (workspaceId === null) return false;
			const { dir, name } = splitPath(path);
			return !!name && listings.get(listingKey(workspaceId, dir))?.entries.has(name) === true;
		},
		[workspaceId, listings],
	);

	return { ...found, hasPath };
}
