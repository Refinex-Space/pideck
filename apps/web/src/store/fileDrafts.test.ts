import { beforeEach, expect, test } from "bun:test";
import { useAppStore } from "./appStore";
import { fileDraftKey, insertAtCursor } from "./fileDrafts";

beforeEach(() => useAppStore.setState(useAppStore.getInitialState(), true));

test("insertion preserves prefix, suffix and a selected replacement; stale cursor appends", () => {
	expect(
		insertAtCursor("hello world", "@src/a.ts", { draft: "hello world", start: 6, end: 11 }),
	).toEqual({ text: "hello @src/a.ts", caret: 15 });
	expect(insertAtCursor("new draft", "@a.ts", { draft: "old", start: 0, end: 3 }).text).toBe(
		"new draft @a.ts",
	);
});

test("inserting a file reference changes only the addressed chat and does not send a turn", () => {
	useAppStore.setState({ activeWorkspaceId: "w" });
	const state = useAppStore.getState();
	state.openChatSession("w", "first", null, "off");
	state.openChatSession("w", "second", null, "off");
	state.setChatDraft("first", "before after");
	state.setChatDraft("second", "other draft");
	state.rememberComposerCursor("w", "first", { draft: "before after", start: 7, end: 7 });
	state.insertChatText("w", "first", "@file.ts ");
	const next = useAppStore.getState();
	expect(next.sessions.first?.draft).toBe("before @file.ts after");
	expect(next.sessions.second?.draft).toBe("other draft");
	expect(next.sessions.first?.turns).toEqual([]);
	expect(next.sessions.first?.composerInsertion?.start).toBe(16);
});

test("save completion retains edits typed during the request and advances the conflict base", () => {
	const state = useAppStore.getState();
	state.beginFileEdit("w", "a.ts", "old", "hash-old");
	state.setFileDraftText("w", "a.ts", "submitted");
	state.setFileDraftSaving("w", "a.ts", true);
	state.setFileDraftText("w", "a.ts", "typed while saving");
	state.finishFileDraftSave("w", "a.ts", "submitted", "hash-new");
	expect(useAppStore.getState().fileDrafts[fileDraftKey("w", "a.ts")]).toMatchObject({
		text: "typed while saving",
		baseContent: "submitted",
		baseHash: "hash-new",
		saving: false,
	});
});

test("a host move follows clean cached files and retains dirty paths for recovery", () => {
	useAppStore.setState({
		tabsByWorkspace: {
			w: [
				{
					kind: "file",
					id: "clean",
					workspaceId: "w",
					name: "clean.ts",
					path: "src/clean.ts",
					content: "saved",
				},
				{
					kind: "file",
					id: "dirty",
					workspaceId: "w",
					name: "dirty.ts",
					path: "src/dirty.ts",
					content: "saved",
				},
			],
		},
	});
	const state = useAppStore.getState();
	state.beginFileEdit("w", "src/dirty.ts", "saved", "h");
	state.setFileDraftText("w", "src/dirty.ts", "unsaved");
	state.noteFsChanged({
		workspaceId: "w",
		paths: ["src", "source"],
		truncated: false,
		skillChange: "none",
		mutation: { kind: "move", from: "src", to: "source" },
	});
	const next = useAppStore.getState();
	expect(next.tabsByWorkspace.w?.map((tab) => (tab.kind === "file" ? tab.path : ""))).toEqual([
		"source/clean.ts",
		"src/dirty.ts",
	]);
	expect(next.fileDrafts[fileDraftKey("w", "src/dirty.ts")]?.text).toBe("unsaved");
	expect(next.layoutIntents.at(-1)).toMatchObject({
		kind: "move-files",
		preserved: ["src/dirty.ts"],
	});
});

test("a late reference for another workspace preserves its draft without taking active focus", () => {
	const state = useAppStore.getState();
	state.openChatSession("w", "first", null, "off");
	useAppStore.setState({ activeWorkspaceId: "other", layoutIntents: [] });
	state.insertChatText("w", "first", "@a.ts ");
	const next = useAppStore.getState();
	expect(next.sessions.first?.draft).toBe("@a.ts ");
	expect(next.activeWorkspaceId).toBe("other");
	expect(next.sessions.first?.composerInsertion).toBeUndefined();
	expect(next.layoutIntents).toEqual([]);
});
