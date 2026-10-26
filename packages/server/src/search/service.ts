import type {
	Project,
	SearchGroup,
	SearchKind,
	SearchPreviewMessage,
	SearchPreviewResult,
	SearchPreviewTarget,
	SearchQueryResult,
	TextSearchBatch,
	Workspace,
	WsParams,
	WsResult,
} from "@thinkrail/contracts";
import {
	DEFAULT_SEARCH_GROUP_LIMIT,
	MAX_SEARCH_GROUP_LIMIT,
	MAX_SEARCH_QUERY_LENGTH,
	parseMatchTerms,
	SEARCH_KINDS,
	TEXT_SEARCH_LIMITS,
} from "@thinkrail/contracts";
import type { HistorySession } from "../history";
import type { SpecSectionSearch, SpecSnapshot } from "../spec";
import type { StoredPlanFile } from "../todos";
import { FileListCache } from "./files";
import { deadlineAt, emptyGroup } from "./hits";
import {
	type ChatLabel,
	type ProviderInput,
	type SearchRoot,
	searchChats,
	searchFiles,
	searchPlans,
	searchSections,
	searchSpecs,
	searchWorkspaces,
} from "./providers";
import { searchText } from "./text";

export interface SearchReaders {
	readonly projects: () => Project[];
	readonly workspaces: () => Workspace[];
	readonly sessions: () => Promise<{ sessions: readonly HistorySession[]; indexing: boolean }>;
	readonly specs: (root: string) => SpecSnapshot;
	readonly sections: (root: string, query: string, limit: number) => SpecSectionSearch;
	readonly plans: (root: string) => StoredPlanFile[];
	readonly invalidateSpecs: (root: string) => void;
	readonly files?: FileListCache;
	readonly now?: () => number;
}

export interface SearchService {
	query(clientKey: string, params: WsParams<"search.query">): Promise<SearchQueryResult>;
	preview(target: SearchPreviewTarget): Promise<SearchPreviewResult>;
	text(
		clientKey: string,
		params: WsParams<"search.text">,
		emit: (batch: TextSearchBatch) => void,
	): WsResult<"search.text">;
	invalidateRoot(root: string): void;
	forgetClient(clientKey: string): void;
}

export const SEARCH_BUDGET = {
	queryMs: 300,
	providerMs: 120,
	previewMessages: 7,
	previewMessageChars: 600,
} as const;

function clampLimit(limit: number | undefined): number {
	if (typeof limit !== "number" || !Number.isFinite(limit)) return DEFAULT_SEARCH_GROUP_LIMIT;
	return Math.max(1, Math.min(MAX_SEARCH_GROUP_LIMIT, Math.floor(limit)));
}

function isDefaultRecord(workspace: Workspace, project: Project): boolean {
	return workspace.kind === "default" || workspace.worktreePath === project.path;
}

/** The one root files and specs are searched in: the active workspace, else the context project's folder through its default record. */
export function resolveSearchRoot(
	projects: readonly Project[],
	workspaces: readonly Workspace[],
	context: { projectId?: string; workspaceId?: string },
): SearchRoot | null {
	const openIds = new Set(projects.map((project) => project.id));
	const current = context.workspaceId
		? workspaces.find((workspace) => workspace.id === context.workspaceId)
		: undefined;
	if (current && openIds.has(current.projectId)) {
		return {
			root: current.worktreePath,
			projectId: current.projectId,
			workspaceId: current.id,
			git: current.kind !== "chat",
		};
	}
	const project = projects.find((candidate) => candidate.id === context.projectId);
	if (!project || project.kind === "chats") return null;
	const defaultRecord = workspaces.find(
		(workspace) => workspace.projectId === project.id && isDefaultRecord(workspace, project),
	);
	if (!defaultRecord) return null;
	return { root: project.path, projectId: project.id, workspaceId: defaultRecord.id, git: true };
}

