import { RiMore2Fill, RiPlugLine } from "@remixicon/react";
import type { McpServerResourceSummary } from "@thinkrail/contracts";
import type { MessageKey } from "@thinkrail/locales";
import { useT } from "@thinkrail/locales/react";
import { Button, IconButton } from "@thinkrail/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@thinkrail/ui/dropdown-menu";
import { cn } from "@thinkrail/ui/utils";
import { type McpStateTone, mcpStateLabel, mcpStateTone, mcpToolCountLabel } from "@/lib";
import type { ResourceActions } from "./resourceRow";

type McpRowActionId = "disable" | "enable" | "reconnect" | "settings";

type McpRowAction = { id: McpRowActionId; label: MessageKey };

const DISABLE = { id: "disable", label: "resources.mcp.disable" } as const satisfies McpRowAction;

export function mcpRowActions(server: McpServerResourceSummary): McpRowAction[] {
	const actions = stateActions(server.state);
	return server.registered ? actions.filter((action) => action.id !== DISABLE.id) : actions;
}

function stateActions(state: McpServerResourceSummary["state"]): McpRowAction[] {
	switch (state) {
		case "disabled-in-chat":
			return [{ id: "enable", label: "resources.mcp.enable" }];
		case "needs-sign-in":
			return [{ id: "settings", label: "resources.mcp.signIn" }, DISABLE];
		case "failed":
		case "disconnected":
			return [{ id: "reconnect", label: "resources.mcp.reconnect" }, DISABLE];
		case "pending-approval":
			return [{ id: "settings", label: "resources.mcp.review" }];
		case "invalid-config":
			return [{ id: "settings", label: "common.edit" }];
		case "connected":
		case "starting":
		case "unknown":
			return [DISABLE];
		default:
			return [];
	}
}

const STATE_TEXT: Record<McpStateTone, string> = {
	success: "text-text-subtle",
	working: "text-primary",
	warning: "text-feedback-warning",
	error: "text-feedback-error",
	info: "text-feedback-info",
	neutral: "text-text-subtle",
};

const STATE_DOT: Record<McpStateTone, string> = {
	success: "bg-feedback-success",
	working: "bg-primary motion-safe:animate-working",
	warning: "bg-feedback-warning",
	error: "bg-feedback-error",
	info: "bg-feedback-info",
	neutral: "bg-text-subtle",
};

function mcpActionKey(name: string): string {
	return `mcp:${name}`;
}

/** The first action that is not "disable" sits on the row; the rest, usually Disable, go in the menu. */
function splitActions(actions: McpRowAction[]): {
	inline: McpRowAction | null;
	menu: McpRowAction[];
} {
	const inline = actions.find((action) => action.id !== DISABLE.id) ?? null;
	return { inline, menu: actions.filter((action) => action !== inline) };
}

function McpRow({
	server,
	authoritative,
	actions,
	onAction,
}: {
	server: McpServerResourceSummary;
	authoritative: boolean;
	actions: ResourceActions;
	onAction: (id: McpRowActionId) => void;
}) {
	const t = useT();
	const tone = mcpStateTone(server.state, server.toolCount);
	const action = actions[mcpActionKey(server.name)];
	const { inline, menu } = splitActions(mcpRowActions(server));
	const disabled = !authoritative || !!action?.pending;
	const connection =
		server.transport === "http" ? t("mcp.transport.http") : t("resources.mcp.stdioOnHost");
	const showTools = server.state === "connected" && server.toolCount !== undefined;
	// "Enable in this chat" already says the server is off here, so its state text only serves readers.
	const stateImplied = server.state === "disabled-in-chat" && inline !== null;
	return (
		<li
			data-testid="resource-mcp"
			data-name={server.name}
			data-state={server.state}
			className="flex min-w-0 flex-col"
		>
			<div
				className="flex min-h-32 min-w-0 items-center gap-8"
				title={`${server.name} · ${connection}`}
			>
				<span className="relative inline-flex size-16 shrink-0 items-center justify-center">
					<RiPlugLine aria-hidden="true" className="size-14 text-text-muted" />
					<span
						aria-hidden="true"
						className={cn(
							"-right-2 -bottom-2 absolute size-6 rounded-full ring-2 ring-container-workspace-bg",
							STATE_DOT[tone],
						)}
					/>
				</span>
				<span className="min-w-0 flex-1 truncate tr-text-ui text-text-default">{server.name}</span>
				<span
					data-testid="resource-mcp-state"
					className={cn(
						"shrink-0 whitespace-nowrap tr-text-metadata",
						STATE_TEXT[tone],
						stateImplied && "sr-only",
					)}
				>
					{showTools ? (
						<>
							<span className="sr-only">{mcpStateLabel(t, server.state)} · </span>
							{mcpToolCountLabel(t, server.toolCount ?? 0)}
						</>
					) : (
						mcpStateLabel(t, server.state)
					)}
				</span>
				{inline ? (
					<Button
						variant="quiet"
						size="s"
						data-testid={`resource-mcp-${inline.id}`}
						disabled={disabled}
						onClick={() => onAction(inline.id)}
					>
						{t(inline.label)}
					</Button>
				) : null}
				{menu.length > 0 ? (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<IconButton
								icon={RiMore2Fill}
								size="s"
								label={t("resources.mcp.more")}
								data-testid="resource-mcp-menu"
								disabled={disabled}
							/>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							{menu.map((item) => (
								<DropdownMenuItem
									key={item.id}
									data-testid={`resource-mcp-${item.id}`}
									onSelect={() => onAction(item.id)}
								>
									{t(item.label)}
								</DropdownMenuItem>
							))}
							{menu.some((item) => item.id === "disable") ? (
								<>
									<DropdownMenuSeparator />
									<DropdownMenuLabel className="max-w-[16rem] whitespace-normal font-normal text-text-subtle">
										{t("resources.mcp.disableHint")}
									</DropdownMenuLabel>
								</>
							) : null}
						</DropdownMenuContent>
					</DropdownMenu>
				) : (
					<span aria-hidden="true" className="size-20 shrink-0" />
				)}
			</div>
			{server.state === "pending-reload" ? (
				<span className="pb-2 pl-24 text-text-subtle tr-text-metadata">
					{t("resources.mcp.pendingReload")}
				</span>
			) : null}
			{action?.error ? (
				<span role="alert" className="break-words pb-2 pl-24 text-feedback-error tr-text-metadata">
					{action.error}
				</span>
			) : null}
		</li>
	);
}

/** The MCP servers of one chat as single-line rows: state, a primary action only when one is needed, the rest in a menu. */
export function McpConnectorList({
	servers,
	authoritative,
	actions,
	onSetEnabled,
	onReconnect,
	onOpenSettings,
}: {
	servers: readonly McpServerResourceSummary[];
	authoritative: boolean;
	actions: ResourceActions;
	onSetEnabled: (name: string, enabled: boolean) => void;
	onReconnect: (name: string) => void;
	onOpenSettings: () => void;
}) {
	if (servers.length === 0) return null;
	return (
		<ul data-testid="resources-mcp" className="flex flex-col">
			{servers.map((server) => (
				<McpRow
					key={server.name}
					server={server}
					authoritative={authoritative}
					actions={actions}
					onAction={(id) => {
						if (id === "settings") onOpenSettings();
						else if (id === "reconnect") onReconnect(server.name);
						else onSetEnabled(server.name, id === "enable");
					}}
				/>
			))}
		</ul>
	);
}
