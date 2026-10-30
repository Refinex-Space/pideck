import { expect, test } from "bun:test";
import { DEFAULT_LSP_CONFIG } from "@thinkrail/contracts";
import { applyLspUpdate, normalizeLspConfig, validateOverride } from "./config";

test("anything unusable normalizes to the defaults, field by field", () => {
	expect(normalizeLspConfig(undefined)).toEqual(DEFAULT_LSP_CONFIG);
	expect(normalizeLspConfig("nope")).toEqual(DEFAULT_LSP_CONFIG);
	expect(
		normalizeLspConfig({
			enabled: true,
			diagnostics: "yes",
			idleMinutes: 9999,
			servers: { Bad: {}, go: { disabled: true } },
		}),
	).toEqual({ ...DEFAULT_LSP_CONFIG, enabled: true, servers: { go: { disabled: true } } });
});

test("a catalog server may be tuned or switched off, a custom one must say how to run", () => {
	expect(validateOverride("typescript", { disabled: true })).toEqual({ disabled: true });
	expect(
		validateOverride("typescript", { env: { A: "1" }, initialization: { a: { b: 1 } } }),
	).toEqual({
		env: { A: "1" },
		initialization: { a: { b: 1 } },
	});
	expect(
		validateOverride("mine", { command: ["mine-ls", "--stdio"], extensions: [".mine", ".mine"] }),
	).toEqual({
		command: ["mine-ls", "--stdio"],
		extensions: [".mine"],
	});
	expect(() => validateOverride("mine", { command: ["mine-ls"] })).toThrow(
		"needs a command and at least one extension",
	);
	expect(validateOverride("mine", { disabled: true })).toEqual({ disabled: true });
});

test("bad overrides are refused with a reason", () => {
	expect(() => validateOverride("Has Space", {})).toThrow("lowercase letters");
	expect(() => validateOverride("go", "x")).toThrow("must be an object");
	expect(() => validateOverride("go", { disabled: "no" })).toThrow('"disabled"');
	expect(() => validateOverride("go", { command: [] })).toThrow("needs an executable");
	expect(() => validateOverride("go", { command: ["a", 1] })).toThrow("list of at most");
	expect(() => validateOverride("go", { extensions: ["ts"] })).toThrow("starts with a dot");
	expect(() => validateOverride("go", { env: { A: 1 } })).toThrow("map names to strings");
	expect(() => validateOverride("go", { initialization: { big: "x".repeat(20_000) } })).toThrow(
		"under 16 KB",
	);
});

test("an update changes what it names, removes with null, and refuses the rest whole", () => {
	const base = { ...DEFAULT_LSP_CONFIG, servers: { go: { disabled: true } } };
	const next = applyLspUpdate(base, {
		enabled: true,
		idleMinutes: 30,
		servers: { go: null, mine: { command: ["m"], extensions: [".m"] } },
	});
	expect(next).toEqual({
		...DEFAULT_LSP_CONFIG,
		enabled: true,
		idleMinutes: 30,
		servers: { mine: { command: ["m"], extensions: [".m"] } },
	});
	expect(base.servers).toEqual({ go: { disabled: true } });
	expect(() => applyLspUpdate(base, { enabled: "on" })).toThrow('"enabled"');
	expect(() => applyLspUpdate(base, { idleMinutes: 0 })).toThrow("whole number");
	expect(() => applyLspUpdate(base, { surprise: true })).toThrow("Unknown language server setting");
	expect(() => applyLspUpdate(base, 5)).toThrow("must be an object");
	expect(() => applyLspUpdate(base, { servers: { mine: { command: ["m"] } } })).toThrow(
		"custom server",
	);
});
