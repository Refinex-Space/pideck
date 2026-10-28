import { expect, test } from "bun:test";
import { TooltipProvider } from "@thinkrail/ui/tooltip";
import { renderToStaticMarkup } from "react-dom/server";
import { useAppStore } from "../store";
import { LayoutSettings } from "./LayoutSettings";
import { BUILTIN_LAYOUT_PRESETS } from "./layout";

test("Studio leads the display with an on-demand description without reordering the preset catalog", () => {
	const previous = useAppStore.getState().customLayoutPresets;
	useAppStore.setState({ customLayoutPresets: [] });
	try {
		const markup = renderToStaticMarkup(
			<TooltipProvider>
				<LayoutSettings />
			</TooltipProvider>,
		);
		expect([...markup.matchAll(/data-preset-id="([^"]+)"/g)].map((match) => match[1])).toEqual([
			"studio",
			"balanced",
			"focus",
			"review",
		]);
		expect(markup).toContain(
			"Project navigation stays visible; files, reviews, and terminals open when needed.",
		);
		expect(BUILTIN_LAYOUT_PRESETS.map((preset) => preset.id)).toEqual([
			"balanced",
			"focus",
			"review",
			"studio",
		]);
	} finally {
		useAppStore.setState({ customLayoutPresets: previous });
	}
});
