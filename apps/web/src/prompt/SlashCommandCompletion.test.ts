import { describe, expect, it } from "bun:test";
import type { SlashCommandInfo } from "@thinkrail/contracts";
import {
	matchSlashCommands,
	slashCommandCatalogOrEmpty,
	slashCompletionKeyAction,
} from "./SlashCommandCompletion";
import { detectPromptTrigger } from "./triggers";

function command(name: string): SlashCommandInfo {
	return {
		name,
		description: `${name} description`,
		source: "skill",
		sourceInfo: {
			path: `/skills/${name}/SKILL.md`,
			source: "fixture",
			scope: "project",
			origin: "top-level",
		},
	};
}

function slash(text: string) {
	return detectPromptTrigger(text, text.length);
}

describe("slash command matching", () => {
	it("matches case-insensitively and caps the list", () => {
		const commands = Array.from({ length: 30 }, (_, index) => command(`Skill-${index}`));
		expect(matchSlashCommands(slash("/skill-"), commands)).toHaveLength(20);
		expect(matchSlashCommands(slash("/SKILL-1"), commands).map((item) => item.name)).toContain(
			"Skill-1",
		);
		expect(matchSlashCommands(null, commands)).toEqual([]);
		expect(matchSlashCommands(slash("@file"), commands)).toEqual([]);
	});

	it("ranks a name prefix, then the part after the colon, then a substring", () => {
		const names = ["x-review", "skill:review", "review-all"].map(command);
		expect(matchSlashCommands(slash("/review"), names).map((item) => item.name)).toEqual([
			"review-all",
			"skill:review",
			"x-review",
		]);
	});

	it("groups by source and offers only skills away from the draft start", () => {
		const mixed: SlashCommandInfo[] = [
			{ ...command("dag"), source: "extension" },
			{ ...command("skill:doc"), source: "skill" },
		];
		expect(matchSlashCommands(slash("/"), mixed).map((item) => item.name)).toEqual([
			"skill:doc",
			"dag",
		]);
		expect(matchSlashCommands(slash("write /"), mixed).map((item) => item.name)).toEqual([
			"skill:doc",
		]);
	});

	it("degrades an empty or failed optional catalog to no matches", async () => {
		expect(await slashCommandCatalogOrEmpty(async () => [])).toEqual([]);
		expect(
			await slashCommandCatalogOrEmpty(async () => {
				throw new Error("host unavailable");
			}),
		).toEqual([]);
	});
});

describe("slash completion keyboard reducer", () => {
	it("wraps arrow navigation", () => {
		expect(slashCompletionKeyAction("ArrowDown", true, 2, 3)).toEqual({
			type: "move",
			index: 0,
		});
		expect(slashCompletionKeyAction("ArrowUp", true, 0, 3)).toEqual({
			type: "move",
			index: 2,
		});
	});

	it("selects on Enter or Tab and dismisses on Escape", () => {
		expect(slashCompletionKeyAction("Enter", true, 1, 3)).toEqual({
			type: "select",
			index: 1,
		});
		expect(slashCompletionKeyAction("Tab", true, 1, 3)).toEqual({
			type: "select",
			index: 1,
		});
		expect(slashCompletionKeyAction("Escape", true, 1, 3)).toEqual({ type: "dismiss" });
		expect(slashCompletionKeyAction("Enter", false, 1, 3)).toEqual({ type: "none" });
	});
});
