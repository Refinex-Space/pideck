import { afterEach, expect, test } from "bun:test";
import type { SessionEventPayload } from "@thinkrail/contracts";
import {
	publishSubagentActivity,
	setSessionPublisher,
	subagentActivityArgs,
} from "./agentSessionManager";

afterEach(() => setSessionPublisher(() => {}));

test("a subagent's tool call keeps only the path or command the file tree can use", () => {
	expect(subagentActivityArgs("read", { path: "src/a.ts", offset: 3, limit: 9 })).toEqual({
		path: "src/a.ts",
	});
	expect(
		subagentActivityArgs("edit", {
			path: "src/a.ts",
			edits: [{ oldText: "secret", newText: "x" }],
		}),
	).toEqual({ path: "src/a.ts" });
	expect(subagentActivityArgs("write", { path: "n.ts", content: "do not leak" })).toEqual({
		path: "n.ts",
	});
	expect(subagentActivityArgs("grep", { pattern: "needle", path: "src" })).toEqual({ path: "src" });
	expect(subagentActivityArgs("bash", { command: "cat README.md", timeout: 5 })).toEqual({
		command: "cat README.md",
	});
});

test("calls with nothing to show, an odd shape or an oversize value publish nothing", () => {
	expect(subagentActivityArgs("grep", { pattern: "needle" })).toBeNull();
	expect(subagentActivityArgs("read", { path: "" })).toBeNull();
	expect(subagentActivityArgs("read", { path: 3 })).toBeNull();
	expect(subagentActivityArgs("read", null)).toBeNull();
	expect(subagentActivityArgs("web_search", { path: "a.ts" })).toBeNull();
	expect(subagentActivityArgs("read", { path: "a".repeat(1_001) })).toBeNull();
	expect(subagentActivityArgs("bash", { command: "x".repeat(2_001) })).toBeNull();
	expect(subagentActivityArgs("bash", { path: "a.ts" })).toBeNull();
});

test("the parent chat's session carries the event, with the role when the child has one", () => {
	const payloads: SessionEventPayload[] = [];
	setSessionPublisher((payload) => payloads.push(payload));
	publishSubagentActivity("parent-1", {
		childSessionId: "child-1",
		roleName: "explorer",
		toolName: "read",
		args: { path: "src/a.ts", offset: 1 },
	});
	publishSubagentActivity("parent-1", { childSessionId: "child-2", toolName: "ls", args: {} });
	publishSubagentActivity("parent-1", {
		childSessionId: "child-2",
		toolName: "bash",
		args: { command: "ls src" },
	});
	expect(payloads).toEqual([
		{
			sessionId: "parent-1",
			event: {
				type: "subagent_activity",
				childSessionId: "child-1",
				roleName: "explorer",
				toolName: "read",
				args: { path: "src/a.ts" },
			},
		},
		{
			sessionId: "parent-1",
			event: {
				type: "subagent_activity",
				childSessionId: "child-2",
				toolName: "bash",
				args: { command: "ls src" },
			},
		},
	]);
});

test("a publisher that throws never fails the subagent", () => {
	setSessionPublisher(() => {
		throw new Error("closed");
	});
	expect(() =>
		publishSubagentActivity("parent-1", {
			childSessionId: "child-1",
			toolName: "read",
			args: { path: "a.ts" },
		}),
	).not.toThrow();
});
