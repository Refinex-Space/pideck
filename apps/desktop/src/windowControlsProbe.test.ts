import { expect, test } from "bun:test";
import { runInNewContext } from "node:vm";
import { windowControlsProbeScript } from "./windowControlsProbe";

test("native caption probe clicks localized buttons only in the expected window state", () => {
	for (const maximized of [false, true]) {
		let clicked = 0;
		const attributes: Record<string, string> = {
			"data-testid": "window-maximize",
			"data-maximized": String(maximized),
			"aria-label": maximized ? "还原" : "最大化",
		};
		const document = {
			querySelector(selector: string) {
				const matches = [...selector.matchAll(/\[([^=]+)="([^"]+)"\]/g)].every(
					(match) => attributes[match[1] || ""] === match[2],
				);
				return matches ? { click: () => clicked++ } : null;
			},
		};
		runInNewContext(windowControlsProbeScript(maximized), { document, Date, setTimeout: () => {} });
		expect(clicked).toBe(1);
		runInNewContext(windowControlsProbeScript(!maximized), {
			document,
			Date,
			setTimeout: () => {},
		});
		expect(clicked).toBe(1);
	}
});
