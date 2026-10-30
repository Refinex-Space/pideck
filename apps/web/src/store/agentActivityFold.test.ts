import { describe, expect, test } from "bun:test";
import type {
	SessionEventPayload,
	Workspace,
	WorkspaceFsChangedPayload,
} from "@thinkrail/contracts";
import { DEFAULT_FILE_ACTIVITY_PREFERENCES, EMPTY_AGENT_ACTIVITY } from "./agentActivity";
import {
	type ActivityFoldState,
	foldAgentActivity,
	foldFsChangeActivity,
} from "./agentActivityFold";

const ROOT = "/work/pideck";
const WORKSPACE = { id: "w1", worktreePath: ROOT } as Workspace;

function state(overrides: Partial<ActivityFoldState> = {}): ActivityFoldState {
	return {
		tabsByWorkspace: {
			w1: [{ kind: "chat", id: "tab-1", workspaceId: "w1", name: "Chat", sessionId: "s1" }],
		},
		workspaces: { p1: [WORKSPACE] },
		sessions: { s1: { isStreaming: true } },
		agentActivityByWorkspace: {},
		fileActivityPreferences: { ...DEFAULT_FILE_ACTIVITY_PREFERENCES },
		...overrides,
	};
}

const start = (
	toolCallId: string,
	toolName: string,
	args: unknown,
	sessionId = "s1",
): SessionEventPayload => ({
	sessionId,
	event: { type: "tool_execution_start", toolCallId, toolName, args },
});

const end = (
	toolCallId: string,
	toolName: string,
	result: unknown,
	isError = false,
): SessionEventPayload => ({
	sessionId: "s1",
	event: { type: "tool_execution_end", toolCallId, toolName, result, isError },
});

function fold(from: ActivityFoldState, payloads: SessionEventPayload[], now = 1_000) {
	const next = foldAgentActivity(from, payloads, now);
	return next ? { ...from, agentActivityByWorkspace: next } : from;
}

describe("foldAgentActivity", () => {
	test("lights a path while its tool runs and settles it when the tool ends", () => {
		let current = fold(state(), [start("t1", "read", { path: "src/a.ts" })]);
		expect(current.agentActivityByWorkspace.w1?.active).toMatchObject([
			{ path: "src/a.ts", phase: "running", kind: "read", source: "agent" },
		]);
		current = fold(current, [end("t1", "read", { content: [] })], 1_500);
		expect(current.agentActivityByWorkspace.w1?.active).toMatchObject([
			{ path: "src/a.ts", phase: "done" },
		]);
		expect(current.agentActivityByWorkspace.w1?.recent).toHaveLength(1);
	});

	test("does nothing for a chat with no tab, a path outside the workspace or a tool it does not know", () => {
		const base = state();
		expect(
			foldAgentActivity(base, [start("t1", "read", { path: "a.ts" }, "stranger")], 1),
		).toBeNull();
		expect(foldAgentActivity(base, [start("t1", "read", { path: "/etc/hosts" })], 1)).toBeNull();
		expect(foldAgentActivity(base, [start("t1", "web_search", { path: "a.ts" })], 1)).toBeNull();
		expect(
			foldAgentActivity(base, [{ sessionId: "s1", event: { type: "agent_start" } }], 1),
		).toBeNull();
	});

	test("does nothing while the feature is off", () => {
		const off = state({
			fileActivityPreferences: { ...DEFAULT_FILE_ACTIVITY_PREFERENCES, enabled: false },
		});
		expect(foldAgentActivity(off, [start("t1", "read", { path: "a.ts" })], 1)).toBeNull();
	});

	test("names the files a search matched once it ends, and drops a failed edit", () => {
		let current = fold(state(), [
			start("t1", "grep", { pattern: "x", path: "src" }),
			start("t2", "edit", { path: "src/b.ts", edits: [{}] }),
		]);
		current = fold(
			current,
			[
				end("t1", "grep", { content: [{ type: "text", text: "a.ts:3: x\na.ts:9: x" }] }),
				end("t2", "edit", {}, true),
			],
			1_200,
		);
		const paths = (current.agentActivityByWorkspace.w1?.active ?? []).map((entry) => entry.path);
		expect(paths.sort()).toEqual(["src", "src/a.ts"]);
		expect(current.agentActivityByWorkspace.w1?.pending).toEqual({});
	});

	test("lights what a search with no path matched, from the workspace root", () => {
		let current = fold(state(), [start("t1", "find", { pattern: "*.md" })]);
		current = fold(
			current,
			[end("t1", "find", { content: [{ type: "text", text: "README.md\ndocs/a.md" }] })],
			1_200,
		);
		expect(
			(current.agentActivityByWorkspace.w1?.active ?? []).map((entry) => entry.path).sort(),
		).toEqual(["README.md", "docs/a.md"]);
	});

	test("forgets a chat's unfinished work when it settles", () => {
		let current = fold(state(), [start("t1", "read", { path: "a.ts" })]);
		current = fold(current, [
			{ sessionId: "s1", event: { type: "agent_settled", terminal: null } },
		]);
		expect(current.agentActivityByWorkspace.w1?.active).toEqual([]);
	});

	test("reads the shell only when the preference allows it", () => {
		const call = start("t1", "bash", { command: "cat README.md" });
		expect(foldAgentActivity(state(), [call], 1)).toBeNull();
		const on = state({
			fileActivityPreferences: { ...DEFAULT_FILE_ACTIVITY_PREFERENCES, shell: true },
		});
		expect(fold(on, [call]).agentActivityByWorkspace.w1?.active).toMatchObject([
			{ path: "README.md", source: "shell", kind: "read" },
		]);
	});

	test("notes a subagent's tool as settled work under the parent chat's workspace", () => {
		const current = fold(state(), [
			{
				sessionId: "s1",
				event: {
					type: "subagent_activity",
					childSessionId: "c1",
					roleName: "explorer",
					toolName: "read",
					args: { path: "src/a.ts" },
				},
			},
		]);
		expect(current.agentActivityByWorkspace.w1?.active).toMatchObject([
			{ path: "src/a.ts", source: "subagent", actor: "explorer", phase: "done" },
		]);
		expect(current.agentActivityByWorkspace.w1?.recent).toHaveLength(1);
	});

	test("leaves the other workspaces' state alone", () => {
		const other = { ...EMPTY_AGENT_ACTIVITY, recent: [] };
		const current = fold(state({ agentActivityByWorkspace: { w2: other } }), [
			start("t1", "read", { path: "a.ts" }),
		]);
		expect(current.agentActivityByWorkspace.w2).toBe(other);
	});
});

