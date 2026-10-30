import {
	DEFAULT_LSP_CONFIG,
	LSP_IDLE_MINUTES,
	type LspConfig,
	type LspConfigUpdate,
	type LspServerOverride,
} from "@thinkrail/contracts";
import { loadLspRecord, saveLspRecord } from "../persistence";
import { serverDefinition } from "./servers";

const ID = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const EXTENSION = /^\.[A-Za-z0-9+_-]{1,15}$/;
const MAX_SERVERS = 32;
const MAX_ARGS = 16;
const MAX_ARG_LENGTH = 1_000;
const MAX_EXTENSIONS = 32;
const MAX_ENV = 32;
const MAX_INITIALIZATION_BYTES = 16_384;

function record(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function stringList(value: unknown, max: number, what: string): string[] {
	if (!Array.isArray(value) || value.length > max || value.some((item) => typeof item !== "string"))
		throw new Error(`${what} must be a list of at most ${max} strings`);
	return value as string[];
}

/** One server's override, checked. A custom server (not in the catalog) must say how to run it. */
export function validateOverride(id: string, value: unknown): LspServerOverride {
	if (!ID.test(id))
		throw new Error("A language server id uses lowercase letters, digits, - and _ (at most 32)");
	const input = record(value);
	if (!input) throw new Error(`The settings for "${id}" must be an object`);
	const custom = serverDefinition(id) === undefined;
	const next: LspServerOverride = {};
	if (input.disabled !== undefined) {
		if (typeof input.disabled !== "boolean")
			throw new Error(`"disabled" for "${id}" must be true or false`);
		if (input.disabled) next.disabled = true;
	}
	if (input.command !== undefined) {
		const command = stringList(input.command, MAX_ARGS, `The command for "${id}"`);
		if (
			command.length === 0 ||
			command.some((part) => part.length === 0 || part.length > MAX_ARG_LENGTH)
		)
			throw new Error(
				`The command for "${id}" needs an executable and arguments of up to ${MAX_ARG_LENGTH} characters`,
			);
		next.command = command;
	}
	if (input.extensions !== undefined) {
		const extensions = stringList(input.extensions, MAX_EXTENSIONS, `The extensions for "${id}"`);
		if (extensions.some((extension) => !EXTENSION.test(extension)))
			throw new Error(`Each extension for "${id}" starts with a dot, like ".ts"`);
		next.extensions = [...new Set(extensions)];
	}
	if (input.env !== undefined) {
		const env = record(input.env);
		const entries = env ? Object.entries(env) : [];
		if (!env || entries.length > MAX_ENV || entries.some(([, v]) => typeof v !== "string"))
			throw new Error(`The environment for "${id}" must map names to strings`);
		next.env = Object.fromEntries(entries) as Record<string, string>;
	}
	if (input.initialization !== undefined) {
		const initialization = record(input.initialization);
		if (!initialization || JSON.stringify(initialization).length > MAX_INITIALIZATION_BYTES)
			throw new Error(`The initialization options for "${id}" must be a JSON object under 16 KB`);
		next.initialization = initialization;
	}
	if (custom && !next.disabled && (!next.command || !next.extensions?.length))
		throw new Error(`The custom server "${id}" needs a command and at least one extension`);
	return next;
}

function normalizeServers(value: unknown): Record<string, LspServerOverride> {
	const input = record(value);
	if (!input) return {};
	const servers: Record<string, LspServerOverride> = {};
	for (const [id, override] of Object.entries(input).slice(0, MAX_SERVERS)) {
		try {
			servers[id] = validateOverride(id, override);
		} catch {}
	}
	return servers;
}

/** Whatever a stored file holds, as a usable config: every bad field falls back to its default. */
export function normalizeLspConfig(value: unknown): LspConfig {
	const input = record(value);
	if (!input) return structuredClone(DEFAULT_LSP_CONFIG);
	const idle = input.idleMinutes;
	return {
		enabled: input.enabled === true,
		diagnostics:
			typeof input.diagnostics === "boolean" ? input.diagnostics : DEFAULT_LSP_CONFIG.diagnostics,
		tool: typeof input.tool === "boolean" ? input.tool : DEFAULT_LSP_CONFIG.tool,
		idleMinutes:
			typeof idle === "number" &&
			Number.isInteger(idle) &&
			idle >= LSP_IDLE_MINUTES.min &&
			idle <= LSP_IDLE_MINUTES.max
				? idle
				: DEFAULT_LSP_CONFIG.idleMinutes,
		servers: normalizeServers(input.servers),
	};
}

/** The config with an update applied; a bad update changes nothing and says why. */
export function applyLspUpdate(current: LspConfig, update: unknown): LspConfig {
	const input = record(update);
	if (!input) throw new Error("A language server update must be an object");
	const next: LspConfig = { ...current, servers: { ...current.servers } };
	for (const key of Object.keys(input))
		if (!["enabled", "diagnostics", "tool", "idleMinutes", "servers"].includes(key))
			throw new Error(`Unknown language server setting: ${key}`);
	for (const key of ["enabled", "diagnostics", "tool"] as const) {
		const value = input[key];
		if (value === undefined) continue;
		if (typeof value !== "boolean") throw new Error(`"${key}" must be true or false`);
		next[key] = value;
	}
	if (input.idleMinutes !== undefined) {
		const idle = input.idleMinutes;
		if (
			typeof idle !== "number" ||
			!Number.isInteger(idle) ||
			idle < LSP_IDLE_MINUTES.min ||
			idle > LSP_IDLE_MINUTES.max
		)
			throw new Error(
				`"idleMinutes" must be a whole number from ${LSP_IDLE_MINUTES.min} to ${LSP_IDLE_MINUTES.max}`,
			);
		next.idleMinutes = idle;
	}
	if (input.servers !== undefined) {
		const servers = record(input.servers);
		if (!servers) throw new Error('"servers" must be an object');
		for (const [id, override] of Object.entries(
			servers as NonNullable<LspConfigUpdate["servers"]>,
		)) {
			if (override === null) delete next.servers[id];
			else next.servers[id] = validateOverride(id, override);
		}
		if (Object.keys(next.servers).length > MAX_SERVERS)
			throw new Error(`At most ${MAX_SERVERS} language servers can be configured`);
	}
	return next;
}

let current: LspConfig | undefined;

/** The saved config, read once and then held; `setLspConfig` is the only writer. */
export function getLspConfig(): LspConfig {
	current ??= normalizeLspConfig(loadLspRecord());
	return current;
}

export function setLspConfig(config: LspConfig): LspConfig {
	saveLspRecord(config);
	current = config;
	return config;
}

/** Forgets the held config so the next read goes to disk again (tests). */
export function resetLspConfig(): void {
	current = undefined;
}
