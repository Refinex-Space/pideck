import { getStablePreferenceAdapter } from "../clientPreferences";
import { STORAGE_PREFIX } from "../constants/branding";
import { isRecord } from "../lib";
import { getTransport } from "../transport";

/** Where a new session runs: its own worktree, or directly in the project folder on its current branch. */
export type NewSessionTarget = "worktree" | "default";

const STABLE_KEY = "new-session-targets";
const FALLBACK: NewSessionTarget = "worktree";

export interface NewSessionTargetStorage {
	read: () => string | null;
	write: (value: string) => void;
}

function isTarget(value: unknown): value is NewSessionTarget {
	return value === "worktree" || value === "default";
}

export function parseSessionTargets(raw: string | null): Record<string, NewSessionTarget> {
	if (!raw) return {};
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!isRecord(parsed)) return {};
		const targets: Record<string, NewSessionTarget> = {};
		for (const [projectId, target] of Object.entries(parsed)) {
			if (isTarget(target)) targets[projectId] = target;
		}
		return targets;
	} catch {
		return {};
	}
}

/** What each project last started a session as; a project without a record starts in a worktree. */
export function createSessionTargets(storage: () => NewSessionTargetStorage | null) {
	const read = () => {
		try {
			return parseSessionTargets(storage()?.read() ?? null);
		} catch {
			return {};
		}
	};
	return {
		preferred: (projectId: string): NewSessionTarget => read()[projectId] ?? FALLBACK,
		remember: (projectId: string, target: NewSessionTarget) => {
			const targets = read();
			if (targets[projectId] === target) return;
			try {
				storage()?.write(JSON.stringify({ ...targets, [projectId]: target }));
			} catch {}
		},
	};
}

function windowStorage(): NewSessionTargetStorage | null {
	const adapter = getStablePreferenceAdapter();
	if (adapter) {
		return {
			read: () => adapter.getItem(STABLE_KEY),
			write: (value) => adapter.setItem(STABLE_KEY, value),
		};
	}
	try {
		const storage = window.localStorage;
		const key = `${STORAGE_PREFIX}new-session-targets:${getTransport().httpBase()}`;
		return { read: () => storage.getItem(key), write: (value) => storage.setItem(key, value) };
	} catch {
		return null;
	}
}

const targets = createSessionTargets(windowStorage);

export const preferredSessionTarget = targets.preferred;
export const rememberSessionTarget = targets.remember;
