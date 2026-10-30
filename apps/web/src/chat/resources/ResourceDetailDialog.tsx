import { RiStopFill } from "@remixicon/react";
import type { SubagentResourceSummary } from "@thinkrail/contracts";
import { type Translator, useT } from "@thinkrail/locales/react";
import { Button } from "@thinkrail/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@thinkrail/ui/dialog";
import { cn } from "@thinkrail/ui/utils";
import type { ReactNode } from "react";
import {
	actionKey,
	ExitBadge,
	elapsedLabel,
	isLiveState,
	KindGlyph,
	type Resource,
	type ResourceActions,
	resourceActivity,
	resourceName,
	resourceState,
	StateText,
} from "./resourceRow";

function formatAgo(t: Translator, ms: number): string {
	const minutes = Math.floor(ms / 60_000);
	if (minutes < 1) return t("resources.ago.justNow");
	if (minutes < 60) return t("resources.ago.minutes", { minutes });
	return t("resources.ago.hours", { hours: Math.floor(minutes / 60) });
}

export function DetailHeader({
	resource,
	now,
	authoritative,
	actions,
	onStop,
	renderSubagentModel,
}: {
	resource: Resource;
	now: number;
	authoritative: boolean;
	actions: ResourceActions;
	onStop: () => void;
	renderSubagentModel: ((summary: SubagentResourceSummary) => ReactNode) | undefined;
}) {
	const t = useT();
	const state = resourceState(resource);
	const live = isLiveState(state);
	const action = actions[actionKey(resource)];
	const started =
		resource.kind === "command"
			? resource.summary.startedAt
			: Date.parse(resource.summary.createdAt);
	const elapsed = elapsedLabel(t, resource, now);
	const exitCode = resource.kind === "command" ? resource.summary.exitCode : undefined;
	const reason =
		resource.kind === "command" ? resource.summary.errorMessage : resource.summary.abortReason;
	const model =
		resource.kind === "subagent" && resource.summary.model
			? renderSubagentModel?.(resource.summary)
			: null;
	return (
		<div className="flex shrink-0 flex-col gap-8 border-border-muted border-b p-12">
			<div className="flex min-w-0 items-center gap-8">
				<KindGlyph kind={resource.kind} state={state} />
				<span className="min-w-0 truncate tr-title-dialog" title={resourceName(t, resource)}>
					{resourceName(t, resource)}
				</span>
				<StateText state={state} kind={resource.kind} />
				<span className="flex-1" />
				{live ? (
					<Button
						variant="outline"
						size="m"
						iconLeft={RiStopFill}
						data-testid="resource-detail-stop"
						disabled={
							!authoritative ||
							state === "stopping" ||
							!!action?.pending ||
							(resource.kind === "subagent" && !!actions.all?.pending)
						}
						onClick={onStop}
						tone="danger"
					>
						{action?.pending ? t("resources.action.stopping") : t("resources.action.stop")}
					</Button>
				) : null}
			</div>
			<dl className="flex flex-wrap gap-x-16 gap-y-4 text-text-muted tr-text-metadata">
				{Number.isFinite(started) ? (
					<div className="flex gap-4">
						<dt className="text-text-default">
							{resource.kind === "command"
								? t("resources.detail.started")
								: t("resources.detail.created")}
						</dt>
						<dd>{formatAgo(t, now - started)}</dd>
					</div>
				) : null}
				{elapsed ? (
					<div className="flex gap-4">
						<dt className="text-text-default">
							{live ? t("resources.detail.elapsed") : t("resources.detail.duration")}
						</dt>
						<dd>{elapsed}</dd>
					</div>
				) : null}
				{exitCode !== undefined && exitCode !== null ? (
					<div className="flex items-center gap-4">
						<dt className="text-text-default">{t("resources.detail.exit")}</dt>
						<dd>
							<ExitBadge exitCode={exitCode} />
						</dd>
					</div>
				) : null}
				{model ? (
					<div data-testid="resource-detail-model" className="flex min-w-0 items-center gap-4">
						<dt className="shrink-0 text-text-default">{t("resources.detail.model")}</dt>
						<dd className="flex min-w-0">{model}</dd>
					</div>
				) : null}
				<div className="flex min-w-0 basis-full gap-4">
					<dt className="shrink-0 text-text-default">
						{resource.kind === "command"
							? t("resources.detail.command")
							: t("resources.detail.task")}
					</dt>
					<dd
						className={cn(
							"min-w-0 break-words",
							resource.kind === "command" && "tr-code-text-small",
						)}
					>
						{resourceActivity(resource)}
					</dd>
				</div>
				{reason ? (
					<div className="flex min-w-0 basis-full gap-4 text-feedback-error">
						<dt className="shrink-0">{t("resources.detail.reason")}</dt>
						<dd className="min-w-0 break-words">{reason}</dd>
					</div>
				) : null}
			</dl>
			{action?.error ? (
				<p role="alert" className="break-words text-feedback-error tr-text-metadata">
					{action.error}
				</p>
			) : null}
		</div>
	);
}

export interface ResourceDetailDialogProps {
	resource: Resource;
	now: number;
	authoritative: boolean;
	actions: ResourceActions;
	onStop: () => void;
	onOpenChange: (open: boolean) => void;
	renderSubagentModel?: (summary: SubagentResourceSummary) => ReactNode;
	/** The body: bounded command output or the read-only subagent transcript. */
	children: ReactNode;
}

/** One background command's output or one subagent's transcript, with its state, timing and Stop. */
export function ResourceDetailDialog({
	resource,
	now,
	authoritative,
	actions,
	onStop,
	onOpenChange,
	renderSubagentModel,
	children,
}: ResourceDetailDialogProps) {
	const t = useT();
	return (
		<Dialog open onOpenChange={onOpenChange}>
			<DialogContent
				data-testid="resources-detail"
				aria-describedby={undefined}
				className="max-w-[820px] gap-0 overflow-hidden p-0"
			>
				<DialogTitle className="sr-only">{resourceName(t, resource)}</DialogTitle>
				<DetailHeader
					resource={resource}
					now={now}
					authoritative={authoritative}
					actions={actions}
					onStop={onStop}
					renderSubagentModel={renderSubagentModel}
				/>
				<div className="flex h-[min(60vh,520px)] min-h-0 flex-col gap-8 p-12">{children}</div>
				<p className="shrink-0 border-border-muted border-t px-12 py-4 text-text-subtle tr-text-metadata">
					{resource.kind === "subagent"
						? t("resources.inspector.subagentFooter")
						: t("resources.inspector.commandFooter")}
				</p>
			</DialogContent>
		</Dialog>
	);
}
