import { expect, test } from "bun:test";
import {
	applyProxyEnvironment,
	DEFAULT_PROXY_CONFIG,
	normalizeBypass,
	parseProxyConfig,
	resolveProxyPolicy,
} from "./policy";

test("inactive system exceptions do not block a system with no proxy enabled", () => {
	const route = resolveProxyPolicy(
		DEFAULT_PROXY_CONFIG,
		{},
		{
			source: "macos",
			http: "",
			https: "",
			bypass: "*.local,169.254.0.0/16,<local>",
		},
	);
	expect(route.issue).toBeUndefined();
	expect(route.http).toBe("");
	expect(route.https).toBe("");
	expect(
		resolveProxyPolicy(
			DEFAULT_PROXY_CONFIG,
			{ NO_PROXY: "*" },
			{
				source: "none",
				http: "",
				https: "",
				bypass: "",
			},
		).bypass,
	).toBe("*");
});

test("wildcard bypass stays a whole-list wildcard for Pi; IPv6 and ports are validated", () => {
	expect(normalizeBypass("localhost,*")).toBe("*");
	expect(normalizeBypass("[::1]:1455")).toContain("[::1]:1455");
	expect(() => normalizeBypass("example.org:65536")).toThrow();
});

test("existing environment bypass rules remain operational instead of becoming a new blocker", () => {
	const route = resolveProxyPolicy(
		parseProxyConfig(manual),
		{ HTTPS_PROXY: "http://localhost:7897", NO_PROXY: "10.0.0.0/8,<local>" },
		{ source: "none", http: "", https: "", bypass: "" },
	);
	expect(route.issue).toBeUndefined();
	expect(route.https).toBe("http://localhost:7897/");
	expect(route.bypass).toContain("10.0.0.0/8,<local>");
	expect(route.bypassWarning).toBe(true);
});

const manual = {
	mode: "manual",
	protocol: "http",
	host: "127.0.0.1",
	port: 7897,
	bypass: "localhost",
	username: "",
};
test("manual proxy reaches both OAuth HTTPS and HTTP model transports", () => {
	const config = parseProxyConfig(manual);
	const policy = resolveProxyPolicy(
		config,
		{},
		{ source: "windows", http: "", https: "", bypass: "" },
	);
	const env: Record<string, string | undefined> = { ALL_PROXY: "socks5://stale:1" };
	applyProxyEnvironment(policy, env);
	expect(env.HTTPS_PROXY).toBe("http://127.0.0.1:7897/");
	expect(env.HTTP_PROXY).toBe(env.HTTPS_PROXY);
	expect(env.ALL_PROXY).toBeUndefined();
	expect(env.NO_PROXY).toContain("127.0.0.1");
});
test("launch configuration wins without mixing it with system settings", () => {
	const policy = resolveProxyPolicy(
		parseProxyConfig(manual),
		{ HTTPS_PROXY: "http://launch:8080" },
		{ source: "windows", http: "http://system:90", https: "http://system:90", bypass: "" },
	);
	expect(policy.source).toBe("environment");
	expect(policy.https).toBe("http://launch:8080/");
	expect(policy.http).toBe("");
});
test("unsupported automatic configurations fail closed rather than silently connecting directly", () => {
	const policy = resolveProxyPolicy(
		parseProxyConfig({ ...manual, mode: "auto" }),
		{},
		{ source: "macos", http: "", https: "", bypass: "", issue: "pacUnsupported" },
	);
	expect(policy.issue).toBe("pacUnsupported");
	expect(policy.https).toBe("http://127.0.0.1:0");
});
test("rejects credentials in hosts, invalid ports and inconsistent bypass syntax", () => {
	for (const patch of [
		{ host: "user:secret@proxy" },
		{ port: 0 },
		{ port: 65536 },
		{ bypass: "10.0.0.0/8" },
		{ protocol: "socks5" },
	]) {
		expect(() => parseProxyConfig({ ...manual, ...patch })).toThrow();
	}
});
