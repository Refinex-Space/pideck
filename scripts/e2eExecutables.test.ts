import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hermeticE2ePath, writeWindowsCommand } from "../e2e/fixtures/executables";

test.skipIf(process.platform !== "win32")(
	"Windows isolated PATH resolves Git and native stubs preserve arguments without real editors",
	() => {
		const root = mkdtempSync(join(tmpdir(), "pideck-native-fixture-"));
		try {
			const log = join(root, "editor.log");
			writeWindowsCommand(root, "code", [
				process.execPath,
				"-e",
				"await Bun.write(process.env.FIXTURE_LOG,JSON.stringify(process.argv.slice(1)))",
				"--",
			]);
			const env = { ...process.env, PATH: hermeticE2ePath(root), FIXTURE_LOG: log };
			expect(execFileSync("git", ["--version"], { env, encoding: "utf8" })).toContain(
				"git version",
			);
			execFileSync(join(root, "code.exe"), ["a path & literal", "中文", 'quote"value'], {
				env,
				windowsHide: true,
			});
			expect(JSON.parse(readFileSync(log, "utf8"))).toEqual([
				"a path & literal",
				"中文",
				'quote"value',
			]);
			expect(hermeticE2ePath(root)).not.toContain("/usr/bin;");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	},
	60000,
);
