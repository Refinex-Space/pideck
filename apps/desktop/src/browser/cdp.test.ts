import { expect, test } from "bun:test";
import { BrowserCdp } from "./cdp";

test("explicit target disposal notifies recording subscribers exactly once", async () => {
	const server = Bun.serve({
		port: 0,
		fetch(request, server) {
			return server.upgrade(request) ? undefined : new Response();
		},
		websocket: { message() {} },
	});
	const client = await BrowserCdp.connect(`ws://127.0.0.1:${server.port}`);
	let disconnected = 0;
	client.subscribe((method) => {
		if (method === "disconnected") disconnected++;
	});
	client.close();
	client.close();
	await Bun.sleep(10);
	expect(disconnected).toBe(1);
	server.stop(true);
});

test("matches concurrent CDP replies and rejects commands when the connection closes", async () => {
	const server = Bun.serve({
		port: 0,
		fetch(request, server) {
			if (server.upgrade(request)) return undefined;
			return new Response("not found", { status: 404 });
		},
		websocket: {
			message(socket, raw) {
				const message = JSON.parse(String(raw));
				if (message.method === "close") socket.close();
				else if (message.method === "fail")
					socket.send(JSON.stringify({ id: message.id, error: { message: "rejected" } }));
				else
					setTimeout(
						() =>
							socket.send(JSON.stringify({ id: message.id, result: { method: message.method } })),
						message.method === "first" ? 20 : 0,
					);
			},
		},
	});
	const client = await BrowserCdp.connect(`ws://127.0.0.1:${server.port}`);
	try {
		expect(await Promise.all([client.request("first"), client.request("second")])).toEqual([
			{ method: "first" },
			{ method: "second" },
		]);
		await expect(client.request("fail")).rejects.toThrow("rejected");
		await expect(client.request("close")).rejects.toThrow("disconnected");
	} finally {
		client.close();
		server.stop(true);
	}
});
