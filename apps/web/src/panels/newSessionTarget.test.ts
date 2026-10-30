import { expect, test } from "bun:test";
import {
	createSessionTargets,
	type NewSessionTargetStorage,
	parseSessionTargets,
} from "./newSessionTarget";

function memory(initial: string | null = null) {
	const state = { value: initial, writes: 0 };
	const storage: NewSessionTargetStorage = {
		read: () => state.value,
		write: (value) => {
			state.value = value;
			state.writes += 1;
		},
	};
	return { state, storage };
}

test("a project without a record starts in a worktree", () => {
	const { storage } = memory();
	expect(createSessionTargets(() => storage).preferred("p1")).toBe("worktree");
});

test("what a project last started as is remembered per project", () => {
	const { state, storage } = memory();
	const targets = createSessionTargets(() => storage);
	targets.remember("p1", "default");
	targets.remember("p2", "worktree");
	expect(targets.preferred("p1")).toBe("default");
	expect(targets.preferred("p2")).toBe("worktree");
	expect(JSON.parse(state.value ?? "{}")).toEqual({ p1: "default", p2: "worktree" });
});

test("remembering the same target again writes nothing", () => {
	const { state, storage } = memory(JSON.stringify({ p1: "default" }));
	createSessionTargets(() => storage).remember("p1", "default");
	expect(state.writes).toBe(0);
});

test("unreadable, foreign and unwritable storage falls back quietly", () => {
	expect(parseSessionTargets("not json")).toEqual({});
	expect(parseSessionTargets(JSON.stringify(["default"]))).toEqual({});
	expect(parseSessionTargets(JSON.stringify({ p1: "elsewhere", p2: "default" }))).toEqual({
		p2: "default",
	});
	const broken = createSessionTargets(() => ({
		read: () => {
			throw new Error("blocked");
		},
		write: () => {
			throw new Error("blocked");
		},
	}));
	expect(broken.preferred("p1")).toBe("worktree");
	broken.remember("p1", "default");
	expect(createSessionTargets(() => null).preferred("p1")).toBe("worktree");
});
