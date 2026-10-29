import type { NetworkProxyRoute } from "@thinkrail/contracts";
import { runBounded } from "../subprocess";

type Runner = (argv: string[]) => Promise<string>;
const run: Runner = async (argv) => {
	const result = await runBounded(argv, { timeoutMs: 8000 });
	if (!result.ok || result.out.length > 65536) throw new Error("Proxy detection failed");
	return result.out.trim();
};
function empty(source: NetworkProxyRoute["source"]): NetworkProxyRoute {
	return { source, http: "", https: "", bypass: "" };
}
async function windowsProxy(): Promise<NetworkProxyRoute> {
	const { dlopen, FFIType, ptr, read } = await import("bun:ffi");
	const winhttp = dlopen("winhttp.dll", {
		WinHttpGetIEProxyConfigForCurrentUser: { args: [FFIType.ptr], returns: FFIType.i32 },
	});
	const kernel = dlopen("kernel32.dll", {
		GlobalFree: { args: [FFIType.ptr], returns: FFIType.ptr },
	});
	const config = Buffer.alloc(32);
	const pointers: number[] = [];
	try {
		if (!winhttp.symbols.WinHttpGetIEProxyConfigForCurrentUser(ptr(config)))
			throw new Error("Windows proxy detection failed");
		for (const offset of [8, 16, 24]) pointers.push(read.ptr(ptr(config), offset));
		const stringAt = (pointer: number) => {
			if (!pointer) return "";
			const characters: number[] = [];
			for (let offset = 0; offset < 65536; offset += 2) {
				const character = read.u16(pointer, offset);
				if (character === 0) return String.fromCharCode(...characters);
				characters.push(character);
			}
			throw new Error("Windows proxy setting exceeds limit");
		};
		return parseWindowsProxy(
			JSON.stringify({
				autoDetect: config.readInt32LE(0) !== 0,
				pac: stringAt(pointers[0] || 0),
				proxy: stringAt(pointers[1] || 0),
				bypass: stringAt(pointers[2] || 0),
			}),
		);
	} finally {
		for (const pointer of pointers)
			if (pointer) kernel.symbols.GlobalFree(pointer as import("bun:ffi").Pointer);
		winhttp.close();
		kernel.close();
	}
}

