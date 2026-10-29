import { expect, test } from "bun:test";
import { fileReference } from "./fileActions";

test("references quote spaced names and keep folders distinct", () => {
	expect(fileReference("src/a.ts", "file")).toBe("@src/a.ts ");
	expect(fileReference("my folder", "dir")).toBe('@"my folder/" ');
});

test("source quotations retain line ranges and cannot break their own fence", () => {
	const result = fileReference("src/a.ts", "file", {
		text: "const s = '```';",
		startLine: 2,
		endLine: 4,
	});
	expect(result).toBe("@src/a.ts:2-4\n````\nconst s = '```';\n````\n");
});

test("a currently selected chat wins over older composer focus", async () => {
	const { useAppStore } = await import("../store");
	const { addFileToChat } = await import("./fileActions");
	useAppStore.setState(useAppStore.getInitialState(), true);
	useAppStore.setState({ activeWorkspaceId: "w" });
	const state = useAppStore.getState();
	state.openChatSession("w", "old", null, "off");
	state.setChatDraft("old", "old draft");
	state.rememberComposerCursor("w", "old", { draft: "old draft", start: 9, end: 9 });
	state.openChatSession("w", "current", null, "off");
	await addFileToChat("w", "source.ts", "file");
	expect(useAppStore.getState().sessions.old?.draft).toBe("old draft");
	expect(useAppStore.getState().sessions.current?.draft).toBe("@source.ts ");
});
