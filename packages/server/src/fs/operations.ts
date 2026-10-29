import { randomUUID } from "node:crypto";
import {
	chmodSync,
	existsSync,
	lstatSync,
	mkdirSync,
	readFileSync,
	renameSync,
	rmdirSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { readdir } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import type { FileNode } from "@thinkrail/contracts";
import { CodedError } from "@thinkrail/shared/codedError";
import { trashFile } from "../trash";
import { hashBytes, resourceMeta } from "./content";
import { resolveWorktreeFile, workspaceRelativePath } from "./files";

const MAX_EDIT_BYTES = 8 * 1024 * 1024;

function target(workspaceId: string, path: string): string {
	if (typeof path !== "string" || !path.trim() || path.includes("\0"))
		throw new Error("Invalid path");
	const root = resolveWorktreeFile(workspaceId, ".");
	const abs = resolveWorktreeFile(workspaceId, path, { followLeaf: false });
	if (
		relative(root, abs)
			.split(sep)
			.some((part) => part.toLowerCase() === ".git")
	)
		throw new Error("Git metadata cannot be modified");
	if (resolve(abs) === resolve(root)) throw new Error("The workspace root cannot be modified");
	let cursor = abs;
	while (cursor !== root) {
		try {
			if (lstatSync(cursor).isSymbolicLink()) throw new Error("Symbolic links cannot be modified");
		} catch (error) {
			if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
		}
		const parent = dirname(cursor);
		if (parent === cursor) break;
		cursor = parent;
	}
	return abs;
}

function canonical(workspaceId: string, abs: string): string {
	const path = workspaceRelativePath(resolveWorktreeFile(workspaceId, "."), abs);
	if (!path) throw new Error("Invalid workspace path");
	return path;
}

export function createWorkspaceEntry(workspaceId: string, path: string, kind: "file" | "dir") {
	const abs = target(workspaceId, path);
	if (kind === "dir") mkdirSync(abs);
	else if (kind === "file") writeFileSync(abs, "", { flag: "wx" });
	else throw new Error("Invalid entry kind");
	return { path: canonical(workspaceId, abs) };
}

export function saveWorkspaceFile(
	workspaceId: string,
	path: string,
	content: string,
	expectedHash: string,
) {
	const abs = target(workspaceId, path);
	if (typeof content !== "string" || Buffer.byteLength(content) > MAX_EDIT_BYTES)
		throw new Error("Editable text files are limited to 8 MiB");
	const stat = lstatSync(abs);
	if (!stat.isFile() || stat.size > MAX_EDIT_BYTES)
		throw new Error("Only regular text files up to 8 MiB can be edited");
	const bytes = readFileSync(abs);
	if (hashBytes(bytes) !== expectedHash)
		throw new CodedError("STALE_VIEW", "The file changed on disk. Your draft has been kept.");
	if (!resourceMeta(bytes, path).text) throw new Error("Binary files cannot be edited as text");
	const temporary = join(dirname(abs), `.pideck-save-${randomUUID()}.tmp`);
	try {
		writeFileSync(temporary, content, { flag: "wx" });
		chmodSync(temporary, stat.mode & 0o777);
		renameSync(temporary, abs);
	} finally {
		if (existsSync(temporary)) unlinkSync(temporary);
	}
	return { content, meta: resourceMeta(Buffer.from(content), path) };
}

export function moveWorkspaceEntry(workspaceId: string, path: string, destination: string) {
	const source = target(workspaceId, path);
	const next = target(workspaceId, destination);
	if (source === next) return { path: canonical(workspaceId, next) };
	if (existsSync(next)) {
		const before = lstatSync(source);
		const after = lstatSync(next);
		const sameCaseOnlyEntry =
			source.toLowerCase() === next.toLowerCase() &&
			before.dev === after.dev &&
			before.ino === after.ino;
		if (!sameCaseOnlyEntry) throw new Error("The destination already exists");
	}
	const rel = relative(source, next);
	if (
		lstatSync(source).isDirectory() &&
		rel !== ".." &&
		!rel.startsWith(`..${sep}`) &&
		!rel.startsWith(sep)
	)
		throw new Error("A directory cannot be moved inside itself");
	renameSync(source, next);
	return { path: canonical(workspaceId, next) };
}

export async function trashWorkspaceEntry(workspaceId: string, path: string): Promise<void> {
	const abs = target(workspaceId, path);
	const claim = join(dirname(abs), `.pideck-trash-${randomUUID()}`);
	mkdirSync(claim);
	const claimed = join(claim, basename(abs));
	try {
		renameSync(abs, claimed);
		await trashFile(claimed);
	} catch (error) {
		if (existsSync(claimed)) {
			if (!existsSync(abs)) renameSync(claimed, abs);
			else throw new Error(`Trash failed. The item is preserved at ${claimed}`, { cause: error });
		}
		throw error;
	} finally {
		if (existsSync(claim) && !existsSync(claimed)) rmdirSync(claim);
	}
}

export async function searchFiles(
	workspaceId: string,
	query: string,
	ignore?: (paths: string[]) => Promise<ReadonlySet<string>>,
): Promise<{ entries: FileNode[]; truncated: boolean }> {
	if (typeof query !== "string" || query.length > 200) throw new Error("Invalid search query");
	const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
	if (!terms.length) return { entries: [], truncated: false };
	resolveWorktreeFile(workspaceId, ".");
	const pending = [""];
	const entries: FileNode[] = [];
	let visited = 0;
	let incomplete = false;
	while (pending.length && visited < 20000 && entries.length < 200) {
		const batch = pending.splice(0, 32);
		const children = (
			await Promise.all(
				batch.map(async (parent) => {
					try {
						const directory = resolveWorktreeFile(workspaceId, parent || ".");
						if (parent && lstatSync(directory).isSymbolicLink()) return [];
						return (await readdir(directory, { withFileTypes: true }))
							.filter(
								(entry) =>
									entry.name.toLowerCase() !== ".git" &&
									!entry.isSymbolicLink() &&
									(entry.isFile() || entry.isDirectory()),
							)
							.map(
								(entry): FileNode => ({
									path: [parent, entry.name].filter(Boolean).join("/"),
									name: entry.name,
									kind: entry.isDirectory() ? "dir" : "file",
								}),
							);
					} catch {
						incomplete = true;
						return [];
					}
				}),
			)
		).flat();
		const ignored = await ignore?.(children.map((node) => node.path));
		for (const node of children) {
			visited += 1;
			if (ignored?.has(node.path)) continue;
			if (node.kind === "dir") pending.push(node.path);
			if (terms.every((term) => node.path.toLowerCase().includes(term))) entries.push(node);
			if (entries.length >= 200 || visited >= 20000) return { entries, truncated: true };
		}
	}
	return { entries, truncated: incomplete || pending.length > 0 };
}
