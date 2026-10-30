import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createJsonRpcConnection, type JsonRpcConnection } from "./jsonrpc";
import { languageIdFor } from "./languages";
import type { Launch } from "./servers";

export interface LspPosition {
	line: number;
	character: number;
}

export interface LspRange {
	start: LspPosition;
	end: LspPosition;
}

export interface LspDiagnostic {
	range: LspRange;
	/** 1 error, 2 warning, 3 information, 4 hint; a server may omit it, which counts as an error. */
	severity?: number;
	code?: string | number;
	source?: string;
	message: string;
}

export type LspClientState = "ready" | "error" | "stopped";

export interface LspClientOptions {
	id: string;
	root: string;
	launch: Launch;
	env?: Record<string, string>;
	/** Called when diagnostics or the state change. */
	onChange: () => void;
	initializeTimeoutMs?: number;
}

const DIAGNOSTICS_DEBOUNCE_MS = 150;
const DIAGNOSTICS_WAIT_MS = 5_000;
const DIAGNOSTICS_PULL_TIMEOUT_MS = 3_000;
const REQUEST_TIMEOUT_MS = 10_000;
const INITIALIZE_TIMEOUT_MS = 30_000;
const STDERR_KEEP = 4_096;
const MAX_FILE_BYTES = 2_000_000;
const WINDOWS = process.platform === "win32";

