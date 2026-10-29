export function finishFixtureCleanup(
	cleanup: () => void,
	platform: NodeJS.Platform = process.platform,
	afterExit: (callback: () => void) => void = (callback) => {
		process.once("exit", callback);
	},
): void {
	if (platform === "win32") afterExit(cleanup);
	else cleanup();
}
