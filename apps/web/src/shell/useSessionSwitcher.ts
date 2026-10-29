import { useCallback, useEffect, useInsertionEffect, useMemo, useRef, useState } from "react";
import { hasPlatformModifier } from "../lib";
import {
	type HostSessionRow,
	mergeHostSessions,
	type SessionRuntime,
	type SwitcherProject,
	type SwitcherSession,
	selectSwitcherGroups,
	useAppStore,
} from "../store";
import { getTransport } from "../transport";

const NO_SESSIONS: Record<string, SessionRuntime> = {};

export interface UseSessionSwitcher {
	groups: SwitcherProject[];
	navigate: (session: SwitcherSession) => void;
}

export function useSessionSwitcher(open: boolean, onClose: () => void): UseSessionSwitcher {
	const [rowsByWorkspace, setRowsByWorkspace] = useState<Record<string, HostSessionRow[]>>({});

	const projects = useAppStore((state) => state.projects);
	const workspaces = useAppStore((state) => state.workspaces);
	const sessions = useAppStore((state) => (open ? state.sessions : NO_SESSIONS));
	const sessionStateByWorkspace = useAppStore((state) => state.sessionStateByWorkspace);
	const layoutDocumentsByWorkspace = useAppStore((state) => state.layoutDocumentsByWorkspace);
	const closedChatsByWorkspace = useAppStore((state) => state.closedChatsByWorkspace);
	const deletedSessionsByWorkspace = useAppStore((state) => state.deletedSessionsByWorkspace);

	const attentionGroups = useMemo(
		() =>
			selectSwitcherGroups({
				projects,
				workspaces,
				sessions,
				sessionStateByWorkspace,
				layoutDocumentsByWorkspace,
				closedChatsByWorkspace,
			}),
		[
			projects,
			workspaces,
			sessions,
			sessionStateByWorkspace,
			layoutDocumentsByWorkspace,
			closedChatsByWorkspace,
		],
	);

	const groups = useMemo(
		() =>
			mergeHostSessions(
				{ projects, workspaces, deletedSessionsByWorkspace },
				attentionGroups,
				Object.values(rowsByWorkspace).flat(),
			),
		[projects, workspaces, deletedSessionsByWorkspace, attentionGroups, rowsByWorkspace],
	);

	const onCloseRef = useRef(onClose);
	useInsertionEffect(() => {
		onCloseRef.current = onClose;
	});

	useEffect(() => {
		if (!open) return;
		let cancelled = false;
		for (const { id: projectId } of useAppStore.getState().projects) {
			// Workspace hydration must land even if the palette closes: activateWorkspaceFromRoute relies on
			// this list to resolve a selected workspace from an unloaded project. Only the row state below
			// respects `cancelled`.
			void getTransport()
				.request("workspace.list", { projectId })
				.then((list) => {
					useAppStore.getState().setWorkspaces(projectId, list);
					for (const workspace of list) {
						void getTransport()
							.request("session.list", { workspaceId: workspace.id })
							.then((summaries) => {
								if (cancelled) return;
								setRowsByWorkspace((prev) => ({
									...prev,
									[workspace.id]: summaries.map((summary) => ({
										sessionId: summary.sessionId,
										workspaceId: workspace.id,
										projectId,
										title: summary.title,
										firstPrompt: summary.firstPrompt,
										updatedAt: summary.updatedAt,
									})),
								}));
							})
							.catch(() => {});
					}
				})
				.catch(() => {});
		}
		return () => {
			cancelled = true;
		};
	}, [open]);

	useEffect(() => {
		if (!open) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.code === "KeyK" && !event.shiftKey && !event.altKey && hasPlatformModifier(event)) {
				event.preventDefault();
				onCloseRef.current();
			}
		};
		window.addEventListener("keydown", onKeyDown, true);
		return () => window.removeEventListener("keydown", onKeyDown, true);
	}, [open]);

	const navigate = useCallback((session: SwitcherSession) => {
		useAppStore
			.getState()
			.activateWorkspaceFromRoute(
				{ id: session.workspaceId, projectId: session.projectId },
				session.sessionId,
			);
		onCloseRef.current();
	}, []);

	return { groups, navigate };
}
