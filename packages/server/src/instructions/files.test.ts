import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { INSTRUCTIONS_MAX_BYTES } from "@thinkrail/contracts";
import { errorCodeOf } from "@thinkrail/shared/codedError";
import { instructionTarget, readInstructions, saveInstruction } from "./files";

let root: string;
let agentDir: string;

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "pideck-instructions-"));
	agentDir = join(root, "agent");
	mkdirSync(agentDir);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const save = (kind: "agents" | "append", content: string) => {
	const doc = readInstructions(agentDir)[kind];
	return saveInstruction(agentDir, {
		kind,
		content,
		expectedPath: doc.path,
		expectedRevision: doc.revision,
	});
};

describe("global agents file", () => {
	test("targets AGENTS.md when nothing exists yet", () => {
		const { agents } = readInstructions(agentDir);
		expect(agents).toMatchObject({ exists: false, content: "", revision: "", ignored: [] });
		expect(agents.path).toBe(join(agentDir, "AGENTS.md"));
	});

	test("follows Pi's candidate order and reports the files it ignores", () => {
		writeFileSync(join(agentDir, "CLAUDE.md"), "claude");
		expect(readInstructions(agentDir).agents.path).toBe(join(agentDir, "CLAUDE.md"));
		writeFileSync(join(agentDir, "AGENTS.override.md"), "override");
		const { agents } = readInstructions(agentDir);
		expect(agents.path).toBe(join(agentDir, "AGENTS.override.md"));
		expect(agents.content).toBe("override");
		expect(agents.ignored).toEqual([join(agentDir, "CLAUDE.md")]);
	});

	test("saving edits the file Pi reads instead of shadowing it", () => {
		writeFileSync(join(agentDir, "CLAUDE.md"), "old\n");
		save("agents", "new rules");
		expect(readFileSync(join(agentDir, "CLAUDE.md"), "utf8")).toBe("new rules\n");
		expect(existsSync(join(agentDir, "AGENTS.md"))).toBe(false);
	});

	test("strips a byte-order mark the way Pi does", () => {
		writeFileSync(join(agentDir, "AGENTS.md"), "﻿hello");
		expect(readInstructions(agentDir).agents.content).toBe("hello");
	});
});

describe("save", () => {
	test("creates the agent directory and the file", () => {
		rmSync(agentDir, { recursive: true });
		const state = save("append", "be brief");
		expect(readFileSync(join(agentDir, "APPEND_SYSTEM.md"), "utf8")).toBe("be brief\n");
		expect(state.append).toMatchObject({ exists: true, content: "be brief\n" });
		expect(readdirSync(agentDir)).toEqual(["APPEND_SYSTEM.md"]);
	});

	test("an empty text deletes the file", () => {
		writeFileSync(join(agentDir, "AGENTS.md"), "rules");
		const state = save("agents", "  \n");
		expect(existsSync(join(agentDir, "AGENTS.md"))).toBe(false);
		expect(state.agents.exists).toBe(false);
	});

	test("refuses a stale revision or path", () => {
		writeFileSync(join(agentDir, "AGENTS.md"), "one");
		const loaded = readInstructions(agentDir).agents;
		writeFileSync(join(agentDir, "AGENTS.md"), "two");
		let error: unknown;
		try {
			saveInstruction(agentDir, {
				kind: "agents",
				content: "mine",
				expectedPath: loaded.path,
				expectedRevision: loaded.revision,
			});
		} catch (caught) {
			error = caught;
		}
		expect(errorCodeOf(error)).toBe("INSTRUCTIONS_CONFLICT");
		expect(readFileSync(join(agentDir, "AGENTS.md"), "utf8")).toBe("two");

		writeFileSync(join(agentDir, "AGENTS.override.md"), "appeared");
		const current = readInstructions(agentDir).agents;
		expect(() =>
			saveInstruction(agentDir, {
				kind: "agents",
				content: "mine",
				expectedPath: join(agentDir, "AGENTS.md"),
				expectedRevision: current.revision,
			}),
		).toThrow();
	});

	test("refuses a file over the size cap", () => {
		let error: unknown;
		try {
			save("agents", "x".repeat(INSTRUCTIONS_MAX_BYTES + 1));
		} catch (caught) {
			error = caught;
		}
		expect(errorCodeOf(error)).toBe("INSTRUCTIONS_TOO_LARGE");
	});

	test("writes through a symlink and leaves no temp file behind", () => {
		const shared = join(root, "shared.md");
		writeFileSync(shared, "shared");
		symlinkSync(shared, join(agentDir, "AGENTS.md"));
		save("agents", "updated");
		expect(lstatSync(join(agentDir, "AGENTS.md")).isSymbolicLink()).toBe(true);
		expect(readFileSync(shared, "utf8")).toBe("updated\n");
		expect(readdirSync(agentDir)).toEqual(["AGENTS.md"]);
	});

	test("deleting through a symlink removes only the link", () => {
		const shared = join(root, "shared.md");
		writeFileSync(shared, "shared");
		symlinkSync(shared, join(agentDir, "AGENTS.md"));
		save("agents", "");
		expect(existsSync(join(agentDir, "AGENTS.md"))).toBe(false);
		expect(readFileSync(shared, "utf8")).toBe("shared");
	});
});

