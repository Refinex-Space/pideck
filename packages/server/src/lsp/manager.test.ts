import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_LSP_CONFIG, type LspConfig } from "@thinkrail/contracts";
import { LspClient, type LspClientOptions } from "./client";
import { LspManager } from "./manager";
import type { ServerDefinition } from "./servers";

const FAKE = new URL("./fixtures/fakeServer.ts", import.meta.url).pathname;
const dirs: string[] = [];
const managers: LspManager[] = [];

function workspace(files: Record<string, string> = {}): string {
	const dir = realpathSync(mkdtempSync(join(tmpdir(), "lsp-manager-")));
	dirs.push(dir);
	for (const [name, text] of Object.entries(files)) {
		mkdirSync(join(dir, name, ".."), { recursive: true });
		writeFileSync(join(dir, name), text);
	}
	return dir;
}

const custom = (extra: Record<string, unknown> = {}) => ({
	command: [process.execPath, FAKE],
	extensions: [".fake"],
	...extra,
});

function setup(
	config: Partial<LspConfig> & { servers?: LspConfig["servers"] },
	options: { catalog?: readonly ServerDefinition[]; now?: () => number } = {},
) {
	const live: LspConfig = { ...DEFAULT_LSP_CONFIG, enabled: true, ...config };
	const starts: LspClientOptions[] = [];
	const manager = new LspManager({
		config: () => live,
		catalog: options.catalog ?? [],
		startClient: (o) => {
			starts.push(o);
			return LspClient.start({ ...o, initializeTimeoutMs: 10_000 });
		},
		...(options.now ? { now: options.now } : {}),
	});
	managers.push(manager);
	return { manager, live, starts };
}

