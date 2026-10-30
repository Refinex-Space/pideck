import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import type { LspStatusPayload, Workspace } from "@thinkrail/contracts";
import { admissionContextFor } from "../agent";
import { lspManager, lspWorkspaceStatus, onLspConfigChange } from "../lsp";
import { getProjects } from "../projects";

function canonical(path: string): string {
	try {
		return realpathSync(path);
	} catch {
		return resolve(path);
	}
}

/** Servers run only where Pi has been told to trust the project: they may be the project's own binaries. */
export function workspaceTrustsLsp(workspace: Pick<Workspace, "projectId">): boolean {
	const project = getProjects().find((candidate) => candidate.id === workspace.projectId);
	return admissionContextFor(project).piResourceTrusted;
}

export function workspaceLsp(workspace: Pick<Workspace, "worktreePath" | "projectId">) {
	return { directory: workspace.worktreePath, trusted: workspaceTrustsLsp(workspace) };
}

export function lspStatusPayload(
	workspace: Pick<Workspace, "id" | "worktreePath" | "projectId">,
): LspStatusPayload {
	const { directory, trusted } = workspaceLsp(workspace);
	return { workspaceId: workspace.id, ...lspWorkspaceStatus(directory, trusted) };
}

/**
 * Tells clients when a workspace's servers change (a server starting, failing, finding errors) and,
 * after a settings change, about every workspace.
 */
export function publishLspStatus(
	listWorkspaces: () => readonly Workspace[],
	publish: (payload: LspStatusPayload) => void,
): { forProject: (projectId: string) => void; stop: () => void } {
	const forWorkspaces = (matches: (workspace: Workspace) => boolean) => {
		for (const workspace of listWorkspaces())
			if (matches(workspace)) publish(lspStatusPayload(workspace));
	};
	const stopManager = lspManager.onChange((directory) =>
		forWorkspaces((workspace) => canonical(workspace.worktreePath) === directory),
	);
	const stopConfig = onLspConfigChange(() => forWorkspaces(() => true));
	return {
		forProject: (projectId) => forWorkspaces((workspace) => workspace.projectId === projectId),
		stop: () => {
			stopManager();
			stopConfig();
		},
	};
}
