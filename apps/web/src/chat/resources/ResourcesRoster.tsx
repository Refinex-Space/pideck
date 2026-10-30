import {
	RiAlertLine,
	RiArrowDownSLine,
	RiErrorWarningLine,
	RiLoader4Line,
	RiStopFill,
} from "@remixicon/react";
import type { BackgroundCommandSummary, SubagentResourceSummary } from "@thinkrail/contracts";
import { useT } from "@thinkrail/locales/react";
import { Button, IconButton } from "@thinkrail/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogTitle,
} from "@thinkrail/ui/dialog";
import { cn } from "@thinkrail/ui/utils";
import { useState } from "react";
import {
	actionKey,
	type Resource,
	type ResourceActions,
	ResourceRow,
	type ResourceTarget,
	resourceTarget,
	sortLive,
	sortSettled,
	toResources,
} from "./resourceRow";

export interface ResourcesRosterProps {
	commands: readonly BackgroundCommandSummary[];
	subagents: readonly SubagentResourceSummary[];
	finishedCommands: readonly BackgroundCommandSummary[];
	finishedSubagents: readonly SubagentResourceSummary[];
	now: number;
	authoritative: boolean;
	loading: boolean;
	stale: boolean;
	error: string | null;
	actions: ResourceActions;
	onInspect: (target: ResourceTarget) => void;
	onRetry: () => void;
	onStopCommand: (commandId: string) => void;
	onStopSubagent: (childSessionId: string) => void;
	onStopAll: () => void;
}

/**
 * The running and finished background work of one chat as a compact list: the status dock's
 * Background tasks block. A row opens its detail (command output or subagent transcript) through
 * `onInspect`; Stop and Stop all stay here, and Stop all asks first.
 */
