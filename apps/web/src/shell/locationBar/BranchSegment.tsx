import {
	RiArrowDownLine as ArrowDown,
	RiArrowUpLine as ArrowUp,
	RiCheckLine as Check,
	RiCloseCircleFill as CloseCircle,
	RiFileCopyLine as Copy,
	RiExternalLinkLine as ExternalLink,
	RiGitBranchLine as GitBranch,
	RiLoader4Line as Loader,
} from "@remixicon/react";
import type { OpenBranchReview, ReviewChecks, Workspace } from "@thinkrail/contracts";
import { type Translator, useT } from "@thinkrail/locales/react";
import { IconButton } from "@thinkrail/ui/button";
import { IconTooltip } from "@thinkrail/ui/tooltip";
import { cn } from "@thinkrail/ui/utils";
import { copyText } from "../../lib";
import { BranchPicker } from "../../panels/BranchPicker";
import { useBranchList } from "../../panels/branches";
import type { BranchFacts } from "../../panels/branchStatusState";
import { isOpenBranchReview } from "../../panels/useBranchStatus";
import { isUserOwnedWorkspace, selectDiffBaseRef, toast, useAppStore } from "../../store";
import { errorText, getTransport } from "../../transport";
import {
	checksSummary,
	checksVerdict,
	remoteCounts,
	reviewChipLabel,
	reviewSummary,
	reviewTone,
} from "./locationModel";
import { chipClass, DetailRow } from "./Segment";

interface RemoteSummary {
	text: string;
	diverges: boolean;
}

function countsSummary(t: Translator, ahead: number, behind: number): RemoteSummary {
	const parts = [
		ahead > 0 ? t("shell.location.remote.unpushedCommits", { count: ahead }) : null,
		behind > 0 ? t("shell.location.remote.behindCommits", { count: behind }) : null,
	].filter(Boolean);
	return parts.length > 0
		? { text: parts.join(" · "), diverges: true }
		: { text: t("shell.location.remote.inSync"), diverges: false };
}

export function BranchSegment({
	workspace,
	review,
	reviewDetailsKnown,
	status,
	active = true,
}: {
	workspace: Workspace;
	review: OpenBranchReview | null;
	reviewDetailsKnown: boolean;
	status: BranchFacts | null;
	/** The details card is open; the branch list is only fetched then. */
	active?: boolean;
}) {
	const t = useT();
	const diffBase = useAppStore((s) => selectDiffBaseRef(s, workspace.id));
	const { branches, refreshing, refresh } = useBranchList(active ? workspace.projectId : null);
	const userOwned = isUserOwnedWorkspace(workspace);
	const remoteStatus = status ? null : remoteCounts(review, reviewDetailsKnown);
	const remote = remoteStatus === "unknown" ? null : remoteStatus;
	const openDetails = review && isOpenBranchReview(review) ? review.details : undefined;
	const decision = openDetails ? reviewSummary(t, openDetails) : null;
	const summary = status
		? null
		: review && isOpenBranchReview(review) && remoteStatus !== "unknown"
			? countsSummary(t, remote?.unpushed ?? 0, remote?.behind ?? 0)
			: null;

	const copyBranch = () => {
		void copyText(workspace.branch).then((ok) => {
			if (ok) toast.success(t("shell.location.branch.copied", { branch: workspace.branch }));
			else toast.error(t("shell.location.branch.clipboardFailed"));
		});
	};
	const pointDiffBaseAt = async (ref: string) => {
		try {
			await getTransport().request("workspace.setDiffBase", { id: workspace.id, ref });
		} catch (error) {
			toast.error(t("shell.location.branch.compareFailed", { error: errorText(error) }));
		}
	};

	return (
		<>
			<DetailRow
				testid="scope-branch-segment"
				caption={t("shell.location.branch.caption")}
				trailing={
					<IconButton
						variant="ghost"
						size="m"
						icon={Copy}
						label={t("shell.location.branch.copyName")}
						data-testid="scope-branch-copy"
						className="shrink-0"
						onClick={copyBranch}
					/>
				}
			>
				<GitBranch aria-hidden="true" className="size-14 shrink-0 text-text-muted" />
				<span data-testid="scope-branch" className="truncate tr-code-text">
					{workspace.branch}
				</span>
			</DetailRow>
			{userOwned ? null : (
				<DetailRow caption={t("shell.location.branch.basedOn")}>
					<span data-testid="scope-base" className="truncate tr-code-text">
						{workspace.baseBranch}
					</span>
				</DetailRow>
			)}
			<DetailRow caption={t("shell.location.branch.compareTo")}>
				<div className="-ml-8 flex min-w-0 -translate-x-px">
					<BranchPicker
						branches={branches}
						selected={diffBase}
						refreshing={refreshing}
						label=""
						testid="scope-diff-base"
						onSelect={(ref) => void pointDiffBaseAt(ref)}
						onRefresh={refresh}
					/>
				</div>
			</DetailRow>
			{remote ? (
				<DetailRow testid="scope-remote-segment" caption={t("shell.location.remote.caption")}>
					{remote.unpushed > 0 ? (
						<span data-testid="scope-remote-unpushed" className={chipClass("warning")}>
							<ArrowUp aria-hidden="true" />
							{t("shell.location.remote.unpushedChip", { count: remote.unpushed })}
						</span>
					) : null}
					{remote.behind > 0 ? (
						<span data-testid="scope-remote-behind" className={chipClass("info")}>
							<ArrowDown aria-hidden="true" />
							{t("shell.location.remote.behindChip", { count: remote.behind })}
						</span>
					) : null}
				</DetailRow>
			) : null}
			{summary ? (
				<DetailRow caption={t("shell.location.remote.caption")}>
					<span
						data-testid="scope-remote-summary"
						className={cn(
							summary.diverges ? "text-text-default" : "text-text-muted",
							"truncate tr-text-ui",
						)}
					>
						{summary.text}
					</span>
				</DetailRow>
			) : null}
			{openDetails?.checks ? (
				<DetailRow caption={t("shell.location.review.checksCaption")}>
					<ChecksGlyph checks={openDetails.checks} />
					<span data-testid="scope-review-checks" className="truncate">
						{checksSummary(t, openDetails.checks)}
					</span>
				</DetailRow>
			) : null}
			{decision ? (
				<DetailRow caption={t("shell.location.review.decisionCaption")}>
					<span
						data-testid="scope-review-decision"
						data-tone={decision.tone}
						className={cn(
							"truncate",
							decision.tone === "success"
								? "text-feedback-success"
								: decision.tone === "warning"
									? "text-feedback-warning"
									: "text-text-muted",
						)}
					>
						{decision.text}
					</span>
				</DetailRow>
			) : null}
		</>
	);
}

