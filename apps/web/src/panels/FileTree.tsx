import type { FileNode } from "@thinkrail/contracts";
import { useT } from "@thinkrail/locales/react";
import { describeResource, PENDING_TEXT_META } from "@thinkrail/resource-renderers";
import { LoadingRegion } from "@thinkrail/ui/skeleton";
import { useEffect, useMemo, useRef, useState } from "react";
import { statusLetter } from "../chat/planView";
import { firstClickOnly } from "../lib";
import { selectFilesTreeView, type TabIntent, useAppStore } from "../store";
import { getTransport } from "../transport";
import { type ChangeMarks, statusMarkClass } from "./changesModel";
import { holdEditorWarm, useEditorWarm, warmOnHover } from "./editorWarm";
import { FileEntryActions } from "./FileEntryActions";
import { type ResolvedFolderChain, resolveFolderChain } from "./folderChains";
import { openFileInTab } from "./openTabs";
import { TreeRow } from "./TreeRow";
import { useWorkspaceRead } from "./useWorkspaceRead";

type SetPathsExpanded = (paths: readonly string[], expanded: boolean) => void;
type WarmFile = ((path: string) => void) | undefined;

interface TreeFocus {
	activePath: string | null;
	revealTarget: string | null;
	onRevealed: () => void;
}

export function FileTree({
	workspaceId,
	marks,
	...focus
}: TreeFocus & { workspaceId: string; marks: ChangeMarks }) {
	const t = useT();
	const [nodes, setNodes] = useState<FileNode[] | null>(null);
	const expanded = useAppStore((s) => selectFilesTreeView(s, workspaceId).expanded);
	const expandedPaths = useMemo(() => new Set(expanded), [expanded]);
	const warm = useEditorWarm();
	const warmFile: WarmFile = warm
		? (path) => warm(describeResource(workspaceId, path, PENDING_TEXT_META))
		: undefined;

	const setPathsExpanded: SetPathsExpanded = (paths, next) =>
		useAppStore.getState().setFilesTreeExpanded(workspaceId, paths, next);

	useWorkspaceRead(
		workspaceId,
		(id) => getTransport().request("fs.readDir", { workspaceId: id, path: "." }),
		{
			onResult: (result) => setNodes(result),
			onFailure: () => setNodes((prev) => prev ?? []),
			onSwitch: () => setNodes(null),
		},
	);

	const loading = nodes === null;
	useEffect(() => (loading ? holdEditorWarm() : undefined), [loading]);

	if (nodes === null) return <LoadingRegion rows={8} className="px-4 py-4" />;
	if (nodes.length === 0)
		return (
			<p className="px-4 py-4 tr-text-metadata text-text-muted">{t("panels.fileTree.empty")}</p>
		);
	return (
		<ul
			data-testid="file-tree"
			ref={(node) => {
				if (node && focus.revealTarget === ".") {
					node.scrollIntoView({ block: "start" });
					focus.onRevealed();
				}
			}}
			className="flex flex-col gap-2 motion-safe:animate-reveal"
		>
			{nodes.map((node) => (
				<FileNodeRow
					key={node.path}
					node={node}
					workspaceId={workspaceId}
					marks={marks}
					focus={focus}
					expandedPaths={expandedPaths}
					setPathsExpanded={setPathsExpanded}
					warmFile={warmFile}
				/>
			))}
		</ul>
	);
}

