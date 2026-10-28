import type { ReactNode } from "react";

/** A tooltip body: the label, then its keyboard shortcut quietly beside it. */
export function TooltipShortcut({ label, shortcut }: { label: ReactNode; shortcut: string }) {
	return (
		<span className="flex items-center gap-8">
			<span>{label}</span>
			<span aria-hidden="true" className="opacity-60">
				{shortcut}
			</span>
		</span>
	);
}
