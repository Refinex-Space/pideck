import { cn } from "@thinkrail/ui/utils";
import { type ReactNode, useEffect, useRef } from "react";

export interface CompletionItem {
	key: string;
	label: string;
	/** A description, or a parent directory: one muted line after the label. */
	secondary?: string | undefined;
	/** Right-aligned source, e.g. `project`. */
	tag?: string | undefined;
	icon: ReactNode;
	/** The group heading; a new value starts a new group, so callers pass items already grouped. */
	group: string;
	/** The full text of the active row, shown in the footer where the row truncates it. */
	detail?: { title: string; body?: string | undefined; meta?: string | undefined } | undefined;
	/** `data-source` on the row, kept for test hooks and styling. */
	source?: string | undefined;
}

/**
 * The popup behind `/` and `@`: grouped rows plus a detail footer for the active row. Rows take pointer
 * moves, not enters, so a menu that scrolls under a still pointer never steals the keyboard selection, and
 * `mousedown` is cancelled so the prompt keeps focus. Selection is announced through `listboxId` and each
 * row's id (`optionId`), which the prompt references with `aria-activedescendant`.
 */
export function CompletionMenu({
	items,
	activeIndex,
	onSelect,
	onActivate,
	className,
	footer,
	testId,
	itemTestId,
	listboxId,
	label,
}: {
	items: readonly CompletionItem[];
	activeIndex: number;
	onSelect: (index: number) => void;
	onActivate: (index: number) => void;
	className?: string;
	footer?: ReactNode;
	testId: string;
	itemTestId: string;
	listboxId: string;
	label: string;
}) {
	const activeRef = useRef<HTMLButtonElement | null>(null);
	const pointerMoved = useRef(false);
	useEffect(() => {
		if (!pointerMoved.current) activeRef.current?.scrollIntoView({ block: "nearest" });
	}, [activeIndex]);
	const active = items[activeIndex];

	return (
		<div
			data-testid={testId}
			className={cn(
				"flex max-h-[min(24rem,45vh)] w-[min(30rem,92%)] flex-col overflow-hidden rounded-lg border border-border-default bg-container-elevated-bg shadow-[var(--shadow-md)]",
				className,
			)}
		>
			<div
				id={listboxId}
				role="listbox"
				aria-label={label}
				className="min-h-0 flex-1 overflow-y-auto p-4"
			>
				{items.map((item, index) => {
					const selected = index === activeIndex;
					return (
						<div key={item.key}>
							{index === 0 || items[index - 1]?.group !== item.group ? (
								<div
									aria-hidden
									className="px-8 pt-8 pb-2 text-text-muted tr-text-metadata first:pt-4"
								>
									{item.group}
								</div>
							) : null}
							<button
								ref={selected ? activeRef : undefined}
								id={optionId(listboxId, index)}
								type="button"
								role="option"
								aria-selected={selected}
								data-testid={itemTestId}
								data-source={item.source}
								tabIndex={-1}
								onMouseDown={(event) => event.preventDefault()}
								onMouseMove={() => {
									pointerMoved.current = true;
									if (!selected) onActivate(index);
								}}
								onClick={() => onSelect(index)}
								className={cn(
									"flex w-full items-center gap-8 rounded-sm px-8 py-4 text-left tr-text-ui",
									selected ? "bg-control-bg-selected text-text-default" : "text-text-muted",
								)}
							>
								<span className="flex size-16 shrink-0 items-center justify-center text-text-muted">
									{item.icon}
								</span>
								<span className="truncate text-text-default">{item.label}</span>
								{item.secondary ? (
									<span className="min-w-0 flex-1 truncate tr-text-metadata">{item.secondary}</span>
								) : (
									<span className="flex-1" />
								)}
								{item.tag ? (
									<span className="shrink-0 text-text-muted tr-text-metadata">{item.tag}</span>
								) : null}
							</button>
						</div>
					);
				})}
			</div>
			{active?.detail ? (
				<div
					data-testid="completion-detail"
					className="flex shrink-0 flex-col gap-2 border-border-default border-t px-12 py-8"
				>
					<span className="truncate tr-text-emphasis text-text-default">{active.detail.title}</span>
					{active.detail.body ? (
						<span className="line-clamp-3 text-text-muted tr-text-metadata">
							{active.detail.body}
						</span>
					) : null}
					{active.detail.meta ? (
						<span
							title={active.detail.meta}
							className="truncate text-text-muted tr-code-text tr-text-metadata"
						>
							{active.detail.meta}
						</span>
					) : null}
				</div>
			) : null}
			{footer}
		</div>
	);
}

export function optionId(listboxId: string, index: number): string {
	return `${listboxId}-option-${index}`;
}
