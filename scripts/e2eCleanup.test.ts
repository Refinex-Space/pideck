import { expect, test } from "bun:test";
import { finishFixtureCleanup } from "../e2e/fixtures/cleanup";

test("Windows cleanup waits until the owned web server has exited", () => {
	const callbacks: (() => void)[] = [];
	let removed = false;
	finishFixtureCleanup(
		() => {
			removed = true;
		},
		"win32",
		(callback) => callbacks.push(callback),
	);
	expect(removed).toBe(false);
	expect(callbacks).toHaveLength(1);
	callbacks[0]?.();
	expect(removed).toBe(true);
});
test("POSIX cleanup still runs in global teardown", () => {
	let removed = false;
	finishFixtureCleanup(
		() => {
			removed = true;
		},
		"linux",
		() => {
			throw new Error("must not defer");
		},
	);
	expect(removed).toBe(true);
});
