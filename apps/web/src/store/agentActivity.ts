import { ancestorPaths, isAbsolutePath, normalizePath } from "../lib";

export type AgentActivityKind = "read" | "search" | "list" | "write";
export type AgentActivitySource = "agent" | "subagent" | "shell" | "watch";

/** One thing the agent is doing to, or just did to, one path of the workspace. */
export interface AgentActivityEntry {
	id: string;
	sessionId: string;
	/** Workspace-relative POSIX path. */
	path: string;
	kind: AgentActivityKind;
	phase: "running" | "done";
	source: AgentActivitySource;
	tool: string;
	/** A directory the entry also opens (a listing), rather than only its parents. */
	expandSelf: boolean;
	/** The subagent's role name, for the row's description. */
	actor?: string;
	/** A read's line range, an edit's hunk count or a search's hit count. */
	range?: { from: number; to: number | null };
	count?: number;
	startedAt: number;
	/** `null` while running; settled entries fade at this time. */
	expiresAt: number | null;
}

export interface AgentActivityState {
	active: readonly AgentActivityEntry[];
	/** Settled work, newest last; it does not fade, the activity list shows it. */
	recent: readonly AgentActivityEntry[];
	/** Searches in flight: their end event does not repeat the searched path. */
	pending: Readonly<Record<string, { tool: string; path: string | null }>>;
}

export const EMPTY_AGENT_ACTIVITY: AgentActivityState = { active: [], recent: [], pending: {} };

export interface FileActivityPreferences {
	enabled: boolean;
	follow: boolean;
	expand: boolean;
	reads: boolean;
	writes: boolean;
	subagents: boolean;
	shell: boolean;
	timeline: boolean;
	openFiles: boolean;
}

export const DEFAULT_FILE_ACTIVITY_PREFERENCES: FileActivityPreferences = {
	enabled: true,
	follow: true,
	expand: true,
	reads: true,
	writes: true,
	subagents: true,
	shell: false,
	timeline: true,
	openFiles: false,
};

export function parseFileActivityPreferences(raw: string | null): FileActivityPreferences {
	if (!raw) return { ...DEFAULT_FILE_ACTIVITY_PREFERENCES };
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch {
		return { ...DEFAULT_FILE_ACTIVITY_PREFERENCES };
	}
	const stored = asRecord(value);
	const next = { ...DEFAULT_FILE_ACTIVITY_PREFERENCES };
	if (!stored) return next;
	for (const key of Object.keys(next) as (keyof FileActivityPreferences)[]) {
		const entry = stored[key];
		if (typeof entry === "boolean") next[key] = entry;
	}
	return next;
}

export function sameFileActivityPreferences(
	a: FileActivityPreferences,
	b: FileActivityPreferences,
): boolean {
	return (Object.keys(a) as (keyof FileActivityPreferences)[]).every((key) => a[key] === b[key]);
}

export const AGENT_ACTIVITY_TTL_MS = 3_200;
export const AGENT_ACTIVITY_RUNNING_MAX_MS = 600_000;
const MAX_ACTIVE = 120;
const MAX_RECENT = 40;
const RECENT_DEDUPE_MS = 1_500;
export const SEARCH_HIT_LIMIT = 12;
export const SHELL_TARGET_LIMIT = 12;

