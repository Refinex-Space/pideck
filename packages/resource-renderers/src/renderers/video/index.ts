import type { ResourceRenderer } from "../../registry";

export const videoRenderer: ResourceRenderer = {
	id: "thinkrail/video",
	labelKey: "viewer.renderer.video",
	match: { glob: ["*.webm"], text: false },
	rank: 120,
	capabilities: {
		view: true,
		diff: false,
		anchors: { view: [], diff: [] },
		mobile: true,
		copy: false,
		layout: false,
		whitespace: false,
	},
	loadView: () => import("./View"),
};
