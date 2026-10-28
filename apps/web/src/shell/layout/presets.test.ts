import { expect, test } from "bun:test";
import { projectWorkbenchRatio } from "./auxiliaryPresentation";
import { LAYOUT_LIMITS } from "./model";
import { BUILTIN_LAYOUT_PRESETS, layoutPresetForViewport } from "./presets";

const studio = BUILTIN_LAYOUT_PRESETS.find((preset) => preset.id === "studio");
if (!studio) throw new Error("Studio preset is missing");

for (const viewportWidth of [2316, 1440, 1024]) {
	test(`Studio starts near 288px including its integrated toolbar at ${viewportWidth}px`, () => {
		const adjusted = layoutPresetForViewport(studio, viewportWidth);
		expect(adjusted.left.width * viewportWidth).toBeCloseTo(288, 5);
		const homeRatio = projectWorkbenchRatio(adjusted.left.width, viewportWidth, viewportWidth);
		expect(homeRatio * viewportWidth).toBeCloseTo(288, 5);
		expect(viewportWidth - 40 - adjusted.left.width * viewportWidth).toBeGreaterThanOrEqual(320);
		expect(studio.left.width).toBe(0.18);
	});
}

test("narrow Studio sizes reserve center space until the existing side minimum takes over", () => {
	expect(layoutPresetForViewport(studio, 640).left.width * 640).toBeCloseTo(280, 5);
	expect(layoutPresetForViewport(studio, 480).left.width * 480).toBeCloseTo(120, 5);
	expect(layoutPresetForViewport(studio, 390).left.width).toBe(LAYOUT_LIMITS.minSideWidth);
});

test("unavailable viewport geometry keeps the pure preset and other presets are never adapted", () => {
	for (const width of [undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
		expect(layoutPresetForViewport(studio, width)).toBe(studio);
	}
	for (const preset of BUILTIN_LAYOUT_PRESETS.filter((preset) => preset.id !== "studio")) {
		expect(layoutPresetForViewport(preset, 2316)).toBe(preset);
	}
});
