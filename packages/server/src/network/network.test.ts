import { expect, test } from "bun:test";
import type { NetworkProxyRoute } from "@thinkrail/contracts";
import { createProxyManager } from "./network";
import { DEFAULT_PROXY_CONFIG } from "./policy";

function fixture() {
	let stored: unknown;
	const secrets = new Map<string, string>();
	const env: Record<string, string | undefined> = {};
	const deps = {
		load: () => stored,
		save: (value: unknown) => {
			stored = value;
		},
		env,
		detect: async () => ({
			source: "windows" as const,
			http: "http://system:8080",
			https: "http://system:8080",
			bypass: "",
		}),
		getSecret: async (id: string) => secrets.get(id) ?? null,
		setSecret: async (id: string, value: string) => {
			secrets.set(id, value);
		},
		deleteSecret: async (id: string) => secrets.delete(id),
	};
	return { deps, env, secrets, stored: () => stored, manager: createProxyManager(deps) };
}
const manual = {
	...DEFAULT_PROXY_CONFIG,
	mode: "manual" as const,
	host: "localhost",
	port: 7897,
	username: "user",
};
test("secrets never enter persisted config or wire status; changes take effect on restart", async () => {
	const f = fixture();
	await f.manager.initialize();
	const status = await f.manager.update({ config: manual, password: "secret-canary" });
	expect(JSON.stringify(f.stored())).not.toContain("secret-canary");
	expect(JSON.stringify(status)).not.toContain("secret-canary");
	expect(status.restartRequired).toBe(true);
	expect(f.env.HTTPS_PROXY).toBe("http://system:8080/");
	const restartedEnv: Record<string, string | undefined> = {};
	const restarted = createProxyManager({ ...f.deps, env: restartedEnv });
	await restarted.initialize();
	expect(restartedEnv.HTTPS_PROXY).toBe("http://user:secret-canary@localhost:7897/");
	expect((await restarted.status()).effective.https).toBe("http://localhost:7897/");
});
test("unsupported system bypass rules retain the detected address and port separately from the blocked route", async () => {
	const f = fixture();
	const manager = createProxyManager({
		...f.deps,
		detect: async () => ({
			source: "windows",
			http: "127.0.0.1:7897",
			https: "127.0.0.1:7897",
			bypass: "<local>;10.*",
		}),
	});
	const status = await manager.status();
	expect(status.detected).toMatchObject({
		http: "http://127.0.0.1:7897/",
		https: "http://127.0.0.1:7897/",
		bypass: "<local>;10.*",
		issue: "bypassUnsupported",
	});
	expect(status.effective.issue).toBe("bypassUnsupported");
	expect(status.detected.https).not.toBe(status.effective.https);
});

test("secret-store failure cannot replace the saved configuration", async () => {
	const f = fixture();
	const manager = createProxyManager({
		...f.deps,
		setSecret: async () => {
			throw new Error("unavailable");
		},
	});
	await expect(manager.update({ config: manual, password: "secret" })).rejects.toThrow(
		"credential storage unavailable",
	);
	expect(f.stored()).toBeUndefined();
});
test("missing credential and malformed disk config block external requests but leave settings usable", async () => {
	const f = fixture();
	f.deps.save({ config: manual, secretId: "00000000-0000-4000-8000-000000000000" });
	expect((await f.manager.status()).effective.issue).toBe("credentialUnavailable");
	const broken = createProxyManager({
		...f.deps,
		env: {},
		load: () => {
			throw new Error("bad json");
		},
	});
	expect((await broken.status()).effective.issue).toBe("invalidConfig");
});
test("changing proxy address cannot reuse another proxy's password", async () => {
	const f = fixture();
	await f.manager.update({ config: manual, password: "secret" });
	await expect(f.manager.update({ config: { ...manual, host: "other" } })).rejects.toThrow(
		"password is required",
	);
	expect(f.secrets.size).toBe(1);
});
test("failed persistence rolls back the newly-created secret", async () => {
	const f = fixture();
	const manager = createProxyManager({
		...f.deps,
		save: () => {
			throw new Error("disk full");
		},
	});
	await expect(manager.update({ config: manual, password: "secret" })).rejects.toThrow(
		"Could not save",
	);
	expect(f.secrets.size).toBe(0);
});

