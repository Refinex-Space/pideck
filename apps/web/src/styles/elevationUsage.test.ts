import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { designSourceFiles, designSourceLabel } from "../../scripts/designSources";
import { normalizeEol } from "../../scripts/generatedFiles";

// Floating surfaces (menus, popovers, tooltips, toasts, dialogs, the composer) are separated from the
// canvas by a thin border and a radius, never by a drop shadow. See `design-system.md` ("层级与阴影").
const SHADOW_UTILITY =
	/(?<![\w.-])(?:(?:drop-|inset-)?shadow-(?!none(?![\w-]))[\w[\]().,%/#-]+|(?<=[\s"'`:])shadow(?=[\s"'`]))/g;
const SHADOW_VARIABLE = /--shadow-[a-z0-9-]+/g;
const SHADOW_IDENTIFIER = /\b(?:boxShadow|textShadow|dropShadow)\b/g;
const CSS_SHADOW = /\b(?:box|text)-shadow\s*:\s*([^;}]*)/g;
const CSS_DROP_SHADOW = /\bdrop-shadow\s*\(/g;
// A `box-shadow` that is not elevation: an inset marker bar or a zero-blur ring.
const NON_ELEVATION_VALUE =
	/^(?:none|inherit|initial|unset|inset\b.*|0(?:px)?\s+0(?:px)?\s+0(?:px)?\s+\d+px\b.*)$/;

const strip = (source: string, css: boolean): string => {
	const blank = (comment: string) => comment.replace(/[^\n]/g, " ");
	const text = normalizeEol(source).replace(/\/\*[\s\S]*?\*\//g, blank);
	return css ? text : text.replace(/^[ \t]*\/\/.*$/gm, blank);
};

const lineOf = (source: string, index: number): number => source.slice(0, index).split("\n").length;

function elevationOffenders(source: string, css: boolean): { line: number; text: string }[] {
	const code = strip(source, css);
	const found: { line: number; text: string }[] = [];
	const add = (index: number | undefined, text: string) =>
		found.push({ line: lineOf(code, index ?? 0), text });
	for (const match of code.matchAll(SHADOW_UTILITY)) add(match.index, match[0]);
	for (const match of code.matchAll(SHADOW_VARIABLE)) add(match.index, match[0]);
	for (const match of code.matchAll(SHADOW_IDENTIFIER)) add(match.index, match[0]);
	for (const match of code.matchAll(CSS_DROP_SHADOW)) add(match.index, match[0]);
	for (const match of code.matchAll(CSS_SHADOW)) {
		const value = (match[1] ?? "").trim().replace(/\s+/g, " ");
		if (!NON_ELEVATION_VALUE.test(value)) add(match.index, match[0].trim());
	}
	return found;
}

describe("flat elevation", () => {
	it("no design source casts an elevation shadow", () => {
		const offenders = designSourceFiles().flatMap((file) =>
			elevationOffenders(readFileSync(file, "utf8"), file.endsWith(".css")).map(
				(hit) => `${designSourceLabel(file)}:${hit.line} ${hit.text}`,
			),
		);
		expect(offenders).toEqual([]);
	});

	it("flags elevation shadows in every spelling", () => {
		const bad = [
			'<div className="shadow-md" />',
			'<div className="rounded-lg shadow-[var(--shadow-md)]" />',
			'<div className="hover:shadow-lg" />',
			'<div className="data-[open=true]:drop-shadow-md" />',
			'<div className="[&::-webkit-slider-thumb]:shadow-sm" />',
			'<div className="shadow" />',
			"const style = { boxShadow: '0 2px 8px #0003' };",
		];
		for (const source of bad) expect(elevationOffenders(source, false).length).toBeGreaterThan(0);
		for (const css of [
			".menu { box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12); }",
			".menu { filter: drop-shadow(0 2px 4px #0003); }",
			".menu { box-shadow: var(--shadow-md); }",
			".menu { text-shadow: 0 1px 0 #fff; }",
		])
			expect(elevationOffenders(css, true).length).toBeGreaterThan(0);
	});

	it("keeps focus rings, inset markers and shadow-named identifiers", () => {
		const fine = [
			'<div className="shadow-none ring-1 ring-inset transition-shadow" />',
			'const root = element.shadowRoot; const host = ".shadow-root-host";',
			'"widget.shadow": "--widget-shadow",',
			"// shadow-md is documented here",
		];
		for (const source of fine) expect(elevationOffenders(source, false)).toEqual([]);
		for (const css of [
			".row { box-shadow: inset 2px 0 0 var(--text-subtle); }",
			".tab { box-shadow: 0 0 0 1px var(--focus-ring); }",
			".reset { box-shadow: none; }",
			"/* box-shadow: 0 8px 24px red; */",
		])
			expect(elevationOffenders(css, true)).toEqual([]);
	});
});
