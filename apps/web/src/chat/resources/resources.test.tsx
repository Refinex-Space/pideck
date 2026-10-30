import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import type {
	BackgroundCommandSummary,
	McpServerResourceSummary,
	SubagentResourceSummary,
} from "@thinkrail/contracts";
import { currentTranslator } from "@thinkrail/locales/react";
import { TooltipProvider } from "@thinkrail/ui/tooltip";
import type { ComponentProps, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as resources from "./index";
import { mcpRowActions } from "./mcpRow";
import { DetailHeader } from "./ResourceDetailDialog";
import { elapsedLabel, formatElapsed, resourceState, sortLive } from "./resourceRow";

const NOW = 10 * 60_000;
const render = (node: ReactNode) => renderToStaticMarkup(<TooltipProvider>{node}</TooltipProvider>);
const command: BackgroundCommandSummary = {
	id: "build",
	sessionId: "chat",
	name: "Build <script>",
	command: "echo '<img src=x onerror=bad()>'",
	status: "running",
	startedAt: NOW - 4 * 60_000,
};
const child: SubagentResourceSummary = {
	childSessionId: "child",
	parentSessionId: "chat",
	roleName: "scout",
	task: "<b>Inspect</b> the registry",
	status: "queued",
	createdAt: new Date(NOW - 30_000).toISOString(),
};
const rosterProps: ComponentProps<typeof resources.ResourcesRoster> = {
	commands: [],
	subagents: [],
	finishedCommands: [],
	finishedSubagents: [],
	now: NOW,
	authoritative: true,
	loading: false,
	stale: false,
	error: null,
	actions: {},
	onInspect: () => {},
	onRetry: () => {},
	onStopCommand: () => {},
	onStopSubagent: () => {},
	onStopAll: () => {},
};
const dockProps: ComponentProps<typeof resources.ResourcesDock> = {
	commands: [],
	subagents: [],
	now: NOW,
	authoritative: true,
	actions: {},
	onInspect: () => {},
	onStopCommand: () => {},
	onStopSubagent: () => {},
};

test("resource primitives keep their props-only import boundary", () => {
	for (const file of readdirSync(import.meta.dir).filter(
		(file) => /\.(ts|tsx)$/.test(file) && !file.includes(".test."),
	)) {
		const source = readFileSync(`${import.meta.dir}/${file}`, "utf8");
		for (const [, dependency] of source.matchAll(/from\s+["']([^"']+)["']/g)) {
			expect(dependency).toMatch(
				/^(?:@thinkrail\/contracts|@thinkrail\/locales(?:\/react)?$|react|lucide-react$|@remixicon\/react|@thinkrail\/ui\/|@\/lib$|\.\/)/,
			);
		}
		expect(source).not.toMatch(
			/(?<![.\w])(?:store|transport)\b|xterm|dangerouslySetInnerHTML|Markdown/,
		);
	}
});

test("the row vocabulary collapses wire statuses into one live and three settled states, sorts live rows oldest-first and reports run time per kind", () => {
	const state = (overrides: Partial<BackgroundCommandSummary>) =>
		resourceState({ kind: "command", summary: { ...command, ...overrides } });
	expect(state({})).toBe("working");
	expect(state({ status: "stopping" })).toBe("stopping");
	expect(state({ status: "completed", exitCode: 0 })).toBe("done");
	expect(state({ status: "completed", exitCode: 2 })).toBe("failed");
	expect(state({ status: "error", exitCode: 1 })).toBe("failed");
	expect(state({ status: "stopped", exitCode: 130 })).toBe("stopped");
	const childState = (status: SubagentResourceSummary["status"]) =>
		resourceState({ kind: "subagent", summary: { ...child, status } });
	expect(childState("queued")).toBe("queued");
	expect(childState("running")).toBe("working");
	expect(childState("completed")).toBe("done");
	expect(childState("error")).toBe("failed");
	expect(childState("aborted")).toBe("stopped");
	expect(formatElapsed(currentTranslator(), 20_000)).toBe("<1 min");
	expect(formatElapsed(currentTranslator(), 4 * 60_000 + 5_000)).toBe("4 min");
	expect(formatElapsed(currentTranslator(), 125 * 60_000)).toBe("2 h 5 min");
	const elapsed = (resource: Parameters<typeof elapsedLabel>[1]) =>
		elapsedLabel(currentTranslator(), resource, NOW);
	expect(elapsed({ kind: "command", summary: command })).toBe("4 min");
	expect(
		elapsed({
			kind: "command",
			summary: { ...command, status: "completed", exitCode: 0, finishedAt: NOW - 60_000 },
		}),
	).toBe("3 min");
	expect(elapsed({ kind: "subagent", summary: child })).toBeNull();
	expect(elapsed({ kind: "subagent", summary: { ...child, status: "running" } })).toBe("<1 min");
	expect(
		elapsed({
			kind: "subagent",
			summary: { ...child, status: "completed", durationMs: 7 * 60_000 },
		}),
	).toBe("7 min");
	expect(elapsed({ kind: "subagent", summary: { ...child, status: "aborted" } })).toBeNull();
	const order = sortLive([
		{ kind: "subagent", summary: child },
		{ kind: "command", summary: { ...command, id: "late", startedAt: NOW - 1000 } },
		{
			kind: "command",
			summary: { ...command, id: "stopping", status: "stopping", startedAt: NOW - 3 * 60_000 },
		},
		{ kind: "command", summary: command },
	]).map((resource) => (resource.kind === "command" ? resource.summary.id : "child"));
	expect(order).toEqual(["build", "stopping", "child", "late"]);
});

test("ChatView mounts the task strip and reads one provider-owned resources scope", () => {
	const source = readFileSync(`${import.meta.dir}/../ChatView.tsx`, "utf8");
	expect(source).toContain("<ResourcesDock");
	expect(source).toContain("useChatResourcesScope()");
	expect(source).toContain("resources.visible && !statusOpen ? (");
	for (const retired of [
		"ResourcesInspector",
		"ResourcesButton",
		"ResourcesAttention",
		"SkillsDialog",
	])
		expect(source).not.toContain(retired);
});

test("the dock lists live rows oldest-first with escaped text, one inspect control and stop, and collapses past four", () => {
	const empty = renderToStaticMarkup(<resources.ResourcesDock {...dockProps} />);
	expect(empty).toBe("");

	const html = renderToStaticMarkup(
		<resources.ResourcesDock
			{...dockProps}
			commands={[
				{ ...command, id: "stopping", status: "stopping", startedAt: NOW - 6 * 60_000 },
				command,
			]}
			subagents={[child]}
		/>,
	);
	expect(html).toContain('data-testid="resources-dock"');
	expect(html).not.toContain("data-collapsed");
	expect(html.indexOf('data-resource-id="stopping"')).toBeLessThan(
		html.indexOf('data-resource-id="build"'),
	);
	expect(html.indexOf('data-resource-id="build"')).toBeLessThan(
		html.indexOf('data-resource-id="child"'),
	);
	expect(html).toMatch(
		/data-testid="resource-inspect"[^>]*>[\s\S]*?Build &lt;script&gt;[\s\S]*?echo/,
	);
	expect(html).toContain('data-status="running"');
	expect(html).toContain('data-state="working"');
	expect(html).toContain("4 min");
	expect(html).toContain('data-testid="resource-inspect"');
	expect(html).toMatch(/data-testid="resource-stop"[^>]*disabled/);
	expect(html).toContain("3 active");
	expect(html).not.toContain("<img");
	expect(html).not.toContain("<b>");
	expect(html).toContain("&lt;script&gt;");

	const many = renderToStaticMarkup(
		<resources.ResourcesDock
			{...dockProps}
			commands={[1, 2, 3, 4, 5].map((n) => ({ ...command, id: `c${n}` }))}
		/>,
	);
	expect(many).toContain('data-collapsed="true"');
	expect(many).not.toContain('data-resource-id="c1"');
	expect(many).toContain("5 active");
	expect(many).toContain('aria-expanded="false"');

	const stale = renderToStaticMarkup(
		<resources.ResourcesDock {...dockProps} commands={[command]} authoritative={false} />,
	);
	expect(stale).toMatch(/data-testid="resource-stop"[^>]*disabled/);
	expect(stale).toContain("reconnecting");
});

test("the roster lists live rows with escaped text and keeps Stop beside each, finished rows wait behind a count", () => {
	const html = render(
		<resources.ResourcesRoster
			{...rosterProps}
			commands={[command]}
			subagents={[child]}
			finishedCommands={[
				{ ...command, id: "finished", status: "completed", finishedAt: NOW - 60_000, exitCode: 1 },
			]}
			finishedSubagents={[{ ...child, status: "aborted", abortReason: "Stopped by user" }]}
		/>,
	);
	expect(html).toContain('data-testid="resources-roster"');
	expect(html).toContain('data-testid="resources-active"');
	expect(html).toContain('data-testid="resources-finished"');
	expect(html).toContain('data-resource-id="build"');
	expect(html).toContain('data-resource-id="child"');
	expect(html.indexOf('data-resource-id="build"')).toBeLessThan(
		html.indexOf('data-resource-id="child"'),
	);
	expect(html.match(/data-testid="resource-stop"/g)?.length).toBe(2);
	expect(html).toContain('aria-label="Stop all subagents"');
	expect(html).toContain("Finished");
	expect(html).toContain("· 2");
	expect(html).toMatch(/data-testid="resources-finished-toggle"[^>]*aria-expanded="false"/);
	expect(html).not.toContain('data-resource-id="finished"');
	expect(html).toContain("Build &lt;script&gt;");
	expect(html).not.toContain("<img");
	expect(html).not.toContain("<b>");
	expect(html).not.toContain("resources-inspector");
});

test("the roster disables controls when stale, and surfaces failures with retry", () => {
	const html = render(
		<resources.ResourcesRoster
			{...rosterProps}
			commands={[command]}
			authoritative={false}
			stale
			error="Read failed"
			actions={{ "command:build": { pending: false, error: "Stop failed" } }}
		/>,
	);
	expect(html).toContain("Snapshot is stale");
	expect(html).toContain("reconnecting");
	expect(html).toMatch(/data-testid="resource-stop"[^>]*disabled/);
	expect(html).toContain("Stop failed");
	expect(html).toContain("Read failed");
	expect(html).toContain('role="alert"');
	expect(html).toContain('data-testid="resources-retry"');
	expect(html).not.toContain('data-testid="resources-stop-all"');
	const idle = render(<resources.ResourcesRoster {...rosterProps} />);
	expect(idle).toContain("Nothing is running in the background.");
});

test("the detail header shows a subagent's model through the parent's label and omits it when the host sent none", () => {
	const header = (summary: SubagentResourceSummary, label: boolean) =>
		render(
			<DetailHeader
				resource={{ kind: "subagent", summary }}
				now={NOW}
				authoritative
				actions={{}}
				onStop={() => {}}
				renderSubagentModel={
					label
						? (value) => (
								<span data-testid="label">{`${value.model} @ ${value.thinkingLevel}`}</span>
							)
						: () => <span>never</span>
				}
			/>,
		);
	const labelled = header({ ...child, model: "openai/gpt-6", thinkingLevel: "max" }, true);
	expect(labelled).toContain('data-testid="resource-detail-model"');
	expect(labelled).toContain(">Model<");
	expect(labelled).toContain("openai/gpt-6 @ max");
	expect(labelled).toContain('data-testid="resource-detail-stop"');

	const older = header(child, false);
	expect(older).not.toContain('data-testid="resource-detail-model"');
	expect(older).not.toContain("never");

	const settled = header({ ...child, status: "completed", durationMs: 7 * 60_000 }, true);
	expect(settled).not.toContain('data-testid="resource-detail-stop"');
	expect(settled).toContain("7 min");
});

test("command logs distinguish loading, empty, retry, permanent unavailability, stale and truncated plain text", () => {
	const log = (overrides: Partial<ComponentProps<typeof resources.CommandLogView>>) =>
		renderToStaticMarkup(
			<resources.CommandLogView
				result={null}
				error={null}
				stale={false}
				onRetry={() => {}}
				{...overrides}
			/>,
		);
	expect(log({})).toContain("Loading logs…");
	expect(log({ result: { available: false } })).toContain('data-testid="command-log-unavailable"');
	expect(log({ error: "Try again", stale: true })).toContain('role="alert"');
	expect(log({ error: "Try again" })).toContain('data-testid="resources-retry"');
	expect(log({ stale: true })).toContain("Logs are stale.");
	expect(
		log({ result: { available: true, command, output: { text: "", truncated: false } } }),
	).toContain("No output yet.");
	const html = log({
		result: {
			available: true,
			command,
			output: { text: "<script>bad()</script>\n**not markdown**\u001b[31m", truncated: true },
		},
	});
	expect(html).toContain("Output truncated");
	expect(html).toContain("&lt;script&gt;bad()&lt;/script&gt;");
	expect(html).toContain("**not markdown**");
	expect(html).not.toContain("<script>");
	expect(html).not.toContain("<strong>");
});

test("the result row maps a completion to the shared states, teases the last output line and stays collapsed unless told", () => {
	const finished = {
		id: "bg-1",
		sessionId: "chat",
		name: "full e2e <b>",
		status: "completed" as const,
		startedAt: 0,
		finishedAt: 12 * 60_000 + 4_000,
		exitCode: 1,
		output: { text: "  1 failed\n\u001b[32m141 passed (12.1m)\u001b[39m\n\n", truncated: true },
	};
	const row = (overrides: Partial<ComponentProps<typeof resources.ResultRow>>) =>
		renderToStaticMarkup(
			<resources.ResultRow
				source={{ kind: "command", details: finished }}
				expanded={false}
				{...overrides}
			>
				<pre>BODY</pre>
			</resources.ResultRow>,
		);
	const collapsed = row({ onToggle: () => {} });
	expect(collapsed).toContain("Failed");
	expect(collapsed).toContain("12 min");
	expect(collapsed).toContain("exit 1");
	expect(collapsed).toContain("full e2e &lt;b&gt;");
	expect(collapsed).toContain('data-testid="background-result-teaser"');
	expect(collapsed).toContain(">141 passed (12.1m)<");
	expect(collapsed).toContain('aria-expanded="false"');
	expect(collapsed).not.toContain("BODY");
	expect(collapsed).not.toContain('data-testid="background-result-open"');

	const open = row({ onToggle: () => {}, expanded: true, onOpen: () => {} });
	expect(open).toContain("BODY");
	expect(open).not.toContain('data-testid="background-result-teaser"');
	expect(open).toContain("Open log");

	expect(row({})).not.toContain('data-testid="background-result-toggle"');
	expect(row({ source: { kind: "command", details: { ...finished, exitCode: 0 } } })).toContain(
		"Done",
	);
	expect(
		row({
			source: { kind: "command", details: { ...finished, status: "stopped", exitCode: null } },
		}),
	).toContain("Stopped");

	const subagent = renderToStaticMarkup(
		<resources.ResultRow
			source={{
				kind: "subagent",
				details: {
					childSessionId: "child",
					roleName: "reviewer",
					task: "review",
					status: "aborted",
					usage: {
						input: 0,
						output: 0,
						cacheRead: 0,
						cacheWrite: 0,
						cost: 0,
						turns: 0,
						contextTokens: 0,
					},
					durationMs: 0,
				},
			}}
			expanded={false}
			metaLead={<span data-testid="meta-lead">gpt-6 · max</span>}
			meta="12 turns"
			teaser="Verdict: approve"
			onOpen={() => {}}
		/>,
	);
	expect(subagent).toContain("Subagent");
	expect(subagent).toContain("reviewer");
	expect(subagent).toContain("Stopped");
	expect(subagent).toMatch(/data-testid="meta-lead"[\s\S]*12 turns/);
	expect(subagent).toContain("Verdict: approve");
	expect(subagent).toContain("Transcript");
	expect(subagent).not.toContain("min<");
});

test("MCP rows offer per-chat actions by state: disable, enable, reconnect, and Settings for sign-in or approval", () => {
	const actions = (state: McpServerResourceSummary["state"]) =>
		mcpRowActions({ name: "docs", state, transport: "stdio" }).map((action) => action.id);
	expect(actions("connected")).toEqual(["disable"]);
	expect(actions("starting")).toEqual(["disable"]);
	expect(actions("disabled-in-chat")).toEqual(["enable"]);
	expect(actions("failed")).toEqual(["reconnect", "disable"]);
	expect(actions("disconnected")).toEqual(["reconnect", "disable"]);
	expect(actions("needs-sign-in")).toEqual(["settings", "disable"]);
	expect(actions("pending-approval")).toEqual(["settings"]);
	expect(actions("pending-reload")).toEqual([]);
	expect(actions("disabled-in-project")).toEqual([]);
	const registered = (state: McpServerResourceSummary["state"]) =>
		mcpRowActions({ name: "ext", state, transport: "http", registered: true }).map(
			(action) => action.id,
		);
	expect(registered("connected")).toEqual([]);
	expect(registered("failed")).toEqual(["reconnect"]);
	expect(registered("needs-sign-in")).toEqual(["settings"]);
});

test("the connector list is one line per server: tool count when connected, a state otherwise, an inline action only when one is needed", () => {
	const mcpServers: McpServerResourceSummary[] = [
		{ name: "linear", state: "needs-sign-in", transport: "http" },
		{ name: "fixture", state: "connected", toolCount: 2, transport: "stdio" },
		{ name: "quiet", state: "disabled-in-chat", transport: "stdio" },
		{ name: "ext", state: "connected", toolCount: 1, transport: "http", registered: true },
	];
	const list = (props: Partial<ComponentProps<typeof resources.McpConnectorList>> = {}) =>
		render(
			<resources.McpConnectorList
				servers={mcpServers}
				authoritative
				actions={{ "mcp:fixture": { pending: false, error: "Disable failed" } }}
				onSetEnabled={() => {}}
				onReconnect={() => {}}
				onOpenSettings={() => {}}
				{...props}
			/>,
		);
	const html = list();
	expect(html).toContain('data-testid="resources-mcp"');
	expect(html.match(/data-testid="resource-mcp"/g)).toHaveLength(4);
	expect(html).toMatch(
		/data-testid="resource-mcp-state"[^>]*>(?:<span class="sr-only">Connected · <\/span>)2 tools</,
	);
	expect(html).toMatch(/data-name="quiet" data-state="disabled-in-chat"/);
	expect(html).toContain("Needs sign-in");
	expect(html).toContain("Disabled in this chat");
	// Sign in and Enable sit on their rows; Disable lives in the menu of rows that can offer it.
	expect(html).toContain('data-testid="resource-mcp-settings"');
	expect(html).toContain('data-testid="resource-mcp-enable"');
	expect(html).not.toContain('data-testid="resource-mcp-disable"');
	expect(html.match(/data-testid="resource-mcp-menu"/g)).toHaveLength(2);
	expect(html).toContain("Disable failed");
	expect(html).not.toContain("Disabling applies when the chat is idle");
	expect(list({ authoritative: false })).toMatch(
		/data-testid="resource-mcp-settings"[^>]*disabled=""/,
	);
	expect(list({ servers: [] })).toBe("");
});

test("the dock keeps finished results the user has not seen yet, with inspect and dismiss", () => {
	const done: BackgroundCommandSummary = {
		...command,
		id: "done",
		status: "completed",
		exitCode: 0,
		finishedAt: NOW - 60_000,
	};
	const reviewed: SubagentResourceSummary = {
		...child,
		childSessionId: "reviewed",
		status: "completed",
		durationMs: 120_000,
	};
	const freshOnly = renderToStaticMarkup(
		<resources.ResourcesDock
			{...dockProps}
			freshCommands={[done]}
			freshSubagents={[reviewed]}
			onDismiss={() => {}}
		/>,
	);
	expect(freshOnly).toContain('data-testid="resources-dock"');
	expect(freshOnly).toMatch(/data-resource-id="done"[^>]*data-fresh="true"/);
	expect(freshOnly).toMatch(/data-resource-id="reviewed"[^>]*data-fresh="true"/);
	expect(freshOnly).toContain('data-testid="resource-dismiss"');
	expect(freshOnly).not.toContain('data-testid="resource-stop"');
	expect(freshOnly).toContain("2 new");
	expect(freshOnly).not.toContain("active");
	expect(freshOnly).not.toContain("animate-working");

	const mixed = renderToStaticMarkup(
		<resources.ResourcesDock {...dockProps} commands={[command]} freshCommands={[done]} />,
	);
	expect(mixed.indexOf('data-resource-id="build"')).toBeLessThan(
		mixed.indexOf('data-resource-id="done"'),
	);
	expect(mixed).toContain("1 active");
	expect(mixed).toContain("1 new");
	expect(mixed).not.toContain('data-testid="resource-dismiss"');

	const crowded = renderToStaticMarkup(
		<resources.ResourcesDock
			{...dockProps}
			commands={[command]}
			freshCommands={[1, 2, 3, 4].map((n) => ({ ...done, id: `done-${n}` }))}
		/>,
	);
	expect(crowded).toContain('data-collapsed="true"');
});
