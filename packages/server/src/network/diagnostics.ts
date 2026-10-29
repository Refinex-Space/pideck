import type {
	NetworkDiagnostic,
	NetworkDiagnosticCode,
	NetworkProxyRoute,
} from "@thinkrail/contracts";
import { redactRoute } from "./policy";

const ENDPOINTS = {
	openaiAuth: "https://auth.openai.com/api/accounts/oauth/token",
	openaiApi: "https://api.openai.com/v1/models",
	anthropic: "https://api.anthropic.com/v1/models",
} as const;
export function classifyNetworkError(error: unknown): NetworkDiagnosticCode {
	if (!(error instanceof Error)) return "network";
	const code = "code" in error ? String(error.code) : "";
	if (error.name === "TimeoutError" || error.name === "AbortError" || /TIMED?OUT/.test(code))
		return "timeout";
	if (code === "ERR_PROXY_TUNNEL")
		return "status" in error && error.status === 407 ? "proxyAuth" : "proxyTunnel";
	if (/CERT|TLS|SSL/.test(code)) return "tls";
	return "network";
}
async function regionDenied(response: Response): Promise<boolean> {
	const reader = response.body?.getReader();
	if (!reader) return false;
	let body = "";
	try {
		const decoder = new TextDecoder();
		while (body.length < 16384) {
			const chunk = await reader.read();
			if (chunk.done) break;
			body += decoder.decode(chunk.value.slice(0, 16384 - body.length));
		}
		return body.includes("unsupported_country_region_territory");
	} finally {
		await reader.cancel().catch(() => {});
	}
}
export async function diagnoseConnection(
	provider: "openai" | "anthropic",
	route: NetworkProxyRoute,
	request: typeof fetch = fetch,
): Promise<NetworkDiagnostic[]> {
	if (provider !== "openai" && provider !== "anthropic")
		throw new Error("Unsupported diagnostic provider");
	const endpoints =
		provider === "openai" ? (["openaiAuth", "openaiApi"] as const) : (["anthropic"] as const);
	return Promise.all(
		endpoints.map(async (endpoint): Promise<NetworkDiagnostic> => {
			const start = performance.now();
			const base = { endpoint, route: redactRoute(route) };
			if (route.issue) return { ...base, code: "blocked", elapsedMs: 0 };
			try {
				// Use the same global fetch/environment as Pi OAuth; never send account credentials.
				const response = await request(ENDPOINTS[endpoint], {
					method: "GET",
					redirect: "manual",
					signal: AbortSignal.timeout(8000),
					headers: { accept: "application/json" },
				});
				const status = response.status;
				const region = status === 403 && (await regionDenied(response));
				if (status !== 403) await response.body?.cancel();
				const code: NetworkDiagnosticCode = region
					? "regionDenied"
					: status === 407
						? "proxyAuth"
						: status === 401
							? "authRequired"
							: status === 403
								? "forbidden"
								: status >= 300 && status < 400
									? "redirect"
									: response.ok || status === 405
										? "reachable"
										: "httpError";
				return { ...base, code, status, elapsedMs: Math.round(performance.now() - start) };
			} catch (error) {
				return {
					...base,
					code: classifyNetworkError(error),
					elapsedMs: Math.round(performance.now() - start),
				};
			}
		}),
	);
}