function record(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function pathOf(uri: unknown): string | null {
	if (typeof uri !== "string" || !uri.startsWith("file://")) return null;
	try {
		return fileURLToPath(uri);
	} catch {
		return null;
	}
}

function section(settings: Record<string, unknown> | undefined, name: unknown): unknown {
	if (!settings) return null;
	if (typeof name !== "string" || name === "") return settings;
	let value: unknown = settings;
	for (const key of name.split(".")) {
		const object = record(value);
		if (!object || !(key in object)) return null;
		value = object[key];
	}
	return value ?? null;
}

function dedupe(items: readonly LspDiagnostic[]): LspDiagnostic[] {
	const seen = new Set<string>();
	return items.filter((item) => {
		const key = JSON.stringify([item.code, item.severity, item.message, item.source, item.range]);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

/** One language server process, spoken to over stdio, for one project root. */
export class LspClient {
	readonly id: string;
	readonly root: string;
	private readonly process: ChildProcessWithoutNullStreams;
	private readonly connection: JsonRpcConnection;
	private readonly documents = new Map<string, { version: number; text: string }>();
	private readonly pushed = new Map<string, LspDiagnostic[]>();
	private readonly pulled = new Map<string, LspDiagnostic[]>();
	private readonly published = new Map<string, { at: number; version?: number }>();
	private readonly waiters = new Set<(path: string) => void>();
	private stderr = "";
	private supportsPull = false;
	private current: LspClientState = "ready";
	private failure: string | undefined;

	private constructor(
		private readonly options: LspClientOptions,
		child: ChildProcessWithoutNullStreams,
	) {
		this.id = options.id;
		this.root = options.root;
		this.process = child;
		this.connection = createJsonRpcConnection(child.stdout, child.stdin);
		child.stderr.on("data", (chunk: Buffer) => {
			this.stderr = (this.stderr + chunk.toString("utf8")).slice(-STDERR_KEEP);
		});
		child.on("exit", (code, signal) => {
			if (this.current === "stopped") return;
			this.fail(`The language server exited (${signal ?? `code ${code ?? "unknown"}`})`);
		});
		child.on("error", (error) => this.fail(error.message));
		this.installHandlers();
	}

	/** Starts the process and finishes the `initialize` handshake; rejects with the reason it could not. */
	static async start(options: LspClientOptions): Promise<LspClient> {
		const { command, args } = options.launch;
		const child = spawn(command, args, {
			cwd: options.root,
			env: { ...process.env, ...options.launch.env, ...options.env },
			stdio: ["pipe", "pipe", "pipe"],
			windowsHide: true,
			shell: WINDOWS && /\.(cmd|bat)$/i.test(command),
		});
		const client = new LspClient(options, child);
		try {
			await client.initialize(
				options.initializeTimeoutMs ?? options.launch.initializeTimeoutMs ?? INITIALIZE_TIMEOUT_MS,
			);
		} catch (error) {
			const reason =
				client.failure ??
				client.describe(error instanceof Error ? error.message : "initialize failed");
			await client.shutdown();
			throw new Error(reason);
		}
		return client;
	}

	get state(): LspClientState {
		return this.current;
	}

	get message(): string | undefined {
		return this.failure;
	}

	get files(): number {
		return this.documents.size;
	}

	/** A failure as one reason line (what the server said last, or its own explanation) and then its stderr. */
	private describe(message: string): string {
		const stderr = this.stderr.trim();
		const lastLine = stderr.split("\n").at(-1)?.trim();
		const reason =
			this.options.launch.explain?.(stderr) ?? (lastLine ? `${message}: ${lastLine}` : message);
		return stderr ? `${reason}\n${stderr}` : reason;
	}

	private fail(message: string): void {
		if (this.current !== "ready") return;
		this.current = "error";
		this.failure = this.describe(message);
		this.connection.dispose(new Error(message));
		this.options.onChange();
		for (const waiter of this.waiters) waiter("");
	}

	private installHandlers(): void {
		const settings = this.options.launch.initialization;
		this.connection.onNotification("textDocument/publishDiagnostics", (params) => {
			const input = record(params);
			const path = pathOf(input?.uri);
			if (!input || !path || !Array.isArray(input.diagnostics)) return;
			this.pushed.set(path, input.diagnostics as LspDiagnostic[]);
			this.published.set(path, {
				at: Date.now(),
				...(typeof input.version === "number" ? { version: input.version } : {}),
			});
			this.options.onChange();
			for (const waiter of this.waiters) waiter(path);
		});
		this.connection.onRequest("window/workDoneProgress/create", () => null);
		this.connection.onRequest("window/showMessageRequest", () => null);
		this.connection.onRequest("window/showDocument", () => ({ success: false }));
		this.connection.onRequest("client/registerCapability", () => null);
		this.connection.onRequest("client/unregisterCapability", () => null);
		this.connection.onRequest("workspace/diagnostic/refresh", () => null);
		this.connection.onRequest("workspace/workspaceFolders", () => [
			{ name: "workspace", uri: pathToFileURL(this.root).href },
		]);
		this.connection.onRequest("workspace/configuration", (params) => {
			const items = record(params)?.items;
			return Array.isArray(items)
				? items.map((item) => section(settings, record(item)?.section))
				: [];
		});
	}

	private async initialize(timeoutMs: number): Promise<void> {
		const uri = pathToFileURL(this.root).href;
		const initialization = this.options.launch.initialization;
		const result = await this.connection.request<{ capabilities?: Record<string, unknown> } | null>(
			"initialize",
			{
				processId: this.process.pid ?? null,
				clientInfo: { name: "PiDeck" },
				rootUri: uri,
				workspaceFolders: [{ name: "workspace", uri }],
				...(initialization ? { initializationOptions: initialization } : {}),
				capabilities: {
					window: { workDoneProgress: true },
					workspace: { configuration: true, workspaceFolders: true },
					textDocument: {
						synchronization: { didOpen: true, didChange: true },
						publishDiagnostics: { versionSupport: true },
						diagnostic: { dynamicRegistration: false, relatedDocumentSupport: false },
						hover: { contentFormat: ["markdown", "plaintext"] },
						definition: { linkSupport: false },
						documentSymbol: { hierarchicalDocumentSymbolSupport: true },
					},
				},
			},
			timeoutMs,
		);
		this.supportsPull = Boolean(result?.capabilities?.diagnosticProvider);
		this.connection.notify("initialized", {});
		if (initialization)
			this.connection.notify("workspace/didChangeConfiguration", { settings: initialization });
	}

	/** Tells the server the file's current text, opening it on first use; returns the version sent. */
	async open(path: string): Promise<number> {
		if (this.current !== "ready") throw new Error("The language server is not running");
		if (statSync(path).size > MAX_FILE_BYTES)
			throw new Error("The file is too large for a language server");
		const text = readFileSync(path, "utf8");
		const uri = pathToFileURL(path).href;
		const known = this.documents.get(path);
		if (known) {
			const version = known.version + 1;
			this.documents.set(path, { version, text });
			this.connection.notify("textDocument/didChange", {
				textDocument: { uri, version },
				contentChanges: [{ text }],
			});
			return version;
		}
		this.pushed.delete(path);
		this.pulled.delete(path);
		this.documents.set(path, { version: 1, text });
		this.connection.notify("textDocument/didOpen", {
			textDocument: { uri, languageId: languageIdFor(path), version: 1, text },
		});
		this.options.onChange();
		return 1;
	}

	diagnosticsFor(path: string): LspDiagnostic[] {
		return dedupe([...(this.pushed.get(path) ?? []), ...(this.pulled.get(path) ?? [])]);
	}

	allDiagnostics(): Map<string, LspDiagnostic[]> {
		const all = new Map<string, LspDiagnostic[]>();
		for (const path of new Set([...this.pushed.keys(), ...this.pulled.keys()]))
			all.set(path, this.diagnosticsFor(path));
		return all;
	}

	counts(): { errors: number; warnings: number } {
		let errors = 0;
		let warnings = 0;
		for (const items of this.allDiagnostics().values())
			for (const item of items) {
				if (item.severity === undefined || item.severity === 1) errors += 1;
				else if (item.severity === 2) warnings += 1;
			}
		return { errors, warnings };
	}

	private async pull(path: string): Promise<boolean> {
		const report = record(
			await this.connection
				.request(
					"textDocument/diagnostic",
					{ textDocument: { uri: pathToFileURL(path).href } },
					DIAGNOSTICS_PULL_TIMEOUT_MS,
				)
				.catch(() => null),
		);
		if (!report || !Array.isArray(report.items)) return false;
		this.pulled.set(path, report.items as LspDiagnostic[]);
		this.options.onChange();
		return true;
	}

	/**
	 * Waits for the server's verdict on the version just sent: a push for it, then a quiet moment so a
	 * burst settles, or a pulled report for servers that answer on request. Gives up quietly after
	 * `timeoutMs`; a slow server then simply reports what it already knew.
	 */
	async waitForDiagnostics(
		path: string,
		version: number,
		since: number,
		timeoutMs = DIAGNOSTICS_WAIT_MS,
	): Promise<boolean> {
		if (this.current !== "ready") return false;
		const fresh = () => {
			const hit = this.published.get(path);
			if (!hit) return false;
			return hit.version === undefined ? hit.at >= since : hit.version >= version;
		};
		const pushed = new Promise<boolean>((resolve) => {
			let quiet: ReturnType<typeof setTimeout> | undefined;
			const finish = (value: boolean) => {
				clearTimeout(quiet);
				clearTimeout(limit);
				this.waiters.delete(listener);
				resolve(value);
			};
			const limit = setTimeout(() => finish(false), timeoutMs);
			const listener = (changed: string) => {
				if (this.current !== "ready") return finish(false);
				if (changed !== path || !fresh()) return;
				clearTimeout(quiet);
				quiet = setTimeout(() => finish(true), DIAGNOSTICS_DEBOUNCE_MS);
			};
			this.waiters.add(listener);
			if (fresh()) listener(path);
		});
		const pulled = this.supportsPull ? this.pull(path) : new Promise<boolean>(() => {});
		return Promise.race([pushed, pulled]);
	}

	request<T = unknown>(
		method: string,
		params: unknown,
		timeoutMs = REQUEST_TIMEOUT_MS,
	): Promise<T> {
		if (this.current !== "ready")
			return Promise.reject(new Error("The language server is not running"));
		return this.connection.request<T>(method, params, timeoutMs);
	}

	async shutdown(): Promise<void> {
		const wasReady = this.current === "ready";
		this.current = "stopped";
		for (const waiter of this.waiters) waiter("");
		if (wasReady) {
			await this.connection.request("shutdown", null, 2_000).catch(() => undefined);
			this.connection.notify("exit");
		}
		this.connection.dispose();
		const child = this.process;
		if (child.exitCode === null && child.signalCode === null) {
			const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
			const kill = setTimeout(() => child.kill(), 500);
			const force = setTimeout(() => child.kill("SIGKILL"), 2_500);
			await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 3_000))]);
			clearTimeout(kill);
			clearTimeout(force);
		}
	}
}
