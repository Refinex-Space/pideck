import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { BRAND_MARK_PATH, BRAND_MARK_SEGMENTS } from "../apps/web/src/constants/branding";

const root = resolve(import.meta.dir, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const paths = (svg: string) =>
	[...svg.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)].map((match) =>
		match[1]?.trim().replace(/\s+/g, " "),
	);

test("native, favicon and interface glyphs preserve the vendored Pi vector geometry", () => {
	const reference = paths(read("packages/shared/assets/pi.svg"));
	expect(reference).toHaveLength(2);
	expect(Object.values(BRAND_MARK_SEGMENTS)).toEqual(reference);
	expect(BRAND_MARK_PATH).toBe(reference.join(" "));
	for (const file of ["packages/shared/assets/icon.svg", "apps/web/public/favicon.svg"]) {
		const svg = read(file);
		expect(paths(svg)).toEqual(reference);
		expect(svg).toContain('fill-rule="evenodd"');
		expect(svg).not.toMatch(/<(?:script|image|foreignObject)\b/);
	}
});
