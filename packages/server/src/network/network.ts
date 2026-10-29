import { randomUUID } from "node:crypto";
import type {
	NetworkProxyConfig,
	NetworkProxyRoute,
	NetworkProxyStatus,
	NetworkProxyUpdate,
} from "@thinkrail/contracts";
import { loadNetworkProxyRecord, saveNetworkProxyRecord } from "../persistence";
import {
	applyProxyEnvironment,
	blockedRoute,
	DEFAULT_PROXY_CONFIG,
	hasProxyEnvironment,
	parseProxyConfig,
	proxyEnvironment,
	redactRoute,
	resolveProxyPolicy,
} from "./policy";
import { detectSystemProxy } from "./systemProxy";

interface StoredProxy {
	config: NetworkProxyConfig;
	secretId?: string;
}
export interface ProxyDependencies {
	load(): unknown;
	save(value: StoredProxy): void;
	detect(): Promise<NetworkProxyRoute>;
	getSecret(id: string): Promise<string | null>;
	setSecret(id: string, value: string): Promise<void>;
	deleteSecret(id: string): Promise<unknown>;
	env: Record<string, string | undefined>;
}
const NONE: NetworkProxyRoute = { source: "none", http: "", https: "", bypass: "" };
export function createProxyManager(deps: ProxyDependencies) {
	let applied = "";
	let ambient = proxyEnvironment(deps.env);
	let effective = NONE;
	let detected = NONE;
	let detectedAt = "";
	let initializing: Promise<void> | undefined;
	let queue = Promise.resolve();
	function read(): StoredProxy {
		const raw = deps.load();
		if (raw === undefined) return { config: { ...DEFAULT_PROXY_CONFIG } };
		if (!raw || typeof raw !== "object") throw new Error("Invalid proxy configuration");
		const r = raw as Record<string, unknown>;
		if (
			r.secretId !== undefined &&
			(typeof r.secretId !== "string" || !/^[0-9a-f-]{36}$/.test(r.secretId))
		)
			throw new Error("Invalid proxy credential reference");
		return {
			config: parseProxyConfig(r.config),
			...(typeof r.secretId === "string" ? { secretId: r.secretId } : {}),
		};
	}
	async function detect() {
		detected = await deps.detect();
		detectedAt = new Date().toISOString();
	}
	async function initialize() {
		initializing ??= (async () => {
			ambient = proxyEnvironment(deps.env);
			await detect();
			try {
				const stored = read();
				applied = JSON.stringify(stored);
				let password: string | undefined;
				if (
					!hasProxyEnvironment(ambient) &&
					stored.config.mode === "manual" &&
					stored.config.username &&
					stored.secretId
				) {
					try {
						password = (await deps.getSecret(stored.secretId)) ?? undefined;
					} catch {
						password = undefined;
					}
				}
				effective = resolveProxyPolicy(stored.config, ambient, detected, password);
			} catch {
				effective = blockedRoute(NONE, "invalidConfig");
			}
			applyProxyEnvironment(effective, deps.env);
		})();
		await initializing;
	}
	async function status(refresh = false): Promise<NetworkProxyStatus> {
		await initialize();
		if (refresh) await detect();
		let stored: StoredProxy;
		try {
			stored = read();
		} catch {
			stored = { config: { ...DEFAULT_PROXY_CONFIG } };
		}
		const next = resolveProxyPolicy(stored.config, ambient, detected);
		const detectedPolicy = resolveProxyPolicy(DEFAULT_PROXY_CONFIG, {}, detected);
		return {
			config: stored.config,
			hasPassword: Boolean(stored.secretId),
			effective: redactRoute(effective),
			detected: redactRoute({
				...detected,
				...(detectedPolicy.issue ? { issue: detectedPolicy.issue } : {}),
			}),
			detectedAt,
			restartRequired:
				JSON.stringify(stored) !== applied ||
				(stored.config.mode === "auto" &&
					!hasProxyEnvironment(ambient) &&
					JSON.stringify(redactRoute(next)) !== JSON.stringify(redactRoute(effective))),
			environmentOverride: hasProxyEnvironment(ambient),
		};
	}
	async function write(input: NetworkProxyUpdate): Promise<NetworkProxyStatus> {
		await initialize();
		const config = parseProxyConfig(input.config);
		if (
			input.password !== undefined &&
			input.password !== null &&
			(typeof input.password !== "string" || input.password.length > 4096)
		)
			throw new Error("Invalid proxy password");
		let previous: StoredProxy;
		try {
			previous = read();
		} catch {
			previous = { config: DEFAULT_PROXY_CONFIG };
		}
		const changedIdentity = ["host", "port", "protocol", "username"].some(
			(key) =>
				config[key as keyof NetworkProxyConfig] !==
				previous.config[key as keyof NetworkProxyConfig],
		);
		let secretId =
			changedIdentity || !config.username || input.password === null
				? undefined
				: previous.secretId;
		let created: string | undefined;
		if (config.username && typeof input.password === "string" && input.password) {
			created = randomUUID();
			try {
				await deps.setSecret(created, input.password);
			} catch {
				throw new Error("Proxy credential storage unavailable");
			}
			secretId = created;
		}
		if (config.mode === "manual" && config.username && !secretId)
			throw new Error("Proxy password is required");
		try {
			deps.save({ config, ...(secretId ? { secretId } : {}) });
		} catch {
			if (created) await deps.deleteSecret(created).catch(() => {});
			throw new Error("Could not save proxy configuration");
		}
		if (previous.secretId && previous.secretId !== secretId)
			await deps.deleteSecret(previous.secretId).catch(() => {});
		return status();
	}
	return {
		initialize,
		status,
		update(input: NetworkProxyUpdate) {
			const task = queue.then(() => write(input));
			queue = task.then(
				() => {},
				() => {},
			);
			return task;
		},
		route: () => effective,
	};
}
const service = "space.refinex.pideck.proxy";
export const proxyManager = createProxyManager({
	load: loadNetworkProxyRecord,
	save: saveNetworkProxyRecord,
	detect: detectSystemProxy,
	getSecret: (name) => Bun.secrets.get({ service, name }),
	setSecret: (name, value) => Bun.secrets.set({ service, name, value }),
	deleteSecret: (name) => Bun.secrets.delete({ service, name }),
	env: process.env,
});
