import type { LspConfigUpdate, LspOverview, LspWorkspaceStatus } from "@thinkrail/contracts";
import { applyLspUpdate, getLspConfig, setLspConfig } from "./config";
import { LspManager } from "./manager";
import { catalogEntries } from "./servers";

/** The host's one set of language servers. */
export const lspManager = new LspManager({ config: getLspConfig });

const configListeners = new Set<() => void>();

/** Called after a settings change has been saved, so every open client can be told. */
export function onLspConfigChange(listener: () => void): () => void {
	configListeners.add(listener);
	return () => configListeners.delete(listener);
}

export function lspWorkspaceStatus(directory: string, trusted: boolean): LspWorkspaceStatus {
	return lspManager.status(directory, trusted);
}

export function lspOverview(workspace?: { directory: string; trusted: boolean }): LspOverview {
	const config = getLspConfig();
	return {
		config,
		catalog: catalogEntries(),
		status: workspace
			? lspManager.status(workspace.directory, workspace.trusted)
			: { enabled: config.enabled, trusted: false, servers: [] },
	};
}

/**
 * Applies a settings change. Servers already running are restarted only when what they were started
 * with changed (the master switch or the server table); the other switches are read live.
 */
export async function updateLspConfig(
	update: LspConfigUpdate,
	workspace?: { directory: string; trusted: boolean },
): Promise<LspOverview> {
	const before = getLspConfig();
	const after = applyLspUpdate(before, update);
	setLspConfig(after);
	if (
		before.enabled !== after.enabled ||
		JSON.stringify(before.servers) !== JSON.stringify(after.servers)
	) {
		await lspManager.reconfigure();
	}
	for (const listener of configListeners) listener();
	return lspOverview(workspace);
}

export async function restartLsp(directory: string, serverId?: string): Promise<void> {
	await lspManager.restart(directory, serverId);
}
