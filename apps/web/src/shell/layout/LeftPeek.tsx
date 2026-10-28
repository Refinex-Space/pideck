import { type PointerEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";

const HIDE_DELAY_MS = 400;
const SUPPRESS_MS = 600;
const TRIGGER_SELECTOR = '[data-testid="tool-rail-projects"]';
// Menus, dialogs and pickers opened from inside the sidebar render in portals, outside its box.
const OVERLAY_SELECTOR = '[role="menu"], [role="dialog"], [role="alertdialog"], [role="listbox"]';

function isTrigger(target: EventTarget | null): boolean {
	return target instanceof Element && target.closest(TRIGGER_SELECTOR) !== null;
}

function textEntryFocused(panel: Element | null): boolean {
	const active = document.activeElement;
	return (
		panel !== null &&
		active instanceof HTMLElement &&
		panel.contains(active) &&
		(active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement)
	);
}

export interface LeftPeek {
	open: boolean;
	/** Pointer handlers for the rail that holds the sidebar toggle: hovering it opens the peek. */
	triggerProps: {
		onPointerOver: (event: PointerEvent<HTMLElement>) => void;
		onPointerOut: (event: PointerEvent<HTMLElement>) => void;
	};
	/** Put on every element that keeps the peek alive: the toolbar cluster and the panel itself. */
	zoneProps: {
		onPointerEnter: () => void;
		onPointerLeave: () => void;
	};
	panelRef: (node: HTMLElement | null) => void;
}

/**
 * A collapsed sidebar slides back in while the pointer rests on its toggle (hover, not click). It
 * stays for as long as the pointer is on the toggle cluster or the panel, while a menu, dialog or
 * text field opened from it is live, and for a grace period after the pointer leaves.
 */
export function useLeftPeek(enabled: boolean): LeftPeek {
	const [open, setOpen] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const inside = useRef(false);
	const panel = useRef<HTMLElement | null>(null);
	// Collapsing with the pointer still on the toggle must not slide the sidebar straight back in:
	// the next peek needs a fresh hover.
	const suppressedUntil = useRef(0);
	const wasEnabled = useRef(enabled);
	const clear = useCallback(() => {
		if (timer.current) clearTimeout(timer.current);
		timer.current = null;
	}, []);
	const check = useCallback(
		function check() {
			clear();
			timer.current = setTimeout(() => {
				timer.current = null;
				if (inside.current) return;
				if (document.querySelector(OVERLAY_SELECTOR) || textEntryFocused(panel.current)) {
					check();
					return;
				}
				setOpen(false);
			}, HIDE_DELAY_MS);
		},
		[clear],
	);
	useEffect(() => {
		if (!enabled) {
			clear();
			inside.current = false;
			setOpen(false);
		} else if (!wasEnabled.current) {
			// The browser re-fires pointer events once the toggle lands under a resting pointer.
			suppressedUntil.current = performance.now() + SUPPRESS_MS;
		}
		wasEnabled.current = enabled;
		return clear;
	}, [enabled, clear]);
	useEffect(() => {
		if (!open) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape" || document.querySelector(OVERLAY_SELECTOR)) return;
			inside.current = false;
			clear();
			setOpen(false);
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [open, clear]);
	return {
		open: enabled && open,
		triggerProps: {
			onPointerOver: (event) => {
				if (
					event.pointerType !== "mouse" ||
					!isTrigger(event.target) ||
					performance.now() < suppressedUntil.current
				)
					return;
				inside.current = true;
				clear();
				setOpen(true);
			},
			onPointerOut: (event) => {
				if (!isTrigger(event.target) || isTrigger(event.relatedTarget)) return;
				suppressedUntil.current = 0;
			},
		},
		zoneProps: {
			onPointerEnter: () => {
				inside.current = true;
				clear();
			},
			onPointerLeave: () => {
				inside.current = false;
				check();
			},
		},
		panelRef: (node) => {
			panel.current = node;
		},
	};
}

export function LeftPeekPanel({ peek, children }: { peek: LeftPeek; children: ReactNode }) {
	return (
		<aside
			ref={peek.panelRef}
			data-testid="left-peek"
			{...peek.zoneProps}
			// The invisible strip on the right edge keeps a drifting pointer from closing the panel.
			className="absolute inset-y-0 left-0 z-40 flex w-288 max-w-[90%] flex-col rounded-r-lg border-border-default border-r bg-container-sidebar-bg shadow-[var(--shadow-lg)] after:absolute after:inset-y-0 after:-right-12 after:w-12 after:content-[''] motion-safe:animate-reveal"
		>
			<div aria-hidden="true" className="h-topbar-row shrink-0" />
			<div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-r-lg">{children}</div>
		</aside>
	);
}
