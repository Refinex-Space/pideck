import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const shellSource = readFileSync(new URL("./Shell.tsx", import.meta.url), "utf8");
const menuSource = readFileSync(new URL("./ApplicationMenu.tsx", import.meta.url), "utf8");
const jsxTag = (name: string) => new RegExp(`<${name}\\b(?:=>|[^>])*>`, "g");
const openingTag =
	[...shellSource.matchAll(jsxTag("div"))]
		.map((m) => m[0])
		.find((tag) => tag.includes('data-testid="topbar"')) ?? "";
const classAttribute = (tag: string) => /className="([^"]*)"/.exec(tag)?.[1]?.split(/\s+/) ?? [];

test("the topbar is a fixed-height window-drag region on the topbar row token", () => {
	expect(shellSource).not.toContain("<header");
	expect(shellSource).not.toContain("grid-rows-[auto_1fr]");
	const classes = classAttribute(openingTag);
	expect(openingTag).toContain('data-testid="topbar"');
	expect(classes).toContain("window-drag");
	expect(classes).toContain("min-w-0");
	expect(classes).toContain("select-none");
	expect(classes).toContain("h-topbar-row");
	expect(classes.some((c) => /^py-/.test(c))).toBe(false);
});

test("application settings live in the navigation footer outside native drag regions", () => {
	expect(menuSource).toContain('data-testid="navigation-footer"');
	expect(menuSource).toContain("window-no-drag");
	expect(menuSource).toContain('data-testid="app-menu"');
	expect(menuSource).toContain('data-testid="open-settings"');
	expect(shellSource).not.toContain('data-testid="open-settings"');
});

test("the topbar reserves host-published window-chrome insets at both edges through width tokens", () => {
	for (const edge of ["left", "right"]) {
		const spacer = [...shellSource.matchAll(jsxTag("div"))]
			.map((m) => m[0])
			.find((tag) => tag.includes(`data-testid="window-chrome-inset-${edge}"`));
		expect(spacer).toContain('aria-hidden="true"');
		expect(spacer).toBeDefined();
		expect(classAttribute(spacer ?? "")).toContain(`w-window-chrome-inset-${edge}`);
	}
});

test("the native window controls mount once, positioned after the right inset spacer, and the header is a positioning root", () => {
	const classes = classAttribute(openingTag);
	expect(classes).toContain("relative");
	const controlMatches = [...shellSource.matchAll(/<NativeWindowControls\b/g)];
	expect(controlMatches).toHaveLength(1);
	const controlIndex = controlMatches[0]?.index;
	const insetRightIndex = shellSource.indexOf('data-testid="window-chrome-inset-right"');
	expect(insetRightIndex).toBeGreaterThanOrEqual(0);
	expect(controlIndex).toBeDefined();
	expect(controlIndex ?? -1).toBeGreaterThan(insetRightIndex);
});
