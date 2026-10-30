import { expect, test } from "bun:test";
import type { NetworkProxyStatus } from "@thinkrail/contracts";
import { NETWORK_PROXY_PROTOCOL_VERSION } from "@thinkrail/contracts";
import { TooltipProvider } from "@thinkrail/ui/tooltip";
import { renderToStaticMarkup } from "react-dom/server";
import { formatProxyAddress, NetworkForm } from "./NetworkSettings";

test("proxy addresses always show an explicit port and never expose userinfo", () => {
	expect(formatProxyAddress("http://127.0.0.1:7897/")).toBe("http://127.0.0.1:7897");
	expect(formatProxyAddress("http://user:secret@127.0.0.1/")).toBe("http://127.0.0.1:80");
	expect(formatProxyAddress("https://[::1]/")).toBe("https://[::1]:443");
});

import { settingsNavGroups } from "./settingsNav";

const status: NetworkProxyStatus = {
	config: {
		mode: "manual",
		protocol: "http",
		host: "localhost",
		port: 7897,
		bypass: "",
		username: "",
	},
	hasPassword: true,
	effective: {
		source: "manual",
		http: "http://localhost:7897",
		https: "http://localhost:7897",
		bypass: "localhost",
	},
	detected: { source: "none", http: "", https: "", bypass: "" },
	detectedAt: "2026-10-29T00:00:00Z",
	restartRequired: true,
	environmentOverride: true,
};
test("proxy form exposes applied routing and restart/override state without revealing a saved password", () => {
	const html = renderToStaticMarkup(
		<TooltipProvider>
			<NetworkForm
				status={status}
				draft={status.config}
				password=""
				busy={false}
				failed={false}
				results={[]}
				onChange={() => {}}
				onPassword={() => {}}
				onSave={() => {}}
				onRefresh={() => {}}
				onDiagnose={() => {}}
				onDiscard={() => {}}
			/>
		</TooltipProvider>,
	);
	expect(html).toContain('data-testid="network-restart"');
	expect(html).toContain('data-testid="network-override"');
	expect(html).toMatch(/data-testid="network-password"[^>]*type="password"/);
	expect(html).toMatch(/data-testid="network-diagnose"[^>]*disabled/);
	// `<local>` is interpolated, because translation catalogs reject raw angle-bracket text.
	expect(html).toContain("CIDR and &lt;local&gt; are not");
});
test("network settings are gated independently of older host settings", () => {
	const available = (v: number) =>
		settingsNavGroups(v, false).flatMap((g) => g.sections.map((s) => s.id));
	expect(available(NETWORK_PROXY_PROTOCOL_VERSION)).toContain("network");
	expect(available(NETWORK_PROXY_PROTOCOL_VERSION - 1)).not.toContain("network");
});
