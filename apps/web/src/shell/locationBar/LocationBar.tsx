import { RiInformationLine } from "@remixicon/react";
import type { OpenBranchReview, Project, Workspace } from "@thinkrail/contracts";
import { useT } from "@thinkrail/locales/react";
import { buttonVariants } from "@thinkrail/ui/button";
import { IconTooltip } from "@thinkrail/ui/tooltip";
import { cn } from "@thinkrail/ui/utils";
import { useEffect, useRef, useState } from "react";
import { useNow } from "../../components/useNow";
import type { BranchFacts } from "../../panels/branchStatusState";
import { resolveBranchReview } from "../../panels/useBranchStatus";
import { useAppStore } from "../../store";
import { BranchSegment } from "./BranchSegment";
import { ProjectSegment } from "./ProjectSegment";
import { ShipStrip } from "./ShipSegments";
import { useActiveWorkspaceSettled, WorkspaceSegment } from "./WorkspaceSegment";

type LocationProps = {
	/** The details card is open (drives lazy data in its sections). */
	active?: boolean;
	placement?: "header" | "tabs";
	project: Project;
	workspace: Workspace | null;
	review: OpenBranchReview | null;
	branchStatus: BranchFacts | null;
	noteOpenReview: (review: OpenBranchReview, url?: string) => void;
	refreshBranchStatus: () => void;
	onNewWorkspace: () => void;
};

export function LocationDetails({
	project,
	workspace,
	review,
	branchStatus,
	noteOpenReview,
	refreshBranchStatus,
	active,
}: LocationProps) {
	const workspaceSettlingSupported = useAppStore((state) => state.workspaceSettlingSupported);
	const now = useNow();
	const settled = useActiveWorkspaceSettled(workspace, now);
	const resolvedReview = resolveBranchReview(review, workspace?.review, workspaceSettlingSupported);
	const shownReview = resolvedReview.review;
	return (
		<div
			data-testid="workspace-details"
			data-context={workspace ? "workspace" : "project-home"}
			className="flex min-w-0 flex-col divide-y divide-border-muted py-4"
		>
			<ProjectSegment project={project} atHome={workspace === null} />
			{workspace ? (
				<BranchSegment
					workspace={workspace}
					review={shownReview}
					reviewDetailsKnown={resolvedReview.detailsKnown}
					status={branchStatus}
					{...(active !== undefined ? { active } : {})}
				/>
			) : null}
			{workspace ? (
				<ShipStrip
					key={workspace.id}
					workspace={workspace}
					status={branchStatus}
					review={shownReview}
					settled={settled}
					noteOpenReview={noteOpenReview}
					refresh={refreshBranchStatus}
				/>
			) : null}
		</div>
	);
}

export function LocationBar(props: LocationProps) {
	const t = useT();
	const now = useNow();
	const settled = useActiveWorkspaceSettled(props.workspace, now);
	const details = useRef<HTMLDetailsElement>(null);
	const [open, setOpen] = useState(false);
	const panelRef = useRef<HTMLElement>(null);
	const hasWorkspace = props.workspace !== null;
	useEffect(() => {
		const root = details.current;
		const panel = panelRef.current;
		if (!root || !panel) return;
		const position = () => {
			if (!root.open) {
				delete panel.dataset.positioned;
				return;
			}
			const trigger = root.getBoundingClientRect();
			const gap = Number.parseFloat(getComputedStyle(panel).getPropertyValue("--space-8"));
			const width = panel.getBoundingClientRect().width;
			const left = Math.max(gap, Math.min(trigger.left, window.innerWidth - width - gap));
			const top = Math.min(trigger.bottom + gap, window.innerHeight - gap);
			panel.style.setProperty("--workspace-details-left", `${left}px`);
			panel.style.setProperty("--workspace-details-top", `${top}px`);
			panel.style.setProperty(
				"--workspace-details-max-height",
				`${Math.max(0, window.innerHeight - top - gap)}px`,
			);
			panel.dataset.positioned = "true";
		};
		const resize = new ResizeObserver(position);
		resize.observe(panel);
		if (root.previousElementSibling) resize.observe(root.previousElementSibling);
		for (let ancestor: HTMLElement | null = root; ancestor; ancestor = ancestor.parentElement)
			resize.observe(ancestor);
		const track = () => setOpen(root.open);
		root.addEventListener("toggle", position);
		root.addEventListener("toggle", track);
		window.addEventListener("resize", position);
		window.addEventListener("scroll", position, true);
		position();
		const dismiss = (event: PointerEvent) => {
			const panel = details.current;
			const target = event.target;
			if (!panel?.open || !(target instanceof Element) || panel.contains(target)) return;
			if (target.closest('[role="dialog"], [role="menu"], [data-radix-popper-content-wrapper]'))
				return;
			panel.open = false;
		};
		document.addEventListener("pointerdown", dismiss);
		return () => {
			document.removeEventListener("pointerdown", dismiss);
			root.removeEventListener("toggle", position);
			root.removeEventListener("toggle", track);
			window.removeEventListener("resize", position);
			window.removeEventListener("scroll", position, true);
			resize.disconnect();
		};
	}, [hasWorkspace]);
	return (
		<div
			data-testid="scope-context"
			data-context={props.workspace ? "workspace" : "project-home"}
			className={cn(
				"window-no-drag flex min-w-0 items-center",
				props.placement === "tabs" ? "shrink-0 gap-4" : "flex-1 gap-8",
			)}
		>
			<WorkspaceSegment
				project={props.project}
				workspace={props.workspace}
				activeSettled={settled}
				now={now}
				onNewWorkspace={props.onNewWorkspace}
			/>
			{hasWorkspace ? (
				<details
					ref={details}
					className="group/environment shrink-0"
					onKeyDown={(event) => {
						if (event.key !== "Escape" || event.defaultPrevented || !event.currentTarget.open)
							return;
						event.preventDefault();
						event.currentTarget.open = false;
						event.currentTarget.querySelector("summary")?.focus();
					}}
				>
					<IconTooltip label={t("shell.workspaceDetails")}>
						<summary
							aria-label={t("shell.workspaceDetails")}
							data-testid="open-workspace-details"
							className={`${buttonVariants({ variant: "ghost", size: "m", shape: "icon" })} list-none cursor-pointer [&::-webkit-details-marker]:hidden group-open/environment:bg-control-bg-selected`}
						>
							<RiInformationLine className="size-16" />
						</summary>
					</IconTooltip>
					<section
						ref={panelRef}
						aria-label={t("shell.workspaceDetails")}
						className="window-no-drag invisible fixed top-[var(--workspace-details-top)] left-[var(--workspace-details-left)] z-40 max-h-[var(--workspace-details-max-height)] w-384 max-w-[calc(100vw-2*var(--space-8))] overflow-y-auto rounded-lg border border-border-default bg-container-elevated-bg text-text-default shadow-[var(--shadow-md)] data-[positioned=true]:visible"
					>
						<LocationDetails {...props} active={open} />
					</section>
				</details>
			) : null}
		</div>
	);
}
