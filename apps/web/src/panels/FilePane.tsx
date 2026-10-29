import { FILE_WORKBENCH_PROTOCOL_VERSION } from "@thinkrail/contracts";
import { useT } from "@thinkrail/locales/react";
import {
	describeResource,
	PENDING_TEXT_META,
	RendererToggles,
	RendererView,
	type ResourceContent,
	type ResourceEditorControls,
	type ResourceTextSelection,
	rendererImplementationKey,
	resourceContent,
	UnplacedReviewStrip,
	useRendererSelection,
} from "@thinkrail/resource-renderers";
import { Button, IconButton } from "@thinkrail/ui/button";
import { ResourceToolbar } from "@thinkrail/ui/resource-toolbar";
import { LoadingRegion } from "@thinkrail/ui/skeleton";
import {
	ChevronRight,
	FilePenLine,
	MessageSquarePlus,
	MessageSquareText,
	Save,
	Search,
	TextSelect,
	WrapText,
	X,
} from "lucide-react";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { FileTypeIcon } from "../fileIcons";
import { isPhoneViewport } from "../lib";
import { type FileTab, fileDraftKey, selectWorkspaceProject, toast, useAppStore } from "../store";
import { errorText, getTransport } from "../transport";
import { ConfirmDialog } from "./ConfirmDialog";
import { FileEntryActions } from "./FileEntryActions";
import { FileOperationDialog } from "./FileOperationDialog";
import { addFileToChat, saveFileDraft } from "./fileActions";
import { resourceBytesUrl, useResetViewStateOnImplementationChange } from "./resourcePane";
import { reviewFlagFor } from "./reviewModel";
import { SendReviewButton } from "./SendReviewButton";
import { useLiveTabContent } from "./useLiveTabContent";
import { useFileReview } from "./useReviewCommenting";

const loading = <LoadingRegion rows={12} className="h-full p-12" testId="file-pane-loading" />;

