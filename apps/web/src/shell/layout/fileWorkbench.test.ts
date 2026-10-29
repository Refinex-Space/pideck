import { expect, test } from "bun:test";
import { t } from "@thinkrail/locales/react";
import { conversationCenter, migrateLegacyFiles, openFileWorkbench } from "./fileWorkbench";
import { collectCenterGroups, isLayoutUnavailable, removeLayoutGroup } from "./model";
import {
	projectWorkspaceLayout,
	workbenchFrameFromDocument,
	workspaceViewFromDocument,
} from "./normalized";
import type { LayoutFileTab, WorkspaceLayoutDocument } from "./types";
import { FILE_WORKBENCH_GROUP } from "./types";

const file = (id: string): LayoutFileTab => ({ kind: "file", id, name: id, path: id });
const base = (): WorkspaceLayoutDocument => ({
	version: 2,
	center: {
		kind: "group",
		id: "chat",
		tabs: [{ kind: "chat", id: "conversation", name: "Chat", sessionId: "session" }],
	},
	left: { visible: true, width: 0.2, groups: [] },
	right: { visible: false, width: 0.25, groups: [] },
	bottom: { visible: false, height: 0.3, alignment: "center", groups: [] },
	toolRestoreTargets: {},
});
function opened(
	document: WorkspaceLayoutDocument,
	id: string,
	intent: "preview" | "keep" = "preview",
) {
	const result = openFileWorkbench(document, file(id), intent, false, 6, 3);
	if (isLayoutUnavailable(result)) throw new Error(result.reason);
	return result.document;
}
test("files retain one preview slot beside an unchanged conversation", () => {
	const before = base();
	const first = opened(before, "a");
	const second = opened(first, "b");
	expect(conversationCenter(second.center)).toEqual(before.center);
	expect(
		collectCenterGroups(second.center)
			.find((g) => g.id === FILE_WORKBENCH_GROUP)
			?.tabs.map((t) => t.id),
	).toEqual(["b"]);
	const pinned = opened(second, "b", "keep");
	const third = opened(pinned, "c");
	expect(
		collectCenterGroups(third.center)
			.find((g) => g.id === FILE_WORKBENCH_GROUP)
			?.tabs.map((t) => t.id),
	).toEqual(["b", "c"]);
	expect(
		projectWorkspaceLayout(workbenchFrameFromDocument(third), workspaceViewFromDocument(third)),
	).toEqual(third);
});
test("reopening a legacy center file migrates its placement without removing chat", () => {
	const before = base();
	if (before.center.kind !== "group") throw new Error("group");
	before.center.tabs.push(file("legacy"));
	const after = opened(before, "legacy", "keep");
	expect(
		collectCenterGroups(conversationCenter(after.center) ?? after.center)
			.flatMap((g) => g.tabs)
			.map((t) => t.id),
	).toEqual(["conversation"]);
});

test("the dock cannot replace the final conversation group", () => {
	const document = opened(base(), "a");
	expect(
		isLayoutUnavailable(removeLayoutGroup(t, document, { area: "center", groupId: "chat" })),
	).toBe(true);
});

test("legacy previews from several groups migrate without replacing another open file", () => {
	const document = base();
	document.center = {
		kind: "split",
		id: "old",
		direction: "horizontal",
		weights: [0.5, 0.5],
		children: [
			{ kind: "group", id: "first", tabs: [file("one")], previewTabId: "one" },
			{ kind: "group", id: "second", tabs: [file("two")], previewTabId: "two" },
		],
	};
	const result = migrateLegacyFiles(document, 6, 3);
	if (isLayoutUnavailable(result)) throw new Error(result.reason);
	const dock = collectCenterGroups(result.document.center).find(
		(g) => g.id === FILE_WORKBENCH_GROUP,
	);
	expect(dock?.tabs.map((tab) => tab.id)).toEqual(["one", "two"]);
	expect(dock?.previewTabId).toBe("two");
	expect(migrateLegacyFiles(result.document, 6, 3)).toEqual({ document: result.document });
});

test("passive file restoration creates no visible navigator", () => {
	const before = base();
	const result = openFileWorkbench(before, file("late"), "keep", false, 6, 3, false);
	if (isLayoutUnavailable(result)) throw new Error(result.reason);
	expect(result.document.right).toBe(before.right);
	expect(conversationCenter(result.document.center)).toEqual(before.center);
});