function FileNodeRow({
	node,
	workspaceId,
	marks,
	focus,
	expandedPaths,
	setPathsExpanded,
	warmFile,
}: {
	node: FileNode;
	workspaceId: string;
	marks: ChangeMarks;
	focus: TreeFocus;
	expandedPaths: ReadonlySet<string>;
	setPathsExpanded: SetPathsExpanded;
	warmFile: WarmFile;
}) {
	const isDir = node.kind === "dir";
	const [directory, setDirectory] = useState<ResolvedFolderChain<FileNode> | null>(null);
	const pendingExpand = useRef(false);

	const { reload } = useWorkspaceRead(
		isDir ? workspaceId : null,
		(id) =>
			resolveFolderChain(node, (path) =>
				getTransport().request("fs.readDir", { workspaceId: id, path }),
			),
		{
			onResult: (result) => {
				setDirectory(result);
				if (!pendingExpand.current) return;
				pendingExpand.current = false;
				setPathsExpanded(result.paths, true);
			},
			onSwitch: () => {
				pendingExpand.current = false;
				setDirectory(null);
			},
		},
	);

	const label = directory?.label ?? node.name;
	const representedPaths = directory?.paths ?? [node.path];
	const expanded = expandedPaths.has(directory?.path ?? node.path);
	const children = directory?.children ?? null;
	const toggleDirectory = () => {
		const nextExpanded = !expanded;
		pendingExpand.current = nextExpanded && directory === null;
		setPathsExpanded(representedPaths, nextExpanded);
		if (nextExpanded) reload();
	};
	const open = (intent: TabIntent) => void openFileInTab(workspaceId, node.path, intent);
	const fileStatus = isDir ? undefined : marks.files.get(node.path);
	const dirChanged = isDir && marks.dirs.has(directory?.path ?? node.path);
	const ignored = (directory?.deepest ?? node).gitignored === true;
	const revealRow =
		focus.revealTarget !== null &&
		(isDir ? representedPaths.includes(focus.revealTarget) : focus.revealTarget === node.path)
			? (row: HTMLButtonElement | null) => {
					if (!row) return;
					row.scrollIntoView({ block: "nearest" });
					focus.onRevealed();
				}
			: undefined;

	return (
		<li>
			<FileEntryActions
				workspaceId={workspaceId}
				path={directory?.path ?? node.path}
				kind={isDir ? "dir" : "file"}
				onOpen={isDir ? toggleDirectory : () => open("keep")}
			>
				{({ onContextMenu, onKeyDown, trigger }) => (
					<div className="group/entry flex min-w-0 items-center rounded-sm hover:bg-control-bg-hovered has-[[data-active=true]]:bg-control-bg-selected [[data-file-menu-open=true]_&]:bg-control-bg-selected">
						<TreeRow
							ref={revealRow}
							testid="file-node"
							highlight="wrapper"
							onContextMenu={onContextMenu}
							onKeyDown={(event) => {
								onKeyDown(event);
								if (
									event.defaultPrevented ||
									event.altKey ||
									event.ctrlKey ||
									event.metaKey ||
									event.shiftKey
								)
									return;
								const rows = [
									...(event.currentTarget
										.closest('[data-testid="file-tree"]')
										?.querySelectorAll<HTMLButtonElement>('[data-testid="file-node"]') ?? []),
								];
								const index = rows.indexOf(event.currentTarget);
								const key = event.key;
								if (key === "ArrowDown" || key === "ArrowUp" || key === "Home" || key === "End") {
									event.preventDefault();
									rows[
										key === "Home"
											? 0
											: key === "End"
												? rows.length - 1
												: index + (key === "ArrowDown" ? 1 : -1)
									]?.focus();
								} else if (
									isDir &&
									((key === "ArrowRight" && !expanded) || (key === "ArrowLeft" && expanded))
								) {
									event.preventDefault();
									toggleDirectory();
								} else if (key === "ArrowRight" && isDir) {
									event.preventDefault();
									event.currentTarget
										.closest("li")
										?.querySelector<HTMLButtonElement>(':scope > ul [data-testid="file-node"]')
										?.focus();
								} else if (key === "ArrowLeft") {
									event.preventDefault();
									event.currentTarget
										.closest("li")
										?.parentElement?.closest("li")
										?.querySelector<HTMLButtonElement>('[data-testid="file-node"]')
										?.focus();
								}
							}}
							kind={isDir ? "dir" : "file"}
							active={!isDir && focus.activePath === node.path}
							subtle={ignored}
							dataStatus={ignored ? "ignored" : undefined}
							expanded={expanded}
							label={label}
							path={directory?.path ?? node.path}
							labelClassName={
								fileStatus
									? statusMarkClass(fileStatus)
									: dirChanged
										? statusMarkClass("modified")
										: ""
							}
							trailing={
								fileStatus ? (
									<span
										data-testid="file-status"
										className={`shrink-0 tr-text-metadata ${statusMarkClass(fileStatus)}`}
									>
										{statusLetter(fileStatus)}
									</span>
								) : dirChanged ? (
									<span
										data-testid="file-folder-dot"
										className="mr-4 size-6 shrink-0 rounded-full bg-feedback-warning"
									/>
								) : undefined
							}
							onClick={isDir ? toggleDirectory : firstClickOnly(() => open("preview"))}
							onDoubleClick={isDir ? undefined : () => open("keep")}
							onWarm={
								isDir || !warmFile
									? undefined
									: (trigger) =>
											trigger === "focus"
												? warmFile(node.path)
												: warmOnHover(() => warmFile(node.path))
							}
						/>
						<div className="shrink-0 opacity-0 group-hover/entry:opacity-100 group-focus-within/entry:opacity-100 focus-within:opacity-100">
							{trigger}
						</div>
					</div>
				)}
			</FileEntryActions>
			{isDir && expanded && children && (
				<ul className="mt-2 flex flex-col gap-2 pl-tree-indent">
					{children.map((child) => (
						<FileNodeRow
							key={child.path}
							node={child}
							workspaceId={workspaceId}
							marks={marks}
							focus={focus}
							expandedPaths={expandedPaths}
							setPathsExpanded={setPathsExpanded}
							warmFile={warmFile}
						/>
					))}
				</ul>
			)}
		</li>
	);
}
