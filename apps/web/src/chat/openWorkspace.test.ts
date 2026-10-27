import { afterAll, beforeEach, expect, mock, test } from "bun:test";
import type { Workspace } from "@thinkrail/contracts";

const requests: { method: string; params: unknown }[] = [];
let reply: () => Promise<unknown> = () => Promise.resolve([]);
const actualTransport = await import("../transport");
mock.module("../transport", () => ({
	...actualTransport,
	getTransport: () => ({
		request: (method: string, params: unknown) => {
			requests.push({ method, params });
			return reply();
		},
	}),
}));

const { useAppStore } = await import("../store");
const { openWorkspace } = await import("./openWorkspace");

const workspace = (id: string, projectId: string): Workspace => ({
	id,
	projectId,
	name: id,
	branch: id,
	worktreePath: `/wt/${id}`,
	baseBranch: "main",
});

beforeEach(() => {
	requests.length = 0;
	reply = () => Promise.resolve([]);
	useAppStore.setState(useAppStore.getInitialState(), true);
	useAppStore.setState({ workspaces: { p1: [workspace("w1", "p1")] } });
});

afterAll(() => useAppStore.setState(useAppStore.getInitialState(), true));

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const opened = () => {
	const state = useAppStore.getState();
	return {
		projectId: state.selectedProjectId,
		workspaceId: state.activeWorkspaceId,
		sessionId: state.routeChatTarget?.sessionId ?? null,
	};
};

test("a workspace the store holds opens at once, under its own project", () => {
	openWorkspace({ workspaceId: "w1", projectId: "stale", sessionId: "s1" });
	expect(requests).toEqual([]);
	expect(opened()).toEqual({ projectId: "p1", workspaceId: "w1", sessionId: "s1" });
});

test("an unknown workspace loads its project's list first, then opens", async () => {
	reply = () => Promise.resolve([workspace("w9", "p2")]);
	openWorkspace({ workspaceId: "w9", projectId: "p2", sessionId: "s9" });
	expect(opened().workspaceId).not.toBe("w9");
	await settle();
	expect(requests).toEqual([{ method: "workspace.list", params: { projectId: "p2" } }]);
	expect(useAppStore.getState().workspaces.p2?.map((row) => row.id)).toEqual(["w9"]);
	expect(opened()).toEqual({ projectId: "p2", workspaceId: "w9", sessionId: "s9" });
});

test("a failed list still opens the workspace", async () => {
	reply = () => Promise.reject(new Error("offline"));
	openWorkspace({ workspaceId: "w9", projectId: "p2" });
	await settle();
	expect(opened()).toEqual({ projectId: "p2", workspaceId: "w9", sessionId: null });
});
