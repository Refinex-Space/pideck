import type {
	SessionEventPayload,
	Workspace,
	WorkspaceFsChangedPayload,
} from "@thinkrail/contracts";
import {
	type AgentActivityEntry,
	type AgentActivityState,
	beginActivity,
	completeActivity,
	EMPTY_AGENT_ACTIVITY,
	type FileActivityPreferences,
	noteActivity,
	pruneActivity,
	searchHitTargets,
	settleSessionActivity,
	takeSearch,
	toolTargets,
	trackSearch,
} from "./agentActivity";
import type { EditorTab } from "./appStore";
import { fsChangedPaths } from "./selectors";

export interface ActivityFoldState {
	tabsByWorkspace: Record<string, EditorTab[]>;
	workspaces: Record<string, Workspace[]>;
	sessions: Record<string, { isStreaming: boolean } | undefined>;
	agentActivityByWorkspace: Record<string, AgentActivityState>;
	fileActivityPreferences: FileActivityPreferences;
}

const WATCH_PATH_LIMIT = 12;
const OWN_WRITE_WINDOW_MS = 4_000;

function chatSessionIds(tabs: readonly EditorTab[]): string[] {
	return tabs.flatMap((tab) => (tab.kind === "chat" || tab.kind === "plan" ? [tab.sessionId] : []));
}

function workspaceOfSession(
	tabsByWorkspace: Record<string, EditorTab[]>,
	sessionId: string,
): string | null {
	for (const [workspaceId, tabs] of Object.entries(tabsByWorkspace))
		if (chatSessionIds(tabs).includes(sessionId)) return workspaceId;
	return null;
}

function worktreeOf(workspaces: Record<string, Workspace[]>, workspaceId: string): string | null {
	for (const list of Object.values(workspaces)) {
		const found = list.find((workspace) => workspace.id === workspaceId);
		if (found) return found.worktreePath;
	}
	return null;
}

function withActivity(
	byWorkspace: Record<string, AgentActivityState>,
	original: Record<string, AgentActivityState>,
	workspaceId: string,
	next: AgentActivityState,
): Record<string, AgentActivityState> {
	const copy = byWorkspace === original ? { ...byWorkspace } : byWorkspace;
	copy[workspaceId] = next;
	return copy;
}

/**
 * Folds a batch of Pi events into each workspace's file activity. `null` when nothing changed, so the
 * store keeps its identity and nothing re-renders.
 */
export function foldAgentActivity(
	state: ActivityFoldState,
	payloads: readonly SessionEventPayload[],
	now: number,
): Record<string, AgentActivityState> | null {
	const prefs = state.fileActivityPreferences;
	if (!prefs.enabled) return null;
	let byWorkspace = state.agentActivityByWorkspace;
	const touched = new Set<string>();
	for (const { sessionId, event } of payloads) {
		if (
			event.type !== "tool_execution_start" &&
			event.type !== "tool_execution_end" &&
			event.type !== "agent_settled" &&
			event.type !== "subagent_activity"
		)
			continue;
		const workspaceId = workspaceOfSession(state.tabsByWorkspace, sessionId);
		const worktree = workspaceId ? worktreeOf(state.workspaces, workspaceId) : null;
		if (!workspaceId || !worktree) continue;
		const before = byWorkspace[workspaceId] ?? EMPTY_AGENT_ACTIVITY;
		let next = before;
		if (event.type === "tool_execution_start") {
			const targets = toolTargets(event.toolName, event.args, worktree, { shell: prefs.shell });
			next = trackSearch(next, sessionId, event.toolCallId, event.toolName, event.args);
			next = beginActivity(
				next,
				{
					sessionId,
					toolCallId: event.toolCallId,
					tool: event.toolName,
					source: event.toolName === "bash" ? "shell" : "agent",
					targets,
				},
				now,
			);
		} else if (event.type === "tool_execution_end") {
			const taken = takeSearch(next, sessionId, event.toolCallId);
			next = taken.state;
			const hits =
				taken.search && !event.isError
					? searchHitTargets(
							taken.search.tool,
							taken.search.path === null ? {} : { path: taken.search.path },
							event.result,
							worktree,
						)
					: [];
			next = completeActivity(
				next,
				{
					sessionId,
					toolCallId: event.toolCallId,
					tool: event.toolName,
					failed: event.isError,
					hits,
				},
				now,
			);
		} else if (event.type === "agent_settled") {
			next = settleSessionActivity(next, sessionId);
		} else {
			next = noteActivity(
				next,
				{
					sessionId,
					key: `sub:${event.childSessionId}:${now}:${event.args.path ?? event.args.command ?? ""}`,
					tool: event.toolName,
					source: "subagent",
					...(event.roleName ? { actor: event.roleName } : {}),
					targets: toolTargets(event.toolName, event.args, worktree, { shell: prefs.shell }),
				},
				now,
			);
		}
		if (next === before) continue;
		byWorkspace = withActivity(byWorkspace, state.agentActivityByWorkspace, workspaceId, next);
		touched.add(workspaceId);
	}
	for (const workspaceId of touched) {
		const current = byWorkspace[workspaceId];
		if (!current) continue;
		const pruned = pruneActivity(current, now);
		if (pruned !== current)
			byWorkspace = withActivity(byWorkspace, state.agentActivityByWorkspace, workspaceId, pruned);
	}
	return byWorkspace === state.agentActivityByWorkspace ? null : byWorkspace;
}

function writtenLately(activity: AgentActivityState, path: string, now: number): boolean {
	const lately = (entry: AgentActivityEntry) =>
		entry.kind === "write" &&
		entry.path === path &&
		(entry.phase === "running" || now - entry.startedAt < OWN_WRITE_WINDOW_MS);
	return activity.active.some(lately) || activity.recent.slice(-8).some(lately);
}

/**
 * While a chat in the workspace is working, files that change on disk count as its writes: a shell
 * command's output has no path of its own, but the watcher's does. A tool's own edit is skipped, it
 * already lit its file.
 */
export function foldFsChangeActivity(
	state: ActivityFoldState,
	payload: WorkspaceFsChangedPayload,
	now: number,
): Record<string, AgentActivityState> | null {
	const prefs = state.fileActivityPreferences;
	if (!prefs.enabled || !prefs.writes) return null;
	const paths = fsChangedPaths(payload);
	if (!paths) return null;
	const tabs = state.tabsByWorkspace[payload.workspaceId] ?? [];
	const sessionId = chatSessionIds(tabs).find((id) => state.sessions[id]?.isStreaming);
	if (!sessionId) return null;
	const before = state.agentActivityByWorkspace[payload.workspaceId] ?? EMPTY_AGENT_ACTIVITY;
	const targets = paths
		.filter((path) => path.length > 0 && !writtenLately(before, path, now))
		.slice(0, WATCH_PATH_LIMIT)
		.map((path) => ({ path, kind: "write" as const, expandSelf: false }));
	const next = noteActivity(
		before,
		{ sessionId, key: `watch:${now}`, tool: "fs", source: "watch", targets },
		now,
	);
	if (next === before) return null;
	return withActivity(
		state.agentActivityByWorkspace,
		state.agentActivityByWorkspace,
		payload.workspaceId,
		pruneActivity(next, now),
	);
}
