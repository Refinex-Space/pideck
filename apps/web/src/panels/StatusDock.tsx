import { type ReactNode, useEffect, useState } from "react";
import { QuietScrollArea } from "@/components/QuietScrollArea";
import { StatusPanel } from "./StatusPanel";
import { useStatusBlocks } from "./statusBlocks";

const DOCK_TRANSITION_MS = 200;

/** True while `active`, and for `ms` after it turns false, so a closing dock keeps its content as it slides. */
function useLingering(active: boolean, ms: number): boolean {
	const [lingering, setLingering] = useState(active);
	useEffect(() => {
		if (active) {
			setLingering(true);
			return;
		}
		const timer = setTimeout(() => setLingering(false), ms);
		return () => clearTimeout(timer);
	}, [active, ms]);
	return active || lingering;
}

/**
 * A chat with the status dock beside it. The chat stays mounted at the same position in the tree
 * whether the dock is open or not; opening only narrows its column, so the conversation slides left
 * and the blocks take the freed width on the right.
 */
export function StatusDock({
	workspaceId,
	sessionId,
	environment,
	children,
}: {
	workspaceId: string;
	sessionId: string | null;
	environment: ReactNode;
	children: ReactNode;
}) {
	const { layout } = useStatusBlocks();
	const mounted = useLingering(layout.open, DOCK_TRANSITION_MS);
	return (
		<div
			data-testid="status-dock-layout"
			className="@container relative flex h-full min-h-0 min-w-0"
		>
			<div className="h-full min-h-0 min-w-0 flex-1">{children}</div>
			<aside
				id="status-dock"
				data-testid="status-dock"
				data-open={layout.open || undefined}
				inert={!layout.open}
				className="w-0 shrink-0 overflow-hidden bg-container-workspace-bg motion-safe:transition-[width] motion-safe:duration-200 data-[open=true]:w-[min(24rem,45%)] @max-[40rem]:data-[open=true]:absolute @max-[40rem]:data-[open=true]:inset-y-0 @max-[40rem]:data-[open=true]:right-0 @max-[40rem]:data-[open=true]:z-20 @max-[40rem]:data-[open=true]:w-[min(24rem,100%)] @max-[40rem]:data-[open=true]:border-border-muted @max-[40rem]:data-[open=true]:border-l @max-[40rem]:data-[open=true]:shadow-[var(--shadow-md)]"
			>
				{mounted ? (
					<QuietScrollArea className="h-full" viewportClassName="p-12">
						<StatusPanel
							workspaceId={workspaceId}
							sessionId={sessionId}
							environment={environment}
						/>
					</QuietScrollArea>
				) : null}
			</aside>
		</div>
	);
}
