import { expect, test } from "bun:test";
import { exportName, svgSize, withPixelSize } from "./exportSvg";

const SVG =
	'<svg id="m1" width="100%" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320.5 180" style="max-width: 320.5px;" role="graphics-document"><g/></svg>';

test("svgSize reads the viewBox of the root element only", () => {
	expect(svgSize(SVG)).toEqual({ width: 320.5, height: 180 });
	expect(svgSize('<svg viewBox="-8,-8,100,40"><svg viewBox="0 0 1 1"/></svg>')).toEqual({
		width: 100,
		height: 40,
	});
	expect(svgSize("<svg><g/></svg>")).toBeNull();
	expect(svgSize('<svg viewBox="0 0 0 10"></svg>')).toBeNull();
});

test("withPixelSize swaps percent sizing and max-width for explicit pixels", () => {
	const out = withPixelSize(SVG, { width: 320.5, height: 180 });
	expect(out.startsWith("<svg ")).toBe(true);
	expect(out).toContain('width="320.5" height="180">');
	expect(out).not.toContain("100%");
	expect(out).not.toContain("max-width");
	expect(out).toContain('viewBox="0 0 320.5 180"');
	expect(out.endsWith("<g/></svg>")).toBe(true);
});

test("exportName keeps letters of any script and falls back to diagram", () => {
	expect(exportName("Auth flow / v2")).toBe("Auth-flow-v2");
	expect(exportName("认证流程")).toBe("认证流程");
	expect(exportName("  ?? ")).toBe("diagram");
	expect(exportName(undefined)).toBe("diagram");
});
