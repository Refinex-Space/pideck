import { useEffect, useMemo, useState } from "react";
import {
	type ActivityIndex,
	type AgentActivityEntry,
	type AgentActivityState,
	activityIndex,
	EMPTY_AGENT_ACTIVITY,
	type FileActivityPreferences,
	nextActivityExpiry,
	useAppStore,
} from "../store";

/** A folder the agent opened stays open this long after its last activity, so it does not flap. */
const EXPAND_HOLD_MS = 12_000;

export interface AgentActivityView {
	index: ActivityIndex;
	recent: readonly AgentActivityEntry[];
	preferences: FileActivityPreferences;
}

function nextDue(state: AgentActivityState, now: number): number | null {
	const due = [
		nextActivityExpiry(state),
		...state.recent.map((entry) => entry.startedAt + EXPAND_HOLD_MS),
	].filter((at): at is number => at !== null && at > now);
	return due.length === 0 ? null : Math.min(...due);
}

/**
 * One workspace's file activity for the tree: what is lit now, which folders the agent holds open,
 * and the settled list. It schedules its own fade, so an idle tree costs nothing.
 */
export function useAgentActivity(workspaceId: string): AgentActivityView {
	const state = useAppStore((s) => s.agentActivityByWorkspace[workspaceId] ?? EMPTY_AGENT_ACTIVITY);
	const preferences = useAppStore((s) => s.fileActivityPreferences);
	// The clock is an input, not a read inside render: the compiler would otherwise cache the hold forever.
	const [now, setNow] = useState(() => Date.now());
	const lit = useMemo(() => activityIndex(state.active, preferences), [state.active, preferences]);
	useEffect(() => {
		setNow(Date.now());
		let timer: ReturnType<typeof setTimeout> | undefined;
		const arm = (from: AgentActivityState) => {
			const due = nextDue(from, Date.now());
			if (due === null) return;
			timer = setTimeout(
				() => {
					const store = useAppStore.getState();
					store.pruneAgentActivity(workspaceId, Date.now());
					setNow(Date.now());
					arm(store.agentActivityByWorkspace[workspaceId] ?? EMPTY_AGENT_ACTIVITY);
				},
				due - Date.now() + 30,
			);
		};
		arm(state);
		return () => clearTimeout(timer);
	}, [state, workspaceId]);

	let index = lit;
	if (preferences.enabled && preferences.expand) {
		const horizon = now - EXPAND_HOLD_MS;
		const held = state.recent.filter((entry) => entry.startedAt >= horizon);
		if (held.length > 0) {
			index = { ...lit, expanded: activityIndex([...state.active, ...held], preferences).expanded };
		}
	}
	return { index, recent: state.recent, preferences };
}
