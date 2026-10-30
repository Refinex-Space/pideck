import { type KeyboardEvent, type PointerEvent, useRef, useState } from "react";
import { dropIndex, type StatusBlockId, type StatusDrag } from "./statusBlocks";

interface DragSession {
	id: StatusBlockId;
	pointerId: number;
	startY: number;
	from: number;
	target: number;
	centre: number;
	minDy: number;
	maxDy: number;
	otherCentres: number[];
	node: HTMLElement;
	list: HTMLElement;
}

/**
 * Pointer and keyboard reordering for the Status tool's blocks. The dragged block follows the pointer
 * through the `--status-drag-y` custom property and its neighbours step aside by `--status-shift`
 * (both set here, read by the frame's classes), so nothing but the final order reaches React state.
 */
export function useStatusReorder({
	order,
	onMove,
	onMoved,
}: {
	order: readonly StatusBlockId[];
	onMove: (id: StatusBlockId, toIndex: number) => void;
	onMoved: (id: StatusBlockId, index: number) => void;
}) {
	const [drag, setDrag] = useState<StatusDrag | null>(null);
	const session = useRef<DragSession | null>(null);

	const finish = (commit: boolean) => {
		const current = session.current;
		if (!current) return;
		session.current = null;
		current.node.style.removeProperty("--status-drag-y");
		current.list.style.removeProperty("--status-shift");
		setDrag(null);
		if (commit && current.target !== current.from) {
			onMove(current.id, current.target);
			onMoved(current.id, current.target);
		}
	};

	const begin = (id: StatusBlockId, event: PointerEvent<HTMLElement>) => {
		if (event.button !== 0 || session.current) return;
		const handle = event.currentTarget;
		const node = handle.closest<HTMLElement>("[data-block-id]");
		const list = node?.parentElement;
		if (!node || !list) return;
		const frames = [...list.children].filter(
			(child): child is HTMLElement => child instanceof HTMLElement && "blockId" in child.dataset,
		);
		const rects = frames.map((frame) => ({
			id: frame.dataset.blockId,
			rect: frame.getBoundingClientRect(),
		}));
		const from = rects.findIndex((entry) => entry.id === id);
		const own = rects[from]?.rect;
		const first = rects[0]?.rect;
		const last = rects.at(-1)?.rect;
		if (!own || !first || !last) return;
		const before = rects[from - 1]?.rect;
		const after = rects[from + 1]?.rect;
		const gap = before ? own.top - before.bottom : after ? after.top - own.bottom : 0;
		handle.setPointerCapture(event.pointerId);
		list.style.setProperty("--status-shift", `${own.height + gap}px`);
		session.current = {
			id,
			pointerId: event.pointerId,
			startY: event.clientY,
			from,
			target: from,
			centre: own.top + own.height / 2,
			minDy: first.top - own.top,
			maxDy: last.bottom - own.bottom,
			otherCentres: rects
				.filter((entry) => entry.id !== id)
				.map((entry) => entry.rect.top + entry.rect.height / 2),
			node,
			list,
		};
		setDrag({ id, from, target: from });
	};

	const move = (event: PointerEvent<HTMLElement>) => {
		const current = session.current;
		if (!current || event.pointerId !== current.pointerId) return;
		const dy = Math.min(current.maxDy, Math.max(current.minDy, event.clientY - current.startY));
		current.node.style.setProperty("--status-drag-y", `${dy}px`);
		const target = dropIndex(current.otherCentres, current.centre + dy);
		if (target === current.target) return;
		current.target = target;
		setDrag({ id: current.id, from: current.from, target });
	};

	const step = (id: StatusBlockId, event: KeyboardEvent<HTMLElement>) => {
		if (event.key === "Escape" && session.current) {
			event.preventDefault();
			finish(false);
			return;
		}
		if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
		event.preventDefault();
		const to = order.indexOf(id) + (event.key === "ArrowUp" ? -1 : 1);
		if (to < 0 || to >= order.length) return;
		const handle = event.currentTarget;
		onMove(id, to);
		onMoved(id, to);
		requestAnimationFrame(() => handle.focus());
	};

	const handlers = (id: StatusBlockId) => ({
		onPointerDown: (event: PointerEvent<HTMLElement>) => begin(id, event),
		onPointerMove: move,
		onPointerUp: () => finish(true),
		onPointerCancel: () => finish(false),
		onKeyDown: (event: KeyboardEvent<HTMLElement>) => step(id, event),
	});

	return { drag, handlers };
}
