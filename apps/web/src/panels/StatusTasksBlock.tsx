import { useT } from "@thinkrail/locales/react";
import { useOptionalChatResources } from "../chat/ChatResourcesScope";
import { ResourcesRoster } from "../chat/resources";

/** Running and finished background commands and subagents of the chat beside the dock. */
export function StatusTasksBlock() {
	const t = useT();
	const scope = useOptionalChatResources();
	if (!scope?.resources.visible) {
		return (
			<p data-testid="status-tasks-empty" className="text-text-muted tr-text-metadata">
				{scope ? t("status.tasks.unavailable") : t("resources.inspector.activeEmpty")}
			</p>
		);
	}
	const { resources, now, openDetail } = scope;
	return (
		<ResourcesRoster
			{...resources.groups}
			now={now}
			authoritative={resources.authoritative}
			loading={resources.loading}
			stale={resources.stale}
			error={resources.projection?.error ?? null}
			actions={resources.actions}
			onInspect={openDetail}
			onRetry={resources.retry}
			onStopCommand={resources.stopCommand}
			onStopSubagent={resources.stopSubagent}
			onStopAll={resources.stopAll}
		/>
	);
}
