import { expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { waitForNativeDownload } from "./downloads";

test("download receipt must follow a native start in the same view and download directory", async () => {
	const root = await mkdtemp(join(tmpdir(), "pideck-download-test-"));
	const file = join(root, "fixture.txt");
	await writeFile(file, "fixture");
	const events = new EventEmitter();
	const controller = new AbortController();
	const ticket = waitForNativeDownload(events, 7, root, controller.signal, 1000);
	const event = { data: { detail: { path: file, filename: "fixture.txt" } } };
	let completed = false;
	ticket.result.then(() => {
		completed = true;
	});
	events.emit("download-completed-7", event);
	events.emit("download-started-8", event);
	await Bun.sleep(5);
	expect(completed).toBe(false);
	events.emit("download-started-7", event);
	events.emit("download-completed-7", event);
	expect(await ticket.result).toMatchObject({ path: file, filename: "fixture.txt", bytes: 7 });
	ticket.dispose();
	expect(events.listenerCount("download-started-7")).toBe(0);
	await rm(root, { recursive: true, force: true });
});

test("aborted downloads reject and release their listeners", async () => {
	const events = new EventEmitter();
	const controller = new AbortController();
	const ticket = waitForNativeDownload(events, 8, tmpdir(), controller.signal, 1000);
	controller.abort();
	await expect(ticket.result).rejects.toThrow("cancelled");
	ticket.dispose();
	expect(events.eventNames()).toEqual([]);
});
