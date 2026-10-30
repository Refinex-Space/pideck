import { useSyncExternalStore } from "react";
import { getStablePreferenceAdapter, type StablePreferenceAdapter } from "../clientPreferences";
import { STORAGE_PREFIX } from "../constants/branding";
import { isRecord } from "../lib";
import { getTransport } from "../transport";

export const STATUS_BLOCK_IDS = [
	"environment",
	"context",
	"tasks",
	"connectors",
	"changes",
] as const;
export type StatusBlockId = (typeof STATUS_BLOCK_IDS)[number];

export interface StatusBlocksLayout {
	order: readonly StatusBlockId[];
	collapsed: readonly StatusBlockId[];
	/** The status dock is open beside the chat. */
	open: boolean;
}

const DEFAULT_LAYOUT: StatusBlocksLayout = { order: STATUS_BLOCK_IDS, collapsed: [], open: false };
const STABLE_KEY = "status-blocks";
const DOCUMENT_VERSION = 1;

export function isStatusBlockId(value: unknown): value is StatusBlockId {
	return STATUS_BLOCK_IDS.some((id) => id === value);
}

function blockIds(value: unknown): StatusBlockId[] {
	if (!Array.isArray(value)) return [];
	const ids: StatusBlockId[] = [];
	for (const candidate of value) {
		if (isStatusBlockId(candidate) && !ids.includes(candidate)) ids.push(candidate);
	}
	return ids;
}

/** Drops unknown and repeated ids, and appends blocks this build knows but the saved order does not. */
export function normalizeStatusBlocks(value: unknown): StatusBlocksLayout {
	if (!isRecord(value)) return DEFAULT_LAYOUT;
	const order = blockIds(value.order);
	for (const id of STATUS_BLOCK_IDS) if (!order.includes(id)) order.push(id);
	return { order, collapsed: blockIds(value.collapsed), open: value.open === true };
}

export function parseStatusBlocks(raw: string | null): StatusBlocksLayout {
	if (!raw) return DEFAULT_LAYOUT;
	try {
		const parsed: unknown = JSON.parse(raw);
		return isRecord(parsed) && parsed.version === DOCUMENT_VERSION
			? normalizeStatusBlocks(parsed)
			: DEFAULT_LAYOUT;
	} catch {
		return DEFAULT_LAYOUT;
	}
}

export function serializeStatusBlocks(layout: StatusBlocksLayout): string {
	return JSON.stringify({ version: DOCUMENT_VERSION, ...layout });
}

/** Moves `id` so it ends at `toIndex` of the resulting order (clamped to the list). */
export function moveStatusBlock(
	order: readonly StatusBlockId[],
	id: StatusBlockId,
	toIndex: number,
): readonly StatusBlockId[] {
	const from = order.indexOf(id);
	if (from < 0) return order;
	const to = Math.max(0, Math.min(order.length - 1, toIndex));
	if (to === from) return order;
	const next = order.filter((candidate) => candidate !== id);
	next.splice(to, 0, id);
	return next;
}

/**
 * Where a dragged block lands: the number of the *other* blocks whose centre sits above the dragged
 * block's centre. Centres arrive in document order with the dragged block already left out.
 */
export function dropIndex(otherCenters: readonly number[], draggedCenter: number): number {
	let index = 0;
	for (const center of otherCenters) if (center < draggedCenter) index += 1;
	return index;
}

export interface StatusDrag {
	id: StatusBlockId;
	from: number;
	target: number;
}

/** Which way a block steps aside while another one is dragged across it. */
export function dragShift(drag: StatusDrag | null, index: number): "up" | "down" | undefined {
	if (!drag || index === drag.from) return undefined;
	if (drag.from < drag.target && index > drag.from && index <= drag.target) return "up";
	if (drag.from > drag.target && index >= drag.target && index < drag.from) return "down";
	return undefined;
}

export function toggleStatusBlock(
	layout: StatusBlocksLayout,
	id: StatusBlockId,
): StatusBlocksLayout {
	return {
		...layout,
		collapsed: layout.collapsed.includes(id)
			? layout.collapsed.filter((candidate) => candidate !== id)
			: [...layout.collapsed, id],
	};
}

export interface StatusBlocksStorage {
	read: () => string | null;
	write: (value: string) => void;
}

export function createStatusBlocksStore(storage: () => StatusBlocksStorage | null) {
	let layout: StatusBlocksLayout | null = null;
	const listeners = new Set<() => void>();
	const current = () => {
		if (layout) return layout;
		let raw: string | null = null;
		try {
			raw = storage()?.read() ?? null;
		} catch {}
		layout = parseStatusBlocks(raw);
		return layout;
	};
	const install = (next: StatusBlocksLayout) => {
		layout = next;
		try {
			storage()?.write(serializeStatusBlocks(next));
		} catch {}
		for (const listener of listeners) listener();
	};
	return {
		getSnapshot: current,
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		move: (id: StatusBlockId, toIndex: number) => {
			const order = moveStatusBlock(current().order, id, toIndex);
			if (order !== current().order) install({ ...current(), order });
		},
		toggle: (id: StatusBlockId) => install(toggleStatusBlock(current(), id)),
		toggleOpen: () => install({ ...current(), open: !current().open }),
		setOpen: (open: boolean) => {
			if (current().open !== open) install({ ...current(), open });
		},
	};
}

function stableStorage(adapter: StablePreferenceAdapter): StatusBlocksStorage {
	return {
		read: () => adapter.getItem(STABLE_KEY),
		write: (value) => adapter.setItem(STABLE_KEY, value),
	};
}

function browserStorage(): StatusBlocksStorage | null {
	try {
		const storage = window.localStorage;
		const key = `${STORAGE_PREFIX}status-blocks:${getTransport().httpBase()}`;
		return { read: () => storage.getItem(key), write: (value) => storage.setItem(key, value) };
	} catch {
		return null;
	}
}

function windowStorage(): StatusBlocksStorage | null {
	const adapter = getStablePreferenceAdapter();
	return adapter ? stableStorage(adapter) : browserStorage();
}

const statusBlocksStore = createStatusBlocksStore(windowStorage);

/** Reveals the status dock from outside it (a chat's "still running" notice, say). */
export function openStatusDock(): void {
	statusBlocksStore.setOpen(true);
}

/** The window-local state of the status dock (open, block order, folds), shared by every workspace. */
export function useStatusBlocks() {
	const layout = useSyncExternalStore(
		statusBlocksStore.subscribe,
		statusBlocksStore.getSnapshot,
		statusBlocksStore.getSnapshot,
	);
	return {
		layout,
		move: statusBlocksStore.move,
		toggle: statusBlocksStore.toggle,
		toggleOpen: statusBlocksStore.toggleOpen,
	};
}
