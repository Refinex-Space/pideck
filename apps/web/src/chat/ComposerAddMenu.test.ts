import { expect, test } from "bun:test";
import { composerAddAvailability } from "./ComposerAddMenu";

test("images and files are always on; commands and templates wait for an empty draft", () => {
	expect(composerAddAvailability({ draftEmpty: true, skillCount: 2 })).toEqual({
		images: true,
		files: true,
		skills: true,
		templates: true,
		commands: true,
	});
	expect(composerAddAvailability({ draftEmpty: false, skillCount: 2 })).toEqual({
		images: true,
		files: true,
		skills: true,
		templates: false,
		commands: false,
	});
});

test("skills are offered only when the chat has some", () => {
	expect(composerAddAvailability({ draftEmpty: true, skillCount: 0 }).skills).toBe(false);
});