export function parseWindowsProxy(text: string): NetworkProxyRoute {
	const data: unknown = JSON.parse(text);
	if (!data || typeof data !== "object") throw new Error("Invalid Windows proxy configuration");
	const c = data as Record<string, unknown>;
	const route = empty("windows");
	if (c.autoDetect || c.pac) return { ...route, issue: "pacUnsupported" };
	const server = typeof c.proxy === "string" ? c.proxy.trim() : "";
	route.bypass = typeof c.bypass === "string" ? c.bypass : "";
	if (!server.includes("=")) route.http = route.https = server;
	else {
		for (const item of server.split(/;\s*/)) {
			const [scheme, value] = item.split("=");
			const protocol = scheme?.trim().toLowerCase();
			if (protocol === "http" || protocol === "https") route[protocol] = value?.trim() || "";
		}
		if ((!route.http || !route.https) && /(?:^|;)\s*socks\s*=/i.test(server))
			route.issue = "socksUnsupported";
	}
	return route;
}
export function parseMacProxy(text: string): NetworkProxyRoute {
	if (!text.includes("<dictionary>")) throw new Error("Invalid macOS proxy configuration");
	const field = (key: string) =>
		new RegExp(`^\\s*${key}\\s*:\\s*(.+)$`, "m").exec(text)?.[1]?.trim() || "";
	const route = empty("macos");
	if (field("ProxyAutoConfigEnable") === "1" || field("ProxyAutoDiscoveryEnable") === "1")
		return { ...route, issue: "pacUnsupported" };
	for (const [scheme, prefix] of [
		["http", "HTTP"],
		["https", "HTTPS"],
	] as const) {
		if (field(`${prefix}Enable`) === "1") {
			const host = field(`${prefix}Proxy`);
			route[scheme] =
				`http://${host.includes(":") && !host.startsWith("[") ? `[${host}]` : host}:${field(`${prefix}Port`)}`;
		}
	}
	if ((!route.http || !route.https) && field("SOCKSEnable") === "1")
		route.issue = "socksUnsupported";
	const list = /ExceptionsList\s*:\s*<array>\s*\{([^}]*)\}/s.exec(text)?.[1] || "";
	route.bypass = [...list.matchAll(/^\s*\d+\s*:\s*(.+)$/gm)].map((m) => m[1]?.trim()).join(",");
	if (field("ExcludeSimpleHostnames") === "1") route.bypass += ",<local>";
	return route;
}
function unquote(value: string): string {
	return value.replace(/^['"]|['"]$/g, "");
}
async function gnomeProxy(execute: Runner): Promise<NetworkProxyRoute> {
	const get = (schema: string, key: string) =>
		execute(["gsettings", "get", `org.gnome.system.proxy${schema}`, key]).then(unquote);
	const mode = await get("", "mode");
	const route = empty("gnome");
	if (mode === "none") return route;
	if (mode === "auto") return { ...route, issue: "pacUnsupported" };
	if (mode !== "manual") throw new Error("Unknown GNOME proxy mode");
	const [http, httpPort, https, httpsPort, socks, socksPort, bypass, auth] = await Promise.all([
		get(".http", "host"),
		get(".http", "port"),
		get(".https", "host"),
		get(".https", "port"),
		get(".socks", "host"),
		get(".socks", "port"),
		get("", "ignore-hosts"),
		get(".http", "use-authentication"),
	]);
	const address = (host: string, port: string) => {
		if (!host || port === "0") return "";
		const number = Number(port);
		if (!Number.isInteger(number) || number < 1 || number > 65535)
			throw new Error("Invalid system proxy port");
		return `http://${host.includes(":") && !host.startsWith("[") ? `[${host}]` : host}:${number}`;
	};
	route.http = address(http, httpPort);
	route.https = address(https, httpsPort) || route.http;
	route.bypass = [...bypass.matchAll(/'([^']*)'/g)].map((m) => m[1]).join(",");
	if (route.http && auth === "true") route.issue = "systemAuthUnsupported";
	else if ((!route.http || !route.https) && address(socks, socksPort))
		route.issue = "socksUnsupported";
	return route;
}
async function kdeProxy(execute: Runner): Promise<NetworkProxyRoute> {
	let command = "kreadconfig6";
	const get = (key: string) =>
		execute([command, "--file", "kioslaverc", "--group", "Proxy Settings", "--key", key]);
	let mode: string;
	try {
		mode = await get("ProxyType");
	} catch {
		command = "kreadconfig5";
		mode = await get("ProxyType");
	}
	const route = empty("kde");
	if (!mode || mode === "0") return route;
	if (mode === "2" || mode === "3") return { ...route, issue: "pacUnsupported" };
	if (mode !== "1") return { ...route, issue: "detectionFailed" };
	const [http, https, socks, bypass, reversed] = await Promise.all([
		get("httpProxy"),
		get("httpsProxy"),
		get("socksProxy"),
		get("NoProxyFor"),
		get("ReversedException"),
	]);
	// KIO stores a port after a space, e.g. "http://localhost 8080".
	route.http = http.replace(/\s+(\d+)$/, ":$1");
	route.https = https.replace(/\s+(\d+)$/, ":$1");
	route.bypass = bypass;
	if ((route.http || route.https) && reversed === "true") route.issue = "bypassUnsupported";
	else if ((!route.http || !route.https) && socks) route.issue = "socksUnsupported";
	return route;
}
export async function detectSystemProxy(
	platform: NodeJS.Platform = process.platform,
	execute: Runner = run,
	desktop = process.env.XDG_CURRENT_DESKTOP || "",
): Promise<NetworkProxyRoute> {
	try {
		if (platform === "win32") return await windowsProxy();
		if (platform === "darwin") return parseMacProxy(await execute(["/usr/sbin/scutil", "--proxy"]));
		if (platform === "linux" && /KDE/i.test(desktop)) return await kdeProxy(execute);
		if (platform === "linux" && /GNOME|Unity|Cinnamon|Pantheon|Budgie/i.test(desktop))
			return await gnomeProxy(execute);
		return empty("none");
	} catch {
		return {
			...empty(platform === "win32" ? "windows" : platform === "darwin" ? "macos" : "none"),
			issue: "detectionFailed",
		};
	}
}