export function ResourcesRoster(props: ResourcesRosterProps) {
	const t = useT();
	const [finishedOpen, setFinishedOpen] = useState(false);
	const [stopAllOpen, setStopAllOpen] = useState(false);
	const live = sortLive(toResources(props.commands, props.subagents));
	const settled = sortSettled(toResources(props.finishedCommands, props.finishedSubagents));
	const stopFor = (resource: Resource) =>
		resource.kind === "command"
			? props.onStopCommand(resource.summary.id)
			: props.onStopSubagent(resource.summary.childSessionId);
	const stopAllBusy =
		!props.authoritative ||
		!!props.actions.all?.pending ||
		props.subagents.some((child) => props.actions[`subagent:${child.childSessionId}`]?.pending);
	const rows = (list: Resource[]) =>
		list.map((resource) => (
			<ResourceRow
				key={actionKey(resource)}
				resource={resource}
				now={props.now}
				authoritative={props.authoritative}
				action={props.actions[actionKey(resource)]}
				stopAllPending={!!props.actions.all?.pending}
				role="listitem"
				onSelect={() => props.onInspect(resourceTarget(resource))}
				onStop={() => stopFor(resource)}
			/>
		));

	return (
		<div data-testid="resources-roster" className="flex flex-col gap-4">
			{!props.authoritative ? (
				<p className="flex items-center gap-4 text-text-muted tr-text-metadata">
					<RiLoader4Line className="size-12 animate-spin motion-reduce:animate-none" />
					{t("resources.inspector.reconnecting")}
				</p>
			) : props.loading ? (
				<p className="text-text-muted tr-text-metadata">{t("resources.inspector.loading")}</p>
			) : null}
			{props.stale ? (
				<p className="flex items-center gap-8 rounded-sm border border-feedback-warning-muted bg-container-elevated-bg px-8 py-4 text-text-default tr-text-metadata">
					<RiAlertLine className="size-14 shrink-0 text-feedback-warning" aria-hidden />
					{t("resources.inspector.stale")}
				</p>
			) : null}
			{props.error ? (
				<div
					role="alert"
					className="flex flex-col gap-8 rounded-sm border border-feedback-error-muted bg-container-elevated-bg px-8 py-4 text-text-default tr-text-metadata"
				>
					<div className="flex items-start gap-8">
						<RiErrorWarningLine className="mt-2 size-14 shrink-0 text-feedback-error" aria-hidden />
						<span className="min-w-0 flex-1 break-words">{props.error}</span>
					</div>
					<div className="flex justify-end">
						<Button
							variant="outline"
							size="m"
							data-testid="resources-retry"
							onClick={props.onRetry}
						>
							{t("common.retry")}
						</Button>
					</div>
				</div>
			) : null}
			{props.actions.all?.error ? (
				<p role="alert" className="text-feedback-error tr-text-metadata">
					{props.actions.all.error}
				</p>
			) : null}

			<section
				data-testid="resources-active"
				data-active-count={live.length}
				aria-label={t("resources.inspector.activeSection")}
				className="flex flex-col gap-2"
			>
				<div className="flex items-center gap-4 text-text-subtle">
					<h4 className="tr-text-metadata">{t("resources.inspector.activeSection")}</h4>
					<span className="tr-text-metadata">· {live.length}</span>
					<span className="flex-1" />
					{props.subagents.length > 0 ? (
						<IconButton
							variant="ghost"
							size="s"
							icon={RiStopFill}
							data-testid="resources-stop-all"
							wrapTrigger
							label={
								props.actions.all?.pending
									? t("resources.inspector.stoppingAll")
									: t("resources.inspector.stopAll")
							}
							disabled={stopAllBusy}
							onClick={() => setStopAllOpen(true)}
							tone="danger"
						/>
					) : null}
				</div>
				{live.length === 0 ? (
					<p className="py-2 text-text-muted tr-text-metadata">
						{t("resources.inspector.activeEmpty")}
					</p>
				) : (
					<ul className="flex flex-col gap-2">{rows(live)}</ul>
				)}
			</section>

			<section
				data-testid="resources-finished"
				aria-label={t("resources.inspector.finishedSection")}
				className="flex flex-col gap-2"
			>
				<button
					type="button"
					data-testid="resources-finished-toggle"
					aria-expanded={finishedOpen}
					onClick={() => setFinishedOpen(!finishedOpen)}
					className="-mx-4 flex h-24 items-center gap-4 rounded-sm px-4 text-left text-text-subtle outline-none transition-colors hover:bg-control-bg-hovered hover:text-text-default focus-visible:ring-1 focus-visible:ring-focus-ring"
				>
					<span className="tr-text-metadata">{t("resources.inspector.finishedSection")}</span>
					<span className="tr-text-metadata">· {settled.length}</span>
					<RiArrowDownSLine
						aria-hidden="true"
						className={cn(
							"size-14 shrink-0 transition-transform motion-reduce:transition-none",
							!finishedOpen && "-rotate-90",
						)}
					/>
				</button>
				{finishedOpen ? (
					settled.length === 0 ? (
						<p className="py-2 text-text-muted tr-text-metadata">
							{t("resources.inspector.finishedEmpty")}
						</p>
					) : (
						<ul className="flex flex-col gap-2">{rows(settled)}</ul>
					)
				) : null}
			</section>

			<Dialog open={stopAllOpen} onOpenChange={setStopAllOpen}>
				<DialogContent>
					<DialogTitle>{t("chat.view.stopAllTitle")}</DialogTitle>
					<DialogDescription>
						{t("chat.view.stopAllDescription", { count: props.subagents.length })}
					</DialogDescription>
					<DialogFooter>
						<Button variant="ghost" onClick={() => setStopAllOpen(false)}>
							{t("common.cancel")}
						</Button>
						<Button
							data-testid="resources-stop-all-confirm"
							disabled={stopAllBusy || props.subagents.length === 0}
							onClick={() => {
								props.onStopAll();
								setStopAllOpen(false);
							}}
						>
							{t("chat.view.stopAllConfirm", { count: props.subagents.length })}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