describe("workspace view", () => {
	test("lists Pi's context files in injection order with their scope", () => {
		const home = join(root, "dev");
		const cwd = join(home, "app");
		mkdirSync(cwd, { recursive: true });
		writeFileSync(join(agentDir, "AGENTS.md"), "global");
		writeFileSync(join(home, "AGENTS.md"), "parent");
		writeFileSync(join(cwd, "CLAUDE.md"), "project");
		const { workspace } = readInstructions(agentDir, { cwd, trusted: false });
		expect(workspace?.loaded.map((file) => [file.scope, file.path])).toEqual([
			["global", join(agentDir, "AGENTS.md")],
			["ancestor", join(home, "AGENTS.md")],
			["project", join(cwd, "CLAUDE.md")],
		]);
	});

	test("flags a project append file that replaces the global one only when trusted", () => {
		const cwd = join(root, "app");
		mkdirSync(join(cwd, ".pi"), { recursive: true });
		writeFileSync(join(cwd, ".pi", "APPEND_SYSTEM.md"), "project");
		const untrusted = readInstructions(agentDir, { cwd, trusted: false }).workspace;
		expect(untrusted?.projectAppend).toEqual({
			path: join(cwd, ".pi", "APPEND_SYSTEM.md"),
			active: false,
		});
		expect(
			readInstructions(agentDir, { cwd, trusted: true }).workspace?.projectAppend?.active,
		).toBe(true);
	});

	test("reports the SYSTEM.md Pi would use, project first only when trusted", () => {
		const cwd = join(root, "app");
		mkdirSync(join(cwd, ".pi"), { recursive: true });
		writeFileSync(join(agentDir, "SYSTEM.md"), "global");
		writeFileSync(join(cwd, ".pi", "SYSTEM.md"), "project");
		expect(readInstructions(agentDir, { cwd, trusted: false }).workspace?.systemPrompt).toEqual({
			path: join(agentDir, "SYSTEM.md"),
			scope: "global",
		});
		expect(readInstructions(agentDir, { cwd, trusted: true }).workspace?.systemPrompt).toEqual({
			path: join(cwd, ".pi", "SYSTEM.md"),
			scope: "project",
		});
	});
});

describe("reveal target", () => {
	test("is the file when it exists and the agent directory when it does not", () => {
		expect(instructionTarget(agentDir, "agents")).toEqual({ path: agentDir, exists: false });
		writeFileSync(join(agentDir, "CLAUDE.md"), "x");
		expect(instructionTarget(agentDir, "agents")).toEqual({
			path: join(agentDir, "CLAUDE.md"),
			exists: true,
		});
		expect(instructionTarget(agentDir, "append").exists).toBe(false);
	});
});