export interface ToolTarget {
	path: string;
	kind: AgentActivityKind;
	expandSelf: boolean;
	range?: { from: number; to: number | null };
	count?: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function text(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

function wholeNumber(value: unknown): number | null {
	return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function trimTrailingSlashes(path: string): string {
	return path === "/" || /^[A-Za-z]:\/$/.test(path) ? path : path.replace(/\/+$/, "");
}

/**
 * A tool's path, as the agent wrote it, against the workspace: relative to `base` (a workspace-relative
 * directory, the root by default) or absolute. `null` for anything outside the workspace and for the
 * workspace root itself, which the tree never lights.
 */
export function resolveActivityPath(raw: string, worktreePath: string, base = ""): string | null {
	const given = normalizePath(raw.startsWith("@") ? raw.slice(1) : raw);
	if (!given || given.startsWith("~")) return null;
	let relative: string;
	if (isAbsolutePath(given)) {
		const root = trimTrailingSlashes(normalizePath(worktreePath));
		const ignoreCase = /^[A-Za-z]:\//.test(given) && /^[A-Za-z]:\//.test(root);
		const comparable = ignoreCase ? given.toLowerCase() : given;
		const comparableRoot = ignoreCase ? root.toLowerCase() : root;
		const prefix = comparableRoot.endsWith("/") ? comparableRoot : `${comparableRoot}/`;
		if (!comparableRoot || !comparable.startsWith(prefix)) return null;
		relative = given.slice(prefix.length);
	} else {
		relative = base ? `${base}/${given}` : given;
	}
	const segments: string[] = [];
	for (const segment of relative.split("/")) {
		if (segment === "" || segment === ".") continue;
		if (segment === "..") {
			if (segments.length === 0) return null;
			segments.pop();
			continue;
		}
		segments.push(segment);
	}
	return segments.length > 0 ? segments.join("/") : null;
}

function isRootPath(raw: string, worktreePath: string, base: string): boolean {
	const given = normalizePath(raw);
	const root = trimTrailingSlashes(normalizePath(worktreePath));
	if (isAbsolutePath(given)) return trimTrailingSlashes(given) === root;
	const segments: string[] = [];
	for (const segment of (base ? `${base}/${given}` : given).split("/")) {
		if (segment === "" || segment === ".") continue;
		if (segment === "..") {
			if (segments.length === 0) return false;
			segments.pop();
		} else segments.push(segment);
	}
	return segments.length === 0;
}

function readRange(args: Record<string, unknown>): { from: number; to: number | null } | undefined {
	const offset = wholeNumber(args.offset);
	const limit = wholeNumber(args.limit);
	if (offset === null && limit === null) return undefined;
	const from = offset ?? 1;
	return { from, to: limit === null ? null : from + limit - 1 };
}

/** What a tool call is about to do to the workspace, from its arguments alone. */
export function toolTargets(
	tool: string,
	rawArgs: unknown,
	worktreePath: string,
	options: { shell: boolean },
): ToolTarget[] {
	const args = asRecord(rawArgs);
	if (!args) return [];
	if (tool === "bash") {
		const command = text(args.command);
		return options.shell && command ? shellReadTargets(command, worktreePath) : [];
	}
	const raw = text(args.path);
	const path = raw ? resolveActivityPath(raw, worktreePath) : null;
	if (!path) return [];
	switch (tool) {
		case "read": {
			const range = readRange(args);
			return [{ path, kind: "read", expandSelf: false, ...(range ? { range } : {}) }];
		}
		case "edit": {
			const edits = Array.isArray(args.edits) ? args.edits.length : 0;
			return [{ path, kind: "write", expandSelf: false, ...(edits > 1 ? { count: edits } : {}) }];
		}
		case "write":
			return [{ path, kind: "write", expandSelf: false }];
		case "grep":
		case "find":
			return [{ path, kind: "search", expandSelf: false }];
		case "ls":
			return [{ path, kind: "list", expandSelf: true }];
		default:
			return [];
	}
}

function resultText(result: unknown): string {
	const content = asRecord(result)?.content;
	if (!Array.isArray(content)) return "";
	return content
		.map((block) => (asRecord(block)?.type === "text" ? (text(asRecord(block)?.text) ?? "") : ""))
		.join("\n");
}

/**
 * The files a finished grep or find named, capped. Both print paths relative to the searched path; a
 * grep of one file prints its bare name, so that name stands for the searched path itself.
 */
export function searchHitTargets(
	tool: string,
	rawArgs: unknown,
	rawResult: unknown,
	worktreePath: string,
): ToolTarget[] {
	if (tool !== "grep" && tool !== "find") return [];
	const args = asRecord(rawArgs);
	const given = text(args?.path);
	const base = given ? resolveActivityPath(given, worktreePath) : "";
	if (base === null) return [];
	const hits = new Map<string, number>();
	const body = resultText(rawResult).split(/\n\s*\n/, 1)[0] ?? "";
	for (const line of body.split("\n")) {
		const hit =
			tool === "grep"
				? /^(.+?):\d+: /.exec(line)?.[1]
				: line.trim() && !line.startsWith("[")
					? line.trim()
					: undefined;
		if (!hit) continue;
		const name = hit.replace(/\/+$/, "");
		const lastBase = base.split("/").pop();
		const path =
			tool === "grep" && base && !name.includes("/") && name === lastBase
				? base
				: resolveActivityPath(name, worktreePath, base ?? "");
		if (!path) continue;
		hits.set(path, (hits.get(path) ?? 0) + 1);
		if (hits.size >= SEARCH_HIT_LIMIT && !hits.has(path)) break;
	}
	return [...hits].slice(0, SEARCH_HIT_LIMIT).map(([path, count]) => ({
		path,
		kind: "search" as const,
		expandSelf: false,
		...(tool === "grep" ? { count } : {}),
	}));
}

const SHELL_READERS = new Set([
	"cat",
	"head",
	"tail",
	"less",
	"more",
	"bat",
	"batcat",
	"nl",
	"wc",
	"tac",
	"strings",
	"stat",
	"file",
	"diff",
	"cmp",
	"cut",
	"sort",
	"uniq",
	"jq",
	"yq",
	"grep",
	"egrep",
	"fgrep",
	"rg",
	"ag",
	"ack",
	"sed",
	"awk",
	"ls",
	"tree",
	"find",
	"fd",
	"du",
]);
const SHELL_LISTERS = new Set(["ls", "tree", "find", "fd", "du"]);
const PATTERN_FIRST = new Set([
	"grep",
	"egrep",
	"fgrep",
	"rg",
	"ag",
	"ack",
	"sed",
	"awk",
	"jq",
	"yq",
	"fd",
]);
const GREP_VALUES = ["-e", "-f", "-m", "-A", "-B", "-C", "-d", "--regexp", "--file", "--max-count"];
const OPTION_VALUES: Readonly<Record<string, ReadonlySet<string>>> = {
	head: new Set(["-n", "-c"]),
	tail: new Set(["-n", "-c"]),
	grep: new Set(GREP_VALUES),
	egrep: new Set(GREP_VALUES),
	fgrep: new Set(GREP_VALUES),
	ag: new Set(GREP_VALUES),
	ack: new Set(GREP_VALUES),
	rg: new Set([...GREP_VALUES, "-g", "-t", "-T", "--glob", "--type", "--max-depth"]),
	sed: new Set(["-e", "-f"]),
	awk: new Set(["-F", "-f", "-v"]),
	tree: new Set(["-L", "-P", "-I"]),
	fd: new Set(["-e", "-t", "-d", "-E"]),
	cut: new Set(["-d", "-f", "-c", "-b"]),
	sort: new Set(["-k", "-t"]),
	jq: new Set(["-f"]),
	yq: new Set(["-f"]),
	du: new Set(["-d", "--max-depth"]),
	bat: new Set(["-r", "-l", "--line-range", "--language"]),
	batcat: new Set(["-r", "-l", "--line-range", "--language"]),
};

function splitShellCommand(command: string): string[][] {
	const segments: string[][] = [];
	let tokens: string[] = [];
	let current = "";
	let quote: "'" | '"' | null = null;
	let started = false;
	const endToken = () => {
		if (started) tokens.push(current);
		current = "";
		started = false;
	};
	const endSegment = () => {
		endToken();
		if (tokens.length > 0) segments.push(tokens);
		tokens = [];
	};
	for (let index = 0; index < command.length; index++) {
		const char = command[index] ?? "";
		if (quote) {
			if (char === quote) quote = null;
			else if (char === "\\" && quote === '"' && index + 1 < command.length) {
				current += command[++index] ?? "";
			} else current += char;
			continue;
		}
		if (char === "'" || char === '"') {
			quote = char;
			started = true;
		} else if (char === "\\" && index + 1 < command.length) {
			current += command[++index] ?? "";
			started = true;
		} else if (/\s/.test(char)) {
			if (char === "\n") endSegment();
			else endToken();
		} else if (char === ";" || char === "|" || char === "&") {
			endSegment();
			while (command[index + 1] === char) index++;
		} else {
			current += char;
			started = true;
		}
	}
	endSegment();
	return segments;
}

/**
 * The paths a shell command only reads, from a short list of read-only commands. It never guesses past
 * that list: a variable, a glob, a substitution or a redirection ends a path's chance of being named,
 * and `sed -i` is a writer.
 */
export function shellReadTargets(command: string, worktreePath: string): ToolTarget[] {
	const found = new Map<string, ToolTarget>();
	// `null` once a cd has left the workspace: relative paths then mean nothing here.
	let cwd: string | null = "";
	for (const tokens of splitShellCommand(command)) {
		const head = (tokens[0] ?? "").split("/").pop() ?? "";
		if (head === "cd") {
			const target = tokens[1];
			if (!target) cwd = null;
			else if (target === ".") continue;
			else if (/[$`~]/.test(target) || target === "-") cwd = null;
			else if (cwd === null && !isAbsolutePath(target)) continue;
			else {
				const next = resolveActivityPath(target, worktreePath, cwd ?? "");
				cwd = next ?? (isRootPath(target, worktreePath, cwd ?? "") ? "" : null);
			}
			continue;
		}
		if (!SHELL_READERS.has(head)) continue;
		if (head === "sed" && tokens.some((token) => /^-[A-Za-z]*i/.test(token))) continue;
		const lister = SHELL_LISTERS.has(head);
		let skipPattern =
			PATTERN_FIRST.has(head) && !tokens.some((token) => token === "-e" || token === "-f");
		let findExpression = false;
		for (let index = 1; index < tokens.length; index++) {
			const token = tokens[index] ?? "";
			if (/^\d*>>?$/.test(token) || /^\d*>>?\S/.test(token)) {
				if (/^\d*>>?$/.test(token)) index++;
				continue;
			}
			if (head === "find" && /^[-(!]/.test(token)) findExpression = true;
			if (findExpression) continue;
			if (token.startsWith("-")) {
				if (OPTION_VALUES[head]?.has(token)) index++;
				continue;
			}
			if (skipPattern) {
				skipPattern = false;
				continue;
			}
			if (/[$`*?<>~{}]/.test(token) || token === "-") continue;
			if (cwd === null && !isAbsolutePath(token)) continue;
			const path = resolveActivityPath(token, worktreePath, cwd ?? "");
			if (!path || found.has(path)) continue;
			found.set(path, {
				path,
				kind: lister ? "list" : "read",
				expandSelf: lister,
			});
			if (found.size >= SHELL_TARGET_LIMIT) return [...found.values()];
		}
	}
	return [...found.values()];
}

function entryFor(
	base: Pick<AgentActivityEntry, "sessionId" | "source" | "tool" | "actor">,
	id: string,
	target: ToolTarget,
	startedAt: number,
	settled: boolean,
): AgentActivityEntry {
	return {
		id,
		sessionId: base.sessionId,
		path: target.path,
		kind: target.kind,
		phase: settled ? "done" : "running",
		source: base.source,
		tool: base.tool,
		expandSelf: target.expandSelf,
		...(base.actor ? { actor: base.actor } : {}),
		...(target.range ? { range: target.range } : {}),
		...(target.count !== undefined ? { count: target.count } : {}),
		startedAt,
		expiresAt: settled ? startedAt + AGENT_ACTIVITY_TTL_MS : null,
	};
}

function capActive(entries: readonly AgentActivityEntry[]): readonly AgentActivityEntry[] {
	if (entries.length <= MAX_ACTIVE) return entries;
	const running = entries.filter((entry) => entry.phase === "running");
	const done = entries.filter((entry) => entry.phase === "done");
	return [...done.slice(-Math.max(0, MAX_ACTIVE - running.length)), ...running].slice(-MAX_ACTIVE);
}

function remember(
	recent: readonly AgentActivityEntry[],
	settled: readonly AgentActivityEntry[],
): readonly AgentActivityEntry[] {
	let next = [...recent];
	for (const entry of settled) {
		const last = next.at(-1);
		if (
			last &&
			last.path === entry.path &&
			last.kind === entry.kind &&
			last.source === entry.source &&
			entry.startedAt - last.startedAt < RECENT_DEDUPE_MS
		)
			next = next.slice(0, -1);
		next.push({ ...entry, phase: "done", expiresAt: null });
	}
	return next.slice(-MAX_RECENT);
}

/** A tool call began: its targets light up as running. */
export function beginActivity(
	state: AgentActivityState,
	call: {
		sessionId: string;
		toolCallId: string;
		tool: string;
		source: AgentActivitySource;
		actor?: string;
		targets: readonly ToolTarget[];
	},
	now: number,
): AgentActivityState {
	if (call.targets.length === 0) return state;
	const prefix = `${call.sessionId}:${call.toolCallId}:`;
	const fresh = call.targets.map((target, index) =>
		entryFor(call, `${prefix}${index}`, target, now, false),
	);
	return {
		...state,
		active: capActive([...state.active.filter((entry) => !entry.id.startsWith(prefix)), ...fresh]),
	};
}

export function trackSearch(
	state: AgentActivityState,
	sessionId: string,
	toolCallId: string,
	tool: string,
	rawArgs: unknown,
): AgentActivityState {
	if (tool !== "grep" && tool !== "find") return state;
	return {
		...state,
		pending: {
			...state.pending,
			[`${sessionId}:${toolCallId}`]: { tool, path: text(asRecord(rawArgs)?.path) },
		},
	};
}

/** The search a call started, if it was tracked, with the state that no longer holds it. */
export function takeSearch(
	state: AgentActivityState,
	sessionId: string,
	toolCallId: string,
): { search: { tool: string; path: string | null } | null; state: AgentActivityState } {
	const key = `${sessionId}:${toolCallId}`;
	const search = state.pending[key] ?? null;
	if (!search) return { search: null, state };
	const { [key]: _taken, ...pending } = state.pending;
	return { search, state: { ...state, pending } };
}

/** A tool call ended: its entries settle (or vanish on failure) and a search adds its hits. */
export function completeActivity(
	state: AgentActivityState,
	call: {
		sessionId: string;
		toolCallId: string;
		/** The tool, for a search that named no path and so had no entry of its own to take it from. */
		tool?: string;
		failed: boolean;
		hits?: readonly ToolTarget[];
	},
	now: number,
): AgentActivityState {
	const prefix = `${call.sessionId}:${call.toolCallId}:`;
	const mine = state.active.filter((entry) => entry.id.startsWith(prefix));
	if (mine.length === 0 && (call.failed || !call.hits?.length)) return state;
	const rest = state.active.filter((entry) => !entry.id.startsWith(prefix));
	if (call.failed) return { ...state, active: rest };
	const settled = mine.map((entry) => ({
		...entry,
		phase: "done" as const,
		expiresAt: now + AGENT_ACTIVITY_TTL_MS,
	}));
	const base: Pick<AgentActivityEntry, "sessionId" | "source" | "tool" | "actor"> | undefined =
		mine[0] ??
		(call.tool ? { sessionId: call.sessionId, source: "agent", tool: call.tool } : undefined);
	const hits = base
		? (call.hits ?? []).map((target, index) =>
				entryFor(base, `${prefix}hit${index}`, target, now, true),
			)
		: [];
	const done = [...settled, ...hits].map((entry) => ({
		...entry,
		expiresAt: now + AGENT_ACTIVITY_TTL_MS,
	}));
	return {
		...state,
		active: capActive([...rest, ...done]),
		recent: remember(state.recent, done),
	};
}

/** Work with no matching start or end, such as a watched write or a subagent's tool. */
export function noteActivity(
	state: AgentActivityState,
	note: {
		sessionId: string;
		key: string;
		tool: string;
		source: AgentActivitySource;
		actor?: string;
		targets: readonly ToolTarget[];
	},
	now: number,
): AgentActivityState {
	if (note.targets.length === 0) return state;
	const prefix = `${note.sessionId}:${note.key}:`;
	const done = note.targets.map((target, index) =>
		entryFor(note, `${prefix}${index}`, target, now, true),
	);
	return {
		...state,
		active: capActive([...state.active.filter((entry) => !entry.id.startsWith(prefix)), ...done]),
		recent: remember(state.recent, done),
	};
}

/** The chat stopped: anything still running for it never finished. */
export function settleSessionActivity(
	state: AgentActivityState,
	sessionId: string,
): AgentActivityState {
	const prefix = `${sessionId}:`;
	const running = state.active.some(
		(entry) => entry.sessionId === sessionId && entry.phase === "running",
	);
	const searching = Object.keys(state.pending).some((key) => key.startsWith(prefix));
	if (!running && !searching) return state;
	return {
		...state,
		active: state.active.filter(
			(entry) => !(entry.sessionId === sessionId && entry.phase === "running"),
		),
		pending: Object.fromEntries(
			Object.entries(state.pending).filter(([key]) => !key.startsWith(prefix)),
		),
	};
}

export function pruneActivity(state: AgentActivityState, now: number): AgentActivityState {
	const active = state.active.filter((entry) =>
		entry.expiresAt === null
			? now - entry.startedAt < AGENT_ACTIVITY_RUNNING_MAX_MS
			: entry.expiresAt > now,
	);
	return active.length === state.active.length ? state : { ...state, active };
}

export function nextActivityExpiry(state: AgentActivityState): number | null {
	let next: number | null = null;
	for (const entry of state.active) {
		const at = entry.expiresAt ?? entry.startedAt + AGENT_ACTIVITY_RUNNING_MAX_MS;
		if (next === null || at < next) next = at;
	}
	return next;
}

export function clearRecentActivity(state: AgentActivityState): AgentActivityState {
	return state.recent.length === 0 ? state : { ...state, recent: [] };
}

export interface PathActivity {
	kind: AgentActivityKind;
	phase: "running" | "done";
	source: AgentActivitySource;
	tool: string;
	actor?: string;
	range?: { from: number; to: number | null };
	count?: number;
	startedAt: number;
}

export interface ActivityIndex {
	byPath: ReadonlyMap<string, PathActivity>;
	/** Directories with a lit path below them. */
	litDirs: ReadonlySet<string>;
	/** Directories the tree opens on its own, apart from what the user opened. */
	expanded: ReadonlySet<string>;
	/** The path to scroll to: the newest, running first. */
	newest: string | null;
}

export const EMPTY_ACTIVITY_INDEX: ActivityIndex = {
	byPath: new Map(),
	litDirs: new Set(),
	expanded: new Set(),
	newest: null,
};

const KIND_RANK: Record<AgentActivityKind, number> = { write: 4, read: 3, search: 2, list: 1 };

/** Whether the preferences let this entry show at all. */
export function activityVisible(
	entry: AgentActivityEntry,
	prefs: FileActivityPreferences,
): boolean {
	if (entry.kind === "write" ? !prefs.writes : !prefs.reads) return false;
	if (entry.source === "subagent") return prefs.subagents;
	if (entry.source === "shell") return prefs.shell;
	return true;
}

export function activityIndex(
	active: readonly AgentActivityEntry[],
	prefs: FileActivityPreferences,
): ActivityIndex {
	if (!prefs.enabled || active.length === 0) return EMPTY_ACTIVITY_INDEX;
	const byPath = new Map<string, PathActivity>();
	const litDirs = new Set<string>();
	const expanded = new Set<string>();
	let newest: AgentActivityEntry | null = null;
	for (const entry of active) {
		if (!activityVisible(entry, prefs)) continue;
		const known = byPath.get(entry.path);
		const better =
			!known ||
			KIND_RANK[entry.kind] > KIND_RANK[known.kind] ||
			(KIND_RANK[entry.kind] === KIND_RANK[known.kind] &&
				entry.phase === "running" &&
				known.phase === "done");
		const count =
			entry.kind === "search" && known?.kind === "search"
				? (known.count ?? 0) + (entry.count ?? 0)
				: entry.count;
		if (better) {
			byPath.set(entry.path, {
				kind: entry.kind,
				phase: entry.phase,
				source: entry.source,
				tool: entry.tool,
				...(entry.actor ? { actor: entry.actor } : {}),
				...(entry.range ? { range: entry.range } : {}),
				...(count !== undefined ? { count } : {}),
				startedAt: entry.startedAt,
			});
		}
		for (const ancestor of ancestorPaths(entry.path)) {
			litDirs.add(ancestor);
			expanded.add(ancestor);
		}
		if (entry.expandSelf) expanded.add(entry.path);
		if (
			!newest ||
			(entry.phase === "running" && newest.phase === "done") ||
			(entry.phase === newest.phase && entry.startedAt >= newest.startedAt)
		)
			newest = entry;
	}
	return {
		byPath,
		litDirs,
		expanded: prefs.expand ? expanded : new Set(),
		newest: newest?.path ?? null,
	};
}
