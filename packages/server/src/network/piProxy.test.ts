import { expect, test } from "bun:test";
import { createServer } from "node:http";
import { createConnection } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Model, normalizeContext, type OAuthAuth } from "@earendil-works/pi-ai";
import { stream } from "@earendil-works/pi-ai/api/openai-responses";
import { resolveHttpProxyUrlForTarget } from "@earendil-works/pi-ai/utils/node-http-proxy";
import {
	applyProxyEnvironment,
	BLOCKED_PROXY,
	DEFAULT_PROXY_CONFIG,
	PROXY_KEYS,
	resolveProxyPolicy,
} from "./policy";

const piDist = dirname(fileURLToPath(import.meta.resolve("@earendil-works/pi-ai")));
const { openaiChatGPTOAuth } = (await import(join(piDist, "auth/oauth/openai-chatgpt.js"))) as {
	openaiChatGPTOAuth: OAuthAuth;
};

test("installed Pi OAuth refresh, model SSE and native WebSocket all use the host proxy policy", async () => {
	const saved = Object.fromEntries(
		PROXY_KEYS.flatMap((key) => [key, key.toUpperCase()]).map((key) => [key, process.env[key]]),
	);
	const tunnels: string[] = [];
	const proxy = createServer();
	let websocketPort = 0;
	proxy.on("connect", (request, socket, head) => {
		tunnels.push(request.url || "");
		if (request.url === "websocket-fixture.invalid:80") {
			const upstream = createConnection({ host: "127.0.0.1", port: websocketPort }, () => {
				socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
				if (head.length) upstream.write(head);
				socket.pipe(upstream);
				upstream.pipe(socket);
			});
			socket.on("close", () => upstream.destroy());
			upstream.on("error", () => socket.destroy());
		} else
			socket.end(
				"HTTP/1.1 407 Proxy Authentication Required\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
			);
	});
	await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
	const address = proxy.address();
	if (!address || typeof address === "string") throw new Error("Missing fixture port");
	const requests: string[] = [];
	const modelProxy = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		fetch(request, server) {
			requests.push(request.url);
			if (server.upgrade(request)) return undefined;
			const response = {
				id: "response-fixture",
				object: "response",
				status: "completed",
				output: [],
				usage: {
					input_tokens: 1,
					output_tokens: 1,
					total_tokens: 2,
					input_tokens_details: { cached_tokens: 0 },
					output_tokens_details: { reasoning_tokens: 0 },
				},
			};
			return new Response(
				`data: ${JSON.stringify({ type: "response.created", response })}\n\ndata: ${JSON.stringify({ type: "response.completed", response })}\n\n`,
				{ headers: { "content-type": "text/event-stream" } },
			);
		},
		websocket: {
			open(socket) {
				socket.send("proxy-websocket");
			},
			message() {},
		},
	});
	try {
		const policy = resolveProxyPolicy(
			{ ...DEFAULT_PROXY_CONFIG, mode: "manual", host: "127.0.0.1", port: address.port },
			{},
			{ source: "none", http: "", https: "", bypass: "" },
		);
		applyProxyEnvironment(policy);
		await expect(
			openaiChatGPTOAuth.refresh(
				{
					type: "oauth",
					access: "fixture-access",
					refresh: "fixture-refresh",
					expires: 0,
					clientId: "fixture-client",
				},
				AbortSignal.timeout(3000),
			),
		).rejects.toThrow();
		expect(tunnels).toEqual(["auth.openai.com:443"]);
		applyProxyEnvironment({ ...policy, http: `http://127.0.0.1:${modelProxy.port}` });
		const model: Model<"openai-responses"> = {
			id: "proxy-fixture",
			name: "Proxy fixture",
			provider: "openai",
			api: "openai-responses",
			baseUrl: "http://model-fixture.invalid/v1",
			reasoning: false,
			input: ["text"],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: 1024,
			maxTokens: 32,
		};
		const result = await stream(
			model,
			normalizeContext({ messages: [{ role: "user", content: "fixture", timestamp: 0 }] }),
			{ apiKey: "fixture-only", signal: AbortSignal.timeout(3000) },
		).result();
		expect(result.stopReason).not.toBe("error");
		expect(requests.some((url) => url.includes("/v1/responses"))).toBe(true);
		websocketPort = modelProxy.port ?? 0;
		applyProxyEnvironment(policy);
		const wsProxy = resolveHttpProxyUrlForTarget("http://websocket-fixture.invalid");
		const socket = Reflect.construct(WebSocket, [
			"ws://websocket-fixture.invalid",
			{ proxy: wsProxy?.href },
		]) as WebSocket;
		try {
			const received = await new Promise<string>((resolve, reject) => {
				const timer = setTimeout(() => reject(new Error("WebSocket proxy timeout")), 3000);
				socket.onmessage = (event) => {
					clearTimeout(timer);
					resolve(String(event.data));
				};
				socket.onerror = () => {
					clearTimeout(timer);
					reject(new Error("WebSocket proxy failed"));
				};
			});
			expect(received).toBe("proxy-websocket");
		} finally {
			socket.close();
		}
		applyProxyEnvironment({ ...policy, http: BLOCKED_PROXY, https: BLOCKED_PROXY });
		await expect(
			fetch("http://blocked-fixture.invalid", { signal: AbortSignal.timeout(1000) }),
		).rejects.toThrow();
		expect(resolveHttpProxyUrlForTarget("http://127.0.0.1:1455/auth/callback")).toBeUndefined();
	} finally {
		for (const [key, value] of Object.entries(saved)) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
		modelProxy.stop(true);
		proxy.closeAllConnections();
		await new Promise<void>((resolve) => proxy.close(() => resolve()));
	}
}, 15000);
