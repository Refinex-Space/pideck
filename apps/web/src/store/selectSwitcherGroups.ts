import {
	isSessionWorking,
	type Project,
	type SessionStateRecord,
	type Workspace,
} from "@thinkrail/contracts";
import type { WorkspaceLayoutDocument } from "../shell/layout";
import type { ClosedChat, SessionRuntime } from "./appStore";
import { selectChatFirstPrompt } from "./selectors";

export type SessionAttention = "needs-input" | "error" | "unread" | "running";

export interface SwitcherSession {
	sessionId: string;
	workspaceId: string;
	projectId: string;
	workspaceName: string;
	workspaceKind: Workspace["kind"] | undefined;
	chatTitle: string | null;
	firstPrompt: string | undefined;
	attention: SessionAttention | null;
	updatedAt?: number;
}

export interface SwitcherProject {
	projectId: string;
	projectName: string;
	needsAttention: boolean;
	sessions: SwitcherSession[];
}

interface SwitcherGroupsState {
	projects: Project[];
	workspaces: Record<string, Workspace[]>;
	sessions: Record<string, SessionRuntime>;
	sessionStateByWorkspace: Record<string, Record<string, SessionStateRecord>>;
	layoutDocumentsByWorkspace: Record<string, WorkspaceLayoutDocument>;
	closedChatsByWorkspace: Record<string, ClosedChat[]>;
}

function getSessionAttention(state: SessionStateRecord["state"]): SessionAttention | null {
	if (state.needsInput !== null) return "needs-input";
	if (state.completionUnread && state.completion?.outcome === "failed") return "error";
	if (state.completionUnread) return "unread";
	if (isSessionWorking(state)) return "running";
	return null;
}

const ATTENTION_PRIORITY: Record<SessionAttention, number> = {
	"needs-input": 0,
	error: 1,
	unread: 2,
	running: 3,
};

function attentionRank(session: SwitcherSession): number {
	return session.attention === null
		? ATTENTION_PRIORITY.running + 1
		: ATTENTION_PRIORITY[session.attention];
}

function compareSessionsByAttention(a: SwitcherSession, b: SwitcherSession): number {
	return attentionRank(a) - attentionRank(b) || (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
}

function resolveChatTitle(
	state: SwitcherGroupsState,
	workspaceId: string,
	sessionId: string,
): string | null {
	const document = state.layoutDocumentsByWorkspace[workspaceId];
	if (document) {
		const visit = (node: WorkspaceLayoutDocument["center"]): string | null => {
			if (node.kind === "split") {
				return visit(node.children[0]) ?? visit(node.children[1]);
			}
			for (const tab of node.tabs) {
				if (tab.kind === "chat" && tab.sessionId === sessionId) return tab.name;
			}
			return null;
		};
		const fromLayout = visit(document.center);
		if (fromLayout !== null) return fromLayout;
	}
	const closed = state.closedChatsByWorkspace[workspaceId] ?? [];
	return closed.find((chat) => chat.sessionId === sessionId)?.title ?? null;
}

function resolveWorkspace(
	state: SwitcherGroupsState,
	projectId: string,
	workspaceId: string,
): Workspace | undefined {
	return state.workspaces[projectId]?.find((workspace) => workspace.id === workspaceId);
}

export function selectSwitcherGroups(state: SwitcherGroupsState): SwitcherProject[] {
	const sessionsByProject = new Map<string, SwitcherSession[]>();
	for (const records of Object.values(state.sessionStateByWorkspace)) {
		for (const record of Object.values(records)) {
			const attention = getSessionAttention(record.state);
			if (!attention) continue;
			const sessions = sessionsByProject.get(record.projectId) ?? [];
			const workspace = resolveWorkspace(state, record.projectId, record.workspaceId);
			sessions.push({
				sessionId: record.sessionId,
				workspaceId: record.workspaceId,
				projectId: record.projectId,
				workspaceName: workspace?.name ?? "",
				workspaceKind: workspace?.kind,
				chatTitle: resolveChatTitle(state, record.workspaceId, record.sessionId),
				firstPrompt: selectChatFirstPrompt(state, record.workspaceId, record.sessionId),
				attention,
			});
			sessionsByProject.set(record.projectId, sessions);
		}
	}

	const groups: SwitcherProject[] = [];
	for (const project of state.projects) {
		const sessions = sessionsByProject.get(project.id);
		if (!sessions || sessions.length === 0) continue;
		sessions.sort(compareSessionsByAttention);
		groups.push({
			projectId: project.id,
			projectName: project.name,
			needsAttention: sessions.some((session) => session.attention !== "running"),
			sessions,
		});
	}
	return groups;
}

export interface HostSessionRow {
	sessionId: string;
	workspaceId: string;
	projectId: string;
	title: string;
	firstPrompt: string | undefined;
	updatedAt: number;
}

/**
 * Widen the attention groups to every chat the host holds: attention rows keep their state, other rows follow
 * by recency, and chats this client already deleted never come back.
 */
export function mergeHostSessions(
	state: Pick<SwitcherGroupsState, "projects" | "workspaces"> & {
		deletedSessionsByWorkspace: Record<string, Record<string, true>>;
	},
	attentionGroups: SwitcherProject[],
	rows: HostSessionRow[],
): SwitcherProject[] {
	const byProject = new Map<string, Map<string, SwitcherSession>>();
	const bucket = (projectId: string) => {
		const existing = byProject.get(projectId);
		if (existing) return existing;
		const created = new Map<string, SwitcherSession>();
		byProject.set(projectId, created);
		return created;
	};
	for (const group of attentionGroups) {
		const sessions = bucket(group.projectId);
		for (const session of group.sessions) sessions.set(session.sessionId, session);
	}
	for (const row of rows) {
		if (state.deletedSessionsByWorkspace[row.workspaceId]?.[row.sessionId]) continue;
		const sessions = bucket(row.projectId);
		const known = sessions.get(row.sessionId);
		if (known) {
			sessions.set(row.sessionId, {
				...known,
				chatTitle: known.chatTitle || row.title || null,
				firstPrompt: known.firstPrompt ?? row.firstPrompt,
				updatedAt: row.updatedAt,
			});
			continue;
		}
		const workspace = state.workspaces[row.projectId]?.find((ws) => ws.id === row.workspaceId);
		sessions.set(row.sessionId, {
			sessionId: row.sessionId,
			workspaceId: row.workspaceId,
			projectId: row.projectId,
			workspaceName: workspace?.name ?? "",
			workspaceKind: workspace?.kind,
			chatTitle: row.title || null,
			firstPrompt: row.firstPrompt,
			attention: null,
			updatedAt: row.updatedAt,
		});
	}
	const groups: SwitcherProject[] = [];
	for (const project of state.projects) {
		const sessions = byProject.get(project.id);
		if (!sessions || sessions.size === 0) continue;
		const list = [...sessions.values()].sort(compareSessionsByAttention);
		groups.push({
			projectId: project.id,
			projectName: project.name,
			needsAttention: list.some((s) => s.attention !== null && s.attention !== "running"),
			sessions: list,
		});
	}
	return groups;
}
