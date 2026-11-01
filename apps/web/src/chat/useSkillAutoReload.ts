import { useEffect } from "react";
import { selectSkillsStale, useAppStore } from "@/store";
import { reloadSessionResourcesWithSkillBaseline } from "@/transport";
import { skillAutoReloadReady } from "./skillAutoReload";

/** Edits to a skill usually arrive as a burst of file events; one reload covers them all. */
const RELOAD_DELAY_MS = 400;

/**
 * Applies skill changes found on disk to the chat in front as soon as it is idle, so nobody has to press Reload.
 * A failed attempt is silent and not repeated until something changes: the Reload button in the status panel
 * stays as the manual path and reports the error.
 */
export function useSkillAutoReload(workspaceId: string, sessionId: string, isCurrentChat: boolean) {
	const stale = useAppStore((state) => selectSkillsStale(state, workspaceId, sessionId));
	const changeTick = useAppStore((state) => state.skillChangeTickByWorkspace[workspaceId] ?? 0);
	const connected = useAppStore((state) => state.status === "connected");
	const sessionExists = useAppStore((state) => state.sessions[sessionId] !== undefined);
	const isStreaming = useAppStore((state) => state.sessions[sessionId]?.isStreaming ?? false);
	const hostState = useAppStore((state) => state.sessions[sessionId]?.hostState ?? null);
	const ready = skillAutoReloadReady({
		isCurrentChat,
		stale,
		connected,
		sessionExists,
		isStreaming,
		hostState,
	});
	useEffect(() => {
		if (!ready) return;
		const timer = setTimeout(() => {
			reloadSessionResourcesWithSkillBaseline(workspaceId, { sessionId })
				.then(({ syncedTick }) => useAppStore.getState().markSkillsSynced(sessionId, syncedTick))
				.catch(() => {});
		}, RELOAD_DELAY_MS);
		return () => clearTimeout(timer);
	}, [ready, changeTick, workspaceId, sessionId]);
}
