import { describe, expect, test } from "bun:test";
import {
	AGENT_ACTIVITY_RUNNING_MAX_MS,
	AGENT_ACTIVITY_TTL_MS,
	type AgentActivityState,
	activityIndex,
	beginActivity,
	clearRecentActivity,
	completeActivity,
	DEFAULT_FILE_ACTIVITY_PREFERENCES,
	EMPTY_AGENT_ACTIVITY,
	nextActivityExpiry,
	noteActivity,
	parseFileActivityPreferences,
	pruneActivity,
	resolveActivityPath,
	SEARCH_HIT_LIMIT,
	searchHitTargets,
	settleSessionActivity,
	shellReadTargets,
	type ToolTarget,
	takeSearch,
	toolTargets,
	trackSearch,
} from "./agentActivity";

const ROOT = "/work/pideck";
const NO_SHELL = { shell: false };

describe("resolveActivityPath", () => {
	test("keeps paths inside the workspace and drops everything else", () => {
		expect(resolveActivityPath("src/a.ts", ROOT)).toBe("src/a.ts");
		expect(resolveActivityPath("./src//a.ts", ROOT)).toBe("src/a.ts");
		expect(resolveActivityPath(`${ROOT}/src/a.ts`, ROOT)).toBe("src/a.ts");
		expect(resolveActivityPath("@src/a.ts", ROOT)).toBe("src/a.ts");
		expect(resolveActivityPath("src/../docs/b.md", ROOT)).toBe("docs/b.md");
		expect(resolveActivityPath("../outside.ts", ROOT)).toBeNull();
		expect(resolveActivityPath("/etc/hosts", ROOT)).toBeNull();
		expect(resolveActivityPath(`${ROOT}-other/a.ts`, ROOT)).toBeNull();
		expect(resolveActivityPath("~/notes.md", ROOT)).toBeNull();
		expect(resolveActivityPath(ROOT, ROOT)).toBeNull();
		expect(resolveActivityPath(".", ROOT)).toBeNull();
	});

	test("resolves against a base directory and compares Windows drives without case", () => {
		expect(resolveActivityPath("a.ts", ROOT, "src")).toBe("src/a.ts");
		expect(resolveActivityPath("../a.ts", ROOT, "src")).toBe("a.ts");
		expect(resolveActivityPath("C:\\Work\\Repo\\src\\a.ts", "c:/work/repo")).toBe("src/a.ts");
	});
});

describe("toolTargets", () => {
	test("maps Pi's file tools to one target each", () => {
		expect(toolTargets("read", { path: "src/a.ts" }, ROOT, NO_SHELL)).toEqual([
			{ path: "src/a.ts", kind: "read", expandSelf: false },
		]);
		expect(toolTargets("read", { path: "a.ts", offset: 10, limit: 5 }, ROOT, NO_SHELL)).toEqual([
			{ path: "a.ts", kind: "read", expandSelf: false, range: { from: 10, to: 14 } },
		]);
		expect(toolTargets("read", { path: "a.ts", offset: 7 }, ROOT, NO_SHELL)[0]?.range).toEqual({
			from: 7,
			to: null,
		});
		expect(toolTargets("edit", { path: "a.ts", edits: [{}, {}, {}] }, ROOT, NO_SHELL)).toEqual([
			{ path: "a.ts", kind: "write", expandSelf: false, count: 3 },
		]);
		expect(toolTargets("write", { path: "new.ts", content: "x" }, ROOT, NO_SHELL)).toEqual([
			{ path: "new.ts", kind: "write", expandSelf: false },
		]);
		expect(toolTargets("ls", { path: "src" }, ROOT, NO_SHELL)).toEqual([
			{ path: "src", kind: "list", expandSelf: true },
		]);
		expect(toolTargets("grep", { pattern: "x", path: "src" }, ROOT, NO_SHELL)).toEqual([
			{ path: "src", kind: "search", expandSelf: false },
		]);
	});

	test("ignores calls with no path, a path outside the workspace, odd arguments and unknown tools", () => {
		expect(toolTargets("grep", { pattern: "x" }, ROOT, NO_SHELL)).toEqual([]);
		expect(toolTargets("ls", {}, ROOT, NO_SHELL)).toEqual([]);
		expect(toolTargets("read", { path: "/etc/hosts" }, ROOT, NO_SHELL)).toEqual([]);
		expect(toolTargets("read", null, ROOT, NO_SHELL)).toEqual([]);
		expect(toolTargets("read", { path: 3 }, ROOT, NO_SHELL)).toEqual([]);
		expect(toolTargets("web_search", { path: "a.ts" }, ROOT, NO_SHELL)).toEqual([]);
	});

	test("reads the shell only when asked to", () => {
		const args = { command: "cat src/a.ts" };
		expect(toolTargets("bash", args, ROOT, NO_SHELL)).toEqual([]);
		expect(toolTargets("bash", args, ROOT, { shell: true })).toEqual([
			{ path: "src/a.ts", kind: "read", expandSelf: false },
		]);
	});
});

