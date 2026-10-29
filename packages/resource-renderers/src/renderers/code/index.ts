import { i18n } from "@thinkrail/locales/react";
import type { ResourceRenderer } from "../../registry";

export const codeRenderer: ResourceRenderer = {
	id: "thinkrail/code",
	labelKey: "viewer.renderer.source",
	match: { text: true },
	rank: 100,
	capabilities: {
		view: true,
		diff: true,
		anchors: { view: ["line"], diff: ["line"] },
		mobile: true,
		copy: true,
		layout: true,
		whitespace: true,
		boundedDiff: "large",
		preload: true,
	},
	loadView: async ({ mobile }) => {
		if (mobile) return import("./PierreFile");
		const language = i18n.language.toLowerCase();
		if (language.startsWith("zh")) await import("monaco-editor/nls/lang/zh-cn.js");
		else if (language.startsWith("ja")) await import("monaco-editor/nls/lang/ja.js");
		else if (language.startsWith("es")) await import("monaco-editor/nls/lang/es.js");
		return import("../../support/MonacoEditor");
	},
	loadDiff: () => import("./PierreDiff"),
};
