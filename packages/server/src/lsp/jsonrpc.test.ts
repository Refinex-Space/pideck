import { expect, test } from "bun:test";
import { PassThrough } from "node:stream";
import { createJsonRpcConnection } from "./jsonrpc";

function pair() {
	const fromServer = new PassThrough();
	const toServer = new PassThrough();
	const written: string[] = [];
	toServer.on("data", (chunk: Buffer) => written.push(chunk.toString()));
	return {
		fromServer,
		toServer,
		written,
		connection: createJsonRpcConnection(fromServer, toServer),
	};
}

const frame = (message: unknown) => {
	const body = JSON.stringify(message);
	return `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;
};

test("a request resolves with the response that carries its id, however the bytes arrive", async () => {
	const { fromServer, connection } = pair();
	const answer = connection.request<{ ok: boolean }>("ping", { n: 1 });
	const reply = frame({ jsonrpc: "2.0", id: 1, result: { ok: true } });
	fromServer.write(reply.slice(0, 7));
	fromServer.write(reply.slice(7, 30));
	fromServer.write(reply.slice(30));
	expect(await answer).toEqual({ ok: true });
});

test("several messages in one chunk are all dispatched, including multibyte text", async () => {
	const { fromServer, connection } = pair();
	const seen: unknown[] = [];
	connection.onNotification("note", (params) => seen.push(params));
	fromServer.write(
		frame({ jsonrpc: "2.0", method: "note", params: "语言服务" }) +
			frame({ jsonrpc: "2.0", method: "note", params: "two" }),
	);
	await new Promise((resolve) => setTimeout(resolve, 10));
	expect(seen).toEqual(["语言服务", "two"]);
});

test("an error response rejects with its code and message", async () => {
	const { fromServer, connection } = pair();
	const answer = connection.request("boom", {});
	fromServer.write(frame({ jsonrpc: "2.0", id: 1, error: { code: -32000, message: "nope" } }));
	await expect(answer).rejects.toMatchObject({ message: "nope", code: -32000 });
});

test("a request from the server is answered by its handler, and an unknown one is reported", async () => {
	const { fromServer, written, connection } = pair();
	connection.onRequest("workspace/configuration", () => [{ a: 1 }]);
	fromServer.write(frame({ jsonrpc: "2.0", id: 9, method: "workspace/configuration", params: {} }));
	fromServer.write(frame({ jsonrpc: "2.0", id: 10, method: "unheard/of", params: {} }));
	await new Promise((resolve) => setTimeout(resolve, 10));
	const replies = written
		.join("")
		.split("Content-Length:")
		.filter(Boolean)
		.map(
			(part) =>
				JSON.parse(part.split("\r\n\r\n")[1] ?? "null") as {
					id: number;
					jsonrpc: string;
					result?: unknown;
					error?: unknown;
				},
		)
		.sort((a, b) => a.id - b.id);
	expect(replies).toEqual([
		{ jsonrpc: "2.0", id: 9, result: [{ a: 1 }] },
		{ jsonrpc: "2.0", id: 10, error: { code: -32601, message: "Method not found: unheard/of" } },
	]);
});

test("a request times out, and disposing fails the ones still waiting", async () => {
	const { connection } = pair();
	await expect(connection.request("slow", {}, 20)).rejects.toThrow("did not answer slow");
	const waiting = connection.request("later", {});
	connection.dispose(new Error("gone"));
	await expect(waiting).rejects.toThrow("gone");
	expect(connection.closed).toBe(true);
	await expect(connection.request("after", {})).rejects.toThrow("closed");
});

test("garbage between frames is skipped without losing the next message", async () => {
	const { fromServer, connection } = pair();
	const seen: unknown[] = [];
	connection.onNotification("note", (params) => seen.push(params));
	fromServer.write("Junk: 1\r\n\r\n");
	fromServer.write(`Content-Length: 5\r\n\r\n{nope`);
	fromServer.write(frame({ jsonrpc: "2.0", method: "note", params: "still here" }));
	await new Promise((resolve) => setTimeout(resolve, 10));
	expect(seen).toEqual(["still here"]);
});
