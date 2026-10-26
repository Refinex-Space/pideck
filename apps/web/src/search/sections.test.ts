import { describe, expect, test } from "bun:test";
import { RiChat2Line, RiCommandLine, RiGitBranchLine, RiHeading } from "@remixicon/react";
import { currentTranslator } from "@thinkrail/locales/react";
import { EMPTY_LEARNING, recordPick } from "./learning";
import type { PaletteItem } from "./model";
import { parseSearchQuery } from "./query";
import { askEligible, buildSections, flattenRows, startEligible, startPrompt } from "./sections";

const chat = (id: string, title: string, extra: Partial<PaletteItem> = {}): PaletteItem => ({
	id: `chat:${id}`,
	kind: "chat",
	title,
	group: "chats",
	scope: "work",
	icon: RiChat2Line,
	...extra,
});
const workspace = (id: string, title: string, extra: Partial<PaletteItem> = {}): PaletteItem => ({
	id: `workspace:${id}`,
	kind: "workspace",
	title,
	group: "workspaces",
	scope: "work",
	icon: RiGitBranchLine,
	...extra,
});
const command = (id: string, title: string): PaletteItem => ({
	id: `command:${id}`,
	kind: "command",
	title,
	group: "commands",
	scope: "commands",
	icon: RiCommandLine,
});

const rootItems = [
	chat("a", "Fix auth token refresh", { attention: "needs-input" }),
	chat("b", "Auth flow follow-ups", { attention: "unread" }),
	chat("c", "Billing redesign", { attention: "running" }),
	workspace("w1", "Fix Auth Refresh"),
	workspace("w2", "Old experiment"),
	command("new", "New workspace…"),
	command("theme", "Change theme…"),
	...Array.from({ length: 6 }, (_, index) => chat(`x${index}`, `Auth note ${index}`)),
];

function sections(raw: string, extra: Partial<Parameters<typeof buildSections>[0]> = {}) {
	return buildSections({
		t: currentTranslator(),
		parsed: parseSearchQuery(raw),
		rootItems,
		waiting: [rootItems[0] as PaletteItem],
		actions: [rootItems[5] as PaletteItem],
		expanded: new Set(),
		learning: EMPTY_LEARNING,
		nowMs: 0,
		...extra,
	});
}

