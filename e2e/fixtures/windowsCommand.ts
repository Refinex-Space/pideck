import { readFileSync } from "node:fs";

const plan = JSON.parse(readFileSync(`${process.execPath}.json`, "utf8")) as { argv: string[] };
const env = { ...process.env };
for (const key of [
	"HOME",
	"CENTRAL_STUB_STATE",
	"CENTRAL_STUB_LOG",
	"CENTRAL_STUB_EXTENSION_SOURCE",
	"CENTRAL_STUB_BAD_EXTENSION_SOURCE",
	"THINKRAIL_E2E_EDITOR_LOG",
]) {
	if (env[key]) env[key] = env[key].replaceAll("\\", "/");
}
const child = Bun.spawnSync([...plan.argv, ...process.argv.slice(2)], {
	env,
	stdin: "inherit",
	stdout: "inherit",
	stderr: "inherit",
	windowsHide: true,
});
process.exit(child.exitCode);
