import { beforeEach, expect, test } from "bun:test";
import { LSP_PROTOCOL_VERSION, type LspStatusPayload } from "@thinkrail/contracts";
import { useAppStore } from "./index";

const state = useAppStore.getState;

const payload = (extra: Partial<LspStatusPayload> = {}): LspStatusPayload => ({
	workspaceId: "w1",
	enabled: true,
	trusted: true,
	servers: [
		{
			id: "typescript",
			name: "TypeScript",
			root: ".",
			state: "ready",
			files: 2,
			errors: 1,
			warnings: 0,
			custom: false,
		},
	],
	...extra,
});

beforeEach(() => {
	useAppStore.setState(useAppStore.getInitialState(), true);
	state().setStatus("connected");
	state().installWelcomeSnapshot(LSP_PROTOCOL_VERSION, [], []);
});

test("a host's status is kept per workspace, without the workspace id inside it", () => {
	state().applyLspStatus(payload());
	state().applyLspStatus(payload({ workspaceId: "w2", enabled: false, servers: [] }));
	expect(state().lspByWorkspace.w1).toMatchObject({ enabled: true, trusted: true });
	expect(state().lspByWorkspace.w1?.servers).toHaveLength(1);
	expect(state().lspByWorkspace.w1).not.toHaveProperty("workspaceId");
	expect(state().lspByWorkspace.w2).toEqual({ enabled: false, trusted: true, servers: [] });
	state().applyLspStatus(payload({ servers: [] }));
	expect(state().lspByWorkspace.w1?.servers).toEqual([]);
});

test("a status from a host without language servers, or while disconnected, is ignored", () => {
	state().installWelcomeSnapshot(LSP_PROTOCOL_VERSION - 1, [], []);
	state().applyLspStatus(payload());
	expect(state().lspByWorkspace).toEqual({});

	state().installWelcomeSnapshot(LSP_PROTOCOL_VERSION, [], []);
	state().setStatus("disconnected");
	state().applyLspStatus(payload());
	expect(state().lspByWorkspace).toEqual({});
});

test("learning the host is older drops what was held, and a removed workspace loses its status", () => {
	state().applyLspStatus(payload());
	state().applyLspStatus(payload({ workspaceId: "w2" }));
	state().installWelcomeSnapshot(LSP_PROTOCOL_VERSION - 1, [], []);
	expect(state().lspByWorkspace).toEqual({});

	state().installWelcomeSnapshot(LSP_PROTOCOL_VERSION, [], []);
	state().applyLspStatus(payload());
	state().applyLspStatus(payload({ workspaceId: "w2" }));
	state().applyWorkspaceRemoved("p1", "w1");
	expect(Object.keys(state().lspByWorkspace)).toEqual(["w2"]);
	state().applyLspStatus(payload());
	expect(Object.keys(state().lspByWorkspace)).toEqual(["w2"]);
});
