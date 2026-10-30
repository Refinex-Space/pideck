import type { ServerWebSocket } from "bun";

export function scaleBrowserInput(
	message: Record<string, unknown>,
	scale: number,
): Record<string, unknown> {
	if (
		scale === 1 ||
		message.method !== "Input.dispatchMouseEvent" ||
		!message.params ||
		typeof message.params !== "object"
	)
		return message;
	const params = { ...message.params } as Record<string, unknown>;
	if (typeof params.x === "number") params.x *= scale;
	if (typeof params.y === "number") params.y *= scale;
	return { ...message, params };
}

interface Peer {
	upstream: WebSocket | null;
	queue: string[];
	targets: Map<string, string>;
}

export async function createBrowserInputTransport(
	port: number,
	scaleOf: (targetId: string) => number,
) {
	const response = await fetch(`http://127.0.0.1:${port}/json/version`, {
		signal: AbortSignal.timeout(3000),
	});
	const version: unknown = await response.json();
	const endpoint =
		version && typeof version === "object" ? Reflect.get(version, "webSocketDebuggerUrl") : null;
	if (typeof endpoint !== "string") throw new Error("CEF browser endpoint is unavailable");
	const url = new URL(endpoint);
	if (
		url.protocol !== "ws:" ||
		!["127.0.0.1", "localhost"].includes(url.hostname) ||
		Number(url.port) !== port
	)
		throw new Error("Invalid CEF endpoint");
	const peers = new Set<ServerWebSocket<Peer>>();
	const server = Bun.serve<Peer>({
		hostname: "127.0.0.1",
		port: 0,
		fetch(request, server) {
			if (
				!request.headers.has("origin") &&
				server.upgrade(request, { data: { upstream: null, queue: [], targets: new Map() } })
			)
				return undefined;
			return new Response("Not found", { status: 404 });
		},
		websocket: {
			maxPayloadLength: 32 * 1024 * 1024,
			open(peer) {
				peers.add(peer);
				const upstream = new WebSocket(url.href);
				peer.data.upstream = upstream;
				upstream.addEventListener("open", () => {
					for (const message of peer.data.queue.splice(0)) upstream.send(message);
				});
				upstream.addEventListener("message", (event) => {
					if (typeof event.data !== "string" || event.data.length > 32_000_000) return;
					try {
						const message = JSON.parse(event.data);
						if (message.method === "Target.attachedToTarget")
							peer.data.targets.set(message.params.sessionId, message.params.targetInfo.targetId);
						if (message.method === "Target.detachedFromTarget")
							peer.data.targets.delete(message.params.sessionId);
						peer.send(event.data);
					} catch {
						peer.close();
					}
				});
				upstream.addEventListener("close", () => peer.close());
				upstream.addEventListener("error", () => peer.close());
			},
			message(peer, data) {
				try {
					const message = JSON.parse(String(data));
					const target = peer.data.targets.get(message.sessionId);
					const transformed = JSON.stringify(
						scaleBrowserInput(message, target ? scaleOf(target) : 1),
					);
					if (peer.data.upstream?.readyState === WebSocket.OPEN)
						peer.data.upstream.send(transformed);
					else if (peer.data.queue.length < 100) peer.data.queue.push(transformed);
					else peer.close();
				} catch {
					peer.close();
				}
			},
			close(peer) {
				peers.delete(peer);
				peer.data.upstream?.close();
				peer.data.queue.length = 0;
			},
		},
	});
	return {
		endpoint: `ws://127.0.0.1:${server.port}`,
		browserEndpoint: url.href,
		dispose() {
			for (const peer of peers) {
				peer.data.upstream?.close();
				peer.close();
			}
			server.stop(true);
		},
	};
}
