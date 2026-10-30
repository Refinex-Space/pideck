import type { LspServerState, LspServerStatus, LspWorkspaceStatus } from "@thinkrail/contracts";
import type { MessageKey } from "@thinkrail/locales";
import { useT } from "@thinkrail/locales/react";
import { Button } from "@thinkrail/ui/button";
import { cn } from "@thinkrail/ui/utils";
import { Braces, Settings2 } from "lucide-react";
import { SettingsSection, useAppStore } from "../store";
import { getTransport } from "../transport";
import { StatusFooterAction } from "./StatusFooterAction";
import { useLspStatus } from "./useLspStatus";

const openLspSettings = () => useAppStore.getState().openSettings(SettingsSection.Lsp);

type Tone = "success" | "working" | "warning" | "error";

const DOT: Record<Tone, string> = {
	success: "bg-feedback-success",
	working: "bg-primary motion-safe:animate-working",
	warning: "bg-feedback-warning",
	error: "bg-feedback-error",
};

const TEXT: Record<Tone, string> = {
	success: "text-text-subtle",
	working: "text-primary",
	warning: "text-feedback-warning",
	error: "text-feedback-error",
};

const STATE_LABEL: Record<LspServerState, MessageKey> = {
	starting: "status.lsp.state.starting",
	ready: "status.lsp.state.ready",
	error: "status.lsp.state.error",
	missing: "status.lsp.state.missing",
};

const STATE_TONE: Record<LspServerState, Tone> = {
	starting: "working",
	ready: "success",
	error: "error",
	missing: "warning",
};

/** What a row says at its right edge: the findings when it is ready and has some, else its state. */
function verdict(server: LspServerStatus): { tone: Tone; key: "errors" | "warnings" | "state" } {
	if (server.state !== "ready") return { tone: STATE_TONE[server.state], key: "state" };
	if (server.errors > 0) return { tone: "error", key: "errors" };
	if (server.warnings > 0) return { tone: "warning", key: "warnings" };
	return { tone: "success", key: "state" };
}

function LspRow({ server, workspaceId }: { server: LspServerStatus; workspaceId: string }) {
	const t = useT();
	const { tone, key } = verdict(server);
	const restart = (serverId: string) =>
		void getTransport()
			.request("lsp.restart", { workspaceId, serverId })
			.catch(() => {});
	const problem = server.state === "error" || server.state === "missing";
	const text =
		key === "errors"
			? t("status.lsp.errors", { count: server.errors })
			: key === "warnings"
				? t("status.lsp.warnings", { count: server.warnings })
				: t(STATE_LABEL[server.state]);
	return (
		<li
			data-testid="status-lsp-server"
			data-id={server.id}
			data-state={server.state}
			className="flex min-w-0 flex-col"
		>
			<div
				className="flex min-h-32 min-w-0 items-center gap-8"
				title={server.root === "." ? server.name : `${server.name} · ${server.root}`}
			>
				<span className="relative inline-flex size-16 shrink-0 items-center justify-center">
					<Braces aria-hidden="true" className="size-14 text-text-muted" />
					<span
						aria-hidden="true"
						className={cn(
							"-right-2 -bottom-2 absolute size-6 rounded-full ring-2 ring-container-workspace-bg",
							DOT[tone],
						)}
					/>
				</span>
				<span className="flex min-w-0 flex-1 items-baseline gap-4">
					<span className="shrink-0 truncate tr-text-ui text-text-default">{server.name}</span>
					{server.root === "." ? null : (
						<span className="min-w-0 truncate text-text-subtle tr-text-metadata">
							{server.root}
						</span>
					)}
				</span>
				<span
					data-testid="status-lsp-verdict"
					className={cn("shrink-0 whitespace-nowrap tr-text-metadata", TEXT[tone])}
				>
					{text}
				</span>
				{problem ? (
					<Button
						variant="quiet"
						size="s"
						data-testid="status-lsp-restart"
						onClick={() => restart(server.id)}
					>
						{t(server.state === "missing" ? "status.lsp.recheck" : "status.lsp.restart")}
					</Button>
				) : null}
			</div>
			{problem && server.message ? (
				<span className="break-words pb-2 pl-24 text-text-subtle tr-text-metadata">
					{server.message}
				</span>
			) : null}
		</li>
	);
}

/** The language servers of a workspace and what they have found; `status` is undefined until first read. */
export function LspStatusView({
	supported,
	status,
	workspaceId,
}: {
	supported: boolean;
	status: LspWorkspaceStatus | undefined;
	workspaceId: string;
}) {
	const t = useT();
	if (!supported) {
		return (
			<p data-testid="status-lsp-unsupported" className="text-text-muted tr-text-metadata">
				{t("status.lsp.unsupported")}
			</p>
		);
	}
	const manage = (
		<StatusFooterAction icon={Settings2} testId="status-lsp-manage" onClick={openLspSettings}>
			{t("status.lsp.manage")}
		</StatusFooterAction>
	);
	if (!status) return <div className="flex flex-col gap-4">{manage}</div>;
	const note = !status.enabled
		? { id: "off", key: "status.lsp.off" as const }
		: !status.trusted
			? { id: "untrusted", key: "status.lsp.untrusted" as const }
			: status.servers.length === 0
				? { id: "idle", key: "status.lsp.idle" as const }
				: null;
	return (
		<div data-testid="status-lsp" data-enabled={status.enabled} className="flex flex-col gap-4">
			{note ? (
				<p data-testid={`status-lsp-${note.id}`} className="text-text-muted tr-text-metadata">
					{t(note.key)}
				</p>
			) : (
				<ul data-testid="status-lsp-servers" className="flex flex-col">
					{status.servers.map((server) => (
						<LspRow key={`${server.id}:${server.root}`} server={server} workspaceId={workspaceId} />
					))}
				</ul>
			)}
			{manage}
		</div>
	);
}

/** The language servers running for the workspace beside the dock. */
export function StatusLspBlock({ workspaceId }: { workspaceId: string }) {
	const { supported, status } = useLspStatus(workspaceId);
	return <LspStatusView supported={supported} status={status} workspaceId={workspaceId} />;
}
