import type { LspWorkspaceStatus } from "@thinkrail/contracts";
import { useEffect } from "react";
import { selectSupportsLsp, useAppStore } from "../store";
import { getTransport } from "../transport";

/**
 * A workspace's language servers: what the host last pushed, seeded by one read when the dock opens
 * and after each reconnect (the host pushes only changes). A push that lands while the read is in
 * flight is newer than the read, so the read then yields.
 */
export function useLspStatus(workspaceId: string): {
	supported: boolean;
	status: LspWorkspaceStatus | undefined;
} {
	const supported = useAppStore(selectSupportsLsp);
	const connectionGeneration = useAppStore((state) => state.connectionGeneration);
	const status = useAppStore((state) => state.lspByWorkspace[workspaceId]);
	useEffect(() => {
		if (!supported || connectionGeneration === 0) return;
		let cancelled = false;
		const before = useAppStore.getState().lspByWorkspace[workspaceId];
		getTransport()
			.request("lsp.get", { workspaceId })
			.then((overview) => {
				if (cancelled) return;
				const state = useAppStore.getState();
				if (state.lspByWorkspace[workspaceId] !== before) return;
				state.applyLspStatus({ workspaceId, ...overview.status });
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [supported, workspaceId, connectionGeneration]);
	return { supported, status };
}
