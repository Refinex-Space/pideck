import { isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { ExtensionAPI, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import {
	diagnosticsReport,
	formatCalls,
	formatHover,
	formatLocations,
	formatSymbols,
	type LspManager,
} from "../lsp";

export const LSP_TOOL_NAME = "lsp";

export const LSP_OPERATIONS = [
	"goToDefinition",
	"findReferences",
	"goToImplementation",
	"hover",
	"documentSymbol",
	"workspaceSymbol",
	"prepareCallHierarchy",
	"incomingCalls",
	"outgoingCalls",
] as const;

type LspOperation = (typeof LSP_OPERATIONS)[number];

export const LspToolSchema = Type.Object({
	operation: Type.Unsafe<LspOperation>({
		type: "string",
		enum: [...LSP_OPERATIONS],
		description: "What to ask the language server.",
	}),
	filePath: Type.Optional(
		Type.String({
			description:
				"The file, relative to the workspace or absolute. Required except for workspaceSymbol.",
		}),
	),
	line: Type.Optional(
		Type.Integer({ minimum: 1, description: "1-based line, as an editor shows it." }),
	),
	character: Type.Optional(
		Type.Integer({ minimum: 1, description: "1-based column, as an editor shows it." }),
	),
	query: Type.Optional(Type.String({ description: "The name to look for. workspaceSymbol only." })),
});

export type LspToolParams = Static<typeof LspToolSchema>;

const FEEDBACK_BUDGET_MS = 20_000;
const FEEDBACK_HEADER = "LSP errors detected in this file, please fix:";

let host: LspManager | null = null;

export function setLspToolHost(next: LspManager | null): void {
	host = next;
}

function relativeTo(cwd: string, path: string): string {
	const rel = relative(cwd, path);
	return rel === "" || rel.startsWith("..") || isAbsolute(rel) ? path : rel.split("\\").join("/");
}

function text(value: string): { content: [{ type: "text"; text: string }]; details: undefined } {
	return { content: [{ type: "text", text: value }], details: undefined };
}

function nothing(operation: LspOperation): string {
	return `No results for ${operation}.`;
}

const NEEDS_POSITION: ReadonlySet<LspOperation> = new Set([
	"goToDefinition",
	"findReferences",
	"goToImplementation",
	"hover",
	"prepareCallHierarchy",
	"incomingCalls",
	"outgoingCalls",
]);

const POSITION_METHODS: Partial<Record<LspOperation, string>> = {
	goToDefinition: "textDocument/definition",
	goToImplementation: "textDocument/implementation",
	findReferences: "textDocument/references",
	hover: "textDocument/hover",
	prepareCallHierarchy: "textDocument/prepareCallHierarchy",
};

function asArray(value: unknown): unknown[] {
	if (Array.isArray(value)) return value;
	return value === null || value === undefined ? [] : [value];
}

/** Whether language servers may be used for this chat right now, or why not. */
function unavailable(
	manager: LspManager,
	trusted: boolean,
	wants: "tool" | "diagnostics",
): string | null {
	const config = manager.settings();
	if (!config.enabled || !config[wants]) {
		return "Language servers are turned off. They can be turned on in Settings → Language servers.";
	}
	if (!trusted) {
		return "Language servers do not run in a project that has not been trusted yet.";
	}
	return null;
}

export function createLspTool(): ToolDefinition<typeof LspToolSchema, undefined> {
	return {
		name: LSP_TOOL_NAME,
		label: "Language server",
		parameters: LspToolSchema,
		description:
			"Ask the project's language server about code: where a symbol is defined or used, what its type is, which symbols a file declares, and who calls what. Positions are 1-based line and column, as shown by read.",
		promptSnippet:
			"Code intelligence from the language server (definitions, references, hover, symbols, call hierarchy)",
		promptGuidelines: [
			"Use lsp to follow a symbol across files instead of guessing with grep: goToDefinition, findReferences and goToImplementation need filePath, line and character on the symbol; hover shows its type and docs; documentSymbol lists a file's declarations; workspaceSymbol finds a name across the project (query, and filePath to start a server); prepareCallHierarchy, incomingCalls and outgoingCalls follow calls.",
			"lsp only answers for files a configured language server serves. When it reports no server or no results, fall back to read and grep.",
		],
		async execute(_id, params, _signal, _update, ctx) {
			if (!host) throw new Error("Language servers are unavailable on this host.");
			const refusal = unavailable(host, ctx.isProjectTrusted(), "tool");
			if (refusal) throw new Error(refusal);

			const directory = ctx.cwd;
			const trusted = true;
			const { operation } = params;

			if (operation === "workspaceSymbol") {
				if (!params.query) throw new Error("workspaceSymbol needs a query.");
				const query = { query: params.query };
				const answers = params.filePath
					? await host.run({ directory, file: params.filePath, trusted }, (client) =>
							client.request("workspace/symbol", query),
						)
					: await host.runAll({ directory, trusted }, (client) =>
							client.request("workspace/symbol", query),
						);
				const lines = formatSymbols(directory, answers.flatMap(asArray));
				return text(
					lines ||
						(answers.length === 0 && !params.filePath
							? "No language server is running in this workspace yet. Pass filePath to start the one that serves it."
							: nothing(operation)),
				);
			}

			if (!params.filePath) throw new Error(`${operation} needs filePath.`);
			const file = resolve(directory, params.filePath);
			if (!host.hasServer(directory, file)) {
				return text(`No language server serves ${relativeTo(directory, file)}.`);
			}
			const textDocument = { uri: pathToFileURL(file).href };
			const target = { directory, file, trusted };

			if (operation === "documentSymbol") {
				const answers = await host.run(target, (client) =>
					client.request("textDocument/documentSymbol", { textDocument }),
				);
				return text(formatSymbols(directory, answers.flatMap(asArray), file) || nothing(operation));
			}

			if (NEEDS_POSITION.has(operation) && (!params.line || !params.character)) {
				throw new Error(`${operation} needs line and character (both 1-based).`);
			}
			const position = { line: (params.line ?? 1) - 1, character: (params.character ?? 1) - 1 };
			const at = { textDocument, position };

			if (operation === "incomingCalls" || operation === "outgoingCalls") {
				const method =
					operation === "incomingCalls"
						? "callHierarchy/incomingCalls"
						: "callHierarchy/outgoingCalls";
				const answers = await host.run(target, async (client) => {
					const items = asArray(await client.request("textDocument/prepareCallHierarchy", at));
					return items.length === 0
						? []
						: asArray(await client.request(method, { item: items[0] }));
				});
				return text(formatCalls(directory, answers.flat()) || nothing(operation));
			}

			const method = POSITION_METHODS[operation];
			if (!method) throw new Error(`Unknown lsp operation: ${operation}`);
			const answers = await host.run(target, (client) =>
				client.request(
					method,
					operation === "findReferences" ? { ...at, context: { includeDeclaration: true } } : at,
				),
			);
			if (operation === "hover") return text(formatHover(answers) || nothing(operation));
			if (operation === "prepareCallHierarchy") {
				return text(formatCalls(directory, answers.flatMap(asArray)) || nothing(operation));
			}
			return text(formatLocations(directory, answers.flatMap(asArray)) || nothing(operation));
		},
	};
}

async function within<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const expired = new Promise<T>((done) => {
		timer = setTimeout(() => done(fallback), ms);
	});
	try {
		return await Promise.race([work, expired]);
	} finally {
		clearTimeout(timer);
	}
}

function editedPath(input: Record<string, unknown>): string | undefined {
	const value = input.path ?? input.file_path;
	return typeof value === "string" && value !== "" ? value : undefined;
}

/**
 * Registers the `lsp` tool and the check that follows an edit. The tool is declared only while
 * language servers and the tool switch are on; the check reads the switches on every edit, so a
 * change in settings reaches chats that are already open.
 */
export function lspExtension(pi: ExtensionAPI): void {
	if (!host) return;
	const config = host.settings();
	if (config.enabled && config.tool) pi.registerTool(createLspTool());

	pi.on("tool_result", async (event, ctx) => {
		const manager = host;
		if (!manager || event.isError) return;
		if (event.toolName !== "edit" && event.toolName !== "write") return;
		const path = editedPath(event.input);
		if (!path || unavailable(manager, ctx.isProjectTrusted(), "diagnostics")) return;
		const file = resolve(ctx.cwd, path);
		if (!manager.hasServer(ctx.cwd, file)) return;
		const issues = await within(
			manager.touch({ directory: ctx.cwd, file, trusted: true, wait: true }),
			FEEDBACK_BUDGET_MS,
			[],
		).catch(() => []);
		const report = diagnosticsReport(relativeTo(ctx.cwd, file), issues);
		if (!report) return;
		return {
			content: [...event.content, { type: "text", text: `\n\n${FEEDBACK_HEADER}\n${report}` }],
		};
	});
}
