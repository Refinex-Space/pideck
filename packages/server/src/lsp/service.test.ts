import { afterEach, beforeEach, expect, test } from "bun:test";
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resetLspConfig } from "./config";
import { lspManager, lspOverview, onLspConfigChange, restartLsp, updateLspConfig } from "./service";

const FAKE = new URL("./fixtures/fakeServer.ts", import.meta.url).pathname;
const saved = process.env.THINKRAIL_DATA_DIR;
let dataDir: string;
let work: string;

beforeEach(() => {
	dataDir = realpathSync(mkdtempSync(join(tmpdir(), "lsp-data-")));
	work = realpathSync(mkdtempSync(join(tmpdir(), "lsp-work-")));
	writeFileSync(join(work, "a.fake"), "ERROR_MARK\n");
	process.env.THINKRAIL_DATA_DIR = dataDir;
	resetLspConfig();
});

afterEach(async () => {
	await lspManager.disposeAll();
	if (saved === undefined) delete process.env.THINKRAIL_DATA_DIR;
	else process.env.THINKRAIL_DATA_DIR = saved;
	resetLspConfig();
	rmSync(dataDir, { recursive: true, force: true });
	rmSync(work, { recursive: true, force: true });
});

const fake = { command: [process.execPath, FAKE], extensions: [".fake"] };

test("language servers are off until switched on, and the overview says what is built in", () => {
	const overview = lspOverview();
	expect(overview.config.enabled).toBe(false);
	expect(overview.status).toEqual({ enabled: false, trusted: false, servers: [] });
	expect(overview.catalog.length).toBeGreaterThan(5);
	expect(overview.catalog.map((entry) => entry.id)).toContain("typescript");
	expect(existsSync(join(dataDir, "lsp.json"))).toBe(false);
});

test("an update is saved, announced, and read back after a restart of the host", async () => {
	let announced = 0;
	const stop = onLspConfigChange(() => announced++);
	const overview = await updateLspConfig({ enabled: true, idleMinutes: 30 });
	stop();
	expect(announced).toBe(1);
	expect(overview.config).toMatchObject({ enabled: true, idleMinutes: 30, diagnostics: true });
	expect(JSON.parse(readFileSync(join(dataDir, "lsp.json"), "utf8"))).toMatchObject({
		enabled: true,
		idleMinutes: 30,
	});
	resetLspConfig();
	expect(lspOverview().config.idleMinutes).toBe(30);
});

test("a refused update changes nothing", async () => {
	await expect(updateLspConfig({ idleMinutes: 0 })).rejects.toThrow("whole number");
	expect(existsSync(join(dataDir, "lsp.json"))).toBe(false);
	expect(lspOverview().config.idleMinutes).toBe(15);
});

test("servers restart when the table changes and are left alone for the other switches", async () => {
	await updateLspConfig({ enabled: true, servers: { fake } });
	await lspManager.touch({ directory: work, file: "a.fake", trusted: true, wait: true });
	const before = lspOverview({ directory: work, trusted: true }).status.servers;
	expect(before).toHaveLength(1);
	expect(before[0]).toMatchObject({ id: "fake", state: "ready", errors: 1, custom: true });

	await updateLspConfig({ diagnostics: false, tool: false });
	expect(lspOverview({ directory: work, trusted: true }).status.servers).toHaveLength(1);

	await updateLspConfig({ servers: { fake: { ...fake, env: { FAKE_LSP_DELAY_MS: "1" } } } });
	expect(lspOverview({ directory: work, trusted: true }).status.servers).toHaveLength(0);

	await lspManager.touch({ directory: work, file: "a.fake", trusted: true, wait: true });
	expect(lspOverview({ directory: work, trusted: true }).status.servers).toHaveLength(1);
	await updateLspConfig({ enabled: false });
	expect(lspOverview({ directory: work, trusted: true }).status).toEqual({
		enabled: false,
		trusted: true,
		servers: [],
	});
});

test("restart stops one server so the next touch starts it again", async () => {
	await updateLspConfig({ enabled: true, servers: { fake } });
	await lspManager.touch({ directory: work, file: "a.fake", trusted: true });
	await restartLsp(work, "other");
	expect(lspOverview({ directory: work, trusted: true }).status.servers).toHaveLength(1);
	await restartLsp(work, "fake");
	expect(lspOverview({ directory: work, trusted: true }).status.servers).toHaveLength(0);
});