export function createSearchService(readers: SearchReaders): SearchService {
	const files = readers.files ?? new FileListCache();
	const now = readers.now ?? (() => performance.now());
	const latestSeq = new Map<string, number>();
	const latestTextSeq = new Map<string, number>();
	const textRuns = new Map<string, AbortController>();

	const openWorkspaces = (projects: readonly Project[]) => {
		const open = new Set(projects.map((project) => project.id));
		return readers.workspaces().filter((workspace) => open.has(workspace.projectId));
	};

	const chatLabeler = (workspaces: readonly Workspace[]) => {
		const byPath = new Map<string, ChatLabel>();
		for (const workspace of workspaces) {
			byPath.set(workspace.worktreePath, {
				projectId: workspace.projectId,
				workspaceId: workspace.id,
			});
		}
		return (cwd: string) => byPath.get(cwd) ?? null;
	};

	return {
		async query(clientKey, params) {
			const seq = params.seq;
			const previous = latestSeq.get(clientKey) ?? Number.NEGATIVE_INFINITY;
			if (seq < previous) return { seq, groups: [], superseded: true };
			latestSeq.set(clientKey, seq);
			const superseded = () => latestSeq.get(clientKey) !== seq;

			const text = params.query.slice(0, MAX_SEARCH_QUERY_LENGTH);
			const terms = parseMatchTerms(text);
			const kinds = new Set<SearchKind>(params.kinds ?? SEARCH_KINDS);
			if (terms.length === 0) return { seq, groups: [...kinds].map((kind) => emptyGroup(kind)) };

			const limit = clampLimit(params.limit);
			const started = now();
			const input = (): ProviderInput => ({
				text,
				terms,
				limit,
				deadline: deadlineAt(
					Math.min(now() + SEARCH_BUDGET.providerMs, started + SEARCH_BUDGET.queryMs),
					now,
				),
			});
			const projects = readers.projects();
			const workspaces = openWorkspaces(projects);
			const root = resolveSearchRoot(projects, workspaces, params.context);

			const groups: SearchGroup[] = [];
			const push = (kind: SearchKind, run: () => SearchGroup) => {
				if (!kinds.has(kind)) return;
				try {
					groups.push(run());
				} catch {
					groups.push(emptyGroup(kind, "failed"));
				}
			};
			push("workspace", () => searchWorkspaces(workspaces, input()));
			push("file", () => (root ? searchFiles(root, files, input()) : emptyGroup("file")));
			push("spec", () => (root ? searchSpecs(root, readers.specs, input()) : emptyGroup("spec")));
			push("section", () =>
				root ? searchSections(root, readers.sections, input()) : emptyGroup("section"),
			);

			let sessions: { sessions: readonly HistorySession[]; indexing: boolean } | null = null;
			if (kinds.has("chat") || kinds.has("transcript") || kinds.has("plan")) {
				try {
					sessions = await readers.sessions();
				} catch {
					sessions = null;
				}
			}
			if (superseded()) return { seq, groups: [], superseded: true };
			if (kinds.has("chat") || kinds.has("transcript")) {
				if (!sessions) {
					if (kinds.has("chat")) groups.push(emptyGroup("chat", "failed"));
					if (kinds.has("transcript")) groups.push(emptyGroup("transcript", "failed"));
				} else {
					const result = searchChats(
						sessions.sessions,
						sessions.indexing,
						chatLabeler(workspaces),
						input(),
					);
					if (kinds.has("chat")) groups.push(result.chats);
					if (kinds.has("transcript")) groups.push(result.transcripts);
				}
			}
			push("plan", () =>
				searchPlans(
					workspaces,
					readers.plans,
					sessions ? new Set(sessions.sessions.map((session) => session.sessionId)) : null,
					input(),
				),
			);
			if (superseded()) return { seq, groups: [], superseded: true };
			return { seq, groups };
		},

		async preview(target) {
			const workspaces = openWorkspaces(readers.projects());
			const { sessions } = await readers.sessions();
			const session = sessions.find((candidate) => candidate.sessionId === target.sessionId);
			if (!session || !chatLabeler(workspaces)(session.cwd)) {
				return { kind: "unavailable", reason: "missing" };
			}
			return transcriptPreview(session, target.messageIndex);
		},

		text(clientKey, params, emit) {
			const seq = params.seq;
			if (seq < (latestTextSeq.get(clientKey) ?? Number.NEGATIVE_INFINITY)) {
				return { seq, superseded: true };
			}
			latestTextSeq.set(clientKey, seq);
			textRuns.get(clientKey)?.abort();
			const controller = new AbortController();
			textRuns.set(clientKey, controller);
			const send = (batch: Omit<TextSearchBatch, "seq">) => {
				if (!controller.signal.aborted) emit({ seq, ...batch });
			};
			const settle = () => {
				if (textRuns.get(clientKey) === controller) textRuns.delete(clientKey);
			};
			const nothing = () => {
				send({ files: [], done: { reason: "complete", files: 0, lines: 0 } });
				settle();
			};
			const query = params.query.slice(0, TEXT_SEARCH_LIMITS.maxQuery);
			if (query.trim().length < TEXT_SEARCH_LIMITS.minQuery) {
				nothing();
				return { seq };
			}
			const projects = readers.projects();
			const root = resolveSearchRoot(projects, openWorkspaces(projects), params.context);
			if (!root) {
				nothing();
				return { seq };
			}
			const scope = { projectId: root.projectId, workspaceId: root.workspaceId };
			void searchText(
				root,
				{ query, caseSensitive: params.caseSensitive, wholeWord: params.wholeWord },
				(batch) => send({ root: scope, ...batch }),
				controller.signal,
			)
				.catch(() => send({ files: [], done: { reason: "failed", files: 0, lines: 0 } }))
				.finally(settle);
			return { seq };
		},

		invalidateRoot(root) {
			files.invalidate(root);
			readers.invalidateSpecs(root);
		},

		forgetClient(clientKey) {
			textRuns.get(clientKey)?.abort();
			textRuns.delete(clientKey);
			latestTextSeq.delete(clientKey);
			latestSeq.delete(clientKey);
		},
	};
}

function transcriptPreview(session: HistorySession, messageIndex?: number): SearchPreviewResult {
	const entries = session.entries;
	const focusAt =
		messageIndex === undefined
			? -1
			: entries.findIndex((entry) => entry.messageIndex === messageIndex);
	const half = Math.floor(SEARCH_BUDGET.previewMessages / 2);
	const start = focusAt === -1 ? 0 : Math.max(0, focusAt - half);
	const window = entries.slice(start, start + SEARCH_BUDGET.previewMessages);
	const messages: SearchPreviewMessage[] = window.map((entry) => ({
		role: entry.role,
		messageIndex: entry.messageIndex,
		text:
			entry.text.length > SEARCH_BUDGET.previewMessageChars
				? `${entry.text.slice(0, SEARCH_BUDGET.previewMessageChars)}…`
				: entry.text,
		focus: entry.messageIndex === messageIndex,
	}));
	return {
		kind: "transcript",
		title: session.title ?? "",
		messages,
		truncated: window.length < entries.length,
	};
}
