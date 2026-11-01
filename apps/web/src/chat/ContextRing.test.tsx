import { expect, test } from "bun:test";
import { TooltipProvider } from "@thinkrail/ui/tooltip";
import { renderToStaticMarkup } from "react-dom/server";
import { ContextRing } from "./ContextRing";
import type { ContextSummary } from "./contextUsage";

const render = (summary: ContextSummary | null) =>
	renderToStaticMarkup(
		<TooltipProvider>
			<ContextRing summary={summary} />
		</TooltipProvider>,
	);

const summary = (
	percent: number | null,
	tone: ContextSummary["tone"] = "info",
): ContextSummary => ({
	percent,
	tokens: percent === null ? null : 474_000,
	contextWindow: 828_000,
	tone,
});

test("the ring names the share, the counted tokens and the window", () => {
	const html = render(summary(57.2));
	expect(html).toContain('aria-label="57.2% (474k / 828k) context used"');
	expect(html).toContain('data-percent="57"');
	expect(html).toContain('data-testid="context-ring-progress"');
});

test("the arc is the used share of the circumference", () => {
	const circumference = 2 * Math.PI * 6;
	const html = render(summary(25));
	expect(html).toContain(
		`stroke-dasharray="${(0.25 * circumference).toString()} ${circumference.toString()}"`,
	);
});

test("warning and error tones recolor the arc, and an empty ring has no arc", () => {
	expect(render(summary(85, "warning"))).toContain("stroke-feedback-warning");
	expect(render(summary(97, "error"))).toContain("stroke-feedback-error");
	expect(render(summary(30))).toContain("stroke-text-default");
	for (const unknown of [null, summary(null), summary(0)]) {
		expect(render(unknown)).not.toContain("context-ring-progress");
	}
	expect(render(null)).toContain("Context size is unknown until the next response.");
});
