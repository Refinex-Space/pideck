import { fileMoveProjection } from "../../lib";
import type { LayoutCenterNode, LayoutCenterTab, WorkspaceLayoutDocument } from "./types";

export function moveLayoutFilePaths(
	document: WorkspaceLayoutDocument,
	from: string,
	to: string,
	preserved: readonly string[] = [],
): WorkspaceLayoutDocument {
	const paths: string[] = [];
	const collect = (node: LayoutCenterNode) => {
		if (node.kind === "split") node.children.forEach(collect);
		else for (const tab of node.tabs) if (tab.kind === "file") paths.push(tab.path);
	};
	collect(document.center);
	const projection = fileMoveProjection(paths, from, to, preserved);
	const visit = (node: LayoutCenterNode): LayoutCenterNode => {
		if (node.kind === "split") {
			const children: [LayoutCenterNode, LayoutCenterNode] = [
				visit(node.children[0]),
				visit(node.children[1]),
			];
			return children.every((child, i) => child === node.children[i])
				? node
				: { ...node, children };
		}
		const tabs = node.tabs.flatMap((tab): LayoutCenterTab[] => {
			if (tab.kind !== "file") return [tab];
			const path = projection.get(tab.path);
			if (path === null) return [];
			if (path === undefined) return [tab];
			if (path !== tab.path) return [{ ...tab, path, name: path.split("/").at(-1) ?? path }];
			return [tab];
		});
		if (tabs.length === node.tabs.length && tabs.every((tab, i) => tab === node.tabs[i]))
			return node;
		const next = { ...node, tabs };
		if (next.previewTabId && !tabs.some((tab) => tab.id === next.previewTabId))
			delete next.previewTabId;
		return next;
	};
	const center = visit(document.center);
	return center === document.center ? document : { ...document, center };
}
