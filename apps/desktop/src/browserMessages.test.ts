import { expect, test } from "bun:test";
import { browserMessage, readBrowserSelection } from "./browserMessages";

const selection = {
	pageUrl: "http://localhost:3000/",
	pageTitle: "Fixture",
	tagName: "button",
	selector: "#save",
	xpath: "/html/body/button",
	text: "Save",
	accessibleName: "Save",
	role: "button",
	html: "<button>Save</button>",
	attributes: { id: "save" },
	style: { color: "rgb(0, 0, 0)" },
	rect: { x: 1, y: 2, width: 100, height: 32 },
};

test("decodes the SDK event envelope without accepting unbounded page payloads", () => {
	expect(browserMessage(JSON.stringify(JSON.stringify({ kind: "ready" })))).toEqual({
		kind: "ready",
	});
	expect(browserMessage("x".repeat(40001))).toBeNull();
	expect(browserMessage("not json")).toBeNull();
	expect(browserMessage([])).toBeNull();
});

test("validates selection fields, URLs, sizes and finite geometry", () => {
	expect(readBrowserSelection(selection)).toEqual(selection);
	for (const patch of [
		{ pageUrl: "javascript:alert(1)" },
		{ html: "x".repeat(8193) },
		{ rect: { ...selection.rect, width: Number.NaN } },
		{ style: { font: 1 } },
		{ attributes: null },
	])
		expect(readBrowserSelection({ ...selection, ...patch })).toBeNull();
});
