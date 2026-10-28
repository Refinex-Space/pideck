import type { MessageKey } from "@thinkrail/locales";
import { useT } from "@thinkrail/locales/react";
import { buttonDataAttributes, buttonVariants } from "@thinkrail/ui/button";
import { IconTooltip } from "@thinkrail/ui/tooltip";
import { cn } from "@thinkrail/ui/utils";
import { Fragment, forwardRef, type ReactNode, useRef, useState } from "react";
import {
	type AuxiliaryRailEntry,
	type AuxiliaryRailToolEntry,
	clusterAuxiliaryRail,
} from "./auxiliaryPresentation";
import { layoutTabName, toolTab } from "./model";
import { tabIcon } from "./tabIcon";
import type { LayoutAuxiliaryRegion } from "./types";

export interface AuxiliaryRailControlProps {
	tabIndex: number;
	onFocus: () => void;
}

const RAIL_TOOLBAR_LABELS = {
	left: "workbench.rail.leftTools",
	right: "workbench.rail.rightTools",
	bottom: "workbench.rail.bottomTools",
} as const satisfies Record<LayoutAuxiliaryRegion, MessageKey>;

export const RAIL_ENTRY_FRAME_CLASS =
	"relative flex h-32 w-32 shrink-0 items-center justify-center";

export const RAIL_ENTRY_BUTTON_CLASS = cn(
	buttonVariants({ variant: "ghost", size: "m", shape: "icon" }),
	"data-[layout-focus-intent=keyboard]:focus:ring-1 data-[layout-focus-intent=restore]:focus-visible:ring-0 data-[layout-focus-intent=restore]:focus-visible:outline-none",
);

export function railEntryButtonProps(active: boolean) {
	return buttonDataAttributes({ variant: "ghost", size: "m", iconOnly: true, selected: active });
}

export const RAIL_ICON = "size-16 shrink-0";

export function railTooltipSide(region: LayoutAuxiliaryRegion | "center"): "right" | "bottom" {
	return region === "left" ? "right" : "bottom";
}

export const AuxiliaryRailToolButton = forwardRef<
	HTMLButtonElement,
	{
		entry: AuxiliaryRailToolEntry;
		controls: string;
		control: AuxiliaryRailControlProps;
		onActivate: () => void;
	}
>(function AuxiliaryRailToolButton({ entry, controls, control, onActivate }, ref) {
	const t = useT();
	const { region } = entry;
	const active = entry.selected && entry.expanded;
	const tab = toolTab(entry.tool);
	const name = layoutTabName(t, tab);
	return (
		<div data-active={active} className={RAIL_ENTRY_FRAME_CLASS}>
			<IconTooltip label={name} side={railTooltipSide(region)}>
				<button
					ref={ref}
					type="button"
					data-testid={`tool-rail-${entry.tool}`}
					data-rail-entry={entry.key}
					aria-label={name}
					aria-pressed={active}
					aria-controls={controls}
					{...railEntryButtonProps(active)}
					{...control}
					onClick={onActivate}
					className={RAIL_ENTRY_BUTTON_CLASS}
				>
					{tabIcon(tab, active, RAIL_ICON)}
				</button>
			</IconTooltip>
		</div>
	);
});

export function AuxiliaryRail({
	region,
	entries,
	renderEntry,
	renderBoundary,
	trailing,
	orientation,
}: {
	region: LayoutAuxiliaryRegion;
	orientation?: "horizontal" | "vertical";
	entries: readonly AuxiliaryRailEntry[];
	renderEntry: (entry: AuxiliaryRailEntry, control: AuxiliaryRailControlProps) => ReactNode;
	renderBoundary?: (paneIndex: number) => ReactNode;
	trailing?: ReactNode;
}) {
	const t = useT();
	const root = useRef<HTMLDivElement>(null);
	const [focused, setFocused] = useState<string | null>(null);
	const activeKey = entries.some((entry) => entry.key === focused)
		? focused
		: (entries.find((entry) => entry.selected && entry.expanded) ?? entries[0])?.key;
	const horizontal = orientation ? orientation === "horizontal" : region === "bottom";
	const clusters = clusterAuxiliaryRail(entries);
	const paneCount = clusters.filter((cluster) => cluster.groupId !== null).length;
	const boundary = (paneIndex: number): ReactNode => {
		const zone = renderBoundary?.(paneIndex);
		return zone ? (
			<div className={cn("relative shrink-0", horizontal ? "h-32 w-0" : "h-0 w-32")}>{zone}</div>
		) : null;
	};
	return (
		<div
			ref={root}
			role="toolbar"
			aria-label={t(RAIL_TOOLBAR_LABELS[region])}
			aria-orientation={horizontal ? "horizontal" : "vertical"}
			data-testid={region === "bottom" ? "bottom-tool-rail" : `${region}-layout-rail`}
			className={cn(
				"relative flex shrink-0 items-center gap-4",
				horizontal
					? "window-no-drag h-32 min-w-0 overflow-x-auto overflow-y-hidden"
					: "h-full w-40 flex-col overflow-x-hidden overflow-y-auto py-4",
				(!horizontal || region === "left") && "bg-container-sidebar-bg",
			)}
			onKeyDown={(event) => {
				if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
				if (!(event.target instanceof HTMLElement) || !root.current?.contains(event.target)) return;
				const current = event.target.closest<HTMLButtonElement>("[data-rail-entry]");
				if (!current) return;
				const controls = Array.from(
					root.current.querySelectorAll<HTMLButtonElement>("[data-rail-entry]"),
				);
				const index = controls.indexOf(current);
				const nextKey = horizontal ? "ArrowRight" : "ArrowDown";
				const previousKey = horizontal ? "ArrowLeft" : "ArrowUp";
				const next =
					event.key === "Home"
						? 0
						: event.key === "End"
							? controls.length - 1
							: event.key === nextKey
								? (index + 1) % controls.length
								: event.key === previousKey
									? (index - 1 + controls.length) % controls.length
									: null;
				if (next === null) return;
				event.preventDefault();
				controls[next]?.focus();
				controls[next]?.scrollIntoView({ block: "nearest", inline: "nearest" });
			}}
		>
			{clusters.map((cluster, clusterIndex) => (
				<Fragment key={cluster.key}>
					{cluster.groupId !== null ? boundary(clusterIndex) : null}
					{clusterIndex > 0 ? (
						<hr
							aria-orientation={horizontal ? "vertical" : "horizontal"}
							data-testid="rail-separator"
							className={cn(
								"shrink-0 border-0 bg-border-muted",
								horizontal ? "mx-2 h-20 w-px" : "my-2 h-px w-20",
							)}
						/>
					) : null}
					{cluster.entries.map((entry) => (
						<div key={entry.key} className="relative flex shrink-0 items-center justify-center">
							{renderEntry(entry, {
								tabIndex: entry.key === activeKey ? 0 : -1,
								onFocus: () => setFocused(entry.key),
							})}
						</div>
					))}
					{clusterIndex === paneCount - 1 ? boundary(paneCount) : null}
				</Fragment>
			))}
			{paneCount === 0 ? boundary(0) : null}
			{trailing}
		</div>
	);
}
