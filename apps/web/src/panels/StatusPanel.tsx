import type { MessageKey } from "@thinkrail/locales";
import { useT } from "@thinkrail/locales/react";
import { type ReactNode, useState } from "react";
import { StatusBlockFrame } from "./StatusBlockFrame";
import { StatusChangesBlock } from "./StatusChangesBlock";
import { StatusConnectorsBlock } from "./StatusConnectorsBlock";
import { StatusContextBlock } from "./StatusContextBlock";
import { StatusLspBlock } from "./StatusLspBlock";
import { StatusTasksBlock } from "./StatusTasksBlock";
import { dragShift, type StatusBlockId, useStatusBlocks } from "./statusBlocks";
import { useStatusReorder } from "./useStatusReorder";

const BLOCK_TITLE: Record<StatusBlockId, MessageKey> = {
	environment: "status.block.environment",
	context: "status.block.context",
	tasks: "status.block.tasks",
	connectors: "status.block.connectors",
	lsp: "status.block.lsp",
	changes: "status.block.changes",
};

/**
 * The status dock's content: one column of hairline blocks the user can fold and reorder, for the chat
 * it sits beside. The shell supplies the Environment block's content (project, branch, remote and
 * review controls), which it owns.
 */
export function StatusPanel({
	workspaceId,
	sessionId,
	environment,
}: {
	workspaceId: string;
	/** The chat beside the dock; null in a pane that shows no chat yet. */
	sessionId: string | null;
	environment: ReactNode;
}) {
	const t = useT();
	const { layout, move, toggle } = useStatusBlocks();
	const [announcement, setAnnouncement] = useState("");
	const { drag, handlers } = useStatusReorder({
		order: layout.order,
		onMove: move,
		onMoved: (id, index) =>
			setAnnouncement(
				t("status.block.moved", {
					block: t(BLOCK_TITLE[id]),
					position: index + 1,
					count: layout.order.length,
				}),
			),
	});

	const bodies: Record<StatusBlockId, ReactNode> = {
		environment,
		context: <StatusContextBlock workspaceId={workspaceId} sessionId={sessionId} />,
		tasks: <StatusTasksBlock />,
		connectors: <StatusConnectorsBlock workspaceId={workspaceId} />,
		lsp: <StatusLspBlock workspaceId={workspaceId} />,
		changes: <StatusChangesBlock workspaceId={workspaceId} />,
	};

	return (
		<section
			data-testid="status-panel"
			aria-label={t("status.panel.label")}
			data-reordering={drag ? true : undefined}
			className="flex flex-col gap-12 data-[reordering=true]:select-none"
		>
			{layout.order.map((id, index) => (
				<StatusBlockFrame
					key={id}
					id={id}
					title={t(BLOCK_TITLE[id])}
					collapsed={layout.collapsed.includes(id)}
					dragging={drag?.id === id}
					stepping={drag !== null && drag.id !== id}
					shift={dragShift(drag, index)}
					flush={id === "environment"}
					handle={handlers(id)}
					onToggle={() => toggle(id)}
				>
					{bodies[id]}
				</StatusBlockFrame>
			))}
			<p role="status" aria-live="polite" className="sr-only">
				{announcement}
			</p>
		</section>
	);
}
