import { realpathSync } from "node:fs";
import { extname, isAbsolute, relative, resolve } from "node:path";
import type {
	LspConfig,
	LspServerOverride,
	LspServerStatus,
	LspWorkspaceStatus,
} from "@thinkrail/contracts";
import { LspClient, type LspClientOptions, type LspDiagnostic } from "./client";
import {
	findBinary,
	findProjectRoot,
	type Launch,
	SERVER_CATALOG,
	type ServerDefinition,
	which,
} from "./servers";

type StartClient = (options: LspClientOptions) => Promise<LspClient>;

export interface LspManagerOptions {
	config: () => LspConfig;
	catalog?: readonly ServerDefinition[];
	startClient?: StartClient;
	now?: () => number;
}

interface Spec {
	key: string;
	id: string;
	name: string;
	root: string;
	custom: boolean;
	resolveLaunch: () => { launch: Launch } | { missing: string };
	env: Record<string, string> | undefined;
}

type EntryState = "starting" | "ready" | "error" | "missing";

interface Entry {
	spec: Spec;
	state: EntryState;
	message?: string;
	client?: LspClient;
	starting?: Promise<LspClient | undefined> | undefined;
	lastUsed: number;
	failedAt: number;
}

interface DirectoryState {
	entries: Map<string, Entry>;
	timer?: ReturnType<typeof setTimeout> | undefined;
}

const RETRY_AFTER_MS = 60_000;
const REAP_INTERVAL_MS = 60_000;
const NOTIFY_DELAY_MS = 80;

