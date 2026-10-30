import type { FileNode } from "@thinkrail/contracts";
import { useT } from "@thinkrail/locales/react";
import { describeResource, PENDING_TEXT_META } from "@thinkrail/resource-renderers";
import { LoadingRegion } from "@thinkrail/ui/skeleton";
import { useEffect, useMemo, useRef, useState } from "react";
import { statusLetter } from "../chat/planView";
import { firstClickOnly } from "../lib";
import { type ActivityIndex, selectFilesTreeView, type TabIntent, useAppStore } from "../store";
import { getTransport } from "../transport";
import { agentActivityLabel } from "./agentActivityLabels";
import { type ChangeMarks, statusMarkClass } from "./changesModel";
import { holdEditorWarm, useEditorWarm, warmOnHover } from "./editorWarm";
import { FileEntryActions } from "./FileEntryActions";
import { type ResolvedFolderChain, resolveFolderChain } from "./folderChains";
import { openFileInTab } from "./openTabs";
import { TreeRow } from "./TreeRow";
import { useAgentActivity } from "./useAgentActivity";
import { useWorkspaceRead } from "./useWorkspaceRead";

type SetPathsExpanded = (paths: readonly string[], expanded: boolean) => void;
type WarmFile = ((path: string) => void) | undefined;

/** What the agent is doing in the tree, and whether the tree may scroll to follow it. */
interface AgentTree {
	index: ActivityIndex;
	follow: boolean;
	paused: () => boolean;
}

/** After the user scrolls the tree themself, the agent stops pulling it along for this long. */
const FOLLOW_PAUSE_MS = 4_000;

const AGENT_ROW =
	"relative motion-safe:transition-colors motion-safe:duration-500 before:absolute before:inset-y-2 before:left-0 before:w-2 before:rounded-full before:bg-transparent data-[agent-activity=read]:bg-feedback-info-subtle data-[agent-activity=read]:before:bg-feedback-info data-[agent-activity=search]:bg-control-bg-selected data-[agent-activity=search]:before:bg-text-muted data-[agent-activity=list]:bg-control-bg-selected data-[agent-activity=list]:before:bg-text-muted data-[agent-activity=write]:bg-feedback-warning-subtle data-[agent-activity=write]:before:bg-feedback-warning data-[agent-activity=within]:bg-control-bg motion-safe:data-[agent-phase=running]:before:animate-agent-pulse";

const AGENT_BADGE: Record<string, string> = {
	read: "bg-feedback-info-subtle text-feedback-info",
	search: "bg-control-bg-selected text-text-muted",
	list: "bg-control-bg-selected text-text-muted",
	write: "bg-feedback-warning-subtle text-feedback-warning",
};

function scrollBehavior(): ScrollBehavior {
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

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
	const { index, preferences } = useAgentActivity(workspaceId);
	const expandedPaths = useMemo(
		() => new Set([...expanded, ...index.expanded]),
		[expanded, index.expanded],
	);
	const userScrolledAt = useRef(0);
	const agent = useMemo<AgentTree>(
		() => ({
			index,
			follow: preferences.enabled && preferences.follow,
			paused: () => Date.now() - userScrolledAt.current < FOLLOW_PAUSE_MS,
		}),
		[index, preferences],
	);
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
			onWheel={() => {
				userScrolledAt.current = Date.now();
			}}
			onPointerDown={() => {
				userScrolledAt.current = Date.now();
			}}
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
					agent={agent}
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
	agent,
}: {
	node: FileNode;
	workspaceId: string;
	marks: ChangeMarks;
	focus: TreeFocus;
	expandedPaths: ReadonlySet<string>;
	setPathsExpanded: SetPathsExpanded;
	warmFile: WarmFile;
	agent: AgentTree;
}) {
	const t = useT();
	const isDir = node.kind === "dir";
	const rowRef = useRef<HTMLButtonElement | null>(null);
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

	const activity =
		(isDir
			? representedPaths.map((path) => agent.index.byPath.get(path)).find((entry) => entry)
			: agent.index.byPath.get(node.path)) ?? null;
	const within =
		isDir && !activity && representedPaths.some((path) => agent.index.litDirs.has(path));
	const newest =
		agent.index.newest !== null &&
		(isDir ? representedPaths.includes(agent.index.newest) : agent.index.newest === node.path);
	const followRow = newest && activity !== null && agent.follow;
	useEffect(() => {
		if (!followRow || agent.paused()) return;
		rowRef.current?.scrollIntoView({ block: "nearest", behavior: scrollBehavior() });
	}, [followRow, agent]);

	return (
		<li>
			<FileEntryActions
				workspaceId={workspaceId}
				path={directory?.path ?? node.path}
				kind={isDir ? "dir" : "file"}
				onOpen={isDir ? toggleDirectory : () => open("keep")}
			>
				{({ onContextMenu, onKeyDown, trigger }) => (
					<div
						data-agent-activity={activity?.kind ?? (within ? "within" : undefined)}
						data-agent-phase={activity?.phase}
						data-agent-source={activity?.source}
						className={`group/entry flex min-w-0 items-center rounded-sm hover:bg-control-bg-hovered has-[[data-active=true]]:bg-control-bg-selected [[data-file-menu-open=true]_&]:bg-control-bg-selected ${AGENT_ROW}`}
					>
						<TreeRow
							ref={(row) => {
								rowRef.current = row;
								revealRow?.(row);
							}}
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
							title={activity ? agentActivityLabel(t, activity) : undefined}
							agentBadge={
								activity ? (
									<span
										data-testid="file-agent-badge"
										className={`max-w-[60%] shrink-0 truncate rounded-sm px-4 tr-text-metadata ${AGENT_BADGE[activity.kind] ?? ""}`}
									>
										{agentActivityLabel(t, activity)}
									</span>
								) : undefined
							}
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
							agent={agent}
						/>
					))}
				</ul>
			)}
		</li>
	);
}
