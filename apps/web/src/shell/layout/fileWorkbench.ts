import { t } from "@thinkrail/locales/react";
import type { LayoutAttention } from "../../lib";
import { isToolShowing } from "./auxiliaryPresentation";
import {
	closeLayoutTab,
	collectCenterGroups,
	createAuxiliaryGroup,
	createLayoutId,
	findPlacedResource,
	findTabLocation,
	isLayoutUnavailable,
	LAYOUT_LIMITS,
	type LayoutOperationResult,
	openCenterTab,
	revealTool,
	selectTab,
	toolTab,
} from "./model";
import type { LayoutCenterNode, LayoutFileResourceTab, WorkspaceLayoutDocument } from "./types";

import { FILE_WORKBENCH_GROUP } from "./types";

export function conversationCenter(node: LayoutCenterNode): LayoutCenterNode | null {
	if (node.kind === "group") return node.id === FILE_WORKBENCH_GROUP ? null : node;
	const left = conversationCenter(node.children[0]);
	const right = conversationCenter(node.children[1]);
	if (!left) return right;
	if (!right) return left;
	return left === node.children[0] && right === node.children[1]
		? node
		: { ...node, children: [left, right] };
}

export function openFileWorkbench(
	document: WorkspaceLayoutDocument,
	tab: LayoutFileResourceTab,
	intent: "preview" | "keep",
	claimPreview: boolean,
	maxSideGroups: number,
	maxBottomGroups: number,
	revealNavigator = true,
): LayoutOperationResult {
	let next = document;
	const placed = findPlacedResource(next, tab);
	const location = placed ? findTabLocation(next, placed.id) : null;
	if (placed && location?.groupId !== FILE_WORKBENCH_GROUP)
		next = closeLayoutTab(next, placed.id).document;
	if (!collectCenterGroups(next.center).some((group) => group.id === FILE_WORKBENCH_GROUP)) {
		if (collectCenterGroups(next.center).length >= LAYOUT_LIMITS.maxCenterGroups)
			return {
				reason: t("workbench.layout.centerGroupLimit", { limit: LAYOUT_LIMITS.maxCenterGroups }),
			};
		next = {
			...next,
			center: {
				kind: "split",
				id: createLayoutId("file-workbench-split"),
				direction: "horizontal",
				weights: [0.5, 0.5],
				children: [next.center, { kind: "group", id: FILE_WORKBENCH_GROUP, tabs: [] }],
			},
		};
	}
	const opened = openCenterTab(next, tab, FILE_WORKBENCH_GROUP, intent, claimPreview);
	if (isLayoutUnavailable(opened) || !revealNavigator) return opened;
	const revealed = revealTool(opened.document, "files", maxSideGroups, maxBottomGroups);
	if (isLayoutUnavailable(revealed)) return revealed;
	const files = findPlacedResource(revealed.document, toolTab("files"));
	if (files && findTabLocation(revealed.document, files.id)?.area !== "right") {
		const relocated = createAuxiliaryGroup(
			revealed.document,
			"right",
			toolTab("files"),
			revealed.document.right.groups.length,
			maxSideGroups,
		);
		return isLayoutUnavailable(relocated) ? relocated : { ...opened, document: relocated.document };
	}
	return { ...opened, document: revealed.document };
}

export function migrateLegacyFiles(
	document: WorkspaceLayoutDocument,
	maxSideGroups: number,
	maxBottomGroups: number,
): LayoutOperationResult {
	const legacy = collectCenterGroups(document.center)
		.filter((group) => group.id !== FILE_WORKBENCH_GROUP)
		.flatMap((group) =>
			group.tabs
				.filter((tab) => tab.kind === "file" || tab.kind === "diff" || tab.kind === "changes")
				.map((tab) => ({ tab, preview: group.previewTabId === tab.id })),
		);
	const previewIndex = legacy.findLastIndex((entry) => entry.preview);
	let next = document;
	for (const [index, { tab, preview }] of legacy.entries()) {
		const result = openFileWorkbench(
			next,
			tab,
			preview && index === previewIndex ? "preview" : "keep",
			false,
			maxSideGroups,
			maxBottomGroups,
		);
		if (isLayoutUnavailable(result)) return result;
		next = result.document;
	}
	return { document: next };
}

export function isFileWorkbenchVisible(
	document: WorkspaceLayoutDocument,
	attention: LayoutAttention,
): boolean {
	return (
		document.right.visible &&
		(["files", "specs"] as const).some(
			(tool) =>
				document.right.groups.some((group) =>
					group.tabs.some((tab) => tab.kind === "tool" && tab.tool === tool),
				) && isToolShowing(document, attention, tool),
		)
	);
}

export function selectFileWorkbenchNavigator(
	document: WorkspaceLayoutDocument,
	attention: LayoutAttention,
): LayoutAttention {
	if (
		isToolShowing(document, attention, "specs") &&
		document.right.groups.some((group) =>
			group.tabs.some((tab) => tab.kind === "tool" && tab.tool === "specs"),
		)
	)
		return attention;
	const files = findPlacedResource(document, toolTab("files"));
	const location = files ? findTabLocation(document, files.id) : null;
	return files && location?.area === "right"
		? selectTab(attention, location, files.id, false)
		: attention;
}