afterEach(async () => {
	await Promise.all(managers.splice(0).map((manager) => manager.disposeAll()));
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

test("touching a file starts the server that serves it once and returns its verdict", async () => {
	const dir = workspace({ "a.fake": "ERROR_MARK\nWARN_MARK\n" });
	const { manager, starts } = setup({ servers: { fake: custom() } });
	const found = await manager.touch({ directory: dir, file: "a.fake", trusted: true, wait: true });
	expect(found.map((item) => item.severity)).toEqual([1, 2]);
	await manager.touch({ directory: dir, file: "a.fake", trusted: true, wait: true });
	expect(starts).toHaveLength(1);

	const status = manager.status(dir, true);
	expect(status).toMatchObject({ enabled: true, trusted: true });
	expect(status.servers).toEqual([
		{
			id: "fake",
			name: "fake",
			root: ".",
			state: "ready",
			files: 1,
			errors: 1,
			warnings: 1,
			custom: true,
		},
	]);
});

test("nothing starts while the switch is off, the project is untrusted, or the file is outside", async () => {
	const dir = workspace({ "a.fake": "x\n" });
	const off = setup({ enabled: false, servers: { fake: custom() } });
	expect(
		await off.manager.touch({ directory: dir, file: "a.fake", trusted: true, wait: true }),
	).toEqual([]);
	expect(off.manager.status(dir, true)).toEqual({ enabled: false, trusted: true, servers: [] });

	const on = setup({ servers: { fake: custom() } });
	expect(await on.manager.touch({ directory: dir, file: "a.fake", trusted: false })).toEqual([]);
	expect(
		await on.manager.touch({ directory: dir, file: "../outside.fake", trusted: true }),
	).toEqual([]);
	expect(await on.manager.touch({ directory: dir, file: "b.other", trusted: true })).toEqual([]);
	expect(on.starts).toHaveLength(0);
	expect(on.manager.status(dir, false).trusted).toBe(false);
});

test("hasServer says whether any server could serve a file", () => {
	const dir = workspace();
	const { manager } = setup({ servers: { fake: custom() } });
	expect(manager.hasServer(dir, "x/y.fake")).toBe(true);
	expect(manager.hasServer(dir, "x/y.ts")).toBe(false);
	expect(manager.hasServer(dir, "../y.fake")).toBe(false);
});

test("a command that is not installed is reported as missing and is not retried at once", async () => {
	const dir = workspace({ "a.fake": "x\n" });
	const { manager, starts } = setup({
		servers: { ghost: { command: ["no-such-language-server-xyz"], extensions: [".fake"] } },
	});
	await manager.touch({ directory: dir, file: "a.fake", trusted: true });
	await manager.touch({ directory: dir, file: "a.fake", trusted: true });
	expect(starts).toHaveLength(0);
	expect(manager.status(dir, true).servers).toMatchObject([
		{ id: "ghost", state: "missing", message: "no-such-language-server-xyz was not found" },
	]);
});

test("a server that fails to start is an error, and is tried again after a pause", async () => {
	const dir = workspace({ "a.fake": "x\n" });
	let now = 1_000_000;
	const { manager, starts, live } = setup(
		{
			servers: {
				broken: { command: [process.execPath, "-e", "process.exit(7)"], extensions: [".fake"] },
			},
		},
		{ now: () => now },
	);
	await manager.touch({ directory: dir, file: "a.fake", trusted: true });
	expect(manager.status(dir, true).servers[0]).toMatchObject({ id: "broken", state: "error" });
	expect(manager.status(dir, true).servers[0]?.message).toContain("exited");
	await manager.touch({ directory: dir, file: "a.fake", trusted: true });
	expect(starts).toHaveLength(1);

	now += 61_000;
	live.servers = { fake: custom() };
	await manager.touch({ directory: dir, file: "a.fake", trusted: true, wait: true });
	expect(starts).toHaveLength(2);
	expect(manager.status(dir, true).servers.map((s) => [s.id, s.state])).toEqual([
		["broken", "error"],
		["fake", "ready"],
	]);
});

test("restart stops one server and the next touch starts it again", async () => {
	const dir = workspace({ "a.fake": "x\n" });
	const { manager, starts } = setup({ servers: { fake: custom() } });
	await manager.touch({ directory: dir, file: "a.fake", trusted: true, wait: true });
	await manager.restart(dir, "other");
	expect(manager.status(dir, true).servers).toHaveLength(1);
	await manager.restart(dir, "fake");
	expect(manager.status(dir, true).servers).toEqual([]);
	await manager.touch({ directory: dir, file: "a.fake", trusted: true, wait: true });
	expect(starts).toHaveLength(2);
});

test("a server nothing has used for the idle limit is stopped", async () => {
	const dir = workspace({ "a.fake": "x\n" });
	let now = 5_000_000;
	const { manager } = setup({ idleMinutes: 2, servers: { fake: custom() } }, { now: () => now });
	await manager.touch({ directory: dir, file: "a.fake", trusted: true });
	now += 60_000;
	await manager.reapIdle();
	expect(manager.status(dir, true).servers).toHaveLength(1);
	now += 90_000;
	await manager.reapIdle();
	expect(manager.status(dir, true).servers).toEqual([]);
});

test("reconfigure stops everything so servers restart under the new rules", async () => {
	const dir = workspace({ "a.fake": "x\n" });
	const { manager } = setup({ servers: { fake: custom() } });
	await manager.touch({ directory: dir, file: "a.fake", trusted: true, wait: true });
	await manager.reconfigure();
	expect(manager.status(dir, true).servers).toEqual([]);
});

test("a built-in server finds its project root and honours an override", async () => {
	const dir = workspace({
		"pkg/marker.txt": "",
		"pkg/src/a.fake": "ERROR_MARK\n",
		"loose.fake": "x\n",
	});
	const definition: ServerDefinition = {
		id: "fakecat",
		name: "Fake catalog",
		extensions: [".fake"],
		binary: process.execPath,
		install: "n/a",
		roots: ["marker.txt"],
		rootFallback: false,
		launch: (binary) => ({ command: binary, args: [FAKE] }),
	};
	const { manager, live } = setup({}, { catalog: [definition] });
	const found = await manager.touch({
		directory: dir,
		file: "pkg/src/a.fake",
		trusted: true,
		wait: true,
	});
	expect(found).toHaveLength(1);
	expect(manager.status(dir, true).servers).toMatchObject([
		{ id: "fakecat", root: "pkg", state: "ready", custom: false },
	]);
	expect(manager.hasServer(dir, "loose.fake")).toBe(false);

	live.servers = { fakecat: { disabled: true } };
	expect(manager.hasServer(dir, "pkg/src/a.fake")).toBe(false);
	live.servers = { fakecat: { extensions: [".other"] } };
	expect(manager.hasServer(dir, "pkg/src/a.fake")).toBe(false);
	expect(manager.hasServer(dir, "pkg/src/b.other")).toBe(true);
});

test("run asks every serving server and runAll the running ones", async () => {
	const dir = workspace({ "a.fake": "one\ntwo\n" });
	const { manager } = setup({ servers: { fake: custom() } });
	const hovers = await manager.run({ directory: dir, file: "a.fake", trusted: true }, (client) =>
		client.request<{ contents: { value: string } }>("textDocument/hover", {
			textDocument: { uri: `file://${join(dir, "a.fake")}` },
			position: { line: 1, character: 2 },
		}),
	);
	expect(hovers.map((hover) => hover.contents.value)).toEqual(["hover 1:2"]);
	const symbols = await manager.runAll({ directory: dir, trusted: true }, (client) =>
		client.request<unknown[]>("workspace/symbol", { query: "q" }),
	);
	expect(symbols).toHaveLength(1);
	expect(await manager.runAll({ directory: dir, trusted: false }, async () => 1)).toEqual([]);
});

test("a listener hears about changes, once per burst", async () => {
	const dir = workspace({ "a.fake": "ERROR_MARK\n" });
	const { manager } = setup({ servers: { fake: custom() } });
	const heard: string[] = [];
	manager.onChange((directory) => heard.push(directory));
	await manager.touch({ directory: dir, file: "a.fake", trusted: true, wait: true });
	await new Promise((resolve) => setTimeout(resolve, 200));
	expect(heard.length).toBeGreaterThan(0);
	expect(new Set(heard)).toEqual(new Set([dir]));
});
