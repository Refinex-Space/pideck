import { selectWorkspaceById, useAppStore } from "@/store";
import { getTransport } from "@/transport";
import type { WorkspaceChatTarget } from "./ChatActions";

export function openWorkspace({ workspaceId, projectId, sessionId }: WorkspaceChatTarget): void {
	const activate = (owner: string) =>
		useAppStore
			.getState()
			.activateWorkspaceFromRoute({ id: workspaceId, projectId: owner }, sessionId);
	const known = selectWorkspaceById(useAppStore.getState(), workspaceId);
	if (known) {
		activate(known.projectId);
		return;
	}
	void getTransport()
		.request("workspace.list", { projectId })
		.then((rows) => useAppStore.getState().setWorkspaces(projectId, rows))
		.catch(() => {})
		.finally(() => activate(projectId));
}