function inside(directory: string, file: string): boolean {
	const rel = relative(directory, file);
	return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

function realOr(path: string): string {
	try {
		return realpathSync(path);
	} catch {
		return resolve(path);
	}
}

function firstLine(message: string): string {
	return message.split("\n")[0] ?? message;
}

/**
 * The host's language servers: one set per workspace directory, started the first time a file one of
 * them serves is touched, stopped when idle, and never started while the switch is off or the project
 * is untrusted. Everything the agent or the UI asks goes through here.
 */
export class LspManager {
	private readonly directories = new Map<string, DirectoryState>();
	private readonly listeners = new Set<(directory: string) => void>();
	private readonly catalog: readonly ServerDefinition[];
	private readonly startClient: StartClient;
	private readonly now: () => number;
	private reaper: ReturnType<typeof setInterval> | undefined;

	constructor(private readonly options: LspManagerOptions) {
		this.catalog = options.catalog ?? SERVER_CATALOG;
		this.startClient = options.startClient ?? ((o) => LspClient.start(o));
		this.now = options.now ?? Date.now;
	}

	/** The settings in force, as the manager reads them. */
	settings(): LspConfig {
		return this.options.config();
	}

	onChange(listener: (directory: string) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private changed(directory: string): void {
		const state = this.directories.get(directory);
		if (!state || state.timer) return;
		state.timer = setTimeout(() => {
			state.timer = undefined;
			for (const listener of this.listeners) listener(directory);
		}, NOTIFY_DELAY_MS);
	}

	private directoryState(directory: string): DirectoryState {
		let state = this.directories.get(directory);
		if (!state) {
			state = { entries: new Map() };
			this.directories.set(directory, state);
		}
		return state;
	}

	/** The servers that serve `file` in this workspace, with how each would start. */
	private specsFor(directory: string, file: string): Spec[] {
		const config = this.options.config();
		const extension = extname(file).toLowerCase();
		const specs: Spec[] = [];
		const seen = new Set<string>();
		for (const definition of this.catalog) {
			seen.add(definition.id);
			const override = config.servers[definition.id];
			if (override?.disabled) continue;
			const extensions = override?.extensions ?? definition.extensions;
			if (!extensions.includes(extension)) continue;
			const root = findProjectRoot(definition, file, directory);
			if (!root) continue;
			specs.push({
				key: `${definition.id}\0${root}`,
				id: definition.id,
				name: definition.name,
				root,
				custom: false,
				env: override?.env,
				resolveLaunch: () => this.launchFor(definition, root, directory, override),
			});
		}
		for (const [id, override] of Object.entries(config.servers)) {
			if (seen.has(id) || override.disabled || !override.command?.length) continue;
			if (!override.extensions?.includes(extension)) continue;
			specs.push({
				key: `${id}\0${directory}`,
				id,
				name: id,
				root: directory,
				custom: true,
				env: override.env,
				resolveLaunch: () => this.customLaunch(override),
			});
		}
		return specs;
	}

	private launchFor(
		definition: ServerDefinition,
		root: string,
		directory: string,
		override: LspServerOverride | undefined,
	): { launch: Launch } | { missing: string } {
		let launch: Launch;
		if (override?.command?.length) {
			const [command, ...args] = override.command as [string, ...string[]];
			const found = which(command);
			if (!found) return { missing: `${command} was not found` };
			launch = { command: found, args };
		} else {
			const binary = findBinary(definition.binary, [root, directory]);
			if (!binary) return { missing: definition.install };
			launch = definition.launch(binary, root);
		}
		if (override?.initialization)
			launch = {
				...launch,
				initialization: { ...launch.initialization, ...override.initialization },
			};
		return { launch };
	}

	private customLaunch(override: LspServerOverride): { launch: Launch } | { missing: string } {
		const [command, ...args] = (override.command ?? []) as [string, ...string[]];
		const found = which(command);
		if (!found) return { missing: `${command} was not found` };
		return {
			launch: {
				command: found,
				args,
				...(override.initialization ? { initialization: override.initialization } : {}),
			},
		};
	}

	private canRun(trusted: boolean): boolean {
		return this.options.config().enabled && trusted;
	}

	/** Whether any server could serve this file (before anything is started). */
	hasServer(directory: string, file: string): boolean {
		const dir = realOr(directory);
		const path = realOr(resolve(dir, file));
		return inside(dir, path) && this.specsFor(dir, path).length > 0;
	}

	private async ensure(directory: string, spec: Spec): Promise<LspClient | undefined> {
		const state = this.directoryState(directory);
		const known = state.entries.get(spec.key);
		if (known?.state === "ready" && known.client?.state === "ready") {
			known.lastUsed = this.now();
			return known.client;
		}
		if (known?.starting) return known.starting;
		if (known && this.now() - known.failedAt < RETRY_AFTER_MS) return undefined;
		if (known?.client) await known.client.shutdown().catch(() => undefined);
		const entry: Entry = { spec, state: "starting", lastUsed: this.now(), failedAt: 0 };
		state.entries.set(spec.key, entry);
		this.changed(directory);
		const resolved = spec.resolveLaunch();
		if ("missing" in resolved) {
			entry.state = "missing";
			entry.message = resolved.missing;
			entry.failedAt = this.now();
			this.changed(directory);
			return undefined;
		}
		entry.starting = this.startClient({
			id: spec.id,
			root: spec.root,
			launch: resolved.launch,
			...(spec.env ? { env: spec.env } : {}),
			onChange: () => this.changed(directory),
		})
			.then((client) => {
				entry.client = client;
				entry.state = "ready";
				entry.lastUsed = this.now();
				this.armReaper();
				return client;
			})
			.catch((error: unknown) => {
				entry.state = "error";
				entry.message =
					error instanceof Error ? error.message : "The language server failed to start";
				entry.failedAt = this.now();
				return undefined;
			})
			.finally(() => {
				entry.starting = undefined;
				this.changed(directory);
			});
		return entry.starting;
	}

	private async clientsFor(
		directory: string,
		file: string,
		trusted: boolean,
	): Promise<LspClient[]> {
		if (!this.canRun(trusted)) return [];
		const dir = realOr(directory);
		const path = realOr(resolve(dir, file));
		if (!inside(dir, path)) return [];
		const clients = await Promise.all(
			this.specsFor(dir, path).map((spec) => this.ensure(dir, spec)),
		);
		return clients.filter((client): client is LspClient => client !== undefined);
	}

	/**
	 * Tells every server that serves `file` its current text and, with `wait`, waits for their verdict.
	 * Returns the diagnostics they reported for it.
	 */
	async touch(input: {
		directory: string;
		file: string;
		trusted: boolean;
		wait?: boolean;
	}): Promise<LspDiagnostic[]> {
		const path = realOr(resolve(realOr(input.directory), input.file));
		const clients = await this.clientsFor(input.directory, input.file, input.trusted);
		const found = await Promise.all(
			clients.map(async (client) => {
				try {
					const since = this.now();
					const version = await client.open(path);
					if (input.wait) await client.waitForDiagnostics(path, version, since);
					return client.diagnosticsFor(path);
				} catch {
					return [];
				}
			}),
		);
		this.changed(realOr(input.directory));
		return found.flat();
	}

	/** Runs `operation` on each server that serves `file`, after making sure each has the file open. */
	async run<T>(
		input: { directory: string; file: string; trusted: boolean },
		operation: (client: LspClient) => Promise<T>,
	): Promise<T[]> {
		const path = realOr(resolve(realOr(input.directory), input.file));
		const clients = await this.clientsFor(input.directory, input.file, input.trusted);
		const results = await Promise.all(
			clients.map(async (client) => {
				try {
					await client.open(path);
					return await operation(client);
				} catch {
					return undefined;
				}
			}),
		);
		return results.filter((result): result is Awaited<T> => result !== undefined) as T[];
	}

	/** Runs `operation` on every server already running in the workspace. */
	async runAll<T>(
		input: { directory: string; trusted: boolean },
		operation: (client: LspClient) => Promise<T>,
	): Promise<T[]> {
		if (!this.canRun(input.trusted)) return [];
		const state = this.directories.get(realOr(input.directory));
		const clients = [...(state?.entries.values() ?? [])]
			.map((entry) => entry.client)
			.filter((client): client is LspClient => client?.state === "ready");
		const results = await Promise.all(
			clients.map((client) => operation(client).catch(() => undefined)),
		);
		return results.filter((result): result is Awaited<T> => result !== undefined) as T[];
	}

	status(directory: string, trusted: boolean): LspWorkspaceStatus {
		const enabled = this.options.config().enabled;
		const dir = realOr(directory);
		const servers: LspServerStatus[] = [];
		if (enabled && trusted) {
			for (const entry of this.directories.get(dir)?.entries.values() ?? []) {
				const down = entry.client && entry.client.state !== "ready";
				const counts =
					entry.client?.state === "ready" ? entry.client.counts() : { errors: 0, warnings: 0 };
				const message = down ? entry.client?.message : entry.message;
				servers.push({
					id: entry.spec.id,
					name: entry.spec.name,
					root: relative(dir, entry.spec.root) || ".",
					state: down ? "error" : entry.state,
					...(message ? { message: firstLine(message) } : {}),
					files: entry.client?.state === "ready" ? entry.client.files : 0,
					errors: counts.errors,
					warnings: counts.warnings,
					custom: entry.spec.custom,
				});
			}
		}
		servers.sort((a, b) => a.name.localeCompare(b.name) || a.root.localeCompare(b.root));
		return { enabled, trusted, servers };
	}

	/** Stops and forgets one server (or all) of a workspace; the next touch starts it fresh. */
	async restart(directory: string, serverId?: string): Promise<void> {
		const dir = realOr(directory);
		const state = this.directories.get(dir);
		if (!state) return;
		const stopping: Promise<void>[] = [];
		for (const [key, entry] of state.entries) {
			if (serverId !== undefined && entry.spec.id !== serverId) continue;
			state.entries.delete(key);
			if (entry.client) stopping.push(entry.client.shutdown().catch(() => undefined));
		}
		await Promise.all(stopping);
		this.changed(dir);
	}

	/** After a settings change: stop everything so each server restarts under the new rules. */
	async reconfigure(): Promise<void> {
		await Promise.all([...this.directories.keys()].map((directory) => this.restart(directory)));
	}

	async dispose(directory: string): Promise<void> {
		const dir = realOr(directory);
		await this.restart(dir);
		const state = this.directories.get(dir);
		if (state?.timer) clearTimeout(state.timer);
		this.directories.delete(dir);
	}

	async disposeAll(): Promise<void> {
		await Promise.all([...this.directories.keys()].map((directory) => this.dispose(directory)));
		if (this.reaper) clearInterval(this.reaper);
		this.reaper = undefined;
	}

	private armReaper(): void {
		if (this.reaper) return;
		this.reaper = setInterval(() => void this.reapIdle(), REAP_INTERVAL_MS);
		this.reaper.unref?.();
	}

	/** Stops the servers nothing has used for `idleMinutes`. */
	async reapIdle(): Promise<void> {
		const limit = this.options.config().idleMinutes * 60_000;
		for (const [directory, state] of this.directories) {
			for (const [key, entry] of state.entries) {
				if (entry.state !== "ready" || this.now() - entry.lastUsed < limit) continue;
				state.entries.delete(key);
				await entry.client?.shutdown().catch(() => undefined);
				this.changed(directory);
			}
		}
	}

	/** The known directories, for the host to map back to workspaces. */
	directoriesInUse(): string[] {
		return [...this.directories.keys()];
	}
}
