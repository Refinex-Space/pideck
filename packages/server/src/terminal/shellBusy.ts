import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSyncCaptured } from "@thinkrail/shared/spawn";

export function parseProcChildren(contents: string): number[] {
	return contents
		.split(/\s+/)
		.map((entry) => Number.parseInt(entry, 10))
		.filter((pid) => Number.isInteger(pid) && pid > 0);
}

function childrenViaProc(pid: number): boolean | null {
	try {
		return parseProcChildren(readFileSync(`/proc/${pid}/task/${pid}/children`, "utf8")).length > 0;
	} catch {
		return null;
	}
}

function childrenViaPgrep(pid: number): boolean | null {
	const run = spawnSyncCaptured(["pgrep", "-P", String(pid)]);
	if (!run.launched) return null;
	if (run.exitCode === 0) return true;
	if (run.exitCode === 1) return false;
	return null;
}

export const WINDOWS_CHILD_COUNT = [
	"$ErrorActionPreference = 'Stop'",
	'$kids = @(Get-CimInstance Win32_Process -Filter "ParentProcessId=$env:TR_PARENT_PID")',
	'$shell = Get-CimInstance Win32_Process -Filter "ProcessId=$env:TR_PARENT_PID"',
	"Write-Output $kids.Count",
	"Write-Output $shell.ExecutablePath",
].join("; ");

function windowsProbe(pid: number): { children: number; executable: string } | null {
	for (const shell of ["powershell.exe", "pwsh.exe"]) {
		const run = spawnSyncCaptured([shell, "-NoProfile", "-Command", WINDOWS_CHILD_COUNT], {
			env: { ...process.env, TR_PARENT_PID: String(pid) },
		});
		if (!run.launched || run.exitCode !== 0) continue;
		const [count = "", executable = ""] = run.stdout.split(/\r?\n/);
		const children = Number.parseInt(count.trim(), 10);
		if (Number.isInteger(children)) return { children, executable: executable.trim() };
	}
	return null;
}

/** Cygwin/MSYS `ps -a` rows: whether the process with Windows pid `winpid` has a child. */
export function parseCygwinChildren(output: string, winpid: number): boolean {
	const rows = output
		.split(/\r?\n/)
		.slice(1)
		.map((line) => line.trim().split(/\s+/))
		// An interactive or stopped process carries a one-letter status before its pid.
		.map((columns) => (/^\d+$/.test(columns[0] ?? "") ? columns : columns.slice(1)))
		.filter((columns) => columns.length >= 4)
		.map(([pid, ppid, , win]) => ({ pid: Number(pid), ppid: Number(ppid), winpid: Number(win) }));
	const self = rows.find((row) => row.winpid === winpid);
	return self !== undefined && rows.some((row) => row.ppid === self.pid);
}

// Cygwin/MSYS exec ends the forked stub, so a running MSYS tool has no Windows parent; only the
// runtime's own process table, read by the `ps` shipped beside the shell, links it to the shell.
function childrenViaCygwinPs(executable: string, pid: number): boolean | null {
	if (!executable) return null;
	const ps = join(dirname(executable), "ps.exe");
	if (!existsSync(ps)) return null;
	const run = spawnSyncCaptured([ps, "-a"]);
	if (!run.launched || run.exitCode !== 0) return null;
	return parseCygwinChildren(run.stdout, pid);
}

export function hasChildProcesses(pid: number): boolean {
	if (!Number.isInteger(pid) || pid <= 0) return false;
	if (process.platform === "win32") {
		const probe = windowsProbe(pid);
		if (!probe) return false;
		return probe.children > 0 || (childrenViaCygwinPs(probe.executable, pid) ?? false);
	}
	return childrenViaProc(pid) ?? childrenViaPgrep(pid) ?? false;
}
