export interface NetworkProxyConfig {
	mode: "auto" | "manual" | "direct";
	protocol: "http" | "https";
	host: string;
	port: number;
	bypass: string;
	username: string;
}
export type NetworkProxyIssue =
	| "pacUnsupported"
	| "socksUnsupported"
	| "bypassUnsupported"
	| "detectionFailed"
	| "invalidConfig"
	| "credentialUnavailable"
	| "systemAuthUnsupported";
export type NetworkProxySource =
	| "environment"
	| "manual"
	| "direct"
	| "windows"
	| "macos"
	| "gnome"
	| "kde"
	| "none";
export interface NetworkProxyRoute {
	source: NetworkProxySource;
	http: string;
	https: string;
	bypass: string;
	issue?: NetworkProxyIssue;
	/** Existing environment bypass syntax is preserved for backward compatibility. */
	bypassWarning?: boolean;
}
export interface NetworkProxyStatus {
	config: NetworkProxyConfig;
	hasPassword: boolean;
	effective: NetworkProxyRoute;
	detected: NetworkProxyRoute;
	detectedAt: string;
	restartRequired: boolean;
	environmentOverride: boolean;
}
export interface NetworkProxyUpdate {
	config: NetworkProxyConfig;
	/** Omitted keeps the existing secret; null clears it. Never returned by reads. */
	password?: string | null;
}
export type NetworkDiagnosticCode =
	| "reachable"
	| "authRequired"
	| "regionDenied"
	| "forbidden"
	| "proxyAuth"
	| "proxyTunnel"
	| "tls"
	| "timeout"
	| "network"
	| "httpError"
	| "redirect"
	| "blocked";
export interface NetworkDiagnostic {
	endpoint: "openaiAuth" | "openaiApi" | "anthropic";
	code: NetworkDiagnosticCode;
	status?: number;
	elapsedMs: number;
	route: NetworkProxyRoute;
}