export function FilePane({ tab }: { tab: FileTab }) {
	const t = useT();
	const setTabRenderer = useAppStore((state) => state.setTabRenderer);
	const draft = useAppStore((state) => state.fileDrafts[fileDraftKey(tab.workspaceId, tab.path)]);
	const wrap = useAppStore((state) => state.fileWordWrap);
	const supported = useAppStore(
		(state) => (state.protocolVersion ?? 0) >= FILE_WORKBENCH_PROTOCOL_VERSION,
	);
	const projectName = useAppStore(
		(state) => selectWorkspaceProject(state, tab.workspaceId)?.name ?? "",
	);
	const [controls, setControls] = useState<ResourceEditorControls | null>(null);
	const paneRef = useRef<HTMLDivElement | null>(null);
	const focusRequest = useAppStore((s) => s.fileEditorFocus);
	useEffect(() => {
		if (
			!focusRequest ||
			focusRequest.workspaceId !== tab.workspaceId ||
			focusRequest.path !== tab.path
		)
			return;
		const frame = requestAnimationFrame(() => {
			const state = useAppStore.getState();
			if (state.activeWorkspaceId !== tab.workspaceId) {
				state.clearFileEditorFocus(focusRequest.id);
				return;
			}
			if (controls) {
				controls.focus();
				state.clearFileEditorFocus(focusRequest.id);
			} else {
				const editor = paneRef.current?.querySelector<HTMLTextAreaElement>(
					'[data-testid="file-mobile-editor"]',
				);
				if (editor) {
					editor.focus();
					state.clearFileEditorFocus(focusRequest.id);
				}
			}
		});
		return () => cancelAnimationFrame(frame);
	}, [focusRequest, controls, tab.path, tab.workspaceId]);
	const [selection, setSelection] = useState<ResourceTextSelection | null>(null);
	const [discard, setDiscard] = useState(false);
	const [saveAs, setSaveAs] = useState(false);
	const readError = tab.loadError ?? null;
	const dirty = !!draft && draft.text !== draft.baseContent;
	const review = useFileReview(tab.workspaceId, tab.path, "inline");
	const reviewComments = useAppStore(
		(state) => state.reviewsByWorkspace[tab.workspaceId]?.comments,
	);
	const fileHasReviewDraft = useMemo(
		() => reviewFlagFor(reviewComments, tab.path) === "draft",
		[reviewComments, tab.path],
	);
	const keepSnapshot = (tick: number, failure?: unknown) => {
		const state = useAppStore.getState();
		const current = state.tabsByWorkspace[tab.workspaceId]?.find((item) => item.id === tab.id);
		if (current?.kind !== "file" || current.path !== tab.path) return;
		state.updateFileTabContent(
			tab.workspaceId,
			tab.id,
			current.content,
			current.meta,
			tick,
			failure === undefined ? undefined : errorText(failure),
		);
	};
	const { reload } = useLiveTabContent(tab, {
		read: () =>
			getTransport().request("fs.readFile", { workspaceId: tab.workspaceId, path: tab.path }),
		applyFresh: ({ content, meta }, tick) =>
			useAppStore
				.getState()
				.updateFileTabContent(tab.workspaceId, tab.id, content, meta, tick, null),
		keepCurrent: (tick) => keepSnapshot(tick),
		onFailure: (error, tick) => keepSnapshot(tick, error),
	});
	const draftHash = draft?.baseHash;
	const effectiveMeta = useMemo(
		() =>
			draftHash !== undefined
				? { ...(tab.meta ?? PENDING_TEXT_META), text: true, hash: draftHash }
				: (tab.meta ?? PENDING_TEXT_META),
		[draftHash, tab.meta],
	);
	const resource = useMemo(
		() => describeResource(tab.workspaceId, tab.path, effectiveMeta),
		[tab.workspaceId, tab.path, effectiveMeta],
	);
	const { mobile, candidates, renderer, implementationKey, placedThreadIds, onPlacedThreadIds } =
		useRendererSelection(resource, "view", draft ? "thinkrail/code" : tab.rendererId);
	useResetViewStateOnImplementationChange(tab.workspaceId, tab.id, implementationKey);
	const content: ResourceContent = draft
		? { kind: "text", text: draft.text, hash: draft.baseHash }
		: resourceContent(tab.content, tab.meta, () => resourceBytesUrl(tab.workspaceId, tab.path));
	const source = renderer.id === "thinkrail/code";
	const reviews = [review.worktree];
	const canEdit =
		supported &&
		tab.meta?.text === true &&
		tab.meta.hash !== null &&
		(tab.meta.byteLength ?? 0) <= 8 * 1024 * 1024;
	const save = () => {
		void saveFileDraft(tab.workspaceId, tab.path).catch(() => {});
	};
	const insert = (selected?: ResourceTextSelection) => {
		void addFileToChat(tab.workspaceId, tab.path, "file", selected).catch((error) =>
			toast.error(errorText(error)),
		);
	};
	const finishEditing = () => {
		if (dirty) setDiscard(true);
		else useAppStore.getState().discardFileDraft(tab.workspaceId, tab.path);
	};
	const showDirectory = (path: string) =>
		useAppStore.getState().showFilesPath(tab.workspaceId, path, "dir");
	const saveViewState = (state: unknown) => {
		const current = useAppStore
			.getState()
			.tabsByWorkspace[tab.workspaceId]?.find((candidate) => candidate.id === tab.id);
		if (
			current?.kind === "file" &&
			(draft || current.rendererId === undefined || current.rendererId === renderer.id) &&
			rendererImplementationKey(renderer.id, isPhoneViewport()) === implementationKey
		)
			useAppStore.getState().setTabViewState(tab.workspaceId, tab.id, state);
	};
	const parts = tab.path.split("/");
	return (
		<div
			className="flex h-full min-h-0 flex-col"
			ref={paneRef}
			data-testid="file-pane"
			data-dirty={dirty || undefined}
		>
			<div
				data-testid="file-toolbar"
				role="toolbar"
				aria-label={t("files.filePath")}
				className="flex h-32 min-w-0 shrink-0 items-center gap-4 border-border-default border-b bg-container-workspace-bg px-8"
			>
				<nav
					aria-label={t("files.filePath")}
					className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden tr-text-metadata text-text-muted"
					title={tab.path}
				>
					<button
						type="button"
						onClick={() => showDirectory("")}
						className="max-w-128 shrink truncate rounded-sm px-4 hover:bg-control-bg-hovered"
					>
						{projectName || t("files.root")}
					</button>
					{parts.map((part, index) => (
						<span
							key={parts.slice(0, index + 1).join("/")}
							className="flex min-w-0 items-center gap-4"
						>
							<ChevronRight className="size-12 shrink-0" aria-hidden="true" />
							{index === parts.length - 1 ? (
								<>
									<FileTypeIcon path={tab.path} />
									<span className="truncate text-text-default">{part}</span>
								</>
							) : (
								<button
									type="button"
									onClick={() => showDirectory(parts.slice(0, index + 1).join("/"))}
									className="truncate rounded-sm px-2 hover:bg-control-bg-hovered"
								>
									{part}
								</button>
							)}
						</span>
					))}
					{dirty ? (
						<span
							className="size-6 shrink-0 rounded-full bg-text-muted"
							role="img"
							aria-label={t("files.unsaved")}
						/>
					) : null}
				</nav>
				<ResourceToolbar>
					<div className="flex max-w-full shrink-0 items-center gap-2 overflow-x-auto">
						{!draft && (candidates.length >= 2 || fileHasReviewDraft) ? (
							<div data-testid="resource-view-toggle" className="flex h-32 items-center gap-4">
								<SendReviewButton workspaceId={tab.workspaceId} path={tab.path} />
								<RendererToggles
									candidates={candidates}
									renderer={renderer}
									onRendererId={(id) => setTabRenderer(tab.workspaceId, tab.id, id)}
								/>
							</div>
						) : null}
						{source ? (
							<>
								<IconButton
									tooltipSide="bottom"
									icon={WrapText}
									label={t("files.wordWrap")}
									aria-pressed={wrap}
									selected={wrap}
									data-testid="file-word-wrap"
									onClick={() => useAppStore.getState().setFileWordWrap(!wrap)}
								/>
								<IconButton
									tooltipSide="bottom"
									icon={Search}
									label={t("files.find")}
									data-testid="file-find"
									disabled={!controls}
									onClick={() => controls?.find()}
								/>
								<IconButton
									tooltipSide="bottom"
									icon={TextSelect}
									label={t("files.selectAll")}
									data-testid="file-select-all"
									disabled={!controls}
									onClick={() => controls?.selectAll()}
								/>
								<IconButton
									tooltipSide="bottom"
									icon={MessageSquareText}
									label={draft ? t("files.finishBeforeComment") : t("files.commentSelection")}
									disabled={!selection || !!draft}
									data-testid="file-comment-selection"
									onClick={() => controls?.comment()}
								/>
							</>
						) : null}
						<IconButton
							tooltipSide="bottom"
							icon={MessageSquarePlus}
							label={selection && source ? t("files.addSelectionToChat") : t("files.addToChat")}
							data-testid="file-reference-chat"
							onClick={() => insert(source ? (selection ?? undefined) : undefined)}
						/>
						{draft ? (
							<>
								<IconButton
									tooltipSide="bottom"
									icon={Save}
									label={t("files.save")}
									loading={draft.saving === true}
									disabled={!dirty || !supported}
									data-testid="file-save"
									onClick={save}
								/>
								<IconButton
									tooltipSide="bottom"
									icon={X}
									label={t("files.finishEdit")}
									disabled={draft.saving}
									data-testid="file-finish-edit"
									onClick={finishEditing}
								/>
							</>
						) : (
							<IconButton
								tooltipSide="bottom"
								icon={FilePenLine}
								label={
									!supported
										? t("files.hostUpdateRequired")
										: canEdit
											? t("files.edit")
											: t("files.editLimit")
								}
								disabled={!canEdit}
								data-testid="file-edit"
								onClick={() => {
									const state = useAppStore.getState();
									state.beginFileEdit(tab.workspaceId, tab.path, tab.content, tab.meta?.hash ?? "");
									state.requestFileEditorFocus(tab.workspaceId, tab.path);
								}}
							/>
						)}
						<FileEntryActions workspaceId={tab.workspaceId} path={tab.path} kind="file" />
					</div>
				</ResourceToolbar>
			</div>
			{draft?.error || readError || (draft && tab.meta?.hash !== draft.baseHash) ? (
				<div
					role="alert"
					className="flex flex-wrap items-center gap-8 border-border-default border-b px-12 py-8 tr-text-metadata text-feedback-warning"
				>
					<span className="min-w-0 flex-1">
						{draft?.error ?? readError ?? t("files.changedOnDisk")}
					</span>
					{draft ? (
						<Button
							variant="outline"
							size="m"
							disabled={!supported}
							onClick={() => setSaveAs(true)}
						>
							{t("files.saveAs")}
						</Button>
					) : null}
					<Button
						variant="ghost"
						size="m"
						disabled={draft?.saving}
						onClick={() => {
							if (dirty) setDiscard(true);
							else {
								useAppStore.getState().discardFileDraft(tab.workspaceId, tab.path);
								reload();
							}
						}}
					>
						{t("files.reload")}
					</Button>
				</div>
			) : null}
			{!draft ? (
				<UnplacedReviewStrip
					reviews={reviews}
					renderer={renderer}
					intent="view"
					candidates={candidates}
					{...(placedThreadIds ? { placedThreadIds } : {})}
					onSelectRenderer={(id) => setTabRenderer(tab.workspaceId, tab.id, id)}
				/>
			) : null}
			<div className="min-h-0 flex-1">
				<Suspense fallback={loading}>
					<RendererView
						key={implementationKey}
						renderer={renderer}
						mobile={mobile}
						resource={resource}
						content={content}
						review={review.worktree}
						onPlacedThreadIds={onPlacedThreadIds}
						viewState={tab.viewState}
						onViewState={saveViewState}
						onEditorReady={setControls}
						onSelectionChange={setSelection}
						onAddSelectionToChat={insert}
						wordWrap={wrap}
						{...(draft
							? {
									editing: {
										onChange: (text: string) =>
											useAppStore.getState().setFileDraftText(tab.workspaceId, tab.path, text),
										onSave: save,
									},
								}
							: {})}
					/>
				</Suspense>
			</div>
			<ConfirmDialog
				open={discard}
				onOpenChange={setDiscard}
				title={t("files.unsavedTitle")}
				description={t("files.unsavedDescription", { path: tab.path })}
				confirmLabel={t("files.discard")}
				destructive
				onConfirm={() => {
					useAppStore.getState().discardFileDraft(tab.workspaceId, tab.path);
					reload();
				}}
			/>
			{saveAs && draft ? (
				<FileOperationDialog
					workspaceId={tab.workspaceId}
					path={tab.path}
					kind="file"
					operation="saveAs"
					initialContent={draft.text}
					onClose={() => setSaveAs(false)}
				/>
			) : null}
		</div>
	);
}
