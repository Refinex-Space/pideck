import { cn } from "@thinkrail/ui/utils";
import {
	type ComponentProps,
	type MouseEvent,
	type PointerEvent,
	type ReactNode,
	type Ref,
	useCallback,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import type { PromptSegment, PromptToken } from "./tokens";

export interface PromptTokenHit {
	token: PromptToken;
	rect: DOMRect;
}

const SLOT_TINT = {
	plain: "",
	unfilled: "rounded-xs bg-primary-soft",
	active: "rounded-xs bg-primary-muted",
	filled: "rounded-xs bg-primary-subtle",
} as const;

const TOKEN_CLASS =
	"rounded-xs bg-feedback-info-subtle text-feedback-info [&[data-hovered=true]]:bg-feedback-info-muted";

interface PromptFieldProps
	extends Omit<ComponentProps<"textarea">, "value" | "className" | "children" | "ref"> {
	ref?: Ref<HTMLTextAreaElement>;
	value: string;
	segments: readonly PromptSegment[];
	/** Box metrics and typography, applied to the textarea and its mirror alike so their glyphs coincide. */
	fieldClassName: string;
	/** How the textarea sits in `wrapperClassName`. */
	textareaClassName?: string;
	wrapperClassName?: string;
	/** Rendered under the field in the wrapper, e.g. a height sizer. */
	children?: ReactNode;
	/** The recognised token under the pointer, or null. Fires on change only. */
	onTokenHover?: (hit: PromptTokenHit | null) => void;
	/** Cmd/Ctrl+click on a token. */
	onTokenActivate?: (token: PromptToken) => void;
}

/**
 * A plain `<textarea>` that keeps the browser's input method, undo, spellcheck and selection, with its glyphs
 * drawn by a mirror layer behind it. The textarea text is transparent (only its caret and a translucent
 * selection show), so the mirror is free to colour tokens and tint template slots; the draft string stays the
 * only data model. While an input method is composing, the textarea draws its own text and the mirror steps
 * aside, since the engine's composition highlight can be opaque and would cover the mirror's glyphs.
 */
export function PromptField({
	ref,
	value,
	segments,
	fieldClassName,
	textareaClassName,
	wrapperClassName,
	children,
	onTokenHover,
	onTokenActivate,
	onScroll,
	onClick,
	onPointerMove,
	onPointerLeave,
	onCompositionStart,
	onCompositionEnd,
	disabled,
	...textareaProps
}: PromptFieldProps) {
	const [composing, setComposing] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement | null>(null);
	const mirrorRef = useRef<HTMLDivElement | null>(null);
	const hoveredRef = useRef<PromptToken | null>(null);

	const setRef = useCallback(
		(node: HTMLTextAreaElement | null) => {
			textareaRef.current = node;
			if (typeof ref === "function") ref(node);
			else if (ref) ref.current = node;
		},
		[ref],
	);

	const sync = useCallback(() => {
		const textarea = textareaRef.current;
		const mirror = mirrorRef.current;
		if (!textarea || !mirror) return;
		mirror.scrollTop = textarea.scrollTop;
		mirror.scrollLeft = textarea.scrollLeft;
		// A classic scrollbar narrows the textarea's wrapping width; the mirror must wrap at the same column.
		mirror.style.setProperty(
			"--prompt-scrollbar",
			`${textarea.offsetWidth - textarea.clientWidth}px`,
		);
	}, []);

	useLayoutEffect(() => {
		sync();
	});

	useLayoutEffect(() => {
		const textarea = textareaRef.current;
		if (!textarea) return;
		const observer = new ResizeObserver(sync);
		observer.observe(textarea);
		return () => observer.disconnect();
	}, [sync]);

	const hit = (event: { clientX: number; clientY: number }): PromptTokenHit | null => {
		const mirror = mirrorRef.current;
		if (!mirror) return null;
		for (const element of mirror.querySelectorAll<HTMLElement>("[data-segment]")) {
			const token = segments[Number(element.dataset.segment)]?.token;
			if (!token) continue;
			for (const rect of element.getClientRects()) {
				if (
					event.clientX >= rect.left &&
					event.clientX <= rect.right &&
					event.clientY >= rect.top &&
					event.clientY <= rect.bottom
				) {
					return { token, rect: element.getBoundingClientRect() };
				}
			}
		}
		return null;
	};

	const hover = (next: PromptTokenHit | null) => {
		if ((next?.token.start ?? -1) === (hoveredRef.current?.start ?? -1)) return;
		hoveredRef.current = next?.token ?? null;
		for (const element of mirrorRef.current?.querySelectorAll<HTMLElement>("[data-segment]") ??
			[]) {
			const token = segments[Number(element.dataset.segment)]?.token;
			element.dataset.hovered = String(!!token && token.start === next?.token.start);
		}
		onTokenHover?.(next);
	};

	const trackable = !!onTokenHover || !!onTokenActivate;

	return (
		<div className={wrapperClassName}>
			{children}
			<div
				ref={mirrorRef}
				data-testid="prompt-mirror"
				aria-hidden
				className={cn(
					"pointer-events-none absolute inset-0 overflow-hidden rounded-sm forced-colors:hidden",
					composing && "invisible",
				)}
			>
				<div
					className={cn(
						"w-[calc(100%-var(--prompt-scrollbar,0px))] whitespace-pre-wrap break-words",
						disabled ? "text-control-disabled-text" : "text-text-default",
						fieldClassName,
					)}
				>
					{segments.map((segment, index) => (
						<span
							key={segment.start}
							data-segment={index}
							data-testid={
								segment.token
									? "prompt-token"
									: segment.slot === "plain"
										? undefined
										: "slot-highlight"
							}
							data-token-kind={segment.token?.kind}
							data-slot-state={segment.slot === "plain" ? undefined : segment.slot}
							className={cn(SLOT_TINT[segment.slot], segment.token && TOKEN_CLASS)}
						>
							{segment.text}
						</span>
					))}
					{"​"}
				</div>
			</div>
			<textarea
				{...textareaProps}
				ref={setRef}
				value={value}
				disabled={disabled}
				data-prompt-field
				data-composing={composing || undefined}
				onCompositionStart={(event) => {
					setComposing(true);
					onCompositionStart?.(event);
				}}
				onCompositionEnd={(event) => {
					setComposing(false);
					onCompositionEnd?.(event);
				}}
				onScroll={(event) => {
					sync();
					hover(null);
					onScroll?.(event);
				}}
				onClick={(event: MouseEvent<HTMLTextAreaElement>) => {
					onClick?.(event);
					if (!onTokenActivate || !(event.metaKey || event.ctrlKey)) return;
					const target = hit(event);
					if (target) onTokenActivate(target.token);
				}}
				onPointerMove={(event: PointerEvent<HTMLTextAreaElement>) => {
					onPointerMove?.(event);
					if (trackable) hover(hit(event));
				}}
				onPointerLeave={(event: PointerEvent<HTMLTextAreaElement>) => {
					onPointerLeave?.(event);
					if (trackable) hover(null);
				}}
				className={cn(
					"resize-none overflow-x-hidden overflow-y-auto bg-transparent caret-text-default outline-none placeholder:text-text-muted",
					composing ? "text-text-default" : "text-transparent",
					textareaClassName,
					fieldClassName,
				)}
			/>
		</div>
	);
}
