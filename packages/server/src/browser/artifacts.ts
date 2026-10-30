import { constants } from "node:fs";
import { copyFile, link, lstat, mkdir, realpath, unlink } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import type { BrowserArtifact, BrowserEngineResult } from "@thinkrail/contracts";

function contained(root: string, path: string): string {
	const rel = relative(root, path);
	if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel))
		throw new Error("Browser artifact must be a file inside the workspace");
	return rel;
}

export async function resolveBrowserUpload(workspace: string, path: string): Promise<string> {
	const root = await realpath(workspace);
	const candidate = resolve(root, path);
	contained(root, candidate);
	const target = await realpath(candidate);
	contained(root, target);
	if (!(await lstat(target)).isFile()) throw new Error("Browser upload must be a file");
	return target;
}

export async function materializeBrowserArtifact(
	workspace: string,
	artifact: NonNullable<BrowserEngineResult["temporaryArtifact"]>,
	requested: string,
	signal?: AbortSignal,
): Promise<BrowserArtifact> {
	signal?.throwIfAborted();
	const root = await realpath(workspace);
	const target = resolve(root, requested);
	const rel = contained(root, target);
	let parent = root;
	for (const segment of relative(root, dirname(target)).split(sep).filter(Boolean)) {
		parent = resolve(parent, segment);
		try {
			await mkdir(parent);
		} catch (error) {
			if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
		}
		const stat = await lstat(parent);
		if (!stat.isDirectory() || stat.isSymbolicLink())
			throw new Error("Browser output parent must not be a symlink");
	}
	const temporary = resolve(parent, `.browser-${crypto.randomUUID()}.tmp`);
	try {
		await copyFile(artifact.temporaryPath, temporary, constants.COPYFILE_EXCL);
		signal?.throwIfAborted();
		if ((await realpath(parent)) !== parent) throw new Error("Browser output directory changed");
		await link(temporary, target);
	} finally {
		await unlink(temporary).catch(() => {});
	}
	const { temporaryPath: _temporaryPath, ...metadata } = artifact;
	return { ...metadata, path: rel.split(sep).join("/") };
}