describe("searchHitTargets", () => {
	const result = (lines: string[]) => ({ content: [{ type: "text", text: lines.join("\n") }] });

	test("names the files a grep matched, counting matches and skipping context lines", () => {
		const hits = searchHitTargets(
			"grep",
			{ pattern: "x", path: "src" },
			result(["a.ts:3: x", "a.ts-4- y", "a.ts:9: x", "lib/b.ts:1: x"]),
			ROOT,
		);
		expect(hits).toEqual([
			{ path: "src/a.ts", kind: "search", expandSelf: false, count: 2 },
			{ path: "src/lib/b.ts", kind: "search", expandSelf: false, count: 1 },
		]);
	});

	test("takes a bare name as the searched file itself", () => {
		const hits = searchHitTargets(
			"grep",
			{ pattern: "x", path: "src/a.ts" },
			result(["a.ts:3: x"]),
			ROOT,
		);
		expect(hits).toEqual([{ path: "src/a.ts", kind: "search", expandSelf: false, count: 1 }]);
	});

	test("lists the files a find returned and stops at the notice", () => {
		const hits = searchHitTargets(
			"find",
			{ pattern: "*.ts" },
			result(["src/a.ts", "src/b.ts", "", "[2 results limit reached]"]),
			ROOT,
		);
		expect(hits.map((hit) => hit.path)).toEqual(["src/a.ts", "src/b.ts"]);
		expect(hits[0]?.count).toBeUndefined();
	});

	test("caps the hits and ignores other tools and paths outside the workspace", () => {
		const many = Array.from({ length: 40 }, (_, index) => `f${index}.ts:1: x`);
		expect(searchHitTargets("grep", { pattern: "x" }, result(many), ROOT)).toHaveLength(
			SEARCH_HIT_LIMIT,
		);
		expect(searchHitTargets("read", { path: "a.ts" }, result(["a.ts:1: x"]), ROOT)).toEqual([]);
		expect(
			searchHitTargets("grep", { pattern: "x", path: "/etc" }, result(["a:1: x"]), ROOT),
		).toEqual([]);
		expect(searchHitTargets("grep", { pattern: "x" }, null, ROOT)).toEqual([]);
	});
});

describe("shellReadTargets", () => {
	const paths = (command: string) => shellReadTargets(command, ROOT).map((target) => target.path);

	test("names the file arguments of read-only commands", () => {
		expect(paths("cat README.md")).toEqual(["README.md"]);
		expect(paths("head -n 20 src/a.ts && tail -5 src/b.ts")).toEqual(["src/a.ts", "src/b.ts"]);
		expect(paths("sed -n '1,20p' src/a.ts")).toEqual(["src/a.ts"]);
		expect(paths("rg -n --glob '*.ts' needle src")).toEqual(["src"]);
		expect(paths("grep -rn needle src docs")).toEqual(["src", "docs"]);
		expect(paths("awk '{print $1}' data.txt")).toEqual(["data.txt"]);
		expect(paths("wc -l a.md b.md | sort")).toEqual(["a.md", "b.md"]);
	});

	test("lists directories and expands them", () => {
		expect(shellReadTargets("ls -la src", ROOT)).toEqual([
			{ path: "src", kind: "list", expandSelf: true },
		]);
		expect(paths("find packages -name '*.ts' -type f")).toEqual(["packages"]);
	});

	test("follows cd inside the workspace", () => {
		expect(paths("cd apps/web && cat src/a.ts")).toEqual(["apps/web/src/a.ts"]);
		expect(paths("cd /tmp && cat x")).toEqual([]);
	});

	test("never guesses past what it can read", () => {
		expect(paths("cat $FILE")).toEqual([]);
		expect(paths("cat src/*.ts")).toEqual([]);
		expect(paths("cat $(ls)")).toEqual([]);
		expect(paths("cat a.md > copy.md")).toEqual(["a.md"]);
		expect(paths("sed -i 's/a/b/' src/a.ts")).toEqual([]);
		expect(paths("cat /etc/hosts")).toEqual([]);
		expect(paths("npm run build")).toEqual([]);
		expect(paths("echo hi > out.txt")).toEqual([]);
	});

	test("caps what one command names", () => {
		const files = Array.from({ length: 30 }, (_, index) => `f${index}.md`).join(" ");
		expect(paths(`cat ${files}`)).toHaveLength(12);
	});
});

