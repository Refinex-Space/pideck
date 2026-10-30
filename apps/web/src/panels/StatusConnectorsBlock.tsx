import { useT } from "@thinkrail/locales/react";
import { Settings2 } from "lucide-react";
import { useEffect } from "react";
import { useOptionalChatResources } from "../chat/ChatResourcesScope";
import { McpConnectorList } from "../chat/resources";
import { SettingsSection, useAppStore } from "../store";
import { watchMcpWorkspace } from "../transport";
import { StatusFooterAction } from "./StatusFooterAction";

const openMcpSettings = () => useAppStore.getState().openSettings(SettingsSection.Mcp);

/** The MCP servers the chat beside the dock sees, with this chat's enable, reconnect and sign-in. */
export function StatusConnectorsBlock({ workspaceId }: { workspaceId: string }) {
	const t = useT();
	const scope = useOptionalChatResources();
	const connectionGeneration = useAppStore((state) => state.connectionGeneration);
	const servers = scope?.resources.groups.mcpServers ?? null;
	const watching = servers !== null && servers.length > 0;
	useEffect(
		() => (watching && connectionGeneration > 0 ? watchMcpWorkspace(workspaceId) : undefined),
		[watching, workspaceId, connectionGeneration],
	);
	const manage = (
		<StatusFooterAction
			icon={Settings2}
			testId="status-connectors-manage"
			onClick={openMcpSettings}
		>
			{t("status.connectors.manage")}
		</StatusFooterAction>
	);
	if (!scope || servers === null || servers.length === 0) {
		return (
			<div className="flex flex-col gap-4">
				<p data-testid="status-connectors-empty" className="text-text-muted tr-text-metadata">
					{t("resources.mcp.empty")}
				</p>
				{manage}
			</div>
		);
	}
	const { resources } = scope;
	return (
		<div data-testid="status-connectors" className="flex flex-col gap-4">
			<McpConnectorList
				servers={servers}
				authoritative={resources.authoritative}
				actions={resources.actions}
				onSetEnabled={resources.setMcpEnabled}
				onReconnect={resources.reconnectMcp}
				onOpenSettings={openMcpSettings}
			/>
			{manage}
		</div>
	);
}
