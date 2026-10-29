import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
	chmodSync,
	constants,
	copyFileSync,
	existsSync,
	linkSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LOGIN_ENV_MARKER } from "@thinkrail/shared/shellEnv";

export function resolveBunExecutable(env: NodeJS.ProcessEnv = process.env): string {
	const name = process.platform === "win32" ? "bun.exe" : "bun";
	const executable = (env.PATH ?? "")
		.split(delimiter)
		.filter(Boolean)
		.map((directory) => join(directory, name))
		.find(existsSync);
	if (!executable) throw new Error("bun executable not found for the e2e host");
	return executable;
}

export function hermeticE2ePath(fakeBinDir: string): string {
	if (process.platform === "win32") {
		const root = windowsGitRoot();
		const system = join(process.env.SystemRoot || "C:\\Windows", "System32");
		return [
			fakeBinDir,
			join(root, "cmd"),
			join(root, "usr", "bin"),
			join(root, "mingw64", "bin"),
			system,
			join(system, "WindowsPowerShell", "v1.0"),
		].join(delimiter);
	}
	return [fakeBinDir, "/usr/bin", "/bin", "/usr/sbin", "/sbin"].join(delimiter);
}

export function windowsGitRoot(): string {
	const git = (process.env.PATH || "")
		.split(delimiter)
		.map((directory) => join(directory, "git.exe"))
		.find(existsSync);
	if (!git) throw new Error("Windows e2e requires Git for Windows");
	const candidates = [resolve(dirname(git), ".."), resolve(dirname(git), "../..")];
	const root = candidates.find(
		(candidate) =>
			existsSync(join(candidate, "usr", "bin", "bash.exe")) &&
			existsSync(join(candidate, "cmd", "git.exe")),
	);
	if (!root) throw new Error("Windows e2e requires a Git for Windows installation with Bash");
	return root;
}

export function writeWindowsCommand(fakeBinDir: string, command: string, argv: string[]): void {
	const source = fileURLToPath(new URL("./windowsCommand.ts", import.meta.url));
	const bun = resolveBunExecutable();
	const version = execFileSync(bun, ["--version"], { encoding: "utf8", windowsHide: true }).trim();
	const digest = createHash("sha256")
		.update(readFileSync(source))
		.update(version)
		.digest("hex")
		.slice(0, 16);
	const cached = join(tmpdir(), `pideck-e2e-command-${process.arch}-${digest}.exe`);
	if (!existsSync(cached)) {
		const temporary = `${cached}.${randomUUID()}.exe`;
		try {
			execFileSync(bun, ["build", "--compile", source, "--outfile", temporary], {
				stdio: "pipe",
				windowsHide: true,
				timeout: 60000,
			});
			try {
				copyFileSync(temporary, cached, constants.COPYFILE_EXCL);
			} catch (error) {
				if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
			}
		} finally {
			rmSync(temporary, { force: true });
		}
	}
	const target = join(fakeBinDir, `${command}.exe`);
	try {
		linkSync(cached, target);
	} catch {
		copyFileSync(cached, target);
	}
	writeFileSync(`${target}.json`, JSON.stringify({ argv }));
}

export function hermeticE2eShell(fakeBinDir: string): string {
	return process.platform === "win32"
		? join(windowsGitRoot(), "usr", "bin", "bash.exe")
		: join(fakeBinDir, "login-shell");
}

export function writeHermeticE2eShell(fakeBinDir: string, realShell: string): void {
	if (process.platform === "win32") {
		return;
	}
	const script = [
		"#!/bin/sh",
		'case "$*" in',
		`\t*${shellQuote(LOGIN_ENV_MARKER)}*) printf '%sPATH=%s\\0' ${shellQuote(LOGIN_ENV_MARKER)} ${shellQuote(hermeticE2ePath(fakeBinDir))}; exit 0 ;;`,
		"esac",
		`exec ${shellQuote(realShell)} "$@"`,
		"",
	].join("\n");
	const target = hermeticE2eShell(fakeBinDir);
	writeFileSync(target, script);
	chmodSync(target, 0o755);
}

export function writeFakeGh(fakeBinDir: string, scenarioPath: string, logPath: string): void {
	const source = fileURLToPath(new URL("./fakeGh.ts", import.meta.url));
	if (process.platform === "win32") {
		writeWindowsCommand(fakeBinDir, "gh", [resolveBunExecutable(), source, scenarioPath, logPath]);
		return;
	}
	const script = [
		"#!/bin/sh",
		`exec ${[resolveBunExecutable(), source, scenarioPath, logPath].map(shellQuote).join(" ")} "$@"`,
		"",
	].join("\n");
	const target = join(fakeBinDir, "gh");
	writeFileSync(target, script);
	chmodSync(target, 0o755);
}

function shellQuote(value: string): string {
	return `'${value.replaceAll("'", `'\\''`)}'`;
}
