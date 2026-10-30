import { expect, test } from "bun:test";
import type { LspDiagnostic } from "./client";
import {
	diagnosticsReport,
	formatCalls,
	formatHover,
	formatLocations,
	formatSymbols,
	prettyDiagnostic,
} from "./format";

const at = (line: number, character: number) => ({
	start: { line, character },
	end: { line, character: character + 1 },
});
const issue = (severity: number | undefined, line: number, message: string): LspDiagnostic => ({
	range: at(line, 4),
	...(severity === undefined ? {} : { severity }),
	message,
});

test("a diagnostic reads as SEVERITY [line:column] message with 1-based positions", () => {
	expect(prettyDiagnostic(issue(1, 9, "bad"))).toBe("ERROR [10:5] bad");
	expect(prettyDiagnostic(issue(2, 0, "hm"))).toBe("WARN [1:5] hm");
	expect(prettyDiagnostic(issue(undefined, 0, "no severity"))).toBe("ERROR [1:5] no severity");
});

test("the report keeps errors only, caps them, and is empty for a clean file", () => {
	expect(diagnosticsReport("a.ts", [issue(2, 0, "warn"), issue(3, 0, "info")])).toBe("");
	const many = Array.from({ length: 23 }, (_, i) => issue(1, i, `e${i}`));
	const report = diagnosticsReport("a.ts", [issue(2, 0, "warn"), ...many]);
	expect(report.startsWith('<diagnostics file="a.ts">\nERROR [1:5] e0')).toBe(true);
	expect(report).toContain("... and 3 more");
	expect(report.split("\n").filter((line) => line.startsWith("ERROR"))).toHaveLength(20);
});

test("locations become relative path:line:column lines, deduped, with links understood", () => {
	const dir = "/work/proj";
	expect(
		formatLocations(dir, [
			{ uri: "file:///work/proj/src/a.ts", range: at(0, 2) },
			{ uri: "file:///work/proj/src/a.ts", range: at(0, 2) },
			{ targetUri: "file:///work/proj/b.ts", targetSelectionRange: at(4, 0) },
			{ uri: "file:///elsewhere/c.ts", range: at(1, 1) },
			{ uri: "https://example.com", range: at(0, 0) },
			null,
		]),
	).toBe("src/a.ts:1:3\nb.ts:5:1\n/elsewhere/c.ts:2:2");
});

test("hover text is joined from every server's markup, string or array form", () => {
	expect(
		formatHover([
			{ contents: { kind: "markdown", value: "**x**: number" } },
			{ contents: ["plain", { language: "ts", value: "let x" }] },
			{ contents: "" },
			null,
		]),
	).toBe("**x**: number\n\n---\n\nplain\n\nlet x");
});

test("symbols keep their nesting and call items name where they are", () => {
	const dir = "/work/proj";
	expect(
		formatSymbols(
			dir,
			[
				{
					name: "Thing",
					kind: 5,
					range: at(0, 0),
					selectionRange: at(0, 6),
					children: [{ name: "run", kind: 6, range: at(2, 2) }],
				},
			],
			"/work/proj/a.ts",
		),
	).toBe("Class Thing (a.ts:1:7)\n  Method run (a.ts:3:3)");
	expect(
		formatSymbols(dir, [
			{ name: "q", kind: 12, location: { uri: "file:///work/proj/z.ts", range: at(4, 0) } },
		]),
	).toBe("Function q (z.ts:5:1)");
	expect(
		formatCalls(dir, [
			{
				from: {
					name: "caller",
					kind: 12,
					uri: "file:///work/proj/a.ts",
					range: at(1, 0),
					selectionRange: at(1, 3),
				},
			},
			{ to: { name: "callee", kind: 6, uri: "file:///work/proj/b.ts", range: at(2, 0) } },
			{ nothing: true },
		]),
	).toBe("Function caller (a.ts:2:4)\nMethod callee (b.ts:3:1)");
});
