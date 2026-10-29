import { expect, test } from "bun:test";
import { moveLayoutFilePaths } from "./filePaths";
import type { LayoutCenterTab, WorkspaceLayoutDocument } from "./types";

const file = (id: string, path: string): LayoutCenterTab => ({
	kind: "file",
	id,
	path,
	name: path,
});
function layout(tabs: LayoutCenterTab[]): WorkspaceLayoutDocument {
	return {
		version: 2,
		center: { kind: "group", id: "center", tabs, previewTabId: "destination" },
		left: { visible: false, width: 0.2, groups: [] },
		right: { visible: false, width: 0.2, groups: [] },
		bottom: { visible: false, height: 0.3, alignment: "center", groups: [] },
		toolRestoreTargets: {},
	};
}

test("directory moves update descendants but leave similarly prefixed paths and historical diffs alone", () => {
	const document = layout([
		file("source", "src/a.ts"),
		file("other", "src-old/a.ts"),
		{ kind: "diff", id: "review", name: "a.ts", path: "src/a.ts", before: "old" },
	]);
	const result = moveLayoutFilePaths(document, "src", "source");
	if (result.center.kind !== "group") throw new Error("Expected group");
	expect(result.center.tabs).toEqual([
		{ kind: "file", id: "source", path: "source/a.ts", name: "a.ts" },
		file("other", "src-old/a.ts"),
		{ kind: "diff", id: "review", name: "a.ts", path: "src/a.ts", before: "old" },
	]);
	expect(moveLayoutFilePaths(document, "missing", "elsewhere")).toBe(document);
});

test("moving onto a stale clean tab drops the duplicate and its preview marker", () => {
	const result = moveLayoutFilePaths(
		layout([file("source", "a.ts"), file("destination", "b.ts")]),
		"a.ts",
		"b.ts",
	);
	if (result.center.kind !== "group") throw new Error("Expected group");
	expect(result.center.tabs).toEqual([{ kind: "file", id: "source", name: "b.ts", path: "b.ts" }]);
	expect(result.center.previewTabId).toBeUndefined();
});

test("dirty source or destination buffers retain their original identities for recovery", () => {
	const document = layout([file("source", "a.ts"), file("destination", "b.ts")]);
	expect(moveLayoutFilePaths(document, "a.ts", "b.ts", ["a.ts"])).toBe(document);
	expect(moveLayoutFilePaths(document, "a.ts", "b.ts", ["b.ts"])).toBe(document);
});
