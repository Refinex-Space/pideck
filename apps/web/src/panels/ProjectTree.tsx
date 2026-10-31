import {
	RiArrowGoBackLine as ArrowGoBack,
	RiCheckLine as Check,
	RiArrowDownSLine as ChevronDown,
	RiArrowRightSLine as ChevronRight,
	RiFileCopyLine as Copy,
	RiExternalLinkLine as ExternalLink,
	RiFolderOpenLine as FolderOpen,
	RiGitBranchLine as GitBranch,
	RiLoader4Line as Loader2,
	RiMailOpenLine as MailOpen,
	RiMailUnreadLine as MailUnread,
	RiMoreLine as MoreVertical,
	RiPencilLine as Pencil,
	RiAddLine as Plus,
	RiFolderOpenFill,
	RiGitBranchFill,
	RiSearchLine,
	RiDeleteBin6Line as Trash2,
	RiCloseLine as X,
} from "@remixicon/react";
import type { EditorInfo, Project, Workspace } from "@thinkrail/contracts";
import { useT } from "@thinkrail/locales/react";
import { IconButton } from "@thinkrail/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@thinkrail/ui/context-menu";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@thinkrail/ui/dropdown-menu";
import { LoadingRegion } from "@thinkrail/ui/skeleton";
import { cn } from "@thinkrail/ui/utils";
import { FolderOpen as ExpandedFolder, FolderClosed } from "lucide-react";
import { type MouseEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { getStablePreferenceAdapter } from "@/clientPreferences";
import { AttentionDot } from "@/components/AttentionDot";
import { RunningIcon } from "@/components/RunningIcon";
import { copyText, platformShortcutLabel } from "@/lib";
import { useNow } from "../components/useNow";
import {
	isDefaultWorkspace,
	isExternalWorkspace,
	SETTLED_SHELF_MORE,
	SETTLED_SHELF_PAGE,
	type SettledReason,
	selectActiveWorkspaceProjectId,
	selectAutoSettledCounts,
	selectContextProject,
	selectProjectIsRunning,
	selectProjectNeedsAttention,
	selectWorkspaceIsRunning,
	selectWorkspaceNeedsAttention,
	selectWorkspacePartition,
	selectWorkspaceReadAction,
	settledReasonLabel,
	settledReasonTitle,
	supportsWorkspaceReadState,
	toast,
	useAppStore,
	type WorkspaceReadAction,
	workspaceName,
} from "../store";
import { errorText, getTransport } from "../transport";
import { AddProjectMenu } from "./AddProjectMenu";
import { ConfirmDialog } from "./ConfirmDialog";
import { ExistingWorktreeDialog } from "./ExistingWorktreeDialog";
import { type NewSessionTarget, preferredSessionTarget } from "./newSessionTarget";
import { RemoveWorkspaceDialog } from "./RemoveWorkspaceDialog";
import {
	announceSettledShelf,
	SETTLED_NOTICE_QUIET_MS,
	settledShelfNoticed,
} from "./settledShelfNotice";
import { useOpenProject } from "./useOpenProject";
import { useWorkspaceChats, WorkspaceSessions, workspaceListsChats } from "./WorkspaceSessions";
import {
	canRenameProject,
	canRenameWorkspace,
	canSettleWorkspace,
	loadProjectWorkspaces,
	markWorkspaceRead,
	markWorkspaceUnread,
	openWorkspaceIn,
	renameProject,
	renameWorkspace,
	revealWorkspace,
	settleWorkspace,
	unsettleWorkspace,
	useEditors,
	useInlineRename,
} from "./workspaceActions";

const NAVIGATION_ACTION_CLASS =
	"group/nav flex h-32 w-full items-center gap-8 rounded-md px-8 text-left tr-text-ui text-text-default outline-none hover:bg-control-bg-hovered focus-visible:outline-1 focus-visible:outline-focus-ring";

/** A navigation row's shortcut hint: out of sight at rest, shown while the row is hovered or focused. */
const NAVIGATION_SHORTCUT_CLASS =
	"shrink-0 tr-text-metadata text-text-subtle opacity-0 transition-opacity group-focus-visible/nav:opacity-100 group-hover/nav:opacity-100 motion-reduce:transition-none";

/**
 * The chord worth advertising for New session: the desktop app receives ⌘N, while a browser tab never
 * does (the browser keeps it for a new window), so there the alias is the one that works.
 */
function newSessionShortcutLabel(): string {
	return getStablePreferenceAdapter()
		? platformShortcutLabel("N")
		: platformShortcutLabel("N", { alt: true });
}

/** The Projects heading's controls: out of sight at rest on hover devices, like a row's own actions. */
const SECTION_CONTROL_CLASS =
	"shrink-0 opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/section:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100";

const HOVER_CONTROL_CLASS =
	"shrink-0 opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100";

export function ProjectTree() {
	const t = useT();
	const projects = useAppStore((s) => s.projects);
	const recentProjects = useAppStore((s) => s.recentProjects);
	const selectedProjectId = useAppStore((s) => s.selectedProjectId);
	const workspaces = useAppStore((s) => s.workspaces);
	const worktreeCreations = useAppStore((s) => s.worktreeCreationsByProject);
	const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
	const activeWorkspaceLiveLatch = useAppStore((s) => s.activeWorkspaceLiveLatch);
	const protocolVersion = useAppStore((s) => s.protocolVersion);
	const supportsSettling = useAppStore((s) => s.workspaceSettlingSupported);
	const sessionStateByWorkspace = useAppStore((s) => s.sessionStateByWorkspace);
	const settleIdleDays = useAppStore((s) => s.settleIdleDays);
	const settledShelfExpanded = useAppStore((s) => s.settledShelfExpanded);
	const settledShelfShown = useAppStore((s) => s.settledShelfShown);
	const now = useNow();

	const editors = useEditors();

	const expandedProjectIds = useAppStore((s) => s.expandedProjectIds);
	const [existingDialogProjectId, setExistingDialogProjectId] = useState<string | null>(null);
	const addProjectButtonRef = useRef<HTMLButtonElement>(null);
	const projectNameButtonsRef = useRef(new Map<string, HTMLButtonElement>());
	const pendingCloseFocusProjectIdRef = useRef<string | null>(null);
	const existingDialogReturnFocusIdRef = useRef<string | null>(null);

	const registerProjectNameButton = useCallback(
		(projectId: string, element: HTMLButtonElement | null) => {
			if (element) projectNameButtonsRef.current.set(projectId, element);
			else projectNameButtonsRef.current.delete(projectId);
		},
		[],
	);
	const focusProjectNameOrAdd = useCallback((projectId?: string) => {
		requestAnimationFrame(() => {
			const projectButton = projectId ? projectNameButtonsRef.current.get(projectId) : undefined;
			(projectButton ?? addProjectButtonRef.current)?.focus();
		});
	}, []);

	useEffect(() => {
		const closedProjectId = pendingCloseFocusProjectIdRef.current;
		if (!closedProjectId || projects.some((project) => project.id === closedProjectId)) return;
		pendingCloseFocusProjectIdRef.current = null;
		let fallbackProjectId = projects[0]?.id;
		if (selectedProjectId && projects.some((project) => project.id === selectedProjectId)) {
			fallbackProjectId = selectedProjectId;
		}
		focusProjectNameOrAdd(fallbackProjectId);
	}, [focusProjectNameOrAdd, projects, selectedProjectId]);

	const activeProjectId = useAppStore(selectActiveWorkspaceProjectId);
	useEffect(() => {
		if (activeProjectId) useAppStore.getState().expandProject(activeProjectId);
	}, [activeProjectId]);

	const partitionState = {
		workspaces,
		workspaceSettlingSupported: supportsSettling,
		sessionStateByWorkspace,
		activeWorkspaceId,
		activeWorkspaceLiveLatch,
		settleIdleDays,
	};
	const activeSettledIndex =
		activeProjectId && activeWorkspaceId
			? selectWorkspacePartition(partitionState, activeProjectId, now).settled.findIndex(
					(row) => row.workspace.id === activeWorkspaceId,
				)
			: -1;
	useEffect(() => {
		if (!activeProjectId || activeSettledIndex < 0) return;
		const store = useAppStore.getState();
		store.toggleSettledShelf(activeProjectId, true);
		store.showMoreSettled(activeProjectId, activeSettledIndex + 1);
	}, [activeProjectId, activeSettledIndex]);

	const autoSettledKey = selectAutoSettledCounts(partitionState, now)
		.map(({ projectId, count }) => `${projectId}:${count}`)
		.join(",");
	useEffect(() => {
		if (autoSettledKey === "" || settledShelfNoticed()) return;
		const timer = setTimeout(announceSettledShelf, SETTLED_NOTICE_QUIET_MS);
		return () => clearTimeout(timer);
	}, [autoSettledKey]);

	const loadWorkspaces = useCallback(async (projectId: string) => {
		await loadProjectWorkspaces(projectId);
	}, []);

	const pendingListLoadsRef = useRef(new Set<string>());
	useEffect(() => {
		for (const project of projects) {
			if (!expandedProjectIds[project.id] || workspaces[project.id]) continue;
			if (pendingListLoadsRef.current.has(project.id)) continue;
			pendingListLoadsRef.current.add(project.id);
			void loadWorkspaces(project.id)
				.catch(() => {})
				.finally(() => pendingListLoadsRef.current.delete(project.id));
		}
	}, [projects, expandedProjectIds, workspaces, loadWorkspaces]);

	const selectProject = async (projectId: string, toggleExpansion = false) => {
		useAppStore
			.getState()
			.selectProject(projectId, toggleExpansion ? { toggleExpansion: true } : { reveal: true });
		await loadWorkspaces(projectId);
	};

	const selectWorkspace = (workspace: Workspace) => {
		useAppStore.getState().activateWorkspace(workspace);
	};

	const toggleExpand = (projectId: string) => {
		const store = useAppStore.getState();
		const willExpand = !store.expandedProjectIds[projectId];
		store.toggleProjectExpanded(projectId);
		if (willExpand) void loadWorkspaces(projectId);
	};

	const { openProject, pickAndOpen, enterHostPath, cloneRepository, dialogs } = useOpenProject(
		(project) => selectProject(project.id),
	);

	const onExistingWorktreeOpened = async (workspace: Workspace) => {
		const rows = await getTransport().request("workspace.list", {
			projectId: workspace.projectId,
		});
		const attached = rows.find((candidate) => candidate.id === workspace.id);
		if (!attached) throw new Error(t("panels.projectTree.attachedWorktreeMissing"));
		const store = useAppStore.getState();
		store.expandProject(workspace.projectId);
		store.setWorkspaces(workspace.projectId, rows);
		store.activateWorkspace(attached);
	};

	const closeProject = (project: Project) => {
		pendingCloseFocusProjectIdRef.current = project.id;
		void getTransport()
			.request("project.close", { id: project.id })
			.catch((err) => {
				if (pendingCloseFocusProjectIdRef.current === project.id) {
					pendingCloseFocusProjectIdRef.current = null;
				}
				focusProjectNameOrAdd(project.id);
				toast.error(errorText(err, t("panels.projectTree.closeFailed", { name: project.name })));
			});
	};

	const collapseAllProjects = () => {
		const store = useAppStore.getState();
		for (const projectId of Object.keys(store.expandedProjectIds))
			store.toggleProjectExpanded(projectId);
	};

	const expandAllProjects = () => {
		const store = useAppStore.getState();
		for (const project of store.projects) store.expandProject(project.id);
	};

	const startNewSession = (projectId: string, target: NewSessionTarget) => {
		useAppStore.getState().openNewSession({ projectId, target, prompt: "" });
	};

	const openExistingWorktreeDialog = (projectId: string) => {
		existingDialogReturnFocusIdRef.current = projectId;
		setExistingDialogProjectId(projectId);
	};

	const contextProject = useAppStore(selectContextProject);
	const newSessionAvailable = contextProject !== null;
	const newSessionRow = (
		<button
			type="button"
			data-testid="new-session"
			className={NAVIGATION_ACTION_CLASS}
			{...(contextProject
				? {
						onClick: () =>
							startNewSession(contextProject.id, preferredSessionTarget(contextProject.id)),
					}
				: {})}
		>
			<Plus className="size-16 shrink-0" />
			<span className="min-w-0 flex-1 truncate">{t("panels.projectTree.newSession")}</span>
			{newSessionAvailable ? (
				<kbd className={NAVIGATION_SHORTCUT_CLASS}>{newSessionShortcutLabel()}</kbd>
			) : null}
		</button>
	);

	return (
		<nav
			aria-label={t("panels.projectTree.title")}
			data-testid="project-tree"
			className="flex flex-col gap-16"
		>
			<header className="flex flex-col gap-2">
				{newSessionAvailable ? (
					newSessionRow
				) : (
					<AddProjectMenu
						align="start"
						recentProjects={recentProjects}
						onOpen={() => void pickAndOpen()}
						onEnterHostPath={enterHostPath}
						onClone={cloneRepository}
						onOpenRecent={(p) => void openProject(p)}
					>
						{newSessionRow}
					</AddProjectMenu>
				)}
				<button
					type="button"
					className={NAVIGATION_ACTION_CLASS}
					data-testid="open-session-switcher"
					onClick={() => useAppStore.getState().openSessionSwitcher()}
				>
					<RiSearchLine className="size-16 shrink-0" />
					<span className="min-w-0 flex-1 truncate">{t("shell.sessionSwitcher.title")}</span>
					<kbd className={NAVIGATION_SHORTCUT_CLASS}>{platformShortcutLabel("K")}</kbd>
				</button>
			</header>

			<div className="flex flex-col gap-2">
				<div
					data-testid="projects-heading"
					className="group/section flex min-h-24 items-center gap-4 pr-4 pl-8"
				>
					<h2 className="min-w-0 flex-1 truncate tr-text-ui text-text-subtle">
						{t("panels.projectTree.title")}
					</h2>
					{projects.length > 0 ? (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<IconButton
									icon={MoreVertical}
									label={t("panels.projectTree.projectsMenu")}
									variant="ghost"
									size="s"
									data-testid="projects-menu"
									className={SECTION_CONTROL_CLASS}
								/>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="start" data-testid="projects-actions">
								<DropdownMenuItem
									data-testid="projects-collapse-all"
									disabled={projects.every((project) => expandedProjectIds[project.id] !== true)}
									onSelect={() => collapseAllProjects()}
								>
									<span>{t("panels.projectTree.collapseAll")}</span>
								</DropdownMenuItem>
								<DropdownMenuItem
									data-testid="projects-expand-all"
									disabled={projects.every((project) => expandedProjectIds[project.id] === true)}
									onSelect={() => expandAllProjects()}
								>
									<span>{t("panels.projectTree.expandAll")}</span>
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					) : null}
					<AddProjectMenu
						align="start"
						recentProjects={recentProjects}
						onOpen={() => void pickAndOpen()}
						onEnterHostPath={enterHostPath}
						onClone={cloneRepository}
						onOpenRecent={(p) => void openProject(p)}
					>
						<IconButton
							icon={Plus}
							ref={addProjectButtonRef}
							label={t("panels.projectTree.addProject")}
							variant="ghost"
							size="s"
							data-testid="add-project-menu"
							className={projects.length > 0 ? SECTION_CONTROL_CLASS : "shrink-0"}
						/>
					</AddProjectMenu>
				</div>
				<ul className="flex flex-col gap-2">
					{projects.map((project) => {
						const isExpanded = expandedProjectIds[project.id] === true;
						const list = workspaces[project.id];
						const stateProjection = { sessionStateByWorkspace };
						return (
							<li key={project.id} className={isExpanded ? "pb-12 last:pb-0" : undefined}>
								<ProjectRow
									project={project}
									isSelected={selectedProjectId === project.id}
									isExpanded={isExpanded}
									needsAttention={
										!isExpanded && selectProjectNeedsAttention(stateProjection, project.id)
									}
									isRunning={!isExpanded && selectProjectIsRunning(stateProjection, project.id)}
									workspaceCount={(list ?? []).filter((w) => !isDefaultWorkspace(w)).length}
									onToggle={() => toggleExpand(project.id)}
									onSelect={() => void selectProject(project.id, true)}
									canRename={canRenameProject(protocolVersion)}
									onRename={(name) => renameProject(project, name)}
									onClose={() => closeProject(project)}
									onNewSession={(target) => startNewSession(project.id, target)}
									onOpenExistingWorktree={() => openExistingWorktreeDialog(project.id)}
									onRegisterNameButton={(element) => registerProjectNameButton(project.id, element)}
									onRestoreFocus={() => focusProjectNameOrAdd(project.id)}
								/>
								{isExpanded && list === undefined && (
									<LoadingRegion rows={2} className="py-4 pr-8 pl-16" />
								)}
								{isExpanded && list !== undefined && (
									<SettledPartition
										enabled={supportsSettling}
										projectId={project.id}
										partition={selectWorkspacePartition(partitionState, project.id, now)}
										shelfExpanded={settledShelfExpanded[project.id] === true}
										shelfShown={settledShelfShown[project.id] ?? SETTLED_SHELF_PAGE}
										renderRow={(ws, settled) => (
											<WorkspaceRow
												key={ws.id}
												workspace={ws}
												settled={settled}
												now={now}
												isActive={activeWorkspaceId === ws.id}
												needsAttention={selectWorkspaceNeedsAttention(stateProjection, ws.id)}
												isRunning={selectWorkspaceIsRunning(stateProjection, ws.id)}
												canRename={canRenameWorkspace(protocolVersion, ws)}
												canSettle={canSettleWorkspace(protocolVersion, ws)}
												readAction={
													supportsWorkspaceReadState(protocolVersion)
														? selectWorkspaceReadAction(stateProjection, ws.id)
														: null
												}
												editors={editors}
												onSelect={() => selectWorkspace(ws)}
												onOpenIn={(editor) => openWorkspaceIn(ws, editor)}
												onCopyPath={() => void copyText(ws.worktreePath)}
												onReveal={() => revealWorkspace(ws)}
												onRename={(name) => renameWorkspace(ws, name)}
												onSettle={() => settleWorkspace(ws.id)}
												onKeepActive={() => unsettleWorkspace(ws.id)}
												onMarkRead={() => markWorkspaceRead(ws.id)}
												onMarkUnread={() => markWorkspaceUnread(ws.id)}
											/>
										)}
									/>
								)}
								{isExpanded && (worktreeCreations[project.id] ?? 0) > 0 && (
									<div
										data-testid="worktree-creating-row"
										className="flex items-center gap-8 py-4 pr-8 pl-16 tr-text-ui text-text-muted"
									>
										<Loader2 className="size-16 shrink-0 animate-spin motion-reduce:animate-none" />
										{t("panels.projectTree.creatingWorktree")}
									</div>
								)}
							</li>
						);
					})}
				</ul>
			</div>

			{existingDialogProjectId !== null ? (
				<ExistingWorktreeDialog
					open
					projectId={existingDialogProjectId}
					onOpenChange={(isOpen) => {
						if (isOpen) return;
						setExistingDialogProjectId(null);
						const returnFocusId = existingDialogReturnFocusIdRef.current;
						existingDialogReturnFocusIdRef.current = null;
						if (returnFocusId) focusProjectNameOrAdd(returnFocusId);
					}}
					onOpened={onExistingWorktreeOpened}
				/>
			) : null}

			{dialogs}
		</nav>
	);
}

function SettledPartition({
	enabled,
	projectId,
	partition,
	shelfExpanded,
	shelfShown,
	renderRow,
}: {
	enabled: boolean;
	projectId: string;
	partition: ReturnType<typeof selectWorkspacePartition>;
	shelfExpanded: boolean;
	shelfShown: number;
	renderRow: (workspace: Workspace, settled: SettledReason | null) => ReactNode;
}) {
	const t = useT();
	if (!enabled) {
		return (
			<ul className="mt-2 flex flex-col gap-2">
				{partition.live.map((workspace) => renderRow(workspace, null))}
			</ul>
		);
	}
	const settledCount = partition.settled.length;
	const shown = partition.settled.slice(0, shelfShown);
	const remaining = settledCount - shown.length;
	return (
		<div className="mt-2 flex flex-col gap-2">
			<ul className="flex flex-col gap-2">{partition.live.map((ws) => renderRow(ws, null))}</ul>
			<div
				data-testid="settled-shelf"
				data-count={settledCount}
				data-expanded={shelfExpanded}
				className="flex h-panel-row min-w-0 items-center rounded-md px-8 text-text-subtle tr-text-metadata hover:bg-control-bg-hovered"
			>
				<button
					type="button"
					data-testid="settled-shelf-toggle"
					aria-expanded={shelfExpanded}
					onClick={() => useAppStore.getState().toggleSettledShelf(projectId)}
					className="flex min-w-0 flex-1 items-center gap-8 text-left outline-none focus-visible:ring-1 focus-visible:ring-focus-ring"
				>
					<span className="w-16 shrink-0" />
					<span className="min-w-0 flex-1 truncate">
						{t("panels.projectTree.settledShelf", { total: settledCount })}
					</span>
					{shelfExpanded ? (
						<ChevronDown className="size-16 shrink-0" />
					) : (
						<ChevronRight className="size-16 shrink-0" />
					)}
				</button>
			</div>
			{shelfExpanded && settledCount > 0 ? (
				<ul className="flex flex-col gap-2" data-testid="settled-shelf-rows">
					{shown.map((row) => renderRow(row.workspace, row.reason))}
					{remaining > 0 ? (
						<li>
							<button
								type="button"
								data-testid="settled-shelf-more"
								onClick={() =>
									useAppStore.getState().showMoreSettled(projectId, shelfShown + SETTLED_SHELF_MORE)
								}
								className="flex h-panel-row w-full items-center rounded-md pl-32 text-left text-text-subtle tr-text-metadata hover:bg-control-bg-hovered hover:text-text-muted"
							>
								{t("panels.projectTree.showMore", {
									count: Math.min(SETTLED_SHELF_MORE, remaining),
								})}
							</button>
						</li>
					) : null}
				</ul>
			) : null}
		</div>
	);
}

function ProjectRow({
	project,
	isSelected,
	isExpanded,
	needsAttention,
	isRunning,
	workspaceCount,
	onToggle,
	onSelect,
	canRename,
	onRename,
	onClose,
	onNewSession,
	onOpenExistingWorktree,
	onRegisterNameButton,
	onRestoreFocus,
}: {
	project: Project;
	isSelected: boolean;
	isExpanded: boolean;
	needsAttention: boolean;
	isRunning: boolean;
	workspaceCount: number;
	onToggle: () => void;
	onSelect: () => void;
	canRename: boolean;
	onRename: (name: string) => void;
	onClose: () => void;
	onNewSession: (target: NewSessionTarget) => void;
	onOpenExistingWorktree: () => void;
	onRegisterNameButton: (element: HTMLButtonElement | null) => void;
	onRestoreFocus: () => void;
}) {
	const t = useT();
	const createWorkspaceLabel = t("panels.projectTree.createWorkspaceShortcut", {
		shortcut: platformShortcutLabel("N"),
		altShortcut: platformShortcutLabel("N", { alt: true }),
	});
	const ExpansionIcon = isExpanded ? ExpandedFolder : FolderClosed;
	const [menuOpen, setMenuOpen] = useState(false);
	const [confirmOpen, setConfirmOpen] = useState(false);
	const openingDialogRef = useRef(false);
	const closeConfirmedRef = useRef(false);
	const {
		editing,
		nameRef,
		start: startRename,
		inputProps: renameInputProps,
	} = useInlineRename({
		target: project,
		canRename,
		onRename: (_target, name) => onRename(name),
	});
	const folderIcon = isRunning ? (
		<RunningIcon className="size-16 shrink-0 text-text-muted" />
	) : null;
	const nameClass = `truncate tr-text-ui ${isSelected ? "text-text-default" : "text-text-muted"}`;
	const openDialogAfterMenu = (openDialog: () => void) => {
		openingDialogRef.current = true;
		setMenuOpen(false);
		requestAnimationFrame(openDialog);
	};
	const row = (
		<div
			data-testid="project-item"
			data-row
			data-menu-open={menuOpen}
			data-attention={needsAttention || undefined}
			data-running={isRunning || undefined}
			className={`group flex h-32 items-center gap-8 rounded-md px-8 transition-colors ${
				menuOpen ? "bg-control-bg-selected" : "hover:bg-control-bg-hovered"
			}`}
		>
			<button
				type="button"
				data-testid="project-expand"
				aria-expanded={isExpanded}
				aria-label={
					isExpanded
						? t("panels.projectTree.collapseProject")
						: t("panels.projectTree.expandProject")
				}
				onClick={onToggle}
				className="flex size-16 shrink-0 items-center justify-center rounded-sm text-text-muted transition-colors hover:text-text-default focus-visible:text-text-default outline-none focus-visible:outline-1 focus-visible:outline-focus-ring"
				data-expanded={isExpanded}
			>
				<ExpansionIcon className="size-16" />
			</button>
			{editing ? (
				<div className="flex min-w-0 flex-1 items-center gap-4">
					{folderIcon}
					<input
						ref={nameRef}
						data-testid="project-name-input"
						type="text"
						spellCheck={false}
						aria-label={t("panels.projectTree.projectName")}
						defaultValue={project.name}
						{...renameInputProps}
						className={cn("w-full min-w-0 border-0 bg-transparent p-0 outline-none", nameClass)}
					/>
				</div>
			) : (
				<button
					ref={onRegisterNameButton}
					type="button"
					data-testid="project-name"
					aria-expanded={isExpanded}
					onClick={onSelect}
					className="flex min-w-0 flex-1 items-center gap-8 self-stretch text-left outline-none focus-visible:outline-1 focus-visible:outline-focus-ring"
				>
					{isRunning ? folderIcon : null}
					<span className={nameClass}>{project.name}</span>
				</button>
			)}
			{needsAttention ? <AttentionDot /> : null}
			{!isExpanded && workspaceCount > 0 && (
				<span
					data-testid="project-workspace-count"
					className="shrink-0 tr-text-metadata text-text-muted"
				>
					{workspaceCount}
				</span>
			)}
			<IconButton
				icon={Plus}
				label={createWorkspaceLabel}
				variant="ghost"
				size="s"
				className={HOVER_CONTROL_CLASS}
				data-testid="add-workspace"
				onClick={() => onNewSession(preferredSessionTarget(project.id))}
			/>
		</div>
	);
	return (
		<>
			<ContextMenu open={menuOpen} onOpenChange={setMenuOpen}>
				<ContextMenuTrigger
					asChild
					onKeyDown={(event) => {
						if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
						event.preventDefault();
						const rect = event.currentTarget.getBoundingClientRect();
						event.currentTarget.dispatchEvent(
							new MouseEvent("contextmenu", {
								bubbles: true,
								clientX: rect.left,
								clientY: rect.bottom,
							}),
						);
					}}
				>
					{row}
				</ContextMenuTrigger>
				<ContextMenuContent
					data-testid="project-actions"
					onCloseAutoFocus={(event) => {
						event.preventDefault();
						if (!openingDialogRef.current) onRestoreFocus();
						openingDialogRef.current = false;
					}}
				>
					<ContextMenuItem
						data-testid="project-menu-create-workspace"
						onSelect={() => onNewSession("worktree")}
					>
						<Plus />
						{t("panels.projectTree.createWorkspace")}
					</ContextMenuItem>
					<ContextMenuItem
						data-testid="project-menu-open-existing-worktree"
						onSelect={(event) => {
							event.preventDefault();
							openDialogAfterMenu(onOpenExistingWorktree);
						}}
					>
						<FolderOpen />
						{t("panels.projectTree.openExistingWorktree")}
					</ContextMenuItem>
					<ContextMenuSeparator />
					{canRename ? (
						<ContextMenuItem
							data-testid="project-menu-rename"
							onSelect={() => {
								openingDialogRef.current = true;
								startRename();
							}}
						>
							<Pencil />
							{t("common.rename")}
						</ContextMenuItem>
					) : null}
					<ContextMenuItem
						data-testid="project-menu-close"
						onSelect={(event) => {
							event.preventDefault();
							openDialogAfterMenu(() => setConfirmOpen(true));
						}}
					>
						<X />
						{t("panels.projectTree.closeProject")}
					</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>
			<ConfirmDialog
				open={confirmOpen}
				onOpenChange={setConfirmOpen}
				title={t("panels.projectTree.closeTitle", { name: project.name })}
				description={t("panels.projectTree.closeDescription")}
				confirmLabel={t("panels.projectTree.closeProject")}
				confirmTestId="confirm-close-project"
				onConfirm={() => {
					closeConfirmedRef.current = true;
					onClose();
				}}
				onClosedAutoFocus={() => {
					if (!closeConfirmedRef.current) onRestoreFocus();
					closeConfirmedRef.current = false;
				}}
			/>
		</>
	);
}

function WorkspaceRow({
	workspace,
	settled,
	now,
	isActive,
	needsAttention,
	isRunning,
	canRename,
	canSettle,
	readAction,
	editors,
	onSelect,
	onOpenIn,
	onCopyPath,
	onReveal,
	onRename,
	onSettle,
	onKeepActive,
	onMarkRead,
	onMarkUnread,
}: {
	workspace: Workspace;
	settled: SettledReason | null;
	now: number;
	isActive: boolean;
	needsAttention: boolean;
	isRunning: boolean;
	canRename: boolean;
	canSettle: boolean;
	readAction: WorkspaceReadAction | null;
	editors: EditorInfo[];
	onSelect: () => void;
	onOpenIn: (editor: EditorInfo) => void;
	onCopyPath: () => void;
	onReveal: () => void;
	onRename: (name: string) => void;
	onSettle: () => void;
	onKeepActive: () => void;
	onMarkRead: () => void;
	onMarkUnread: () => void;
}) {
	const t = useT();
	const isDefault = isDefaultWorkspace(workspace);
	const isExternal = isExternalWorkspace(workspace);
	const { chats, refresh } = useWorkspaceChats(workspace.id);
	// Only the project folder trades its row for its chat rows; other workspaces list chats under their row.
	const headerless = isDefault && workspaceListsChats(workspace, chats.length);
	const isSettled = settled !== null;
	const settleBlocked = isRunning || needsAttention;
	const Icon = isExternal
		? isActive
			? RiFolderOpenFill
			: FolderOpen
		: isActive
			? RiGitBranchFill
			: GitBranch;
	const showBranch = !isSettled && workspace.branch !== workspace.name;
	const displayName = workspaceName(t, workspace);
	const [menuOpen, setMenuOpen] = useState(false);
	const openMenuFromContext = (event: MouseEvent) => {
		event.preventDefault();
		setMenuOpen(true);
	};
	const [confirmOpen, setConfirmOpen] = useState(false);
	const {
		editing,
		nameRef,
		start: startRename,
		inputProps: renameInputProps,
		onMenuCloseAutoFocus,
	} = useInlineRename({
		target: workspace,
		canRename,
		onRename: (_target, name) => onRename(name),
	});

	const identityClass = `flex min-h-24 min-w-0 flex-1 gap-8 text-left outline-none focus-visible:outline-1 focus-visible:outline-focus-ring items-center`;
	const identityIcon = isRunning ? (
		<RunningIcon className={cn("size-16", isActive ? "text-text-default" : "text-text-muted")} />
	) : isDefault ? (
		<span aria-hidden="true" className="size-16 shrink-0" />
	) : (
		<Icon className={`size-16 shrink-0 ${isActive ? "text-text-default" : "text-text-muted"}`} />
	);
	const branchLabel = showBranch ? (
		<span
			data-testid="workspace-branch"
			className="min-w-0 flex-1 truncate text-right text-text-subtle tr-text-metadata"
		>
			{workspace.branch}
		</span>
	) : null;

	const reasonChip = settled ? (
		<span
			data-testid="workspace-settled-reason"
			data-reason={settled.kind}
			title={settledReasonTitle(t, settled, now)}
			className={cn(
				"shrink-0 rounded-full border px-4 tr-text-caption",
				settled.kind === "review" && settled.state === "merged"
					? "border-feedback-info-muted text-feedback-info"
					: settled.kind === "override"
						? "border-feedback-warning-muted text-feedback-warning"
						: "border-border-default text-text-subtle",
			)}
		>
			{settledReasonLabel(t, settled, now)}
		</span>
	) : null;
	const hoverAction = isSettled ? (
		<IconButton
			icon={ArrowGoBack}
			label={t("panels.projectTree.keepActiveLabel", { name: displayName })}
			tooltip={t("panels.projectTree.keepActive")}
			variant="ghost"
			size="s"
			data-testid="workspace-keep-active"
			onClick={onKeepActive}
			className={HOVER_CONTROL_CLASS}
		/>
	) : canSettle ? (
		<IconButton
			icon={Check}
			label={t("panels.projectTree.settleLabel", { name: displayName })}
			tooltip={
				settleBlocked ? t("panels.projectTree.settleBlocked") : t("panels.projectTree.settle")
			}
			wrapTrigger
			variant="ghost"
			size="s"
			data-testid="workspace-settle"
			disabled={settleBlocked}
			onClick={onSettle}
			className={HOVER_CONTROL_CLASS}
		/>
	) : null;

	if (isDefault && chats.length === 0) return null;

	return (
		<li
			{...(headerless
				? {
						"data-testid": "workspace-item",
						"data-kind": workspace.kind ?? "worktree",
						"data-active": isActive,
						"data-attention": needsAttention || undefined,
						"data-running": isRunning || undefined,
					}
				: {})}
		>
			{headerless ? null : (
				<fieldset
					aria-label={displayName}
					data-testid="workspace-item"
					data-row
					data-active={isActive}
					data-kind={workspace.kind ?? "worktree"}
					data-settled={settled?.kind}
					data-attention={needsAttention || undefined}
					data-running={isRunning || undefined}
					onContextMenu={openMenuFromContext}
					className={cn(
						"group relative flex min-h-32 min-w-0 items-center gap-8 rounded-md border-0 py-4 pr-4 pl-8 transition-colors",
						isActive || menuOpen ? "bg-control-bg-selected" : "hover:bg-control-bg-hovered",
					)}
				>
					{editing ? (
						<div className={identityClass}>
							{identityIcon}
							<span className="flex min-w-0 flex-1 items-center gap-8">
								<input
									ref={nameRef}
									data-testid="workspace-name"
									data-editing
									type="text"
									spellCheck={false}
									aria-label={t("panels.projectTree.workspaceName")}
									defaultValue={workspace.name}
									{...renameInputProps}
									className={`w-full min-w-0 truncate border-0 bg-transparent p-0 tr-text-ui outline-none ${isActive ? "text-text-default" : "text-text-muted"}`}
								/>
								{branchLabel}
							</span>
						</div>
					) : (
						<button type="button" onClick={onSelect} className={identityClass}>
							{identityIcon}
							<span className="flex min-w-0 flex-1 items-center gap-8">
								<span
									data-testid="workspace-name"
									className={`truncate tr-text-ui ${isActive ? "text-text-default" : "text-text-muted"}`}
								>
									{displayName}
								</span>
								{branchLabel}
							</span>
						</button>
					)}
					{reasonChip}
					{needsAttention ? <AttentionDot /> : null}
					<span
						className={cn(
							"flex shrink-0 items-center gap-4",
							"[@media(hover:hover)]:absolute [@media(hover:hover)]:top-1/2 [@media(hover:hover)]:right-4 [@media(hover:hover)]:-translate-y-1/2 [@media(hover:hover)]:rounded-sm [@media(hover:hover)]:pl-4 [@media(hover:hover)]:group-hover:bg-control-bg-hovered",
							(isActive || menuOpen) && "[@media(hover:hover)]:group-hover:bg-control-bg-selected",
							menuOpen && "[@media(hover:hover)]:bg-control-bg-selected",
						)}
					>
						{hoverAction}
						<DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
							<DropdownMenuTrigger asChild>
								<IconButton
									icon={MoreVertical}
									label={t("panels.projectTree.workspaceActions", { name: displayName })}
									variant="ghost"
									size="s"
									data-testid="workspace-menu"
									className={HOVER_CONTROL_CLASS}
								/>
							</DropdownMenuTrigger>
							<DropdownMenuContent
								align="end"
								data-testid="workspace-actions"
								onCloseAutoFocus={onMenuCloseAutoFocus}
							>
								{editors.length > 0 && (
									<DropdownMenuSub>
										<DropdownMenuSubTrigger data-testid="workspace-open-in">
											<ExternalLink />
											{t("panels.projectTree.openIn")}
										</DropdownMenuSubTrigger>
										<DropdownMenuSubContent>
											{editors.map((editor) => (
												<DropdownMenuItem
													key={editor.id}
													data-testid="workspace-open-in-editor"
													onSelect={() => onOpenIn(editor)}
												>
													{editor.label}
												</DropdownMenuItem>
											))}
										</DropdownMenuSubContent>
									</DropdownMenuSub>
								)}
								{canRename ? (
									<DropdownMenuItem data-testid="workspace-rename" onSelect={startRename}>
										<Pencil />
										{t("common.rename")}
									</DropdownMenuItem>
								) : null}
								<DropdownMenuItem data-testid="workspace-copy-path" onSelect={onCopyPath}>
									<Copy />
									{t("panels.projectTree.copyPath")}
								</DropdownMenuItem>
								<DropdownMenuItem data-testid="workspace-reveal" onSelect={onReveal}>
									<FolderOpen />
									{t("panels.projectTree.reveal")}
								</DropdownMenuItem>
								{readAction !== null || canSettle ? <DropdownMenuSeparator /> : null}
								{readAction === "markRead" ? (
									<DropdownMenuItem data-testid="workspace-mark-read" onSelect={onMarkRead}>
										<MailOpen />
										{t("panels.projectTree.markRead")}
									</DropdownMenuItem>
								) : readAction === "markUnread" ? (
									<DropdownMenuItem data-testid="workspace-mark-unread" onSelect={onMarkUnread}>
										<MailUnread />
										{t("panels.projectTree.markUnread")}
									</DropdownMenuItem>
								) : null}
								{canSettle ? (
									isSettled ? (
										<DropdownMenuItem
											data-testid="workspace-menu-keep-active"
											onSelect={onKeepActive}
										>
											<ArrowGoBack />
											{t("panels.projectTree.keepActive")}
										</DropdownMenuItem>
									) : (
										<DropdownMenuItem
											data-testid="workspace-menu-settle"
											disabled={settleBlocked}
											onSelect={onSettle}
										>
											<Check />
											{t("panels.projectTree.settle")}
										</DropdownMenuItem>
									)
								) : null}
								{!isDefault && (
									<>
										<DropdownMenuSeparator />
										<DropdownMenuItem
											data-testid="workspace-remove"
											className="text-feedback-error focus:bg-feedback-error-subtle [&_svg]:text-feedback-error"
											onSelect={(event) => {
												event.preventDefault();
												setConfirmOpen(true);
											}}
										>
											<Trash2 />
											{isExternal
												? t("panels.projectTree.removeExternal")
												: t("panels.projectTree.removeWorkspace")}
										</DropdownMenuItem>
									</>
								)}
							</DropdownMenuContent>
						</DropdownMenu>
					</span>
				</fieldset>
			)}
			<WorkspaceSessions workspace={workspace} chats={chats} onChanged={refresh} />

			{!isDefault && (
				<RemoveWorkspaceDialog
					workspace={workspace}
					open={confirmOpen}
					onOpenChange={setConfirmOpen}
				/>
			)}
		</li>
	);
}
