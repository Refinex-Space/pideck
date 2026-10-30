import { RiCollapseVerticalLine } from "@remixicon/react";
import { FILE_WORKBENCH_PROTOCOL_VERSION } from "@thinkrail/contracts";
import { useT } from "@thinkrail/locales/react";
import { IconButton } from "@thinkrail/ui/button";
import { ToggleSegment } from "@thinkrail/ui/toggle-segment";
import { RefreshCw, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { selectActiveFilePath, selectFilesTreeView, useAppStore } from "../store";
import { AgentActivityList } from "./AgentActivityList";
import { ChangesPanel } from "./ChangesPanel";
import {
	buildChangeMarks,
	buildChangesTree,
	type ChangeMarks,
	changeTreeFolderPaths,
} from "./changesModel";
import { FileEntryActions } from "./FileEntryActions";
import { FileSearch } from "./FileSearch";
import { FileTree } from "./FileTree";
import { HeaderIconButton } from "./HeaderIconButton";
import { RememberedScrollArea } from "./RememberedScrollArea";
import { useGitStatus } from "./useGitStatus";

export function FilesPanel({ workspaceId }: { workspaceId: string }) {
	const t = useT();
	const supported = useAppStore((s) => (s.protocolVersion ?? 0) >= FILE_WORKBENCH_PROTOCOL_VERSION);
	const query = useAppStore((s) => s.filesSearchByWorkspace[workspaceId] ?? "");
	const setQuery = (value: string) => useAppStore.getState().setFilesSearch(workspaceId, value);
	const [includeIgnored, setIncludeIgnored] = useState(false);
	const revealDirectory = (path: string) =>
		useAppStore.getState().showFilesPath(workspaceId, path, "dir");
	const mode = useAppStore((s) => s.filesMode);
	const setMode = useAppStore((s) => s.setFilesMode);
	const changesView = useAppStore((s) => s.changesView);
	const { status, error, reload } = useGitStatus(workspaceId);
	const marks = useMemo(() => buildChangeMarks(status?.changes ?? []), [status]);
	const count = status?.changes.length ?? 0;
	const canCollapse = mode === "all" || (changesView === "tree" && count > 0);
	const collapseAll = () => {
		const store = useAppStore.getState();
		if (mode === "all") store.collapseAllFiles(workspaceId);
		else if (status) {
			store.setChangedTreeCollapsed(
				workspaceId,
				changeTreeFolderPaths(buildChangesTree(status.changes)),
				true,
			);
		}
	};

	return (
		<div data-testid="files-panel" className="flex h-full min-h-0 flex-col">
			{supported && mode === "all" ? (
				<div className="flex shrink-0 flex-col gap-4 px-8 py-4">
					<div className="flex h-28 items-center gap-6 rounded-md border border-control-border-default bg-control-bg px-8 focus-within:border-control-border-active">
						<Search aria-hidden="true" className="size-14 shrink-0 text-text-muted" />
						<input
							data-testid="file-search-input"
							aria-label={t("files.search")}
							placeholder={t("files.search")}
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Escape") setQuery("");
								if (event.key === "ArrowDown") {
									event.preventDefault();
									event.currentTarget
										.closest('[data-testid="files-panel"]')
										?.querySelector<HTMLButtonElement>('[data-testid="file-search-row"]')
										?.focus();
								}
							}}
							className="min-w-0 flex-1 bg-transparent tr-text-ui text-text-default outline-none"
						/>
						{query ? (
							<IconButton
								icon={X}
								label={t("common.close")}
								size="s"
								onClick={() => setQuery("")}
							/>
						) : null}
					</div>
					{query ? (
						<label className="flex items-center gap-6 tr-text-metadata text-text-muted">
							<input
								type="checkbox"
								checked={includeIgnored}
								onChange={(event) => setIncludeIgnored(event.target.checked)}
							/>
							{t("files.includeIgnored")}
						</label>
					) : null}
				</div>
			) : null}
			<div
				data-testid="files-mode-toggle"
				role="toolbar"
				aria-label={t("panels.files.toolbar")}
				className="flex h-panel-header-row shrink-0 items-center gap-4 overflow-x-auto border-border-default border-b px-12"
			>
				<ToggleSegment
					testid="files-mode-all"
					label={t("panels.files.all")}
					active={mode === "all"}
					onClick={() => setMode("all")}
				/>
				<ToggleSegment
					testid="files-mode-changed"
					label={count > 0 ? t("panels.files.changedCount", { count }) : t("panels.files.changed")}
					active={mode === "changed"}
					onClick={() => setMode("changed")}
				/>
				<div className="ml-auto flex shrink-0 items-center gap-2">
					<IconButton
						icon={RefreshCw}
						label={t("files.refresh")}
						data-testid="files-refresh"
						size="s"
						onClick={() =>
							useAppStore
								.getState()
								.noteFsChanged({ workspaceId, paths: [], truncated: true, skillChange: "none" })
						}
					/>
					<FileEntryActions workspaceId={workspaceId} path="." kind="dir" />
					{canCollapse ? (
						<div className="ml-auto flex shrink-0">
							<HeaderIconButton
								testid="files-collapse-all"
								label={t("panels.files.collapseAll")}
								onClick={collapseAll}
								icon={RiCollapseVerticalLine}
							/>
						</div>
					) : null}
				</div>
			</div>
			{supported && mode === "all" && query.trim() ? (
				<FileSearch
					workspaceId={workspaceId}
					query={query}
					includeIgnored={includeIgnored}
					onDirectory={revealDirectory}
				/>
			) : mode === "all" ? (
				<AllFiles workspaceId={workspaceId} marks={marks} />
			) : (
				<div className="min-h-0 flex-1">
					<ChangesPanel workspaceId={workspaceId} status={status} error={error} reload={reload} />
				</div>
			)}
			<AgentActivityList workspaceId={workspaceId} />
		</div>
	);
}

function AllFiles({ workspaceId, marks }: { workspaceId: string; marks: ChangeMarks }) {
	const activePath = useAppStore((s) => selectActiveFilePath(s, workspaceId));
	const [revealOnMount] = useState(
		() =>
			activePath !== null &&
			activePath !== selectFilesTreeView(useAppStore.getState(), workspaceId).seenActivePath,
	);
	const [revealTarget, setRevealTarget] = useState<string | null>(null);
	const requestedReveal = useAppStore((state) =>
		state.filesRevealRequest?.workspaceId === workspaceId ? state.filesRevealRequest : null,
	);
	useEffect(() => {
		if (requestedReveal) setRevealTarget(requestedReveal.path);
	}, [requestedReveal]);
	const previousActive = useRef<string | null | undefined>(revealOnMount ? undefined : activePath);

	useEffect(() => {
		const before = previousActive.current;
		previousActive.current = activePath;
		if (requestedReveal) return;
		if (activePath === null || activePath === before) return;
		useAppStore.getState().revealInFiles(workspaceId, activePath);
		setRevealTarget(activePath);
	}, [activePath, workspaceId, requestedReveal]);

	return (
		<RememberedScrollArea
			workspaceId={workspaceId}
			view="all"
			restore={!revealOnMount}
			className="min-h-0 flex-1"
			viewportClassName="p-panel-inset"
		>
			<FileTree
				workspaceId={workspaceId}
				marks={marks}
				activePath={activePath}
				revealTarget={revealTarget}
				onRevealed={() => {
					setRevealTarget(null);
					if (requestedReveal) useAppStore.getState().clearFilesReveal(requestedReveal.id);
				}}
			/>
		</RememberedScrollArea>
	);
}
