import { describe, expect, it } from "bun:test";
import { applyPromptCompletion, detectPromptTrigger } from "./triggers";

describe("detectPromptTrigger", () => {
	it("opens a slash menu at the draft start and marks it leading", () => {
		expect(detectPromptTrigger("/ski", 4)).toEqual({
			kind: "slash",
			query: "ski",
			start: 0,
			end: 4,
			leading: true,
		});
		expect(detectPromptTrigger("  /ski", 6)?.leading).toBe(true);
	});

	it("opens a slash menu mid-text but not as leading", () => {
		const trigger = detectPromptTrigger("polish /ski", 11);
		expect(trigger).toMatchObject({ kind: "slash", query: "ski", start: 7, leading: false });
	});

	it("opens a mention menu at any token start", () => {
		expect(detectPromptTrigger("read @src/a", 11)).toMatchObject({
			kind: "mention",
			query: "src/a",
			start: 5,
			leading: false,
		});
	});

	it("ignores a sigil that is not at the start of a token", () => {
		for (const text of ["src/a", "https://x.dev", "a@b.com", "1/2", "and/or"]) {
			expect(detectPromptTrigger(text, text.length)).toBeNull();
		}
	});

	it("closes once a space follows the sigil, so a plain slash is one space away", () => {
		expect(detectPromptTrigger("/ ", 2)).toBeNull();
		expect(detectPromptTrigger("/skill:a ", 9)).toBeNull();
	});

	it("covers the rest of the token after the caret but queries only up to it", () => {
		expect(detectPromptTrigger("/skill:abc rest", 6)).toMatchObject({
			query: "skill",
			start: 0,
			end: 10,
		});
	});
});

describe("applyPromptCompletion", () => {
	const trigger = (text: string, caret: number) => {
		const found = detectPromptTrigger(text, caret);
		if (!found) throw new Error("expected a trigger");
		return found;
	};

	it("replaces the whole token and places the caret after the insert", () => {
		expect(
			applyPromptCompletion("see @sr and more", trigger("see @sr and more", 7), "@src/"),
		).toEqual({ value: "see @src/ and more", caret: 9 });
	});

	it("adds one space after a finished token, but not a second one", () => {
		expect(applyPromptCompletion("/ski", trigger("/ski", 4), "/skill:a", true)).toEqual({
			value: "/skill:a ",
			caret: 9,
		});
		expect(applyPromptCompletion("/ski rest", trigger("/ski rest", 4), "/skill:a", true)).toEqual({
			value: "/skill:a rest",
			caret: 9,
		});
	});
});
