import { expect, test } from "bun:test";
import {
	DEFAULT_LSP_CONFIG,
	LSP_PROTOCOL_VERSION,
	type LspCatalogEntry,
	type LspConfig,
	type LspOverview,
} from "@thinkrail/contracts";
import { TooltipProvider } from "@thinkrail/ui/tooltip";
import { renderToStaticMarkup } from "react-dom/server";
import { LspSettingsForm } from "./LspSettings";
import { settingsNavGroups } from "./settingsNav";

const catalog: LspCatalogEntry[] = [
	{
		id: "typescript",
		name: "TypeScript",
		extensions: [".ts", ".tsx"],
		binary: "typescript-language-server",
		available: true,
		install: "npm i -g typescript-language-server typescript",
	},
	{
		id: "go",
		name: "Go",
		extensions: [".go"],
		binary: "gopls",
		available: false,
		install: "go install golang.org/x/tools/gopls@latest",
	},
];

function render(
	config: Partial<LspConfig> = {},
	failure = null as null | { message: string; scope: "general" | "add" },
) {
	const overview: LspOverview = {
		config: { ...DEFAULT_LSP_CONFIG, ...config },
		catalog,
		status: { enabled: false, trusted: false, servers: [] },
	};
	return renderToStaticMarkup(
		<TooltipProvider>
			<LspSettingsForm
				overview={overview}
				busy={false}
				failure={failure}
				onUpdate={async () => true}
			/>
		</TooltipProvider>,
	);
}

const isDisabled = (tag: string) => /\sdisabled(?:=""|\s|>)/.test(tag);

const switchOf = (html: string, testId: string) =>
	new RegExp(`<button[^>]*data-testid="${testId}"[^>]*>`).exec(html)?.[0] ?? "";

test("language servers start switched off, with the other switches waiting on the first", () => {
	const html = render();
	expect(switchOf(html, "lsp-enabled")).toContain('aria-checked="false"');
	for (const id of ["lsp-diagnostics", "lsp-tool"]) {
		expect(isDisabled(switchOf(html, id))).toBe(true);
	}
	expect(html).toMatch(/data-testid="lsp-idle"[^>]*disabled/);
	expect(html).toContain('data-testid="lsp-notice"');
	expect(html).toContain("PiDeck never installs language servers");
});

test("turned on, the switches follow the saved config", () => {
	const html = render({ enabled: true, diagnostics: false, idleMinutes: 45 });
	expect(switchOf(html, "lsp-enabled")).toContain('aria-checked="true"');
	expect(switchOf(html, "lsp-diagnostics")).toContain('aria-checked="false"');
	expect(isDisabled(switchOf(html, "lsp-diagnostics"))).toBe(false);
	expect(switchOf(html, "lsp-tool")).toContain('aria-checked="true"');
	expect(html).toMatch(/data-testid="lsp-idle"[^>]*value="45"/);
});

test("built-in servers say whether they were found and can be switched off one by one", () => {
	const html = render({ enabled: true, servers: { go: { disabled: true } } });
	expect(html).toMatch(/data-testid="lsp-available-typescript"[^>]*data-available="true"/);
	expect(html).toMatch(/data-testid="lsp-available-go"[^>]*data-available="false"/);
	expect(html).toContain("go install golang.org/x/tools/gopls@latest");
	expect(switchOf(html, "lsp-server-typescript")).toContain('aria-checked="true"');
	expect(switchOf(html, "lsp-server-go")).toContain('aria-checked="false"');
});

test("custom servers are listed apart from the built-in ones, with a way to add and remove", () => {
	expect(render()).toContain('data-testid="lsp-custom-empty"');
	const html = render({
		servers: {
			go: { disabled: true },
			mine: { command: ["my-ls", "--stdio"], extensions: [".mine"] },
		},
	});
	expect(html).toContain('data-testid="lsp-custom-mine"');
	expect(html).toContain("my-ls --stdio");
	expect(html).toContain('data-testid="lsp-remove-mine"');
	expect(html).not.toContain('data-testid="lsp-custom-go"');
	expect(html).toContain('data-testid="lsp-add-form"');
});

test("a host refusal shows beside the control that caused it", () => {
	const general = render({}, { message: "Extensions must start with a dot", scope: "general" });
	expect(general).toContain('data-testid="lsp-error"');
	expect(general).not.toContain('data-testid="lsp-add-error"');
	const add = render({}, { message: "Too many servers", scope: "add" });
	expect(add).toContain('data-testid="lsp-add-error"');
	expect(add).toContain("Too many servers");
	expect(add).not.toContain('data-testid="lsp-error"');
});

test("the page is offered only by hosts that have language servers", () => {
	const available = (version: number) =>
		settingsNavGroups(version, false).flatMap((group) =>
			group.sections.map((section) => section.id),
		);
	expect(available(LSP_PROTOCOL_VERSION)).toContain("lsp");
	expect(available(LSP_PROTOCOL_VERSION - 1)).not.toContain("lsp");
});
