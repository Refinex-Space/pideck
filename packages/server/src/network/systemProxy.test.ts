import { expect, test } from "bun:test";
import { detectSystemProxy, parseMacProxy, parseWindowsProxy } from "./systemProxy";

test("Windows proxy map keys are case-insensitive and mixed SOCKS fallback stays explicit", () => {
	expect(
		parseWindowsProxy(JSON.stringify({ proxy: "HTTP =localhost:7897; HTTPS=localhost:7898" })),
	).toMatchObject({ http: "localhost:7897", https: "localhost:7898" });
	expect(
		parseWindowsProxy(JSON.stringify({ proxy: "http=localhost:7897;socks=localhost:1080" })).issue,
	).toBe("socksUnsupported");
	expect(
		parseMacProxy(
			"<dictionary> {\n HTTPEnable : 1\n HTTPProxy : localhost\n HTTPPort : 7897\n SOCKSEnable : 1\n}",
		).issue,
	).toBe("socksUnsupported");
});

test("GNOME reuses HTTP for HTTPS, honors disabled ports and detects a missing scheme's SOCKS fallback", async () => {
	const values: Record<string, string> = {
		"org.gnome.system.proxy/mode": "'manual'",
		"org.gnome.system.proxy/ignore-hosts": "[]",
		"org.gnome.system.proxy.http/host": "'localhost'",
		"org.gnome.system.proxy.http/port": "7897",
		"org.gnome.system.proxy.http/use-authentication": "false",
		"org.gnome.system.proxy.https/host": "''",
		"org.gnome.system.proxy.https/port": "0",
		"org.gnome.system.proxy.socks/host": "'localhost'",
		"org.gnome.system.proxy.socks/port": "0",
	};
	const detect = () =>
		detectSystemProxy("linux", async (argv) => values[`${argv[2]}/${argv[3]}`] ?? "", "GNOME");
	expect(await detect()).toMatchObject({
		http: "http://localhost:7897",
		https: "http://localhost:7897",
	});
	values["org.gnome.system.proxy.http/port"] = "0";
	values["org.gnome.system.proxy.http/use-authentication"] = "true";
	values["org.gnome.system.proxy.https/host"] = "'secure-proxy'";
	values["org.gnome.system.proxy.https/port"] = "7898";
	const httpsOnly = await detect();
	expect(httpsOnly).toMatchObject({ http: "", https: "http://secure-proxy:7898" });
	expect(httpsOnly.issue).toBeUndefined();
	values["org.gnome.system.proxy.socks/port"] = "1080";
	expect((await detect()).issue).toBe("socksUnsupported");
});

test("Windows WinHTTP settings preserve protocol-specific proxies and identify PAC", () => {
	expect(
		parseWindowsProxy(
			JSON.stringify({
				proxy: "http=localhost:8080;https=localhost:8081",
				bypass: "*.example.org",
				autoDetect: false,
			}),
		),
	).toMatchObject({ http: "localhost:8080", https: "localhost:8081", bypass: "*.example.org" });
	expect(
		parseWindowsProxy(JSON.stringify({ proxy: "localhost:8080", autoDetect: true })).issue,
	).toBe("pacUnsupported");
	expect(parseWindowsProxy(JSON.stringify({ proxy: "socks=localhost:1080" })).issue).toBe(
		"socksUnsupported",
	);
});
test("macOS scutil preserves the proxy transport and bypass list", () => {
	expect(
		parseMacProxy(`<dictionary> {
 HTTPEnable : 1
 HTTPProxy : localhost
 HTTPPort : 7897
 HTTPSEnable : 1
 HTTPSProxy : localhost
 HTTPSPort : 7897
 ExceptionsList : <array> {
  0 : *.example.org
  1 : 127.0.0.1
 }
}`),
	).toEqual({
		source: "macos",
		http: "http://localhost:7897",
		https: "http://localhost:7897",
		bypass: "*.example.org,127.0.0.1",
	});
	expect(parseMacProxy("<dictionary> {\n ProxyAutoConfigEnable : 1\n}").issue).toBe(
		"pacUnsupported",
	);
});
test("GNOME static configuration is read without accessing the stored password", async () => {
	const values: Record<string, string> = {
		mode: "'manual'",
		"org.gnome.system.proxy.http/host": "'localhost'",
		"org.gnome.system.proxy.https/host": "'localhost'",
		"org.gnome.system.proxy.socks/host": "''",
		port: "7897",
		"ignore-hosts": "['localhost', '*.example.org']",
		"use-authentication": "false",
	};
	const route = await detectSystemProxy(
		"linux",
		async (argv) => {
			expect(argv.join(" ")).not.toContain("password");
			return values[`${argv[2]}/${argv[3]}`] ?? values[argv[3] || ""] ?? "";
		},
		"ubuntu:GNOME",
	);
	expect(route).toMatchObject({
		source: "gnome",
		https: "http://localhost:7897",
		bypass: "localhost,*.example.org",
	});
});
test("KDE handles its space-separated port and rejects reverse bypass semantics", async () => {
	const values: Record<string, string> = {
		ProxyType: "1",
		httpProxy: "http://localhost 8080",
		httpsProxy: "http://localhost 8081",
		ReversedException: "true",
	};
	const route = await detectSystemProxy(
		"linux",
		async (argv) => values[argv.at(-1) || ""] || "",
		"KDE",
	);
	expect(route).toMatchObject({
		source: "kde",
		https: "http://localhost:8081",
		issue: "bypassUnsupported",
	});
	values.httpProxy = "";
	values.httpsProxy = "";
	expect(
		(await detectSystemProxy("linux", async (argv) => values[argv.at(-1) || ""] || "", "KDE"))
			.issue,
	).toBeUndefined();
	values.socksProxy = "socks://localhost 1080";
	expect(
		(await detectSystemProxy("linux", async (argv) => values[argv.at(-1) || ""] || "", "KDE"))
			.issue,
	).toBe("socksUnsupported");
});
test("failed detectors report failure, while headless Linux uses environment only", async () => {
	expect(
		(
			await detectSystemProxy("darwin", async () => {
				throw new Error("failed");
			})
		).issue,
	).toBe("detectionFailed");
	expect(
		await detectSystemProxy(
			"linux",
			async () => {
				throw new Error("must not run");
			},
			"",
		),
	).toMatchObject({ source: "none" });
});
