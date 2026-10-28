import { RiInformationLine } from "@remixicon/react";
import type { OpenBranchReview, Project, Workspace } from "@thinkrail/contracts";
import { useT } from "@thinkrail/locales/react";
import { buttonVariants } from "@thinkrail/ui/button";
import { cn } from "@thinkrail/ui/utils";
import { useEffect, useRef } from "react";
import { useNow } from "../../components/useNow";
import type { BranchFacts } from "../../panels/branchStatusState";
import { resolveBranchReview } from "../../panels/useBranchStatus";
import { useAppStore } from "../../store";
import { BranchSegment } from "./BranchSegment";
import { ProjectSegment } from "./ProjectSegment";
import { ShipStrip } from "./ShipSegments";
import { useActiveWorkspaceSettled, WorkspaceSegment } from "./WorkspaceSegment";

type LocationProps = {
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
			className="flex min-w-0 flex-col gap-12 p-12"
		>
			<ProjectSegment project={project} atHome={workspace === null} />
			{workspace ? (
				<BranchSegment
					workspace={workspace}
					review={shownReview}
					reviewDetailsKnown={resolvedReview.detailsKnown}
					status={branchStatus}
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
	useEffect(() => {
		const dismiss = (event: PointerEvent) => {
			const panel = details.current;
			const target = event.target;
			if (!panel?.open || !(target instanceof Element) || panel.contains(target)) return;
			if (target.closest('[role="dialog"], [role="menu"], [data-radix-popper-content-wrapper]'))
				return;
			panel.open = false;
		};
		document.addEventListener("pointerdown", dismiss);
		return () => document.removeEventListener("pointerdown", dismiss);
	}, []);
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
			<details
				ref={details}
				className="group/environment shrink-0"
				onKeyDown={(event) => {
					if (event.key !== "Escape" || event.defaultPrevented || !event.currentTarget.open) return;
					event.preventDefault();
					event.currentTarget.open = false;
					event.currentTarget.querySelector("summary")?.focus();
				}}
			>
				<summary
					aria-label={t("shell.workspaceDetails")}
					data-testid="open-workspace-details"
					className={`${buttonVariants({ variant: "ghost", size: "m", shape: "icon" })} list-none cursor-pointer [&::-webkit-details-marker]:hidden group-open/environment:bg-control-bg-selected`}
				>
					<RiInformationLine className="size-16" />
				</summary>
				<section
					aria-label={t("shell.workspaceDetails")}
					className="absolute top-full right-8 z-40 mt-8 w-full max-w-384 rounded-lg border border-border-default bg-container-elevated-bg text-text-default shadow-[var(--shadow-md)]"
				>
					<LocationDetails {...props} />
				</section>
			</details>
		</div>
	);
}
