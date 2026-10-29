import { describe, expect, test } from "bun:test";
import { applyLocale } from "@thinkrail/locales/react";
import { TooltipProvider } from "@thinkrail/ui/tooltip";
import { renderToStaticMarkup } from "react-dom/server";
import type { ChatRow } from "./rows";
import { ChatTurnView } from "./turns";

function renderRow(row: ChatRow, isFinalAnswer: boolean): string {
	return renderToStaticMarkup(
		<TooltipProvider>
			<ChatTurnView row={row} agentResponded isFinalAnswer={isFinalAnswer} />
		</TooltipProvider>,
	);
}

describe("message copy layout", () => {
	test("shows the assistant copy action in a hover strip under the message, on the left", () => {
		const html = renderRow({ kind: "markdown", id: "answer", text: "100. Final answer" }, true);

		expect(html).toContain("list-inside");
		expect(html).toContain('data-testid="message-actions"');
		expect(html).toContain("justify-start");
		expect(html).not.toContain("absolute");
	});

	test("shows the user copy action in a hover strip under the bubble, on the right", () => {
		const html = renderRow(
			{
				kind: "user",
				id: "prompt",
				message: { role: "user", content: "User prompt", timestamp: 0 },
			},
			false,
		);

		expect(html).toContain('data-testid="message-actions"');
		expect(html).toContain("justify-end");
		expect(html).not.toContain("border-bubble-user-border");
	});
});

describe("system and failure notices", () => {
	test("an extension notice keeps its text; the round closer and failure notices follow the language", () => {
		expect(renderRow({ kind: "system", id: "n", text: "Just so you know" }, false)).toContain(
			"Just so you know",
		);
		expect(renderRow({ kind: "system", id: "done" }, false)).toContain("✓ Done");
		applyLocale("de", {
			de: { "chat.turn.done": "✓ Fertig", "chat.failure.truncated": "Antwort abgeschnitten." },
		});
		try {
			expect(renderRow({ kind: "system", id: "done" }, false)).toContain("✓ Fertig");
			expect(
				renderRow({ kind: "error", id: "e", text: "", failure: "truncated" }, false),
			).toContain("Antwort abgeschnitten.");
			expect(
				renderRow({ kind: "error", id: "e", text: "429 rate limited", failure: "error" }, false),
			).toContain("429 rate limited");
		} finally {
			applyLocale("en", {});
		}
	});
});
