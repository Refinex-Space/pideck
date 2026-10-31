import {
	type ComponentProps,
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { cn } from "./utils";

const COPIED_MS = 1200;

/** `copied` flips true for a moment after `copy` succeeds, so a button can swap its icon for a check. */
export function useCopyFeedback(): { copied: boolean; copy: (text: string) => void } {
	const [copied, setCopied] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	useEffect(() => () => (timer.current ? clearTimeout(timer.current) : undefined), []);
	const copy = useCallback((text: string) => {
		void navigator.clipboard.writeText(text).then(
			() => {
				setCopied(true);
				if (timer.current) clearTimeout(timer.current);
				timer.current = setTimeout(() => setCopied(false), COPIED_MS);
			},
			() => undefined,
		);
	}, []);
	return { copied, copy };
}

interface BlockFrameProps extends ComponentProps<"div"> {
	/** Controls shown top-right while the block is hovered or holds focus (always on touch screens). */
	toolbar: ReactNode;
}

/** A hairline-bordered, softly rounded block (code, diagram) with a hover toolbar in its top-right corner. */
export function BlockFrame({ toolbar, className, children, ...props }: BlockFrameProps) {
	// Tooltips need a provider that static renders (`renderToStaticMarkup`) lack; there is no hover there anyway.
	const [mounted, setMounted] = useState(false);
	useEffect(() => setMounted(true), []);
	return (
		<div
			{...props}
			className={cn(
				"group/block relative overflow-hidden rounded-md border border-border-muted bg-container-elevated-bg",
				className,
			)}
		>
			{children}
			{mounted ? (
				<div
					data-testid="block-toolbar"
					className="absolute top-4 right-4 z-10 flex items-center gap-2 rounded-md border border-border-muted bg-container-elevated-bg p-2 opacity-0 transition-opacity duration-[var(--motion-duration-normal)] focus-within:opacity-100 group-hover/block:opacity-100 pointer-coarse:opacity-100"
				>
					{toolbar}
				</div>
			) : null}
		</div>
	);
}
