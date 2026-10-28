import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

const CSS = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
const WEBSITE_FONTS = {
	interface: {
		stack: [
			"Geist Variable",
			"Geist",
			"-apple-system",
			"BlinkMacSystemFont",
			"Segoe UI",
			"sans-serif",
		],
		selfHosted: ["@fontsource-variable/geist", "@fontsource-variable/geist/wght-italic.css"],
	},
	code: {
		stack: [
			"JetBrains Mono Variable",
			"JetBrains Mono",
			"Fira Code",
			"SF Mono",
			"Cascadia Code",
			"monospace",
		],
		selfHosted: [
			"@fontsource-variable/jetbrains-mono",
			"@fontsource-variable/jetbrains-mono/wght-italic.css",
		],
	},
	brand: {
		stack: [
			"Orbitron Variable",
			"Orbitron",
			"Geist Variable",
			"Geist",
			"-apple-system",
			"BlinkMacSystemFont",
			"Segoe UI",
			"sans-serif",
		],
		selfHosted: ["@fontsource-variable/orbitron"],
	},
};

function cssStack(name: string): string[] {
	const match = CSS.match(new RegExp(`--${name}:([^;]*);`));
	if (!match) throw new Error(`--${name} is not declared in styles.css`);
	return (match[1] as string).split(",").map((f) => f.trim().replace(/^"|"$/g, ""));
}

describe("retained upstream website font contract", () => {
	it("declares the same stacks", () => {
		expect(cssStack("font-sans")).toEqual(WEBSITE_FONTS.interface.stack);
		expect(cssStack("font-mono")).toEqual(WEBSITE_FONTS.code.stack);
	});

	it("keeps Orbitron for the upstream display role", () => {
		expect(cssStack("font-display")).toEqual(WEBSITE_FONTS.brand.stack);
	});

	it("bundles the website's declared interface, code and brand packages", () => {
		const imported = [...CSS.matchAll(/@import "([^"]+)";/g)].map((m) => m[1]);
		expect(imported).toEqual([
			...(WEBSITE_FONTS.interface.selfHosted ?? []),
			...(WEBSITE_FONTS.code.selfHosted ?? []),
			...(WEBSITE_FONTS.brand.selfHosted ?? []),
		]);
	});

	it("requests no font from a CDN", () => {
		const html = readFileSync(new URL("./pages/index.astro", import.meta.url), "utf8");
		for (const source of [CSS, html])
			expect(source).not.toMatch(/fonts\.(?:googleapis|gstatic)\.com|api\.fontshare\.com/);
	});
});
