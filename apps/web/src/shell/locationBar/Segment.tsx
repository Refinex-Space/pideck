import { RiArrowDownSLine as ChevronDown } from "@remixicon/react";
import { cn } from "@thinkrail/ui/utils";
import type { ReactNode } from "react";

export function Segment({
	caption,
	detail,
	children,
	className,
	testid,
}: {
	caption: ReactNode;
	detail?: ReactNode;
	children: ReactNode;
	className?: string | undefined;
	testid?: string | undefined;
}) {
	return (
		<div data-testid={testid} className={cn("flex min-w-0 items-center gap-4 pl-8", className)}>
			<span className="sr-only">{caption}</span>
			<div className="flex h-24 min-w-0 items-center gap-4">{children}</div>
			{detail ? (
				<span className="flex min-w-0 items-center gap-4 truncate text-text-subtle tr-text-metadata">
					{detail}
				</span>
			) : null}
		</div>
	);
}

export const pillClass =
	"group/pill window-no-drag inline-flex h-24 min-w-0 items-center gap-4 rounded-md px-8 text-text-muted outline-none transition-colors hover:bg-control-bg-hovered hover:text-text-default focus-visible:ring-1 focus-visible:ring-focus-ring data-[state=open]:bg-control-bg-selected data-[state=open]:text-text-default";

export function PillChevron({
	className,
	always = false,
}: {
	className?: string | undefined;
	always?: boolean;
}) {
	return (
		<ChevronDown
			aria-hidden="true"
			className={cn(
				"size-14 shrink-0 text-text-subtle transition-opacity",
				!always &&
					"opacity-0 group-hover/pill:opacity-100 group-focus-visible/pill:opacity-100 group-data-[state=open]/pill:opacity-100",
				className,
			)}
		/>
	);
}

/** One labelled line of the workspace-details card: caption left, value fills, actions trail. */
export function DetailRow({
	caption,
	children,
	trailing,
	className,
	testid,
}: {
	caption: ReactNode;
	children: ReactNode;
	trailing?: ReactNode;
	className?: string | undefined;
	testid?: string | undefined;
}) {
	return (
		<div
			data-testid={testid}
			className={cn("flex min-h-32 items-center gap-8 px-12 py-4", className)}
		>
			<span className="w-[72px] shrink-0 text-text-subtle tr-text-metadata">{caption}</span>
			<div className="flex min-w-0 flex-1 items-center gap-4 tr-text-ui text-text-default">
				{children}
			</div>
			{trailing}
		</div>
	);
}

export type ChipTone = "neutral" | "success" | "warning" | "info";

const CHIP_TONE: Record<ChipTone, { rest: string; hover: string }> = {
	neutral: { rest: "bg-control-bg-selected text-text-muted", hover: "hover:bg-control-bg-hovered" },
	success: {
		rest: "bg-feedback-success-subtle text-feedback-success",
		hover: "hover:bg-feedback-success-muted data-[state=open]:bg-feedback-success-muted",
	},
	warning: {
		rest: "bg-feedback-warning-subtle text-feedback-warning",
		hover: "hover:bg-feedback-warning-muted data-[state=open]:bg-feedback-warning-muted",
	},
	info: {
		rest: "bg-feedback-info-subtle text-feedback-info",
		hover: "hover:bg-feedback-info-muted data-[state=open]:bg-feedback-info-muted",
	},
};

export function chipClass(tone: ChipTone, interactive = false): string {
	return cn(
		"inline-flex h-20 shrink-0 items-center gap-4 whitespace-nowrap rounded-full px-8 tr-text-emphasis [&_svg]:size-12 [&_svg]:shrink-0",
		CHIP_TONE[tone].rest,
		interactive &&
			cn(
				"window-no-drag outline-none transition-colors focus-visible:ring-1 focus-visible:ring-focus-ring",
				CHIP_TONE[tone].hover,
			),
	);
}

export type SplitTone = "primary" | "warning" | "neutral";

const SPLIT_TONE: Record<SplitTone, { frame: string; hover: string }> = {
	primary: {
		frame: "border-primary-soft bg-primary-subtle text-primary",
		hover: "hover:bg-primary-soft data-[state=open]:bg-primary-soft",
	},
	warning: {
		frame: "border-feedback-warning-muted bg-feedback-warning-subtle text-feedback-warning",
		hover: "hover:bg-feedback-warning-muted data-[state=open]:bg-feedback-warning-muted",
	},
	neutral: {
		frame: "border-control-border-default text-text-muted",
		hover:
			"hover:bg-control-bg-hovered hover:text-text-default data-[state=open]:bg-control-bg-selected",
	},
};

export function splitFrameClass(tone: SplitTone): string {
	return cn(
		"inline-flex h-20 shrink-0 items-stretch overflow-hidden rounded-sm border",
		SPLIT_TONE[tone].frame,
	);
}

export function splitPartClass(tone: SplitTone): string {
	return cn(
		"window-no-drag flex items-center gap-4 outline-none transition-colors focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-focus-ring disabled:opacity-60 [&_svg]:size-12 [&_svg]:shrink-0",
		SPLIT_TONE[tone].hover,
	);
}
