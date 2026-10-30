import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * The action row that closes a status block: its icon sits in the 16px column the list rows use and its
 * label starts where their names do, so the row reads as part of the list; hover tints the whole row.
 */
export function StatusFooterAction({
	icon: Icon,
	testId,
	onClick,
	children,
}: {
	icon: LucideIcon;
	testId: string;
	onClick: () => void;
	children: ReactNode;
}) {
	return (
		<button
			type="button"
			data-testid={testId}
			onClick={onClick}
			className="-mx-4 flex h-28 min-w-0 items-center gap-8 rounded-sm px-4 text-left text-text-muted outline-none transition-colors hover:bg-control-bg-hovered hover:text-text-default focus-visible:ring-1 focus-visible:ring-focus-ring"
		>
			<span className="flex size-16 shrink-0 items-center justify-center">
				<Icon aria-hidden="true" className="size-14" />
			</span>
			<span className="min-w-0 flex-1 truncate tr-text-ui">{children}</span>
		</button>
	);
}
