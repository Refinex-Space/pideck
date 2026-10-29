import { afterEach, beforeEach, expect, test } from "bun:test";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { setTrashImplementationForTests } from "../trash";
import { readFile } from "./files";
import {
	createWorkspaceEntry,
	moveWorkspaceEntry,
	saveWorkspaceFile,
	searchFiles,
	trashWorkspaceEntry,
} from "./operations";

let data: string;
let root: string;
const originalDataDir = process.env.THINKRAIL_DATA_DIR;
beforeEach(() => {
	data = mkdtempSync(join(tmpdir(), "pideck-file-operations-"));
	root = join(data, "workspace");
	mkdirSync(root);
	process.env.THINKRAIL_DATA_DIR = data;
	writeFileSync(join(data, "workspaces.json"), JSON.stringify([{ id: "w", worktreePath: root }]));
	setTrashImplementationForTests(async (input) => {
		const path = typeof input === "string" ? input : input[0];
		if (!path) throw new Error("Missing trash input");
		renameSync(path, join(data, `trashed-${basename(path)}`));
	});
});
afterEach(() => {
	setTrashImplementationForTests(undefined);
	rmSync(data, { recursive: true, force: true });
	if (originalDataDir === undefined) delete process.env.THINKRAIL_DATA_DIR;
	else process.env.THINKRAIL_DATA_DIR = originalDataDir;
});

test("create and move refuse overwrites and preserve files and directories", () => {
	createWorkspaceEntry("w", "src", "dir");
	createWorkspaceEntry("w", "src/a.ts", "file");
	writeFileSync(join(root, "src/a.ts"), "keep");
	expect(() => createWorkspaceEntry("w", "src/a.ts", "file")).toThrow();
	expect(moveWorkspaceEntry("w", "src/a.ts", "src/b.ts")).toEqual({ path: "src/b.ts" });
	createWorkspaceEntry("w", "src/a.ts", "file");
	expect(() => moveWorkspaceEntry("w", "src/b.ts", "src/a.ts")).toThrow("already exists");
	expect(readFileSync(join(root, "src/b.ts"), "utf8")).toBe("keep");
	expect(() => moveWorkspaceEntry("w", "src", "src/nested")).toThrow("inside itself");
	moveWorkspaceEntry("w", "src", "source");
	expect(existsSync(join(root, "source/b.ts"))).toBe(true);
});

test("save checks the loaded hash, refuses binary, and preserves permissions and exact text", () => {
	writeFileSync(join(root, "a.ts"), "\ufeffbefore\r\n");
	chmodSync(join(root, "a.ts"), 0o755);
	const before = readFile("w", "a.ts");
	const saved = saveWorkspaceFile("w", "a.ts", "\ufeffafter\r\n", before.meta.hash ?? "");
	expect(saved.content).toBe("\ufeffafter\r\n");
	if (process.platform !== "win32") expect(statSync(join(root, "a.ts")).mode & 0o777).toBe(0o755);
	expect(() => saveWorkspaceFile("w", "a.ts", "stale", before.meta.hash ?? "")).toThrow(
		"changed on disk",
	);
	expect(readFileSync(join(root, "a.ts"), "utf8")).toBe("\ufeffafter\r\n");
	writeFileSync(join(root, "binary"), Buffer.from([0, 1, 2]));
	const binary = readFile("w", "binary");
	expect(() => saveWorkspaceFile("w", "binary", "oops", binary.meta.hash ?? "")).toThrow("Binary");
	expect(readdirSync(root).some((name) => name.startsWith(".pideck-save-"))).toBe(false);
});

test("mutation containment protects root, git metadata, traversal and symlinks", async () => {
	mkdirSync(join(root, ".git"));
	writeFileSync(join(data, "outside"), "secret");
	for (const path of [".", "../outside", ".git/config", ".GIT/config"]) {
		expect(() => createWorkspaceEntry("w", path, "file")).toThrow();
		await expect(trashWorkspaceEntry("w", path)).rejects.toThrow();
	}
	if (process.platform !== "win32") {
		symlinkSync(join(data, "outside"), join(root, "link"));
		expect(() => moveWorkspaceEntry("w", "link", "moved")).toThrow("Symbolic");
		await expect(trashWorkspaceEntry("w", "link")).rejects.toThrow("Symbolic");
	}
	expect(readFileSync(join(data, "outside"), "utf8")).toBe("secret");
});

test("trash retains the original name and restores when the system trash fails", async () => {
	mkdirSync(join(root, "docs"));
	writeFileSync(join(root, "docs/a.md"), "recoverable");
	await trashWorkspaceEntry("w", "docs");
	expect(readFileSync(join(data, "trashed-docs/a.md"), "utf8")).toBe("recoverable");
	writeFileSync(join(root, "keep.txt"), "kept");
	setTrashImplementationForTests(async () => {
		throw new Error("trash unavailable");
	});
	await expect(trashWorkspaceEntry("w", "keep.txt")).rejects.toThrow("trash unavailable");
	expect(readFileSync(join(root, "keep.txt"), "utf8")).toBe("kept");
	expect(readdirSync(root)).toEqual(["keep.txt"]);
});

test("a concurrent recreation is never overwritten by failed-trash recovery", async () => {
	writeFileSync(join(root, "a.txt"), "original");
	setTrashImplementationForTests(async () => {
		writeFileSync(join(root, "a.txt"), "new");
		throw new Error("trash unavailable");
	});
	await expect(trashWorkspaceEntry("w", "a.txt")).rejects.toThrow("preserved at");
	expect(readFileSync(join(root, "a.txt"), "utf8")).toBe("new");
	const recovery = readdirSync(root).find((name) => name.startsWith(".pideck-trash-"));
	expect(recovery).toBeDefined();
	expect(readFileSync(join(root, recovery ?? "", "a.txt"), "utf8")).toBe("original");
});

test("search traverses collapsed directories, observes ignore policy and bounds results", async () => {
	mkdirSync(join(root, "src"));
	mkdirSync(join(root, "node_modules"));
	mkdirSync(join(root, ".git"));
	writeFileSync(join(root, "src/Hello.java"), "");
	writeFileSync(join(root, "node_modules/Hello.java"), "");
	writeFileSync(join(root, ".git/Hello.java"), "");
	const filtered = await searchFiles("w", "hello", async () => new Set(["node_modules"]));
	expect(filtered.entries.map((entry) => entry.path)).toEqual(["src/Hello.java"]);
	expect((await searchFiles("w", "hello")).entries).toHaveLength(2);
	if (process.platform !== "win32") {
		symlinkSync(join(root, "src"), join(root, "linked-src"));
		const alias = join(data, "workspace-alias");
		symlinkSync(root, alias);
		writeFileSync(
			join(data, "workspaces.json"),
			JSON.stringify([{ id: "w", worktreePath: alias }]),
		);
		expect((await searchFiles("w", "hello")).entries).toHaveLength(2);
	}
	for (let i = 0; i < 205; i++) writeFileSync(join(root, `sample-${i}.txt`), "");
	const limited = await searchFiles("w", "sample");
	expect(limited.entries).toHaveLength(200);
	expect(limited.truncated).toBe(true);
});