describe("foldFsChangeActivity", () => {
	const change = (paths: string[], truncated = false): WorkspaceFsChangedPayload => ({
		workspaceId: "w1",
		paths,
		truncated,
		skillChange: "none",
	});

	test("counts a changed file as the working chat's write", () => {
		const next = foldFsChangeActivity(state(), change(["dist/out.js", "notes.md"]), 1_000);
		expect(next?.w1?.active).toMatchObject([
			{ path: "dist/out.js", source: "watch", kind: "write", phase: "done" },
			{ path: "notes.md", source: "watch" },
		]);
	});

	test("stays quiet when no chat is working, the change is unnamed or writes are off", () => {
		const idle = state({ sessions: { s1: { isStreaming: false } } });
		expect(foldFsChangeActivity(idle, change(["a.ts"]), 1)).toBeNull();
		expect(foldFsChangeActivity(state(), change([]), 1)).toBeNull();
		expect(foldFsChangeActivity(state(), change(["a.ts"], true), 1)).toBeNull();
		const noWrites = state({
			fileActivityPreferences: { ...DEFAULT_FILE_ACTIVITY_PREFERENCES, writes: false },
		});
		expect(foldFsChangeActivity(noWrites, change(["a.ts"]), 1)).toBeNull();
	});

	test("skips a file the agent's own edit just lit", () => {
		const edited = fold(state(), [start("t1", "edit", { path: "src/a.ts", edits: [{}] })], 900);
		expect(foldFsChangeActivity(edited, change(["src/a.ts"]), 1_200)).toBeNull();
		const other = foldFsChangeActivity(edited, change(["src/a.ts", "src/b.ts"]), 1_200);
		expect(other?.w1?.active.map((entry) => entry.path).sort()).toEqual(["src/a.ts", "src/b.ts"]);
	});

	test("caps what one change lights", () => {
		const many = Array.from({ length: 40 }, (_, index) => `gen/f${index}.js`);
		expect(foldFsChangeActivity(state(), change(many), 1)?.w1?.active).toHaveLength(12);
	});
});
