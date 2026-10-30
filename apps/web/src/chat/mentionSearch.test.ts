import { describe, expect, it } from "bun:test";
import type { FileNode } from "@thinkrail/contracts";
import {
	browseMentionNodes,
	mentionedPaths,
	planMention,
	rankMentionNodes,
	splitPath,
} from "./mentionSearch";

const node = (path: string, kind: FileNode["kind"] = "file"): FileNode => ({
	path,
	name: path.slice(path.lastIndexOf("/") + 1),
	kind,
});

describe("planMention", () => {
	it("browses for a bare @ or a typed separator and searches a bare name", () => {
		expect(planMention(null)).toEqual({ kind: "none" });
		expect(planMention("")).toEqual({ kind: "browse", dir: "", prefix: "" });
		expect(planMention("src/ap")).toEqual({ kind: "browse", dir: "src", prefix: "ap" });
		expect(planMention("src\\ap")).toEqual({ kind: "browse", dir: "src", prefix: "ap" });
		expect(planMention("App")).toEqual({ kind: "search", query: "app" });
	});
});

describe("rankMentionNodes", () => {
	it("ranks exact name, name prefix, name substring, then path match", () => {
		const nodes = [
			node("src/deep/app.ts.bak"),
			node("docs/myapp.md"),
			node("app/index.ts"),
			node("src/app.ts"),
			node("app", "dir"),
		];
		expect(rankMentionNodes(nodes, "app").map((c) => c.path)).toEqual([
			"app",
			"src/app.ts",
			"src/deep/app.ts.bak",
			"docs/myapp.md",
			"app/index.ts",
		]);
	});

	it("caps the list", () => {
		const nodes = Array.from({ length: 60 }, (_, i) => node(`f${i}.ts`));
		expect(rankMentionNodes(nodes, "f")).toHaveLength(40);
	});
});

describe("browseMentionNodes", () => {
	it("keeps the folder order and filters by prefix", () => {
		const nodes = [node("src", "dir"), node("scripts", "dir"), node("README.md")];
		expect(browseMentionNodes(nodes, "s").map((c) => c.path)).toEqual(["src", "scripts"]);
	});
});

describe("mentionedPaths and splitPath", () => {
	it("collects mentions with and without trailing punctuation", () => {
		expect(mentionedPaths("see @src/a.ts, then @b。 mail x@y.com")).toEqual([
			"src/a.ts,",
			"src/a.ts",
			"b。",
			"b",
		]);
	});

	it("splits a path, ignoring a trailing slash", () => {
		expect(splitPath("src/lib/")).toEqual({ dir: "src", name: "lib" });
		expect(splitPath("README.md")).toEqual({ dir: "", name: "README.md" });
	});
});
