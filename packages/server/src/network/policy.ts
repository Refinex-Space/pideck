import { isIP } from "node:net";
import type { NetworkProxyConfig, NetworkProxyRoute } from "@thinkrail/contracts";

export const DEFAULT_PROXY_CONFIG: NetworkProxyConfig = {
	mode: "auto",
	protocol: "http",
	host: "",
	port: 8080,
	bypass: "",
	username: "",
};
export const PROXY_KEYS = ["http_proxy", "https_proxy", "all_proxy", "no_proxy"] as const;
const LOOPBACK = ["localhost", "127.0.0.1", "::1"];
export const BLOCKED_PROXY = "http://127.0.0.1:0";
export type ProxyEnvironment = Record<string, string | undefined>;

export function proxyEnvironment(env: ProxyEnvironment): ProxyEnvironment {
	return Object.fromEntries(
		PROXY_KEYS.map((key) => [key, env[key] || env[key.toUpperCase()] || ""]),
	);
}
export function hasProxyEnvironment(env: ProxyEnvironment): boolean {
	return PROXY_KEYS.slice(0, 3).some((key) => Boolean(env[key] || env[key.toUpperCase()]));
}
export function normalizeBypass(value: string): string {
	const entries = value.split(/[,;\s]+/).filter(Boolean);
	for (const entry of entries) {
		if (entry === "*" || isIP(entry)) continue;
		const ipv6 = /^\[([^\]]+)\](?::(\d+))?$/.exec(entry);
		const parts = ipv6 || /^([^:]+)(?::(\d+))?$/.exec(entry);
		const host = parts?.[1]?.replace(/^\*?\./, "") || "";
		const port = parts?.[2];
		if (
			!parts ||
			(ipv6 ? isIP(host) !== 6 : !/^(?:[a-zA-Z0-9_-]+\.)*[a-zA-Z0-9_-]+$/.test(host)) ||
			(port !== undefined && (Number(port) < 1 || Number(port) > 65535))
		)
			throw new Error("Unsupported proxy bypass rule");
	}
	if (entries.includes("*")) return "*";
	return [...new Set([...LOOPBACK, ...entries])].join(",");
}
export function parseProxyConfig(input: unknown): NetworkProxyConfig {
	if (!input || typeof input !== "object" || Array.isArray(input))
		throw new Error("Invalid proxy configuration");
	const c = input as Record<string, unknown>;
	if (
		!Object.keys(c).every((key) => Object.hasOwn(DEFAULT_PROXY_CONFIG, key)) ||
		typeof c.mode !== "string" ||
		typeof c.protocol !== "string" ||
		!["auto", "manual", "direct"].includes(String(c.mode)) ||
		!["http", "https"].includes(String(c.protocol)) ||
		typeof c.host !== "string" ||
		typeof c.port !== "number" ||
		!Number.isInteger(c.port) ||
		c.port < 1 ||
		c.port > 65535 ||
		typeof c.bypass !== "string" ||
		typeof c.username !== "string" ||
		c.host.length > 253 ||
		c.bypass.length > 4096 ||
		c.username.length > 256 ||
		/[\r\n\0]/.test(c.username)
	)
		throw new Error("Invalid proxy configuration");
	const host = c.host.trim().replace(/^\[|\]$/g, "");
	if (host && !isIP(host) && !/^(?:[a-zA-Z0-9_-]+\.)*[a-zA-Z0-9_-]+$/.test(host))
		throw new Error("Invalid proxy host");
	if (c.mode === "manual" && !host) throw new Error("Proxy host is required");
	normalizeBypass(c.bypass);
	return {
		mode: c.mode as NetworkProxyConfig["mode"],
		protocol: c.protocol as NetworkProxyConfig["protocol"],
		host,
		port: c.port,
		bypass: c.bypass.trim(),
		username: c.username,
	};
}
export function normalizeProxyUrl(value: string): string {
	if (!value) return "";
	const url = new URL(value.includes("://") ? value : `http://${value}`);
	if (!["http:", "https:"].includes(url.protocol)) throw new Error("Unsupported proxy protocol");
	if (!url.hostname || url.pathname !== "/" || url.search || url.hash)
		throw new Error("Invalid proxy URL");
	return url.href;
}
export function redactRoute(route: NetworkProxyRoute): NetworkProxyRoute {
	const redact = (value: string) => {
		if (!value) return "";
		try {
			const url = new URL(value.includes("://") ? value : `http://${value}`);
			url.username = "";
			url.password = "";
			url.pathname = "/";
			url.search = "";
			url.hash = "";
			return url.href;
		} catch {
			return "";
		}
	};
	return { ...route, http: redact(route.http), https: redact(route.https) };
}
export function blockedRoute(
	route: NetworkProxyRoute,
	issue: NonNullable<NetworkProxyRoute["issue"]>,
): NetworkProxyRoute {
	return { ...route, http: BLOCKED_PROXY, https: BLOCKED_PROXY, bypass: LOOPBACK.join(","), issue };
}
export function resolveProxyPolicy(
	config: NetworkProxyConfig,
	ambient: ProxyEnvironment,
	system: NetworkProxyRoute,
	password?: string,
): NetworkProxyRoute {
	const env = proxyEnvironment(ambient);
	let route: NetworkProxyRoute;
	if (hasProxyEnvironment(env))
		route = {
			source: "environment",
			http: env.http_proxy || env.all_proxy || "",
			https: env.https_proxy || env.all_proxy || "",
			bypass: env.no_proxy || "",
		};
	else if (config.mode === "direct") route = { source: "direct", http: "", https: "", bypass: "" };
	else if (config.mode === "manual") {
		const url = new URL(
			`${config.protocol}://${isIP(config.host) === 6 ? `[${config.host}]` : config.host}:${config.port}`,
		);
		url.username = config.username;
		url.password = password || "";
		route = { source: "manual", http: url.href, https: url.href, bypass: config.bypass };
		if (config.username && password === undefined)
			return blockedRoute(route, "credentialUnavailable");
	} else route = { ...system, bypass: [system.bypass, env.no_proxy].filter(Boolean).join(",") };
	if (route.issue) return blockedRoute(route, route.issue);
	try {
		route = {
			...route,
			http: normalizeProxyUrl(route.http),
			https: normalizeProxyUrl(route.https),
		};
	} catch {
		return blockedRoute(
			route,
			/socks/i.test(`${route.http} ${route.https}`) ? "socksUnsupported" : "invalidConfig",
		);
	}
	try {
		return { ...route, bypass: normalizeBypass(route.bypass) };
	} catch {
		if (!route.http && !route.https) return { ...route, bypass: LOOPBACK.join(",") };
		if (route.source === "environment")
			return {
				...route,
				bypass: route.bypass.split(/[,;\s]+/).includes("*")
					? "*"
					: [...LOOPBACK, route.bypass].join(","),
				bypassWarning: true,
			};
		return blockedRoute(route, "bypassUnsupported");
	}
}
export function applyProxyEnvironment(
	route: NetworkProxyRoute,
	env: ProxyEnvironment = process.env,
): void {
	for (const key of PROXY_KEYS) {
		delete env[key];
		delete env[key.toUpperCase()];
	}
	for (const [key, value] of Object.entries({
		HTTP_PROXY: route.http,
		HTTPS_PROXY: route.https,
		NO_PROXY: route.bypass,
	})) {
		// An absent scheme must not inherit the other scheme through ALL_PROXY.
		if (value) {
			env[key] = value;
			if (process.platform !== "win32") env[key.toLowerCase()] = value;
		}
	}
}
