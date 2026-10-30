import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { LspDiagnostic, LspPosition, LspRange } from "./client";

const SEVERITY = ["ERROR", "ERROR", "WARN", "INFO", "HINT"] as const;
const MAX_ERRORS_PER_FILE = 20;
const MAX_LOCATIONS = 50;

function record(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function position(value: unknown): LspPosition | null {
	const input = record(value);
	return input && typeof input.line === "number" && typeof input.character === "number"
		? { line: input.line, character: input.character }
		: null;
}

function range(value: unknown): LspRange | null {
	const input = record(value);
	const start = position(input?.start);
	const end = position(input?.end);
	return start && end ? { start, end } : null;
}

function pathOf(uri: unknown): string | null {
	if (typeof uri !== "string" || !uri.startsWith("file://")) return null;
	try {
		return fileURLToPath(uri);
	} catch {
		return null;
	}
}

function shown(directory: string, path: string): string {
	const rel = relative(directory, path);
	return rel === "" || rel.startsWith("..") ? path : rel.split("\\").join("/");
}

/** One diagnostic as a line, with 1-based positions as an editor shows them. */
export function prettyDiagnostic(diagnostic: LspDiagnostic): string {
	const severity = SEVERITY[diagnostic.severity ?? 1] ?? "ERROR";
	const { line, character } = diagnostic.range.start;
	return `${severity} [${line + 1}:${character + 1}] ${diagnostic.message}`;
}

/**
 * The block added to an edit's result: the file's errors only (warnings would bury them), capped, or
 * an empty string when the file is clean.
 */
export function diagnosticsReport(file: string, issues: readonly LspDiagnostic[]): string {
	const errors = issues.filter((item) => item.severity === undefined || item.severity === 1);
	if (errors.length === 0) return "";
	const lines = errors.slice(0, MAX_ERRORS_PER_FILE).map(prettyDiagnostic);
	const more = errors.length - MAX_ERRORS_PER_FILE;
	return `<diagnostics file="${file}">\n${lines.join("\n")}${more > 0 ? `\n... and ${more} more` : ""}\n</diagnostics>`;
}

/** Locations (or location links) as `path:line:column` lines. */
export function formatLocations(directory: string, results: readonly unknown[]): string {
	const seen = new Set<string>();
	const lines: string[] = [];
	for (const result of results) {
		const item = record(result);
		const uri = item?.uri ?? item?.targetUri;
		const at = range(item?.range ?? item?.targetSelectionRange ?? item?.targetRange);
		const path = pathOf(uri);
		if (!path || !at) continue;
		const line = `${shown(directory, path)}:${at.start.line + 1}:${at.start.character + 1}`;
		if (seen.has(line)) continue;
		seen.add(line);
		lines.push(line);
		if (lines.length >= MAX_LOCATIONS) break;
	}
	return lines.join("\n");
}

function hoverText(contents: unknown): string {
	if (typeof contents === "string") return contents;
	if (Array.isArray(contents)) return contents.map(hoverText).filter(Boolean).join("\n\n");
	const item = record(contents);
	if (item && typeof item.value === "string") return item.value;
	return "";
}

export function formatHover(results: readonly unknown[]): string {
	return results
		.map((result) => hoverText(record(result)?.contents))
		.filter((text) => text.trim() !== "")
		.join("\n\n---\n\n");
}

const SYMBOL_KINDS = [
	"",
	"File",
	"Module",
	"Namespace",
	"Package",
	"Class",
	"Method",
	"Property",
	"Field",
	"Constructor",
	"Enum",
	"Interface",
	"Function",
	"Variable",
	"Constant",
	"String",
	"Number",
	"Boolean",
	"Array",
	"Object",
	"Key",
	"Null",
	"EnumMember",
	"Struct",
	"Event",
	"Operator",
	"TypeParameter",
];

function kindName(kind: unknown): string {
	return typeof kind === "number" ? (SYMBOL_KINDS[kind] ?? "Symbol") : "Symbol";
}

function symbolLines(
	directory: string,
	symbols: readonly unknown[],
	depth: number,
	into: string[],
	file?: string,
): void {
	for (const symbol of symbols) {
		const item = record(symbol);
		if (!item || typeof item.name !== "string") continue;
		const location = record(item.location);
		const at = range(item.selectionRange ?? item.range ?? location?.range);
		const path = location ? pathOf(location.uri) : (file ?? null);
		const where = at
			? `${path ? `${shown(directory, path)}:` : ""}${at.start.line + 1}:${at.start.character + 1}`
			: "";
		into.push(
			`${"  ".repeat(depth)}${kindName(item.kind)} ${item.name}${where ? ` (${where})` : ""}`,
		);
		if (Array.isArray(item.children)) symbolLines(directory, item.children, depth + 1, into, file);
	}
}

export function formatSymbols(
	directory: string,
	symbols: readonly unknown[],
	file?: string,
): string {
	const lines: string[] = [];
	symbolLines(directory, symbols, 0, lines, file);
	return lines.join("\n");
}

/** Call hierarchy items, or the `from`/`to` side of calls, as `Kind name (path:line:column)` lines. */
export function formatCalls(directory: string, results: readonly unknown[]): string {
	const lines: string[] = [];
	for (const result of results) {
		const call = record(result);
		const item = record(call?.from ?? call?.to ?? call);
		if (!item || typeof item.name !== "string") continue;
		const path = pathOf(item.uri);
		const at = range(item.selectionRange ?? item.range);
		const where =
			path && at
				? ` (${shown(directory, path)}:${at.start.line + 1}:${at.start.character + 1})`
				: "";
		lines.push(`${kindName(item.kind)} ${item.name}${where}`);
	}
	return lines.join("\n");
}