function ChecksGlyph({ checks }: { checks: ReviewChecks }) {
	switch (checksVerdict(checks)) {
		case "failing":
			return <CloseCircle aria-hidden="true" className="size-12 shrink-0 text-feedback-error" />;
		case "pending":
			return (
				<Loader aria-hidden="true" className="size-12 shrink-0 animate-spin text-text-muted" />
			);
		case "passing":
			return <Check aria-hidden="true" className="size-12 shrink-0 text-feedback-success" />;
	}
}

export function ReviewChip({ review }: { review: OpenBranchReview }) {
	const t = useT();
	const label = reviewChipLabel(t, review);
	const tone = reviewTone(review);
	const checks = isOpenBranchReview(review) ? review.details?.checks : undefined;
	const checksText = checks ? checksSummary(t, checks) : null;
	const chip = (
		<>
			<span aria-hidden="true" className="size-6 shrink-0 rounded-full bg-current" />
			{label}
			{checks ? (
				<span data-testid="scope-review-checks-glyph" data-verdict={checksVerdict(checks)}>
					<ChecksGlyph checks={checks} />
				</span>
			) : review.url ? (
				<ExternalLink aria-hidden="true" />
			) : null}
		</>
	);
	const described = checksText ? `${label} · ${checksText}` : label;
	const element = review.url ? (
		<a
			data-testid="scope-review"
			data-kind={review.kind}
			href={review.url}
			target="_blank"
			rel="noreferrer"
			aria-label={t("shell.location.review.openLink", { label: described })}
			data-state-tone={tone}
			className={chipClass(tone, true)}
		>
			{chip}
		</a>
	) : (
		<span
			data-testid="scope-review"
			data-kind={review.kind}
			data-state-tone={tone}
			className={chipClass(tone)}
		>
			{chip}
			{checksText ? <span className="sr-only">{checksText}</span> : null}
		</span>
	);
	return checksText ? <IconTooltip label={checksText}>{element}</IconTooltip> : element;
}

export function ReviewSegment({ review }: { review: OpenBranchReview }) {
	const t = useT();
	return (
		<DetailRow
			testid="scope-review-segment"
			caption={
				review.kind === "pull-request"
					? t("shell.location.review.pullRequest")
					: t("shell.location.review.mergeRequest")
			}
		>
			<ReviewChip review={review} />
		</DetailRow>
	);
}
