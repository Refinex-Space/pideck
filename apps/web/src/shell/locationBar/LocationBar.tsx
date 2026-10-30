import type { OpenBranchReview, Project, Workspace } from "@thinkrail/contracts";
import { useT } from "@thinkrail/locales/react";
import { IconButton } from "@thinkrail/ui/button";
import { cn } from "@thinkrail/ui/utils";
import { LayoutList } from "lucide-react";
import { useNow } from "../../components/useNow";
import type { BranchFacts } from "../../panels/branchStatusState";
import { useStatusBlocks } from "../../panels/statusBlocks";
import { resolveBranchReview } from "../../panels/useBranchStatus";
import {
	isDefaultWorkspace,
	selectChatResourceGroups,
	selectChatResourceProjection,
	selectRailPlanSessionId,
	useAppStore,
} from "../../store";
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

export type LocationDetailsProps = Pick<
	LocationProps,
	"project" | "workspace" | "review" | "branchStatus" | "noteOpenReview" | "refreshBranchStatus"
> & {
	/** The details are on screen (drives lazy data in their sections). */
	active?: boolean;
};

/** The project / branch / remote / review rows; the Status tool's Environment block renders them. */
export function LocationDetails({
	project,
	workspace,
	review,
	branchStatus,
	noteOpenReview,
	refreshBranchStatus,
	active,
}: LocationDetailsProps) {
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

/** Opens and closes the status dock beside the chat; it sits where the workspace details control used to. */
function StatusToggle({ workspaceId }: { workspaceId: string }) {
	const t = useT();
	const { layout, toggleOpen } = useStatusBlocks();
	const sessionId = useAppStore((state) => selectRailPlanSessionId(state, workspaceId));
	const snapshot = useAppStore((state) =>
		sessionId ? selectChatResourceProjection(state, { workspaceId, sessionId })?.snapshot : null,
	);
	const { mcpAttentionCount, activeCount } = selectChatResourceGroups(snapshot);
	const signal =
		mcpAttentionCount > 0
			? ({
					kind: "attention",
					text: t("status.signal.attention", { count: mcpAttentionCount }),
				} as const)
			: activeCount > 0
				? ({ kind: "working", text: t("status.signal.working", { count: activeCount }) } as const)
				: null;
	return (
		<span className="relative inline-flex shrink-0">
			<IconButton
				icon={LayoutList}
				label={t("status.panel.label")}
				tooltip={signal ? `${t("status.panel.label")} · ${signal.text}` : t("status.panel.label")}
				tooltipSide="bottom"
				selected={layout.open}
				aria-pressed={layout.open}
				aria-controls="status-dock"
				data-testid="open-status-panel"
				data-signal={signal?.kind}
				className="window-no-drag"
				onClick={toggleOpen}
			/>
			{signal ? (
				<span
					aria-hidden="true"
					className={cn(
						"pointer-events-none absolute top-2 right-2 size-6 rounded-full ring-2 ring-container-content-bg",
						signal.kind === "attention"
							? "bg-feedback-warning"
							: "bg-primary motion-safe:animate-working",
					)}
				/>
			) : null}
		</span>
	);
}

export function LocationBar(props: LocationProps) {
	const now = useNow();
	const settled = useActiveWorkspaceSettled(props.workspace, now);
	return (
		<div
			data-testid="scope-context"
			data-context={props.workspace ? "workspace" : "project-home"}
			className={cn(
				"window-no-drag flex min-w-0 items-center",
				props.placement === "tabs" ? "shrink-0 gap-4" : "flex-1 gap-8",
			)}
		>
			{props.workspace && isDefaultWorkspace(props.workspace) ? null : (
				<WorkspaceSegment
					project={props.project}
					workspace={props.workspace}
					activeSettled={settled}
					now={now}
					onNewWorkspace={props.onNewWorkspace}
				/>
			)}
			{props.workspace ? <StatusToggle workspaceId={props.workspace.id} /> : null}
		</div>
	);
}
