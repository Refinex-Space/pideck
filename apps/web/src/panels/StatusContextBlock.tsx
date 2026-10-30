import type { SessionStats } from "@thinkrail/contracts";
import type { MessageKey } from "@thinkrail/locales";
import { t as translate, useT } from "@thinkrail/locales/react";
import { Button } from "@thinkrail/ui/button";
import { cn } from "@thinkrail/ui/utils";
import { useState } from "react";
import { formatTokens } from "../chat/usageFormat";
import { selectSkillsStale, toast, useAppStore } from "../store";
import { errorText, reloadSessionResourcesWithSkillBaseline } from "../transport";
import {
	type ContextSummary,
	type ContextTone,
	formatPercent,
	type LedgerKey,
	ledgerRows,
	summarizeContext,
} from "./statusModel";

const LEDGER_LABEL: Record<LedgerKey, MessageKey> = {
	input: "status.context.input",
	output: "status.context.output",
	cacheRead: "status.context.cacheRead",
	cacheWrite: "status.context.cacheWrite",
	cost: "status.context.cost",
	messages: "status.context.messages",
};

const FILL: Record<ContextTone, string> = {
	info: "bg-feedback-info",
	warning: "bg-feedback-warning",
	error: "bg-feedback-error",
};

function UsageBar({ summary, label }: { summary: ContextSummary; label: string }) {
	const percent = summary.percent ?? 0;
	return (
		<>
			<meter
				aria-label={label}
				min={0}
				max={100}
				value={Math.round(percent)}
				data-testid="status-context-meter"
				className="sr-only"
			/>
			<div
				aria-hidden="true"
				data-testid="status-context-bar"
				data-tone={summary.tone}
				className="h-6 w-full overflow-hidden rounded-full bg-control-bg-selected"
			>
				<span
					ref={(node) => node?.style.setProperty("--status-fill", `${percent}%`)}
					className={cn(
						"block h-full w-[var(--status-fill)] rounded-full motion-safe:transition-[width] motion-safe:duration-300",
						FILL[summary.tone],
					)}
				/>
			</div>
		</>
	);
}

/** The chat's context window as the engine reports it, plus the usage it has counted so far. */
export function ContextBlockView({
	stats,
	hasChat,
	skillsStale,
}: {
	stats: SessionStats | null;
	hasChat: boolean;
	/** The chat's skills are older than what is on disk; Reload applies them to this chat. */
	skillsStale?: { disabled: boolean; onReload: () => void };
}) {
	const t = useT();
	if (!hasChat) {
		return (
			<p data-testid="status-context-empty" className="text-text-muted tr-text-metadata">
				{t("status.context.empty")}
			</p>
		);
	}
	const summary = summarizeContext(stats);
	return (
		<div data-testid="status-context" className="flex flex-col gap-8">
			{skillsStale ? (
				<div
					data-testid="status-skills-stale"
					className="flex items-center gap-8 rounded-sm border border-feedback-warning-muted bg-feedback-warning-subtle px-8 py-4"
				>
					<span className="min-w-0 flex-1 truncate tr-text-metadata text-text-default">
						{t("status.context.skillsStale")}
					</span>
					<Button
						variant="quiet"
						size="s"
						data-testid="status-skills-reload"
						disabled={skillsStale.disabled}
						onClick={skillsStale.onReload}
					>
						{t("chat.skills.reload")}
					</Button>
				</div>
			) : null}
			{summary ? (
				<>
					<div className="flex items-baseline justify-between gap-8">
						<span data-testid="status-context-used" className="tr-text-ui text-text-default">
							{summary.percent === null
								? t("status.context.unknown")
								: t("status.context.usedPercent", { percent: formatPercent(summary.percent) })}
						</span>
						<span
							data-testid="status-context-window"
							className="shrink-0 text-text-muted tabular-nums tr-text-metadata"
						>
							{summary.tokens === null ? "?" : formatTokens(summary.tokens)} /{" "}
							{formatTokens(summary.contextWindow)}
						</span>
					</div>
					<UsageBar summary={summary} label={t("status.context.barLabel")} />
				</>
			) : (
				<p className="text-text-muted tr-text-metadata">{t("status.context.unknown")}</p>
			)}
			{stats ? (
				<div data-testid="status-context-ledger" className="flex flex-col gap-2 pt-4">
					<p className="text-text-subtle tr-text-metadata">{t("status.context.thisChat")}</p>
					<dl className="flex flex-col gap-2">
						{ledgerRows(stats).map((row) => (
							<div
								key={row.key}
								data-testid={`status-context-${row.key}`}
								className="flex items-center justify-between gap-8 tr-text-ui"
							>
								<dt className="text-text-muted">{t(LEDGER_LABEL[row.key])}</dt>
								<dd className="text-text-default tabular-nums">{row.text}</dd>
							</div>
						))}
					</dl>
				</div>
			) : null}
		</div>
	);
}

export function StatusContextBlock({
	workspaceId,
	sessionId,
}: {
	workspaceId: string;
	sessionId: string | null;
}) {
	const stats = useAppStore((state) =>
		sessionId ? (state.sessions[sessionId]?.stats ?? null) : null,
	);
	const stale = useAppStore((state) =>
		sessionId ? selectSkillsStale(state, workspaceId, sessionId) : false,
	);
	const streaming = useAppStore((state) =>
		sessionId ? (state.sessions[sessionId]?.isStreaming ?? false) : false,
	);
	const [busy, setBusy] = useState(false);
	const reload = () => {
		if (!sessionId || busy) return;
		setBusy(true);
		const run = async () => {
			const { syncedTick } = await reloadSessionResourcesWithSkillBaseline(workspaceId, {
				sessionId,
			});
			useAppStore.getState().markSkillsSynced(sessionId, syncedTick);
			toast.success(translate("chat.skills.reloadedBody"), translate("chat.skills.reloadedTitle"));
		};
		run()
			.catch((err: unknown) => toast.error(errorText(err), translate("chat.skills.reloadFailed")))
			.finally(() => setBusy(false));
	};
	return (
		<ContextBlockView
			stats={stats}
			hasChat={sessionId !== null}
			{...(stale ? { skillsStale: { disabled: busy || streaming, onReload: reload } } : {})}
		/>
	);
}
