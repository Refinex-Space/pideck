import type { GitStatus } from "@thinkrail/contracts";
import { useT } from "@thinkrail/locales/react";
import { Button } from "@thinkrail/ui/button";
import { selectDiffScope, useAppStore } from "../store";
import { DiffStatBadge } from "./DiffStatBadge";
import { openChangesTab } from "./openTabs";
import { summarizeChanges } from "./statusModel";
import { useGitStatus } from "./useGitStatus";

export function ChangesBlockView({
	status,
	error,
	onReview,
}: {
	status: GitStatus | null;
	error: string | null;
	onReview: () => void;
}) {
	const t = useT();
	if (!status) {
		return (
			<p data-testid="status-changes-state" className="text-text-muted tr-text-metadata">
				{error ? t("status.changes.unavailable") : t("status.changes.loading")}
			</p>
		);
	}
	const summary = summarizeChanges(status.changes);
	if (summary.files === 0) {
		return (
			<p data-testid="status-changes-state" className="text-text-muted tr-text-metadata">
				{t("status.changes.empty")}
			</p>
		);
	}
	return (
		<div className="flex items-center justify-between gap-8">
			<div className="flex min-w-0 flex-col gap-2">
				<span data-testid="status-changes-count" className="truncate tr-text-ui text-text-default">
					{t("status.changes.files", { count: summary.files })}
				</span>
				<DiffStatBadge added={summary.added} removed={summary.removed} />
			</div>
			<Button
				variant="outline"
				size="m"
				data-testid="status-changes-review"
				className="shrink-0"
				onClick={onReview}
			>
				{t("status.changes.review")}
			</Button>
		</div>
	);
}

export function StatusChangesBlock({ workspaceId }: { workspaceId: string }) {
	const { status, error } = useGitStatus(workspaceId);
	const review = () => {
		const scope = selectDiffScope(useAppStore.getState(), workspaceId);
		void openChangesTab(workspaceId, scope, {}, "keep");
	};
	return <ChangesBlockView status={status} error={error} onReview={review} />;
}