describe("buildSections", () => {
	test("the empty query shows waiting, recent and actions", () => {
		const learning = recordPick(EMPTY_LEARNING, "", "command:theme", 0);
		expect(sections("", { learning }).map((section) => section.id)).toEqual([
			"waiting",
			"recent",
			"actions",
		]);
	});

	test("a row never appears twice: Recent skips what Waiting and Actions already show", () => {
		let learning = recordPick(EMPTY_LEARNING, "", "command:new", 0);
		learning = recordPick(learning, "", "chat:a", 0);
		learning = recordPick(learning, "", "command:theme", 0);
		const rows = flattenRows(sections("", { learning }));
		const ids = rows.map((row) => row.item.id);
		expect(new Set(ids).size).toBe(ids.length);
		expect(ids).toContain("command:theme");
	});

	test("a bare prefix lists its scope grouped, without the empty-state sections", () => {
		const result = sections(">");
		expect(result.map((section) => section.id)).toEqual(["commands"]);
		expect(flattenRows(result)).toHaveLength(2);
	});

	test("text groups by kind, caps All at four rows with a more row, and skips an unclear top hit", () => {
		const result = sections("auth");
		expect(result[0]?.id).not.toBe("top");
		const chats = result.find((section) => section.id === "chats");
		expect(chats?.items.length).toBe(5);
		expect(chats?.items.at(-1)?.item).toMatchObject({
			kind: "more",
			more: { kind: "scope", scope: "work" },
		});
	});

	test("a scope lifts the cap and never shows a top hit", () => {
		const result = sections("@auth");
		expect(
			result
				.find((section) => section.id === "chats")
				?.items.every((row) => row.item.kind !== "more"),
		).toBe(true);
		expect(result.some((section) => section.id === "top")).toBe(false);
	});

	test("the start row closes a typed query in All and Work, never in another scope, and opens the dialog with the text", () => {
		const opened: string[] = [];
		const start = { openDialog: (text: string) => opened.push(text) };
		const withStart = (raw: string) =>
			sections(raw, { start: { start, text: raw.replace(/^[@>]/, "").trim() } });
		const last = (raw: string) => withStart(raw).at(-1);
		expect(last("ship the thing")).toMatchObject({ id: "start" });
		expect(last("ship the thing")?.items[0]?.item).toMatchObject({
			kind: "start",
			title: "Start work with “ship the thing”…",
		});
		last("ship the thing")?.items[0]?.item.run?.();
		expect(opened).toEqual(["ship the thing"]);
		expect(last("@ship")?.id).toBe("start");
		expect(last(">ship")?.id).not.toBe("start");
		expect(flattenRows(withStart("zzz-no-match"))).toHaveLength(1);
		expect(startEligible(parseSearchQuery("/ship"))).toBe(false);
		expect(startEligible(parseSearchQuery("   "))).toBe(false);
	});

	test("in the specs scope the Ask the agent row is always last, after title matches and sections, and never elsewhere", () => {
		const asked: string[] = [];
		const ask = { ask: (text: string) => asked.push(text), target: "Default" };
		const section: PaletteItem = {
			id: "section:w1:SPEC.md:7",
			kind: "section",
			title: "Sample › Goal",
			group: "sections",
			scope: "specs",
			icon: RiHeading,
			match: { tier: 5, score: 3, ranges: {} },
		};
		const spec: PaletteItem = {
			...section,
			id: "spec:w1:SPEC.md",
			kind: "spec",
			title: "Goal keeper",
			group: "specs",
			match: { tier: 1, score: 1, ranges: {} },
		};
		const scoped = (raw: string, items: PaletteItem[]) =>
			sections(raw, { rootItems: items, ask: { ask, text: raw.slice(1) } });
		expect(scoped("#goal", [section, spec]).map((group) => group.id)).toEqual([
			"specs",
			"sections",
			"ask",
		]);
		const [row] = scoped("#goal", []).at(-1)?.items ?? [];
		expect(row?.item).toMatchObject({
			kind: "ask",
			title: "Ask the agent: “goal”",
			subtitle: "New chat in Default · the agent finds the sections and cites them",
			shortcut: { key: "↵", alt: true },
		});
		row?.item.run?.();
		expect(asked).toEqual(["goal"]);
		expect(sections("goal", { ask: { ask, text: "goal" } }).at(-1)?.id).not.toBe("ask");
		expect(askEligible(parseSearchQuery("@goal"))).toBe(false);
		expect(askEligible(parseSearchQuery("#  "))).toBe(false);
		const untargeted = sections("#goal", { ask: { ask: { ask: () => {} }, text: "goal" } });
		expect(untargeted.at(-1)?.items[0]?.item.subtitle).toBe(
			"New chat · the agent finds the sections and cites them",
		);
	});

	test("the prompt is the text as typed: the scope prefix goes, inner whitespace and quotes stay", () => {
		const raw = "  replace 'a  b' with 'a b'  ";
		expect(startPrompt(raw, parseSearchQuery(raw))).toBe("replace 'a  b' with 'a b'");
		expect(startPrompt("@ fix  it", parseSearchQuery("@ fix  it"))).toBe("fix  it");
		expect(startPrompt("#812", parseSearchQuery("#812"))).toBe("#812");
	});

	test("a scoped group past its cap ends in a more row that expands it in place", () => {
		const many = Array.from({ length: 35 }, (_, index) => chat(`m${index}`, `Many ${index}`));
		const collapsed = sections("@", { rootItems: many });
		const chats = collapsed.find((section) => section.id === "chats");
		expect(chats?.items).toHaveLength(31);
		expect(chats?.items.at(-1)?.item.more).toEqual({
			kind: "expand",
			group: "chats",
			nextId: "chat:m30",
		});
		const expanded = sections("@", { rootItems: many, expanded: new Set(["chats"]) });
		expect(expanded.find((section) => section.id === "chats")?.items).toHaveLength(35);
	});

	test("host hits beyond the returned page count into the more row in All and into the meta of a scope", () => {
		const two = [chat("h1", "Auth one"), chat("h2", "Auth two")];
		const all = sections("auth", { rootItems: two, hostOverflow: { chats: 18 } });
		const chats = all.find((section) => section.id === "chats");
		expect(chats?.meta).toBe("20");
		expect(chats?.items.at(-1)?.item).toMatchObject({
			kind: "more",
			title: "18 more in Chats",
			more: { kind: "scope", scope: "work" },
		});
		const scoped = sections("@auth", { rootItems: two, hostOverflow: { chats: 18 } });
		const scopedChats = scoped.find((section) => section.id === "chats");
		expect(scopedChats?.meta).toBe("20 matches · showing 2, refine the query for the rest");
		expect(scopedChats?.items.every((row) => row.item.kind !== "more")).toBe(true);
	});
});
