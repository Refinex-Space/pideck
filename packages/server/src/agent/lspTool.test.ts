import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { DEFAULT_LSP_CONFIG, type LspConfig } from "@thinkrail/contracts";
import { LspManager } from "../lsp";
import { createLspTool, LSP_TOOL_NAME, lspExtension, setLspToolHost } from "./lspTool";

const FAKE = new URL("../lsp/fixtures/fakeServer.ts", import.meta.url).pathname;
const dirs: string[] = [];
const managers: LspManager[] = [];

function workspace(files: Record<string, string>): string {
	const dir = realpathSync(mkdtempSync(join(tmpdir(), "lsp-tool-")));
	dirs.push(dir);
	for (const [name, text] of Object.entries(files)) {
		mkdirSync(join(dir, name, ".."), { recursive: true });
		writeFileSync(join(dir, name), text);
	}
	return dir;
}

function host(config: Partial<LspConfig> = {}): LspManager {
	const live: LspConfig = {
		...DEFAULT_LSP_CONFIG,
		enabled: true,
		servers: { fake: { command: [process.execPath, FAKE], extensions: [".fake"] } },
		...config,
	};
	const manager = new LspManager({ config: () => live, catalog: [] });
	managers.push(manager);
	setLspToolHost(manager);
	return manager;
}

