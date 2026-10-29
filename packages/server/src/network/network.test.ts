import { expect, test } from "bun:test";
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
