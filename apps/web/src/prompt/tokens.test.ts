import { describe, expect, it } from "bun:test";
import type { SlashCommandItem } from "./SlashCommandCompletion";
import { highlightSegments } from "./slotSession";
import { hoistSkillReference, promptSegments, scanPromptTokens } from "./tokens";

function item(name: string, source: SlashCommandItem["source"]): SlashCommandItem {
	return {
		name,
		source,
		sourceInfo: { path: `/x/${name}`, source: "fixture", scope: "user", origin: "top-level" },
	};
}

const commands = [
	item("skill:doc-craft", "skill"),
	item("skill:review", "skill"),
	item("compact", "builtin"),
	item("dag", "extension"),
];

describe("scanPromptTokens", () => {
	it("recognises a leading command of any source and mid-text skills only", () => {
		const text = "/compact tighten /skill:review /dag";
		const tokens = scanPromptTokens(text, { commands });
		expect(tokens.map((token) => [token.kind, text.slice(token.start, token.end)])).toEqual([
			["command", "/compact"],
			["skill", "/skill:review"],
		]);
	});

	it("leaves names outside the catalog as plain text", () => {
		expect(scanPromptTokens("ls /usr/bin /skill:nope", { commands })).toEqual([]);
	});

	it("recognises mentions and drops trailing punctuation from the path", () => {
		const text = "see @src/app.ts, and @README.md。";
		const tokens = scanPromptTokens(text, { commands });
		expect(tokens.map((token) => token.path)).toEqual(["src/app.ts", "README.md"]);
		expect(tokens.map((token) => text.slice(token.start, token.end))).toEqual([
			"@src/app.ts",
			"@README.md",
		]);
	});

	it("accepts any skill name for text already sent", () => {
		const text = "run /skill:ghost then /usr/bin";
		const tokens = scanPromptTokens(text, { commands: [], anySkill: true });
		expect(tokens.map((token) => text.slice(token.start, token.end))).toEqual(["/skill:ghost"]);
	});

	it("keeps only mentions the resolver confirms", () => {
		const tokens = scanPromptTokens("@a.ts @b.ts", {
			commands,
			hasPath: (path) => path === "b.ts",
		});
		expect(tokens.map((token) => token.path)).toEqual(["b.ts"]);
	});

	it("keeps a mid-token or mid-word sigil plain", () => {
		expect(scanPromptTokens("mail a@b.com or 看@README.md", { commands })).toEqual([]);
	});
});

describe("promptSegments", () => {
	it("joins back to the draft with and without tokens or slots", () => {
		const text = "write /skill:review about @src/a.ts now";
		const tokens = scanPromptTokens(text, { commands });
		expect(
			promptSegments(text, tokens)
				.map((segment) => segment.text)
				.join(""),
		).toBe(text);
		expect(promptSegments("", [])).toEqual([{ text: "", start: 0, slot: "plain" }]);
	});

	it("layers slot state under tokens", () => {
		const text = "/skill:review [topic]";
		const slots = [{ start: 14, end: 21, filled: false, group: 0 }];
		const segments = promptSegments(
			text,
			scanPromptTokens(text, { commands }),
			highlightSegments(text, slots as never, 0),
		);
		expect(segments.map((segment) => [segment.text, segment.token?.kind, segment.slot])).toEqual([
			["/skill:review", "skill", "plain"],
			[" ", undefined, "plain"],
			["[topic]", undefined, "active"],
		]);
	});
});

describe("hoistSkillReference", () => {
	it("moves the first mid-text skill to the front and keeps the request in order", () => {
		expect(hoistSkillReference("polish /skill:doc-craft this text", commands)).toBe(
			"/skill:doc-craft polish this text",
		);
		expect(hoistSkillReference("polish this /skill:doc-craft", commands)).toBe(
			"/skill:doc-craft polish this",
		);
	});

	it("keeps line breaks and further skills as text", () => {
		expect(
			hoistSkillReference("line one\n/skill:review\nline two /skill:doc-craft", commands),
		).toBe("/skill:review line one\n\nline two /skill:doc-craft");
	});

	it("leaves a draft that already opens with a slash token, or names no skill, untouched", () => {
		expect(hoistSkillReference("/compact then /skill:review", commands)).toBe(
			"/compact then /skill:review",
		);
		expect(hoistSkillReference("/unknown /skill:review", commands)).toBe("/unknown /skill:review");
		expect(hoistSkillReference("plain request", commands)).toBe("plain request");
	});

	it("returns the bare reference when nothing else is written", () => {
		expect(hoistSkillReference("see /skill:review", commands)).toBe("/skill:review see");
		expect(hoistSkillReference("  /skill:review", commands)).toBe("  /skill:review");
	});
});