afterEach(async () => {
	setLspToolHost(null);
	await Promise.all(managers.splice(0).map((manager) => manager.disposeAll()));
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

type ResultHandler = (
	event: Record<string, unknown>,
	ctx: Record<string, unknown>,
) => Promise<{ content?: unknown[] } | undefined>;

function register() {
	const tools: ToolDefinition[] = [];
	let onResult: ResultHandler | undefined;
	const pi = {
		registerTool: (tool: ToolDefinition) => tools.push(tool),
		on: (name: string, handler: ResultHandler) => {
			if (name === "tool_result") onResult = handler;
		},
	} as unknown as ExtensionAPI;
	lspExtension(pi);
	return { tools, onResult: () => onResult };
}

const context = (cwd: string, trusted = true) => ({ cwd, isProjectTrusted: () => trusted });

async function ask(cwd: string, params: Record<string, unknown>, trusted = true): Promise<string> {
	const tool = createLspTool();
	const result = await tool.execute(
		"call",
		params as never,
		undefined,
		undefined,
		context(cwd, trusted) as never,
	);
	const first = result.content[0];
	return first?.type === "text" ? first.text : "";
}

test("the tool is declared only while servers and the tool switch are on", () => {
	expect(register().tools).toHaveLength(0);
	host({ enabled: false });
	expect(register().tools).toHaveLength(0);
	host({ tool: false });
	expect(register().tools).toHaveLength(0);
	host();
	expect(register().tools.map((tool) => tool.name)).toEqual([LSP_TOOL_NAME]);
});

test("it answers definition, references, hover and symbols with 1-based positions", async () => {
	const dir = workspace({ "a.fake": "one\ntwo\nthree\n" });
	host();
	expect(
		await ask(dir, { operation: "goToDefinition", filePath: "a.fake", line: 2, character: 3 }),
	).toBe("a.fake:1:1");
	expect(
		await ask(dir, { operation: "findReferences", filePath: "a.fake", line: 1, character: 1 }),
	).toBe("a.fake:1:1\na.fake:3:1");
	expect(
		await ask(dir, { operation: "goToImplementation", filePath: "a.fake", line: 1, character: 1 }),
	).toBe("a.fake:2:1");
	expect(
		await ask(dir, { operation: "hover", filePath: join(dir, "a.fake"), line: 2, character: 4 }),
	).toBe("hover 1:3");
	expect(await ask(dir, { operation: "documentSymbol", filePath: "a.fake" })).toBe(
		"Class Thing (a.fake:1:1)\n  Method run (a.fake:2:1)",
	);
});

test("workspaceSymbol needs a running server, or a file to start one with", async () => {
	const dir = workspace({ "a.fake": "x\n" });
	host();
	expect(await ask(dir, { operation: "workspaceSymbol", query: "q" })).toContain(
		"No language server is running",
	);
	expect(
		await ask(dir, { operation: "workspaceSymbol", query: "q", filePath: "a.fake" }),
	).toContain("match q");
	expect(await ask(dir, { operation: "workspaceSymbol", query: "again" })).toContain("match again");
	await expect(ask(dir, { operation: "workspaceSymbol" })).rejects.toThrow("needs a query");
});

test("call hierarchy goes through the prepared item", async () => {
	const dir = workspace({ "a.fake": "x\n" });
	host();
	const at = { filePath: "a.fake", line: 1, character: 1 };
	expect(await ask(dir, { operation: "prepareCallHierarchy", ...at })).toBe(
		"Function caller (a.fake:1:1)",
	);
	expect(await ask(dir, { operation: "incomingCalls", ...at })).toBe(
		"Function caller (a.fake:1:1)",
	);
	expect(await ask(dir, { operation: "outgoingCalls", ...at })).toBe(
		"Function callee (a.fake:1:1)",
	);
});

test("it explains itself when it cannot answer", async () => {
	const dir = workspace({ "a.fake": "x\n", "b.txt": "x\n" });
	host();
	await expect(ask(dir, { operation: "hover", filePath: "a.fake" })).rejects.toThrow(
		"needs line and character",
	);
	await expect(ask(dir, { operation: "documentSymbol" })).rejects.toThrow("needs filePath");
	expect(await ask(dir, { operation: "documentSymbol", filePath: "b.txt" })).toBe(
		"No language server serves b.txt.",
	);
	expect(await ask(dir, { operation: "documentSymbol", filePath: "../outside.fake" })).toContain(
		"No language server serves",
	);
	await expect(
		ask(dir, { operation: "documentSymbol", filePath: "a.fake" }, false),
	).rejects.toThrow("trusted");
	host({ enabled: false });
	await expect(ask(dir, { operation: "documentSymbol", filePath: "a.fake" })).rejects.toThrow(
		"turned off",
	);
	setLspToolHost(null);
	await expect(ask(dir, { operation: "documentSymbol", filePath: "a.fake" })).rejects.toThrow(
		"unavailable",
	);
});

test("an edit's result gains the file's errors, and only its errors", async () => {
	const dir = workspace({ "a.fake": "fine\nERROR_MARK\nWARN_MARK\n", "ok.fake": "fine\n" });
	host();
	const { onResult } = register();
	const handle = onResult();
	if (!handle) throw new Error("no tool_result handler");
	const base = {
		type: "tool_result",
		toolName: "edit",
		content: [{ type: "text", text: "Edited." }],
		isError: false,
	};

	const changed = await handle({ ...base, input: { path: "a.fake" } }, context(dir));
	expect(changed?.content).toEqual([
		{ type: "text", text: "Edited." },
		{
			type: "text",
			text: '\n\nLSP errors detected in this file, please fix:\n<diagnostics file="a.fake">\nERROR [2:1] error_mark on line 2\n</diagnostics>',
		},
	]);
	const written = await handle(
		{ ...base, toolName: "write", input: { path: join(dir, "a.fake") } },
		context(dir),
	);
	expect(written?.content).toHaveLength(2);

	expect(await handle({ ...base, input: { path: "ok.fake" } }, context(dir))).toBeUndefined();
	expect(
		await handle({ ...base, toolName: "read", input: { path: "a.fake" } }, context(dir)),
	).toBeUndefined();
	expect(
		await handle({ ...base, isError: true, input: { path: "a.fake" } }, context(dir)),
	).toBeUndefined();
	expect(await handle({ ...base, input: { path: "a.fake" } }, context(dir, false))).toBeUndefined();
	expect(await handle({ ...base, input: { path: "notes.txt" } }, context(dir))).toBeUndefined();
	expect(await handle({ ...base, input: {} }, context(dir))).toBeUndefined();
});

test("the check follows its own switch, read at every edit", async () => {
	const dir = workspace({ "a.fake": "ERROR_MARK\n" });
	const live: LspConfig = {
		...DEFAULT_LSP_CONFIG,
		enabled: true,
		servers: { fake: { command: [process.execPath, FAKE], extensions: [".fake"] } },
	};
	const manager = new LspManager({ config: () => live, catalog: [] });
	managers.push(manager);
	setLspToolHost(manager);
	const handle = register().onResult();
	if (!handle) throw new Error("no tool_result handler");
	const event = { toolName: "edit", content: [], isError: false, input: { path: "a.fake" } };
	expect(await handle(event, context(dir))).toBeDefined();
	live.diagnostics = false;
	expect(await handle(event, context(dir))).toBeUndefined();
});