describe("activity lifecycle", () => {
	const read = (path: string): ToolTarget => ({ path, kind: "read", expandSelf: false });
	const write = (path: string): ToolTarget => ({ path, kind: "write", expandSelf: false });
	const call = (toolCallId: string, targets: ToolTarget[], tool = "read") => ({
		sessionId: "s1",
		toolCallId,
		tool,
		source: "agent" as const,
		targets,
	});

	test("lights a path while the tool runs, then fades it and remembers it", () => {
		let state = beginActivity(EMPTY_AGENT_ACTIVITY, call("t1", [read("a.ts")]), 1_000);
		expect(state.active[0]).toMatchObject({ phase: "running", expiresAt: null, path: "a.ts" });
		expect(state.recent).toHaveLength(0);

		state = completeActivity(state, { sessionId: "s1", toolCallId: "t1", failed: false }, 1_400);
		expect(state.active[0]).toMatchObject({
			phase: "done",
			expiresAt: 1_400 + AGENT_ACTIVITY_TTL_MS,
		});
		expect(state.recent.map((entry) => entry.path)).toEqual(["a.ts"]);
		expect(nextActivityExpiry(state)).toBe(1_400 + AGENT_ACTIVITY_TTL_MS);

		expect(pruneActivity(state, 1_400 + AGENT_ACTIVITY_TTL_MS - 1)).toBe(state);
		expect(pruneActivity(state, 1_400 + AGENT_ACTIVITY_TTL_MS).active).toEqual([]);
		expect(pruneActivity(state, 1_400 + AGENT_ACTIVITY_TTL_MS).recent).toHaveLength(1);
	});

	test("drops a failed call without a trace", () => {
		let state = beginActivity(EMPTY_AGENT_ACTIVITY, call("t1", [write("a.ts")], "edit"), 0);
		state = completeActivity(state, { sessionId: "s1", toolCallId: "t1", failed: true }, 10);
		expect(state).toEqual(EMPTY_AGENT_ACTIVITY);
		expect(
			completeActivity(state, { sessionId: "s1", toolCallId: "ghost", failed: false }, 20),
		).toBe(state);
	});

	test("adds a search's hits when it ends", () => {
		let state = beginActivity(
			EMPTY_AGENT_ACTIVITY,
			call("t1", [{ path: "src", kind: "search", expandSelf: false }], "grep"),
			0,
		);
		state = completeActivity(
			state,
			{
				sessionId: "s1",
				toolCallId: "t1",
				failed: false,
				hits: [{ path: "src/a.ts", kind: "search", expandSelf: false, count: 3 }],
			},
			50,
		);
		expect(state.active.map((entry) => entry.path).sort()).toEqual(["src", "src/a.ts"]);
		expect(state.active.find((entry) => entry.path === "src/a.ts")?.count).toBe(3);
	});

	test("settles a chat's unfinished work and prunes a stuck run", () => {
		let state = beginActivity(EMPTY_AGENT_ACTIVITY, call("t1", [read("a.ts")]), 0);
		state = beginActivity(state, { ...call("t2", [read("b.ts")]), sessionId: "s2" }, 0);
		state = settleSessionActivity(state, "s1");
		expect(state.active.map((entry) => entry.path)).toEqual(["b.ts"]);
		expect(settleSessionActivity(state, "s1")).toBe(state);
		expect(pruneActivity(state, AGENT_ACTIVITY_RUNNING_MAX_MS).active).toEqual([]);
	});

	test("remembers a search's path until its end event, and forgets it when the chat settles", () => {
		let state = trackSearch(EMPTY_AGENT_ACTIVITY, "s1", "t1", "grep", {
			pattern: "x",
			path: "src",
		});
		state = trackSearch(state, "s1", "t2", "find", { pattern: "*.ts" });
		expect(trackSearch(state, "s1", "t3", "read", { path: "a.ts" })).toBe(state);
		const taken = takeSearch(state, "s1", "t1");
		expect(taken.search).toEqual({ tool: "grep", path: "src" });
		expect(takeSearch(taken.state, "s1", "t1").search).toBeNull();
		expect(takeSearch(state, "s1", "t2").search).toEqual({ tool: "find", path: null });
		expect(settleSessionActivity(state, "s1").pending).toEqual({});
		expect(settleSessionActivity(state, "s2")).toBe(state);
	});

	test("notes finished work that had no start, and dedupes the recent list", () => {
		const note = (from: AgentActivityState, key: string, at: number): AgentActivityState =>
			noteActivity(
				from,
				{ sessionId: "s1", key, tool: "watch", source: "watch", targets: [write("a.ts")] },
				at,
			);
		let state = note(EMPTY_AGENT_ACTIVITY, "w1", 100);
		state = note(state, "w2", 600);
		expect(state.recent).toHaveLength(1);
		state = note(state, "w3", 5_000);
		expect(state.recent).toHaveLength(2);
		expect(clearRecentActivity(state).recent).toEqual([]);
		expect(clearRecentActivity(clearRecentActivity(state))).toEqual(clearRecentActivity(state));
	});
});

