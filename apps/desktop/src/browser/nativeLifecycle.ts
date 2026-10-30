import { dlopen, ptr } from "bun:ffi";
import { join } from "node:path";
import { PATHS } from "electrobun/main";

const symbols = {
	pideckInstallCEFViewLifecycle: { args: [], returns: "i32" },
	pideckGetDownloadsDirectory: { args: ["ptr", "u32"], returns: "i32" },
} as const;
let lifecycleLibrary: ReturnType<typeof dlopen<typeof symbols>> | undefined;

export function installBrowserNativeLifecycle(): void {
	if (process.platform !== "darwin" || lifecycleLibrary) return;
	const library = dlopen(
		join(PATHS.RESOURCES_FOLDER, "app", "runtime", "libpideck-browser-lifecycle.dylib"),
		symbols,
	);
	const result = library.symbols.pideckInstallCEFViewLifecycle();
	if (result !== 0) {
		library.close();
		throw new Error(`Cannot install CEF view lifecycle adapter (${result})`);
	}
	lifecycleLibrary = library;
}

export function nativeDownloadsDirectory(): string {
	if (!lifecycleLibrary) throw new Error("Native browser lifecycle is unavailable");
	const bytes = new Uint8Array(4096);
	const length = Number(
		lifecycleLibrary.symbols.pideckGetDownloadsDirectory(ptr(bytes), bytes.length),
	);
	if (!Number.isInteger(length) || length < 1 || length >= bytes.length)
		throw new Error("Native Downloads folder is unavailable");
	return new TextDecoder().decode(bytes.subarray(0, length));
}
