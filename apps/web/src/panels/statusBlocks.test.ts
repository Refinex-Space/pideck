import { expect, test } from "bun:test";
import {
	createStatusBlocksStore,
	dragShift,
	dropIndex,
	moveStatusBlock,
	normalizeStatusBlocks,
	parseStatusBlocks,
	STATUS_BLOCK_IDS,
	type StatusBlocksStorage,
	serializeStatusBlocks,
	toggleStatusBlock,
} from "./statusBlocks";

function memoryStorage(initial: string | null = null) {
	const state = { value: initial, writes: 0 };
	const storage: StatusBlocksStorage = {
		read: () => state.value,
		write: (value) => {
			state.value = value;
			state.writes += 1;
		},
	};
	return { state, storage };
}

test("an unreadable or foreign document falls back to the default order", () => {
	expect(parseStatusBlocks(null).order).toEqual(STATUS_BLOCK_IDS);
	expect(parseStatusBlocks("not json").order).toEqual(STATUS_BLOCK_IDS);
	expect(parseStatusBlocks(JSON.stringify({ version: 9, order: ["changes"] })).order).toEqual(
		STATUS_BLOCK_IDS,
	);
});

test("normalizing keeps the saved order, drops strangers and appends new blocks", () => {
	const layout = normalizeStatusBlocks({
		order: ["changes", "bogus", "environment", "changes"],
		collapsed: ["context", "context", "nope"],
	});
	expect(layout.order).toEqual(["changes", "environment", "context", "tasks", "connectors", "lsp"]);
	expect(layout.collapsed).toEqual(["context"]);
});

test("a saved layout round-trips", () => {
	const layout = {
		order: ["changes", "environment", "context", "tasks", "connectors", "lsp"] as const,
	};
	const raw = serializeStatusBlocks({ order: layout.order, collapsed: ["tasks"], open: true });
	expect(parseStatusBlocks(raw)).toEqual({
		order: layout.order,
		collapsed: ["tasks"],
		open: true,
	});
});

test("moving a block lands it at the requested index and clamps to the list", () => {
	expect(moveStatusBlock(STATUS_BLOCK_IDS, "environment", 2)).toEqual([
		"context",
		"tasks",
		"environment",
		"connectors",
		"lsp",
		"changes",
	]);
	expect(moveStatusBlock(STATUS_BLOCK_IDS, "changes", -4)[0]).toBe("changes");
	expect(moveStatusBlock(STATUS_BLOCK_IDS, "environment", 99).at(-1)).toBe("environment");
	expect(moveStatusBlock(STATUS_BLOCK_IDS, "tasks", 2)).toBe(STATUS_BLOCK_IDS);
});

test("the drop index counts the other blocks above the dragged centre", () => {
	const centers = [20, 80, 140, 200];
	expect(dropIndex(centers, 10)).toBe(0);
	expect(dropIndex(centers, 81)).toBe(2);
	expect(dropIndex(centers, 500)).toBe(4);
});

test("blocks between the dragged one and its target step aside", () => {
	const down = { id: "environment" as const, from: 0, target: 2 };
	expect([0, 1, 2, 3].map((index) => dragShift(down, index))).toEqual([
		undefined,
		"up",
		"up",
		undefined,
	]);
	const up = { id: "tasks" as const, from: 3, target: 1 };
	expect([0, 1, 2, 3].map((index) => dragShift(up, index))).toEqual([
		undefined,
		"down",
		"down",
		undefined,
	]);
	expect(dragShift(null, 1)).toBeUndefined();
});

test("toggling folds and unfolds one block without touching the order", () => {
	const folded = toggleStatusBlock(
		{ order: STATUS_BLOCK_IDS, collapsed: [], open: false },
		"context",
	);
	expect(folded.collapsed).toEqual(["context"]);
	expect(folded.order).toBe(STATUS_BLOCK_IDS);
	expect(toggleStatusBlock(folded, "context").collapsed).toEqual([]);
});

test("the store reads once, persists each change and notifies subscribers", () => {
	const { state, storage } = memoryStorage(
		serializeStatusBlocks({
			order: ["changes", ...STATUS_BLOCK_IDS.slice(0, 4)],
			collapsed: [],
			open: false,
		}),
	);
	const store = createStatusBlocksStore(() => storage);
	expect(store.getSnapshot().order[0]).toBe("changes");
	let notified = 0;
	const unsubscribe = store.subscribe(() => {
		notified += 1;
	});
	store.move("changes", 0);
	expect(notified).toBe(0);
	store.move("changes", 2);
	store.toggle("tasks");
	expect(notified).toBe(2);
	expect(state.writes).toBe(2);
	expect(parseStatusBlocks(state.value).collapsed).toEqual(["tasks"]);
	unsubscribe();
	store.toggle("tasks");
	expect(notified).toBe(2);
});

test("a store without storage still works for the session", () => {
	const store = createStatusBlocksStore(() => null);
	store.move("context", 3);
	expect(store.getSnapshot().order[3]).toBe("context");
});

test("a storage that throws never breaks reading or writing", () => {
	const store = createStatusBlocksStore(() => ({
		read: () => {
			throw new Error("blocked");
		},
		write: () => {
			throw new Error("blocked");
		},
	}));
	expect(store.getSnapshot().order).toEqual(STATUS_BLOCK_IDS);
	store.toggle("environment");
	expect(store.getSnapshot().collapsed).toEqual(["environment"]);
});

test("the dock opens and closes through the store and the choice is persisted", () => {
	const { state, storage } = memoryStorage();
	const store = createStatusBlocksStore(() => storage);
	expect(store.getSnapshot().open).toBe(false);
	store.toggleOpen();
	expect(store.getSnapshot().open).toBe(true);
	expect(parseStatusBlocks(state.value).open).toBe(true);
	const reloaded = createStatusBlocksStore(() => storage);
	expect(reloaded.getSnapshot().open).toBe(true);
	reloaded.toggleOpen();
	expect(parseStatusBlocks(state.value).open).toBe(false);
	reloaded.setOpen(true);
	reloaded.setOpen(true);
	expect(parseStatusBlocks(state.value).open).toBe(true);
});
