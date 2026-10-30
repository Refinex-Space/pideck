import { expect, test } from "bun:test";
import type { LspServerStatus, LspWorkspaceStatus } from "@thinkrail/contracts";
import { TooltipProvider } from "@thinkrail/ui/tooltip";
import { renderToStaticMarkup } from "react-dom/server";
import { LspStatusView } from "./StatusLspBlock";

const server = (extra: Partial<LspServerStatus>): LspServerStatus => ({
	id: "typescript",
	name: "TypeScript",
	root: ".",
	state: "ready",
	files: 3,
	errors: 0,
	warnings: 0,
	custom: false,
	...extra,
});

function render(status?: LspWorkspaceStatus, supported = true) {
	return renderToStaticMarkup(
		<TooltipProvider>
			<LspStatusView supported={supported} status={status} workspaceId="w1" />
		</TooltipProvider>,
	);
}

test("a host without language servers says so and offers nothing to manage", () => {
	const html = render(undefined, false);
	expect(html).toContain('data-testid="status-lsp-unsupported"');
	expect(html).not.toContain("status-lsp-manage");
});

test("before the first read only the way to settings shows", () => {
	const html = render();
	expect(html).toContain('data-testid="status-lsp-manage"');
	expect(html).not.toContain("status-lsp-off");
	expect(html).not.toContain("status-lsp-idle");
});

test("off, untrusted and idle each get their own plain sentence", () => {
	expect(render({ enabled: false, trusted: true, servers: [] })).toContain(
		'data-testid="status-lsp-off"',
	);
	expect(render({ enabled: true, trusted: false, servers: [] })).toContain(
		'data-testid="status-lsp-untrusted"',
	);
	const idle = render({ enabled: true, trusted: true, servers: [] });
	expect(idle).toContain('data-testid="status-lsp-idle"');
	expect(idle).toContain('data-testid="status-lsp-manage"');
});

test("a ready server reports its errors first, then its warnings, then that it is ready", () => {
	const html = render({
		enabled: true,
		trusted: true,
		servers: [
			server({ id: "a", name: "Alpha", errors: 1, warnings: 4 }),
			server({ id: "b", name: "Beta", warnings: 2 }),
			server({ id: "c", name: "Gamma" }),
		],
	});
	const verdicts = [...html.matchAll(/data-testid="status-lsp-verdict"[^>]*>([^<]*)</g)].map(
		(m) => m[1],
	);
	expect(verdicts).toEqual(["1 error", "2 warnings", "Ready"]);
	expect(html).not.toContain("status-lsp-restart");
});

test("a starting server shows progress, and its root only when it is not the workspace", () => {
	const html = render({
		enabled: true,
		trusted: true,
		servers: [
			server({ state: "starting", root: "packages/web" }),
			server({ id: "go", name: "Go" }),
		],
	});
	expect(html).toMatch(/data-state="starting"/);
	expect(html).toContain("Starting");
	expect(html).toContain("packages/web");
	expect(html.match(/status-lsp-server"/g)).toHaveLength(2);
});

test("a failed or missing server says why and offers a way to try again", () => {
	const html = render({
		enabled: true,
		trusted: true,
		servers: [
			server({
				id: "go",
				name: "Go",
				state: "missing",
				message: "go install golang.org/x/tools/gopls@latest",
			}),
			server({ id: "rust", name: "Rust", state: "error", message: "exited with code 1" }),
		],
	});
	expect(html).toContain("Not installed");
	expect(html).toContain("go install golang.org/x/tools/gopls@latest");
	expect(html).toContain("Check again");
	expect(html).toContain("Failed");
	expect(html).toContain("exited with code 1");
	expect(html).toContain("Restart");
	expect(html.match(/status-lsp-restart/g)).toHaveLength(2);
});
