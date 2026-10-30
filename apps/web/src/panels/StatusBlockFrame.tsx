import { useT } from "@thinkrail/locales/react";
import { IconButton } from "@thinkrail/ui/button";
import { cn } from "@thinkrail/ui/utils";
import { ChevronDown, GripVertical } from "lucide-react";
import type { KeyboardEvent, PointerEvent, ReactNode } from "react";
import type { StatusBlockId } from "./statusBlocks";

interface HandleProps {
	onPointerDown: (event: PointerEvent<HTMLElement>) => void;
	onPointerMove: (event: PointerEvent<HTMLElement>) => void;
	onPointerUp: () => void;
	onPointerCancel: () => void;
	onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}

/**
 * One hairline-bordered block of the Status tool: a fold toggle titled by the block, and a grip that
 * appears on hover or focus for reordering. The body stays mounted while folded (`hidden`), so a draft
 * or a pending confirmation inside it survives.
 */
export function StatusBlockFrame({
	id,
	title,
	collapsed,
	dragging,
	stepping,
	shift,
	flush = false,
	handle,
	onToggle,
	children,
}: {
	id: StatusBlockId;
	title: string;
	collapsed: boolean;
	dragging: boolean;
	/** Another block is being dragged: this one animates when it steps aside. */
	stepping: boolean;
	shift: "up" | "down" | undefined;
	/** The body brings its own horizontal padding (hairline rows that run edge to edge). */
	flush?: boolean;
	handle: HandleProps;
	onToggle: () => void;
	children: ReactNode;
}) {
	const t = useT();
	const titleId = `status-block-title-${id}`;
	const bodyId = `status-block-body-${id}`;
	return (
		<section
			data-testid={`status-block-${id}`}
			data-block-id={id}
			data-collapsed={collapsed || undefined}
			data-dragging={dragging || undefined}
			data-shift={shift}
			aria-labelledby={titleId}
			className={cn(
				"group/block relative min-w-0 translate-y-[var(--status-drag-y,0px)] rounded-lg border border-border-muted bg-container-workspace-bg data-[shift=down]:translate-y-[var(--status-shift)] data-[shift=up]:-translate-y-[var(--status-shift)]",
				"data-[dragging=true]:z-10 data-[dragging=true]:border-border-default data-[dragging=true]:bg-container-elevated-bg data-[dragging=true]:shadow-[var(--shadow-md)]",
				stepping && "motion-safe:transition-transform motion-safe:duration-150",
			)}
		>
			<div className="flex h-32 items-center gap-4 pr-4 pl-12">
				<button
					type="button"
					id={titleId}
					data-testid={`status-block-toggle-${id}`}
					aria-expanded={!collapsed}
					aria-controls={bodyId}
					aria-label={t(collapsed ? "status.block.expand" : "status.block.collapse", {
						block: title,
					})}
					onClick={onToggle}
					className="-ml-4 flex h-24 min-w-0 items-center gap-4 rounded-sm px-4 text-text-default outline-none transition-colors hover:bg-control-bg-hovered focus-visible:ring-1 focus-visible:ring-focus-ring"
				>
					<span className="truncate tr-text-emphasis">{title}</span>
					<ChevronDown
						aria-hidden="true"
						className={cn(
							"size-14 shrink-0 text-text-subtle transition-transform motion-reduce:transition-none",
							collapsed && "-rotate-90",
						)}
					/>
				</button>
				<span className="flex-1" />
				<IconButton
					icon={GripVertical}
					size="s"
					label={t("status.block.reorder", { block: title })}
					tooltip={t("status.block.reorderHint")}
					data-testid={`status-block-handle-${id}`}
					{...handle}
					className={cn(
						"cursor-grab touch-none opacity-0 focus-visible:opacity-100 active:cursor-grabbing group-focus-within/block:opacity-100 group-hover/block:opacity-100",
						dragging && "cursor-grabbing opacity-100",
					)}
				/>
			</div>
			<div id={bodyId} data-testid={`status-block-body-${id}`} hidden={collapsed}>
				<div className={flush ? "pb-4" : "px-12 pb-12"}>{children}</div>
			</div>
		</section>
	);
}
