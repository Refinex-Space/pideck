import type { SessionState } from "@thinkrail/contracts";

export interface SkillAutoReloadGate {
	/** The chat is the one in front: a background chat catches up when the user goes back to it. */
	isCurrentChat: boolean;
	/** The chat's skills are older than what is on disk. */
	stale: boolean;
	connected: boolean;
	sessionExists: boolean;
	isStreaming: boolean;
	hostState: SessionState | null;
}

/**
 * Whether the stale skills of this chat can be applied right now. A turn in flight is never interrupted by a
 * reload, so the chat catches up the moment it is idle; hosts that publish no state are judged by `isStreaming`.
 */
export function skillAutoReloadReady(gate: SkillAutoReloadGate): boolean {
	if (!gate.isCurrentChat || !gate.stale || !gate.connected || !gate.sessionExists) return false;
	return !gate.isStreaming && gate.hostState?.execution !== "running";
}
