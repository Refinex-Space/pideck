import { ChevronDown, ChevronRight } from "lucide-react";
import type { MouseEvent, ReactNode, Ref } from "react";
import { FileTypeIcon, FolderTypeIcon } from "../fileIcons";

export function TreeRow({
	ref,
	testid,
	kind,
	expanded,
	active,
	subtle = false,
	dataStatus,
	dataViewed,
	label,
	path = label,
	labelClassName,
	trailing,
	highlight = "self",
	onClick,
	onDoubleClick,
	onContextMenu,
	onWarm,
}: {
	ref?: Ref<HTMLButtonElement> | undefined;
	testid: string;
	kind: "dir" | "file";
	expanded?: boolean;
	active?: boolean;
	subtle?: boolean;
	dataStatus?: string | undefined;
	dataViewed?: boolean;
	label: string;
	path?: string;
	labelClassName?: string;
	trailing?: ReactNode;
	highlight?: "self" | "wrapper";
	onClick?: ((event: MouseEvent) => void) | undefined;
	onDoubleClick?: (() => void) | undefined;
	onContextMenu?: ((event: MouseEvent) => void) | undefined;
	onWarm?: ((trigger: "hover" | "focus") => void) | undefined;
}) {
	const Chevron = expanded ? ChevronDown : ChevronRight;
	const tone = subtle ? "text-text-subtle" : "text-text-muted";
	return (
		<button
			ref={ref}
			type="button"
			data-testid={testid}
			data-kind={kind}
			aria-expanded={kind === "dir" ? Boolean(expanded) : undefined}
			data-active={active ? true : undefined}
			data-status={dataStatus}
			data-viewed={dataViewed ? true : undefined}
			onClick={onClick}
			onDoubleClick={onDoubleClick}
			onContextMenu={onContextMenu}
			onPointerEnter={onWarm && (() => onWarm("hover"))}
			onFocus={onWarm && (() => onWarm("focus"))}
			className={`flex h-panel-row w-full min-w-0 items-center gap-4 rounded-sm px-4 text-left tr-text-ui ${tone} outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-focus-ring ${
				highlight === "self"
					? `hover:bg-control-bg-hovered ${active ? "bg-control-bg-selected" : ""}`
					: ""
			}`}
		>
			{kind === "dir" ? (
				<Chevron className={`size-16 shrink-0 ${tone}`} />
			) : (
				<span className="size-14 shrink-0" />
			)}
			<span className="flex min-w-0 flex-1 items-center gap-4">
				{kind === "dir" ? (
					<FolderTypeIcon path={path} expanded={Boolean(expanded)} className={tone} />
				) : (
					<FileTypeIcon path={path} className={subtle ? "opacity-60" : tone} />
				)}
				<span className={`min-w-0 flex-1 truncate ${labelClassName ?? ""}`}>{label}</span>
			</span>
			{trailing}
		</button>
	);
}
