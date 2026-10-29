import { expect, test } from "bun:test";
import { classifyNetworkError, diagnoseConnection } from "./diagnostics";

const route = {
	source: "manual" as const,
	http: "http://user:secret@localhost:7897",
	https: "http://user:secret@localhost:7897",
	bypass: "localhost",
};
test("diagnostics distinguish service reachability from authentication and redact routes", async () => {
	const request: typeof fetch = Object.assign(
		async (input: string | URL | Request, options?: RequestInit) => {
			expect(new Headers(options?.headers).has("Authorization")).toBe(false);
			expect(options?.redirect).toBe("manual");
			return new Response("", { status: String(input).includes("auth.openai.com") ? 405 : 401 });
		},
		{ preconnect: fetch.preconnect },
	);
	const results = await diagnoseConnection("openai", route, request);
	expect(results.map((r) => r.code)).toEqual(["reachable", "authRequired"]);
	expect(JSON.stringify(results)).not.toContain("secret");
});
test("region rejection and proxy authentication have separate outcomes", async () => {
	const request: typeof fetch = Object.assign(
		async () =>
			new Response('{"error":{"code":"unsupported_country_region_territory"}}', { status: 403 }),
		{ preconnect: fetch.preconnect },
	);
	expect((await diagnoseConnection("openai", route, request))[0]?.code).toBe("regionDenied");
	expect(
		classifyNetworkError(
			Object.assign(new Error("secret"), { code: "ERR_PROXY_TUNNEL", status: 407 }),
		),
	).toBe("proxyAuth");
	expect(
		classifyNetworkError(Object.assign(new Error("secret"), { code: "CERT_HAS_EXPIRED" })),
	).toBe("tls");
});
