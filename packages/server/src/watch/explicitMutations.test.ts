import { afterEach, expect, test } from "bun:test";
import type { WorkspaceFsChangedPayload } from "@thinkrail/contracts";
import { notifyWorkspaceFiles, setSkillPathClassifier, setWatchPublisher } from "./watch";

afterEach(() => {
	setWatchPublisher(null);
	setSkillPathClassifier(null);
});

test("explicit source writes do not spuriously invalidate skills and moves retain their identity", () => {
	const frames: WorkspaceFsChangedPayload[] = [];
	setWatchPublisher((frame) => frames.push(frame));
	setSkillPathClassifier((path) => path.startsWith(".pi/skills/"));
	notifyWorkspaceFiles("w", ["src/a.ts"]);
	notifyWorkspaceFiles("w", [".pi/skills/new/SKILL.md"]);
	notifyWorkspaceFiles("w", ["src", "source"], { kind: "move", from: "src", to: "source" });
	expect(frames.map((frame) => frame.skillChange)).toEqual(["none", "detected", "none"]);
	expect(frames[2]?.mutation).toEqual({ kind: "move", from: "src", to: "source" });
});
