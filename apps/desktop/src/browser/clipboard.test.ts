import { expect, test } from "bun:test";
import { clipboardShortcut } from "./clipboard";

test("agent clipboard shortcuts are scoped while developer-tool shortcuts keep their meaning", () => {
	expect(clipboardShortcut("Meta+V", "darwin")).toBe("paste");
	expect(clipboardShortcut("ControlOrMeta+C", "darwin")).toBe("copy");
	expect(clipboardShortcut("Control+X", "win32")).toBe("cut");
	expect(clipboardShortcut("Control+Shift+V", "linux")).toBe("paste");
	expect(clipboardShortcut("Meta+Shift+C", "darwin")).toBeNull();
	expect(clipboardShortcut("Alt+V", "win32")).toBeNull();
});
