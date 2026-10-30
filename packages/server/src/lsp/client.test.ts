import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LspClient, type LspClientOptions } from "./client";
import type { Launch } from "./servers";

const FAKE = new URL("./fixtures/fakeServer.ts", import.meta.url).pathname;
const dirs: string[] = [];
const clients: LspClient[] = [];

function project(files: Record<string, string>): string {
	const dir = mkdtempSync(join(tmpdir(), "lsp-client-"));
	dirs.push(dir);
	for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
	return dir;
}

async function start(root: string, env: Record<string, string> = {}): Promise<LspClient> {
	const client = await LspClient.start({
		id: "fake",
		root,
		launch: { command: process.execPath, args: [FAKE] },
		env,
		onChange: () => {},
		initializeTimeoutMs: 10_000,
	});
	clients.push(client);
	return client;
}

afterEach(async () => {
	await Promise.all(clients.splice(0).map((client) => client.shutdown()));
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

test("opening a file yields the server's pushed diagnostics for that version", async () => {
	const root = project({ "a.fake": "fine\nhas ERROR_MARK here\nand WARN_MARK\n" });
	const client = await start(root);
	const file = join(root, "a.fake");
	const since = Date.now();
	const version = await client.open(file);
	expect(await client.waitForDiagnostics(file, version, since)).toBe(true);
	const found = client.diagnosticsFor(file);
	expect(found.map((item) => [item.severity, item.range.start.line])).toEqual([
		[1, 1],
		[2, 2],
	]);
	expect(client.counts()).toEqual({ errors: 1, warnings: 1 });
	expect(client.files).toBe(1);
});

test("an edit sends the new text and the next verdict replaces the old", async () => {
	const root = project({ "a.fake": "ERROR_MARK\n" });
	const client = await start(root);
	const file = join(root, "a.fake");
	let since = Date.now();
	await client.waitForDiagnostics(file, await client.open(file), since);
	expect(client.counts().errors).toBe(1);

	writeFileSync(file, "all good\n");
	since = Date.now();
	const version = await client.open(file);
	expect(version).toBe(2);
	await client.waitForDiagnostics(file, version, since);
	expect(client.diagnosticsFor(file)).toEqual([]);
});

test("a server that answers pulls instead of pushing still reports", async () => {
	const root = project({ "a.fake": "ERROR_MARK\n" });
	const client = await start(root, { FAKE_LSP_PULL: "1" });
	const file = join(root, "a.fake");
	const since = Date.now();
	expect(await client.waitForDiagnostics(file, await client.open(file), since)).toBe(true);
	expect(client.counts().errors).toBe(1);
});

test("waiting gives up quietly when the server is slower than the limit", async () => {
	const root = project({ "a.fake": "ERROR_MARK\n" });
	const client = await start(root, { FAKE_LSP_DELAY_MS: "600" });
	const file = join(root, "a.fake");
	const since = Date.now();
	expect(await client.waitForDiagnostics(file, await client.open(file), since, 100)).toBe(false);
});

test("requests reach the server and positions pass through", async () => {
	const root = project({ "a.fake": "one\ntwo\nthree\n" });
	const client = await start(root);
	const file = join(root, "a.fake");
	await client.open(file);
	const hover = await client.request<{ contents: { value: string } }>("textDocument/hover", {
		textDocument: { uri: `file://${file}` },
		position: { line: 3, character: 4 },
	});
	expect(hover.contents.value).toBe("hover 3:4");
});

test("a server that dies is reported as an error and its waiters are released", async () => {
	const root = project({ "a.fake": "x\n" });
	const client = await start(root, { FAKE_LSP_CRASH: "1" });
	const file = join(root, "a.fake");
	const since = Date.now();
	const version = await client.open(file);
	expect(await client.waitForDiagnostics(file, version, since, 2_000)).toBe(false);
	expect(client.state).toBe("error");
	expect(client.message).toContain("exited");
	await expect(client.open(file)).rejects.toThrow("not running");
});

test("a command that does not exist fails to start with a readable reason", async () => {
	const root = project({});
	await expect(
		LspClient.start({
			id: "ghost",
			root,
			launch: { command: join(root, "no-such-server"), args: [] },
			onChange: () => {},
			initializeTimeoutMs: 2_000,
		}),
	).rejects.toThrow(/ENOENT|no-such-server|exited/);
});

test("shutdown stops the process", async () => {
	const root = project({});
	const client = await start(root);
	await client.shutdown();
	expect(client.state).toBe("stopped");
});

async function crash(
	root: string,
	extra: Omit<Partial<LspClientOptions>, "launch"> & { launch?: Partial<Launch> },
): Promise<LspClient> {
	const { launch, ...rest } = extra;
	const client = await LspClient.start({
		id: "fake",
		root,
		launch: { command: process.execPath, args: [FAKE], ...launch },
		onChange: () => {},
		initializeTimeoutMs: 10_000,
		...rest,
	});
	clients.push(client);
	const file = join(root, "a.fake");
	await client.waitForDiagnostics(file, await client.open(file), Date.now(), 2_000);
	return client;
}

test("a death says what the server said last, with its whole stderr below", async () => {
	const root = project({ "a.fake": "x\n" });
	const client = await crash(root, {
		env: { FAKE_LSP_CRASH: "1", FAKE_LSP_STDERR: "warming up\nfatal: no JVM" },
	});
	expect(client.message?.split("\n")[0]).toBe("The language server exited (code 3): fatal: no JVM");
	expect(client.message?.split("\n").slice(1)).toEqual(["warming up", "fatal: no JVM"]);
});

test("a server's own explanation of its death comes first", async () => {
	const root = project({ "a.fake": "x\n" });
	const client = await crash(root, {
		env: { FAKE_LSP_CRASH: "1", FAKE_LSP_STDERR: "boom" },
		launch: { explain: (stderr) => (stderr === "boom" ? "needs a newer JDK" : undefined) },
	});
	expect(client.message?.split("\n")).toEqual(["needs a newer JDK", "boom"]);
});

test("a launch's environment reaches the process, and the server's own settings win over it", async () => {
	const root = project({ "a.fake": "x\n" });
	const fromLaunch = await crash(root, { launch: { env: { FAKE_LSP_CRASH: "1" } } });
	expect(fromLaunch.state).toBe("error");
	const overridden = await crash(root, {
		launch: { env: { FAKE_LSP_CRASH: "1" } },
		env: { FAKE_LSP_CRASH: "0" },
	});
	expect(overridden.state).toBe("ready");
});
