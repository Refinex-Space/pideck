import type { EventEmitter } from "node:events";
import { lstat, realpath } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

const pending = new Set<number>();

export function waitForNativeDownload(
	events: Pick<EventEmitter, "on" | "off">,
	viewId: number,
	downloadsRoot: string,
	signal: AbortSignal,
	timeout: number,
) {
	if (pending.has(viewId)) throw new Error("This tab already has a pending download");
	pending.add(viewId);
	const started = new Set<string>();
	let reject: (error: Error) => void = () => {};
	let done: (value: { path: string; filename: string; bytes: number; ino: number }) => void =
		() => {};
	const result = new Promise<{ path: string; filename: string; bytes: number; ino: number }>(
		(resolve, fail) => {
			done = resolve;
			reject = fail;
		},
	);
	result.catch(() => {});
	const detail = (event: unknown): { path: string; filename: string } | null => {
		if (!event || typeof event !== "object") return null;
		const data = Reflect.get(event, "data");
		if (!data || typeof data !== "object") return null;
		let value: unknown = Reflect.get(data, "detail");
		try {
			if (typeof value === "string" && value.length <= 16000) value = JSON.parse(value);
		} catch {
			return null;
		}
		if (!value || typeof value !== "object") return null;
		const path: unknown = Reflect.get(value, "path");
		const filename: unknown = Reflect.get(value, "filename");
		if (
			typeof path !== "string" ||
			typeof filename !== "string" ||
			dirname(resolve(path)) !== resolve(downloadsRoot)
		)
			return null;
		return { path, filename: basename(filename) };
	};
	const begin = (event: unknown) => {
		const value = detail(event);
		if (value) started.add(value.path);
	};
	const complete = (event: unknown) => {
		const value = detail(event);
		if (!value || !started.has(value.path)) return;
		void (async () => {
			const stat = await lstat(value.path);
			if (
				!stat.isFile() ||
				stat.size > 256 * 1024 * 1024 ||
				dirname(await realpath(value.path)) !== (await realpath(downloadsRoot))
			)
				throw new Error("Invalid browser download artifact");
			done({ ...value, bytes: stat.size, ino: stat.ino });
		})().catch((error) => reject(error));
	};
	const failed = (event: unknown) => {
		const value = detail(event);
		if (value && started.has(value.path)) reject(new Error("Browser download was cancelled"));
	};
	const abort = () => reject(new Error("Browser download cancelled"));
	const timer = setTimeout(() => reject(new Error("Browser download timed out")), timeout);
	events.on(`download-started-${viewId}`, begin);
	events.on(`download-completed-${viewId}`, complete);
	events.on(`download-failed-${viewId}`, failed);
	signal.addEventListener("abort", abort, { once: true });
	if (signal.aborted) abort();
	return {
		result,
		dispose() {
			clearTimeout(timer);
			pending.delete(viewId);
			signal.removeEventListener("abort", abort);
			events.off(`download-started-${viewId}`, begin);
			events.off(`download-completed-${viewId}`, complete);
			events.off(`download-failed-${viewId}`, failed);
		},
	};
}