const HUB = "https://huggingface.co/csukuangfj/model/resolve/abc/file.onnx";
const macSystem = (patch: Partial<NetworkProxyRoute> = {}): NetworkProxyRoute => ({
	source: "macos",
	http: "http://127.0.0.1:7897",
	https: "http://127.0.0.1:7897",
	bypass: "127.0.0.1,192.168.0.0/16,10.0.0.0/8,172.16.0.0/12,localhost,*.local,<local>",
	...patch,
});
test("a download uses the OS proxy even when its exception list blocks the route applied at boot", async () => {
	const f = fixture();
	const manager = createProxyManager({ ...f.deps, detect: async () => macSystem() });
	await manager.initialize();
	expect(manager.route().issue).toBe("bypassUnsupported");
	expect(f.env.HTTPS_PROXY).toBe("http://127.0.0.1:0");
	expect(await manager.downloadProxy(HUB)).toBe("http://127.0.0.1:7897/");
});
test("a download sees an OS proxy switched on after the host started, and follows its scheme", async () => {
	const f = fixture();
	let system = macSystem({ http: "", https: "", bypass: "" });
	const manager = createProxyManager({ ...f.deps, detect: async () => system });
	await manager.initialize();
	expect(await manager.downloadProxy(HUB)).toBeUndefined();
	system = macSystem({ http: "http://127.0.0.1:7000", https: "http://127.0.0.1:7001", bypass: "" });
	expect(await manager.downloadProxy(HUB)).toBe("http://127.0.0.1:7001/");
	expect(await manager.downloadProxy("http://models.test/file")).toBe("http://127.0.0.1:7000/");
});
test("a download leaves the route alone when the user or the OS did not give a usable proxy", async () => {
	const f = fixture();
	const auto = (patch: Partial<NetworkProxyRoute>) =>
		createProxyManager({ ...f.deps, detect: async () => macSystem(patch) });
	expect(await auto({ bypass: "*.huggingface.co" }).downloadProxy(HUB)).toBeUndefined();
	expect(await auto({ issue: "pacUnsupported" }).downloadProxy(HUB)).toBeUndefined();
	expect(await auto({ https: "socks5://127.0.0.1:7897" }).downloadProxy(HUB)).toBeUndefined();

	const withEnv = createProxyManager({
		...f.deps,
		env: { HTTPS_PROXY: "http://env.test:3128" },
		detect: async () => macSystem(),
	});
	expect(await withEnv.downloadProxy(HUB)).toBeUndefined();

	for (const mode of ["manual", "direct"] as const) {
		const chosen = fixture();
		const manager = createProxyManager({ ...chosen.deps, detect: async () => macSystem() });
		await manager.update({
			config: mode === "manual" ? manual : { ...DEFAULT_PROXY_CONFIG, mode },
			password: "secret",
		});
		expect(await manager.downloadProxy(HUB)).toBeUndefined();
	}
});
test("Bun sends a request through an explicit proxy even while the environment route is blocked", async () => {
	const keys = ["HTTP_PROXY", "http_proxy", "HTTPS_PROXY", "https_proxy"] as const;
	const saved = keys.map((key) => process.env[key]);
	const seen: string[] = [];
	const proxy = Bun.serve({
		port: 0,
		hostname: "127.0.0.1",
		fetch: (request) => {
			seen.push(request.url);
			return new Response("via-proxy");
		},
	});
	for (const key of keys) process.env[key] = "http://127.0.0.1:0";
	try {
		const blocked = await fetch("http://models.invalid/a").catch(() => null);
		expect(blocked).toBeNull();
		const response = await fetch("http://models.invalid/b", {
			proxy: `http://127.0.0.1:${proxy.port}`,
		});
		expect(await response.text()).toBe("via-proxy");
		expect(seen).toEqual(["http://models.invalid/b"]);
	} finally {
		keys.forEach((key, index) => {
			const value = saved[index];
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		});
		await proxy.stop(true);
	}
});