describe("activityIndex", () => {
	const prefs = DEFAULT_FILE_ACTIVITY_PREFERENCES;
	const entries = () => {
		let state = beginActivity(
			EMPTY_AGENT_ACTIVITY,
			{
				sessionId: "s1",
				toolCallId: "t1",
				tool: "read",
				source: "agent",
				targets: [{ path: "apps/web/src/a.ts", kind: "read", expandSelf: false }],
			},
			1,
		);
		state = beginActivity(
			state,
			{
				sessionId: "s1",
				toolCallId: "t2",
				tool: "ls",
				source: "agent",
				targets: [{ path: "docs", kind: "list", expandSelf: true }],
			},
			2,
		);
		return state.active;
	};

	test("opens ancestors, and a listed directory itself, and finds the newest path", () => {
		const index = activityIndex(entries(), prefs);
		expect([...index.expanded].sort()).toEqual(["apps", "apps/web", "apps/web/src", "docs"]);
		expect([...index.litDirs].sort()).toEqual(["apps", "apps/web", "apps/web/src"]);
		expect(index.byPath.get("apps/web/src/a.ts")?.kind).toBe("read");
		expect(index.newest).toBe("docs");
	});

	test("lets a write outrank a read of the same path and a running entry outrank a settled one", () => {
		let state = beginActivity(
			EMPTY_AGENT_ACTIVITY,
			{
				sessionId: "s1",
				toolCallId: "t1",
				tool: "read",
				source: "agent",
				targets: [{ path: "a.ts", kind: "read", expandSelf: false }],
			},
			1,
		);
		state = beginActivity(
			state,
			{
				sessionId: "s1",
				toolCallId: "t2",
				tool: "edit",
				source: "agent",
				targets: [{ path: "a.ts", kind: "write", expandSelf: false }],
			},
			2,
		);
		expect(activityIndex(state.active, prefs).byPath.get("a.ts")?.kind).toBe("write");
	});

	test("honours the preferences", () => {
		const active = entries();
		expect(activityIndex(active, { ...prefs, enabled: false }).byPath.size).toBe(0);
		expect(activityIndex(active, { ...prefs, reads: false }).byPath.size).toBe(0);
		expect(activityIndex(active, { ...prefs, expand: false }).expanded.size).toBe(0);
		expect(activityIndex(active, { ...prefs, expand: false }).byPath.size).toBe(2);

		const sub = beginActivity(
			EMPTY_AGENT_ACTIVITY,
			{
				sessionId: "s1",
				toolCallId: "t1",
				tool: "read",
				source: "subagent",
				targets: [{ path: "a.ts", kind: "read", expandSelf: false }],
			},
			1,
		).active;
		expect(activityIndex(sub, prefs).byPath.size).toBe(1);
		expect(activityIndex(sub, { ...prefs, subagents: false }).byPath.size).toBe(0);
		const shell = beginActivity(
			EMPTY_AGENT_ACTIVITY,
			{
				sessionId: "s1",
				toolCallId: "t1",
				tool: "bash",
				source: "shell",
				targets: [{ path: "a.ts", kind: "read", expandSelf: false }],
			},
			1,
		).active;
		expect(activityIndex(shell, prefs).byPath.size).toBe(0);
		expect(activityIndex(shell, { ...prefs, shell: true }).byPath.size).toBe(1);
		const writes = beginActivity(
			EMPTY_AGENT_ACTIVITY,
			{
				sessionId: "s1",
				toolCallId: "t1",
				tool: "write",
				source: "agent",
				targets: [{ path: "a.ts", kind: "write", expandSelf: false }],
			},
			1,
		).active;
		expect(activityIndex(writes, { ...prefs, writes: false }).byPath.size).toBe(0);
	});
});

describe("parseFileActivityPreferences", () => {
	test("falls back to the defaults and keeps only booleans", () => {
		expect(parseFileActivityPreferences(null)).toEqual(DEFAULT_FILE_ACTIVITY_PREFERENCES);
		expect(parseFileActivityPreferences("{nope")).toEqual(DEFAULT_FILE_ACTIVITY_PREFERENCES);
		expect(parseFileActivityPreferences("[]")).toEqual(DEFAULT_FILE_ACTIVITY_PREFERENCES);
		expect(
			parseFileActivityPreferences(JSON.stringify({ follow: false, shell: true, reads: "no" })),
		).toEqual({ ...DEFAULT_FILE_ACTIVITY_PREFERENCES, follow: false, shell: true });
	});
});
