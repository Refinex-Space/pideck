import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { channel, version } from "@thinkrail/shared/version";
import { windowsFileIdentity, windowsIconPath } from "@thinkrail/shared/windowsIdentity";
import { BROWSER_BOOTSTRAP } from "./src/browserBootstrap";
import { brandWindowsExecutable } from "./src/windowsExecutableIdentity";

const desktopDir = import.meta.dir;

const buildDir = process.env.ELECTROBUN_BUILD_DIR;
const appName = process.env.ELECTROBUN_APP_NAME;
const buildEnvironment = process.env.ELECTROBUN_BUILD_ENV;
if (!buildDir || !appName || !buildEnvironment)
	throw new Error("Browser postBuild requires build output metadata");
const bundleName = buildEnvironment === "stable" ? appName : `${appName}-${buildEnvironment}`;
const launcherDirectory =
	process.env.ELECTROBUN_OS === "macos" || process.env.ELECTROBUN_OS === "mac"
		? join(buildDir, `${bundleName}.app`, "Contents", "Resources")
		: join(buildDir, bundleName, "Resources");
const launcherScript = join(launcherDirectory, "main.js");
const original = readFileSync(launcherScript, "utf8");
if (!original.includes("electrobun_core_run_main_thread") || !original.includes("new Worker("))
	throw new Error("Unsupported Electrobun launcher: review browser bootstrap ordering");
writeFileSync(join(launcherDirectory, "electrobun-main.js"), original);
writeFileSync(launcherScript, BROWSER_BOOTSTRAP);

if (process.env.ELECTROBUN_OS === "win") {
	const buildDir = process.env.ELECTROBUN_BUILD_DIR;
	const appName = process.env.ELECTROBUN_APP_NAME;
	const buildEnvironment = process.env.ELECTROBUN_BUILD_ENV;
	if (!buildDir || !appName || !buildEnvironment) {
		throw new Error("Windows postBuild requires build output metadata");
	}

	const bundleName = buildEnvironment === "stable" ? appName : `${appName}-${buildEnvironment}`;
	const bundleDir = join(buildDir, bundleName);
	const icon = readFileSync(windowsIconPath);
	const identity = windowsFileIdentity({ version, channel });
	for (const [path, originalFilename] of [
		[join(bundleDir, "bin", "bun.exe"), "bun.exe"],
		[join(bundleDir, "bin", "launcher.exe"), "launcher.exe"],
		[join(bundleDir, "Resources", "uninstall"), "uninstall.exe"],
	] as const) {
		try {
			writeFileSync(
				path,
				brandWindowsExecutable(readFileSync(path), icon, identity, originalFilename),
			);
		} catch (error) {
			throw new Error(`could not brand Windows executable ${path}`, { cause: error });
		}
	}
	console.log(`branded Windows executables as ${identity.productName} ${identity.fileVersion}`);
}

rmSync(join(desktopDir, ".stage"), { recursive: true, force: true });
