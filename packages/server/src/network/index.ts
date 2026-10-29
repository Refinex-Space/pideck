import type { NetworkProxyUpdate } from "@thinkrail/contracts";
import { diagnoseConnection } from "./diagnostics";
import { proxyManager } from "./network";

export const initializeNetworkProxy = () => proxyManager.initialize();
export const networkProxyStatus = (refresh = false) => proxyManager.status(refresh);
export const updateNetworkProxy = (input: NetworkProxyUpdate) => proxyManager.update(input);
let diagnostic: ReturnType<typeof diagnoseConnection> | undefined;
export async function diagnoseNetwork(provider: "openai" | "anthropic") {
	await proxyManager.initialize();
	if (diagnostic) throw new Error("Network diagnostics already running");
	diagnostic = diagnoseConnection(provider, proxyManager.route());
	try {
		return await diagnostic;
	} finally {
		diagnostic = undefined;
	}
}
