import {
	RiGitBranchLine as GitBranch,
	RiLoader4Line as Loader,
	RiChatNewLine as MessageSquarePlus,
} from "@remixicon/react";
import type { Workspace } from "@thinkrail/contracts";
import { useT } from "@thinkrail/locales/react";
import { cn } from "@thinkrail/ui/utils";

export type WorkspaceReadyKind = "default" | "external" | "worktree";

/** The empty center of a workspace: where it is, and a single card that starts its first chat. */
export function WorkspaceReady({
	kind,
	workspace,
	title,
	starting,
	onStart,
}: {
	kind: WorkspaceReadyKind;
	workspace: Workspace | null;
	title: string;
	starting: boolean;
	onStart: () => void;
}) {
	const t = useT();
	const eyebrow =
		kind === "default"
			? t("shell.workbench.ready.defaultEyebrow")
			: kind === "external"
				? t("shell.workbench.ready.externalEyebrow")
				: t("shell.workbench.ready.worktreeEyebrow");
	const description =
		kind === "default"
			? t("shell.workbench.ready.defaultDescription")
			: t("shell.workbench.ready.worktreeDescription");
	const Icon = starting ? Loader : MessageSquarePlus;
	return (
		<div
			data-testid="workspace-ready"
			className="flex h-full min-h-0 flex-col items-center justify-center overflow-auto px-24 py-24 text-center"
		>
			<span className="tr-text-eyebrow text-text-muted">{eyebrow}</span>
			{workspace ? (
				<>
					<h2 className="mt-8 max-w-[640px] break-words tr-brand-hero text-text-default">
						{title}
					</h2>
					<p className="mt-8 flex max-w-full items-center gap-4 tr-text-metadata text-text-muted">
						<GitBranch aria-hidden className="size-14 shrink-0" />
						{kind === "worktree" ? (
							<>
								<span className="truncate">{workspace.branch}</span>
								<span className="shrink-0">
									{t("shell.workbench.ready.fromBase", { base: workspace.baseBranch })}
								</span>
							</>
						) : (
							<span className="truncate">
								{t("shell.workbench.ready.onBranch", { branch: workspace.branch })}
							</span>
						)}
					</p>
				</>
			) : null}
			<div className="mt-24 flex w-full max-w-[560px] flex-col gap-4 text-left">
				<button
					type="button"
					data-testid="start-chat"
					data-starting={starting || undefined}
					disabled={starting}
					onClick={onStart}
					className="relative flex min-h-64 w-full items-start gap-12 rounded-lg border border-transparent bg-clip-padding bg-control-bg-selected px-16 py-12 text-left outline-none transition-colors hover:bg-control-bg-hovered focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:cursor-progress"
				>
					<Icon
						aria-hidden
						className={cn(
							"mt-2 size-20 shrink-0 text-text-default",
							starting && "animate-spin motion-reduce:animate-none",
						)}
					/>
					<span className="min-w-0 flex-1">
						<span className="block tr-text-emphasis text-text-default">
							{starting
								? t("shell.workbench.ready.startingChat")
								: t("shell.workbench.ready.newChat")}
						</span>
						<span className="mt-2 block text-text-muted tr-text-metadata leading-snug">
							{description}
						</span>
					</span>
				</button>
			</div>
		</div>
	);
}
