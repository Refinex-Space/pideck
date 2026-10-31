import {
	type PromptHit,
	type QueueLane,
	type SessionQueueContent,
	sameModel,
	type TemplateInfo,
	type ThinkingLevel,
} from "@thinkrail/contracts";
import { t as translate, useT } from "@thinkrail/locales/react";
import { useCallback, useEffect, useInsertionEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { type ParsedTemplate, templateToSlashCommand, useTemplateCommandPicker } from "@/prompt";
import {
	EMPTY_RUNTIME,
	SettingsSection,
	selectActiveEditorTab,
	selectCanRenameChat,
	selectCatalogModel,
	selectCompactionTurnIds,
	selectPickerModels,
	selectSupportsMcp,
	selectWorkspaceById,
	toast,
	useAppStore,
	workspaceName,
} from "@/store";
import { errorText, getTransport } from "@/transport";
import type { ResultTarget } from "./ChatActions";
import { ChatHeader } from "./ChatHeader";
import { useChatResourcesScope } from "./ChatResourcesScope";
import ChatTranscript, { type ChatTranscriptHandle } from "./ChatTranscript";
import {
	Composer,
	type ComposerHandle,
	type ComposerSubmitDisposition,
	type SubmitBehavior,
} from "./Composer";
import { ExtraUsageNotice } from "./ExtraUsageNotice";
import { HistoryOverlay } from "./HistoryOverlay";
import { parseModelRef } from "./ModelEffortLabel";
import type { ModelSelection } from "./ModelEffortPicker";
import {
	compactSubmissionError,
	mergeNativeChatCommands,
	parseNativeChatCommand,
	prepareNameChatCommand,
} from "./nativeCommands";
import { QueueStrip } from "./QueueStrip";
import { deriveRecentPrompts } from "./recentPrompts";
import { ResourcesDock } from "./resources";
import { TemplateEditorDialog } from "./TemplateEditorDialog";
import { useMentionSource } from "./useMentionSource";
import { useModelCatalog } from "./useModelCatalog";
import { useModelPreferences } from "./useModelPreferences";
import { useSessionStats } from "./useSessionStats";
import "./tools/register";
import type { ChatAttachment } from "./types";
import { useHistorySearch } from "./useHistorySearch";

const TRY_AGAIN_PROMPT = "Try again.";

export default function ChatView({
	sessionId,
	workspaceId,
	onOpenFile,
	onOpenBrowser,
}: {
	sessionId: string;
	workspaceId: string;
	onOpenFile?: ((path: string) => void) | undefined;
	onOpenBrowser?: ((url: string) => void) | undefined;
}) {
	const t = useT();
	const sessionExists = useAppStore((s) => s.sessions[sessionId] !== undefined);
	const isStreaming = useAppStore((s) => s.sessions[sessionId]?.isStreaming ?? false);
	const draft = useAppStore((s) => s.sessions[sessionId]?.draft ?? "");
	const queue = useAppStore((s) => s.sessions[sessionId]?.queue ?? EMPTY_RUNTIME.queue);
	const sessionModel = useAppStore((s) => s.sessions[sessionId]?.model ?? null);
	const thinkingLevel = useAppStore(
		(s) => s.sessions[sessionId]?.thinkingLevel ?? EMPTY_RUNTIME.thinkingLevel,
	);
	const extUiStatus = useAppStore(
		(s) => s.sessions[sessionId]?.extUiStatus ?? EMPTY_RUNTIME.extUiStatus,
	);
	const extUiWidget = useAppStore(
		(s) => s.sessions[sessionId]?.extUiWidget ?? EMPTY_RUNTIME.extUiWidget,
	);
	const notice = useAppStore((s) => s.sessions[sessionId]?.notice ?? null);
	const [disablingNotice, setDisablingNotice] = useState(false);
	const commands = useAppStore((s) => s.sessions[sessionId]?.commands ?? EMPTY_RUNTIME.commands);
	const statsRefreshTick = useAppStore((s) => s.sessions[sessionId]?.statsRefreshTick ?? 0);
	const syncedConnectionGeneration = useAppStore(
		(s) => s.sessions[sessionId]?.syncedConnectionGeneration ?? 0,
	);
	const recentPrompts = useAppStore(
		useShallow((s) => deriveRecentPrompts(s.sessions[sessionId]?.turns ?? [])),
	);

	const status = useAppStore((s) => s.status);
	const connectionGeneration = useAppStore((s) => s.connectionGeneration);
	const canRenameChat = useAppStore(selectCanRenameChat);
	const supportsMcp = useAppStore(selectSupportsMcp);
	const composerGrowthLimit = useAppStore((state) => state.composerGrowthLimit);
	const chatLineWidth = useAppStore((state) => state.chatLineWidth);
	const chatLineWidthBounded = useAppStore((state) => state.chatLineWidthBounded);
	const chatMessageOrder = useAppStore((state) => state.chatMessageOrder);
	const {
		models: allModels,
		refreshing: modelsRefreshing,
		refresh: onRefreshModels,
	} = useModelCatalog();
	const hiddenModels = useAppStore((s) => s.hiddenModels);
	const visibleModels = useMemo(
		() => selectPickerModels(allModels, hiddenModels, []),
		[allModels, hiddenModels],
	);
	const models = useMemo(
		() => selectPickerModels(allModels, hiddenModels, [sessionModel]),
		[allModels, hiddenModels, sessionModel],
	);
	const modelPreferences = useModelPreferences(visibleModels);
	const projectId = useAppStore(
		(s) =>
			Object.values(s.workspaces)
				.flat()
				.find((w) => w.id === workspaceId)?.projectId,
	);
	const workspaceRoot = useAppStore(
		(s) => selectWorkspaceById(s, workspaceId)?.worktreePath ?? undefined,
	);
	const workspaces = useAppStore((s) => s.workspaces);
	const workspaceNames = useMemo(() => {
		const map: Record<string, string> = {};
		for (const list of Object.values(workspaces)) {
			for (const w of list) map[w.id] = workspaceName(t, w);
		}
		return map;
	}, [t, workspaces]);

	const currentModel = selectCatalogModel(models, sessionModel) ?? sessionModel;
	const refreshStats = useSessionStats({
		sessionId,
		statsRefreshTick,
		syncedConnectionGeneration,
		status,
		connectionGeneration,
		enabled: sessionExists,
	});

	const [mentionQuery, setMentionQuery] = useState<string | null>(null);
	const [slashActive, setSlashActive] = useState(false);
	const [templates, setTemplates] = useState<TemplateInfo[]>([]);
	const [templatesEmpty, setTemplatesEmpty] = useState(false);
	const [saveAsTemplateHit, setSaveAsTemplateHit] = useState<PromptHit | null>(null);
	const composerRef = useRef<ComposerHandle>(null);
	const isCurrentChat = useAppStore((state) => {
		const tab = selectActiveEditorTab(state, workspaceId);
		return tab?.kind === "chat" && tab.sessionId === sessionId;
	});
	useEffect(() => {
		if (isCurrentChat) useAppStore.getState().rememberChatTarget(workspaceId, sessionId);
	}, [isCurrentChat, sessionId, workspaceId]);
	const composerInsertion = useAppStore((s) => s.sessions[sessionId]?.composerInsertion);
	useEffect(() => {
		if (!composerInsertion) return;
		const frame = requestAnimationFrame(() => {
			const state = useAppStore.getState();
			if (
				state.activeWorkspaceId === workspaceId &&
				state.sessions[sessionId]?.composerInsertion?.id === composerInsertion.id
			)
				composerRef.current?.focusRange(composerInsertion.start, composerInsertion.end);
			state.consumeChatInsertion(sessionId, composerInsertion.id);
		});
		return () => cancelAnimationFrame(frame);
	}, [composerInsertion, sessionId, workspaceId]);
	const transcriptRef = useRef<ChatTranscriptHandle>(null);
	const {
		resources,
		fresh: freshResults,
		now,
		openDetail,
		openTranscript,
		openStatus,
		statusOpen,
	} = useChatResourcesScope();
	const markResultSeen = freshResults.markSeen;
	const openMcpSettings = useCallback(
		() => useAppStore.getState().openSettings(SettingsSection.Mcp),
		[],
	);
	const openProviderSettings = useCallback(
		() => useAppStore.getState().openSettings(SettingsSection.Providers),
		[],
	);
	const findModel = useCallback(
		(ref: string) => selectCatalogModel(allModels, parseModelRef(ref)),
		[allModels],
	);
	const readMcpOutput = useCallback(
		(toolCallId: string) =>
			getTransport().request("mcp.readOutput", { workspaceId, sessionId, toolCallId }),
		[workspaceId, sessionId],
	);

	const resultOpener = useMemo(() => {
		const { commands, finishedCommands, subagents, finishedSubagents } = resources.groups;
		const commandIds = new Set(
			resources.visible ? [...commands, ...finishedCommands].map((command) => command.id) : [],
		);
		return (target: ResultTarget): (() => void) | undefined => {
			if (target.kind === "command")
				return commandIds.has(target.id) ? () => openDetail(target) : undefined;
			const listed =
				resources.visible &&
				[...subagents, ...finishedSubagents].some(
					(child) => child.childSessionId === target.childSessionId,
				);
			return listed ? () => openDetail(target) : () => openTranscript(target.childSessionId);
		};
	}, [resources.visible, resources.groups, openDetail, openTranscript]);

	const stillRunning = useMemo(
		() =>
			resources.visible && resources.authoritative && resources.groups.activeCount > 0
				? { count: resources.groups.activeCount, onOpen: openStatus }
				: undefined,
		[resources.visible, resources.authoritative, resources.groups.activeCount, openStatus],
	);

	const chatViewRef = useCallback(
		(element: HTMLDivElement | null) => {
			if (element) {
				element.style.setProperty(
					"--chat-transcript-width",
					`calc(${chatLineWidth}ch + 2 * var(--chat-gutter))`,
				);
			}
		},
		[chatLineWidth],
	);

	const {
		state: historyState,
		openOverlay,
		close: closeHistory,
		setQuery,
		cycleScope,
		setScope,
		toggleStage,
		moveSelection,
		openMessage,
	} = useHistorySearch(sessionId, workspaceId, projectId);
	useEffect(() => {
		useAppStore.getState().setChatObscured(sessionId, historyState.open);
		return () => useAppStore.getState().setChatObscured(sessionId, false);
	}, [historyState.open, sessionId]);

	useEffect(() => {
		getTransport()
			.request("session.getCommands", { sessionId })
			.then((c) => useAppStore.getState().setCommands(sessionId, c))
			.catch(() => {});
	}, [sessionId]);

	useEffect(() => {
		if (!slashActive) return;
		let cancelled = false;
		getTransport()
			.request("template.list", { workspaceId })
			.then((res) => {
				if (cancelled) return;
				setTemplates(res.templates);
				setTemplatesEmpty(res.templates.length === 0);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [slashActive, workspaceId]);

	const mergedCommands = useMemo(
		() =>
			mergeNativeChatCommands(
				t,
				[
					...commands.filter((command) => command.source !== "prompt"),
					...templates.map(templateToSlashCommand),
				],
				canRenameChat,
			),
		[canRenameChat, commands, t, templates],
	);

	const mention = useMentionSource(workspaceId, draft, mentionQuery);

	const onMentionQuery = useCallback((q: string | null) => setMentionQuery(q), []);

	const liveRuntime = () => useAppStore.getState().sessions[sessionId];
	const pairSelection = useRef(0);

	const requestLevel = useCallback(
		(level: ThinkingLevel, previous: ThinkingLevel) =>
			getTransport()
				.request("session.setThinkingLevel", { sessionId, level })
				.catch((error: unknown) => {
					if (useAppStore.getState().sessions[sessionId]?.thinkingLevel === level) {
						useAppStore.getState().setThinkingLevel(sessionId, previous);
					}
					toast.error(errorText(error), translate("chat.view.effortChangeFailed"));
				}),
		[sessionId],
	);

	useEffect(() => {
		if (!currentModel || currentModel.thinkingLevels.includes(thinkingLevel)) return;
		let cancelled = false;
		getTransport()
			.request("model.clampThinking", {
				provider: currentModel.provider,
				id: currentModel.id,
				level: thinkingLevel,
			})
			.then((clamped) => {
				if (cancelled || clamped.level === thinkingLevel) return;
				pairSelection.current += 1;
				useAppStore.getState().setThinkingLevel(sessionId, clamped.level);
				return requestLevel(clamped.level, thinkingLevel);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [currentModel, thinkingLevel, sessionId, requestLevel]);

	const onSelectThinking = (level: ThinkingLevel) => {
		if (level === thinkingLevel) return;
		pairSelection.current += 1;
		useAppStore.getState().setThinkingLevel(sessionId, level);
		void requestLevel(level, thinkingLevel);
	};

	const onSelectModel = ({ model, level }: ModelSelection) => {
		if (sameModel(model, currentModel)) {
			if (level) onSelectThinking(level);
			return;
		}
		const previous = { model: sessionModel, level: thinkingLevel };
		const selection = ++pairSelection.current;
		const superseded = () => selection !== pairSelection.current;
		useAppStore.getState().setCurrentModel(sessionId, model);
		if (level) useAppStore.getState().setThinkingLevel(sessionId, level);
		getTransport()
			.request("session.setModel", { sessionId, model })
			.then(
				() => (level && !superseded() ? requestLevel(level, previous.level) : undefined),
				(error: unknown) => {
					if (sameModel(liveRuntime()?.model, model)) {
						if (previous.model) useAppStore.getState().setCurrentModel(sessionId, previous.model);
						if (level && !superseded()) {
							useAppStore.getState().setThinkingLevel(sessionId, previous.level);
						}
					}
					toast.error(
						errorText(error),
						translate("chat.view.modelSwitchFailed", { model: model.name }),
					);
				},
			)
			.then(() => refreshStats());
	};

	const restoreTextToDraft = (text: string) => {
		if (!text.trim()) return;
		const current = useAppStore.getState().sessions[sessionId]?.draft ?? "";
		const combined = [text, current].filter((t) => t.trim()).join("\n\n");
		useAppStore.getState().setChatDraft(sessionId, combined);
		composerRef.current?.refocus();
	};

	const restoreQueueContentToDraft = (content: SessionQueueContent): void => {
		const messages = [...content.steering, ...content.followUp];
		restoreTextToDraft(messages.map((message) => message.text).join("\n\n"));
		const images = messages.flatMap((message) => message.images ?? []);
		composerRef.current?.restoreAttachments(
			images.map((image, index) => ({
				name: `queued-image-${index + 1}`,
				content: image,
			})),
		);
	};

	const drainQueueToDraft = async (): Promise<void> => {
		const content = await getTransport().request("session.clearQueue", {
			sessionId,
			requireTextOnly: true,
		});
		restoreQueueContentToDraft(content);
	};

	const performCompact = (instructions?: string) => {
		const observedTurnIds = selectCompactionTurnIds(useAppStore.getState(), sessionId);
		void drainQueueToDraft()
			.then(() =>
				getTransport().request("session.compact", {
					sessionId,
					...(instructions ? { instructions } : {}),
				}),
			)
			.catch((err) =>
				useAppStore
					.getState()
					.appendCompactionFailureUnlessObserved(sessionId, observedTurnIds, errorText(err)),
			);
	};

	const performRename = (title: string) => {
		void getTransport()
			.request("session.rename", { workspaceId, sessionId, title })
			.catch((err) => useAppStore.getState().appendErrorTurn(sessionId, errorText(err)));
	};

	const performSend = (
		text: string,
		attachments: ChatAttachment[],
		behavior: Exclude<SubmitBehavior, "interrupt">,
	) => {
		const queued = behavior !== "send";
		freshResults.markAllSeen();
		if (!queued && (text || attachments.length > 0)) {
			transcriptRef.current?.armImmediateTurn();
			useAppStore.getState().appendUserMessage(sessionId, text, attachments);
		}
		const images = attachments.map((a) => a.content);
		const params = { sessionId, text, ...(images.length > 0 ? { images } : {}) };
		const method =
			behavior === "steer"
				? "session.steer"
				: behavior === "followUp"
					? "session.followUp"
					: "session.prompt";
		getTransport()
			.request(method, params)
			.catch((err) => {
				useAppStore.getState().appendErrorTurn(sessionId, errorText(err));
				if (queued) restoreTextToDraft(text);
				else {
					const streaming = useAppStore.getState().sessions[sessionId]?.isStreaming ?? false;
					transcriptRef.current?.cancelImmediateTurn(streaming);
				}
			});
	};

	const onSubmit = (
		text: string,
		attachments: ChatAttachment[],
		behavior: SubmitBehavior,
	): ComposerSubmitDisposition => {
		const nativeCommand = parseNativeChatCommand(text, canRenameChat);
		if (nativeCommand?.kind === "compact") {
			const submissionError = compactSubmissionError(
				attachments.length > 0,
				queue.hasImages === true,
			);
			if (submissionError) return { accepted: false, reason: submissionError };
			performCompact(nativeCommand.instructions);
			return { accepted: true };
		}
		if (nativeCommand?.kind === "name") {
			const prepared = prepareNameChatCommand(nativeCommand.title, attachments.length > 0);
			if ("reason" in prepared) return { accepted: false, reason: prepared.reason };
			performRename(prepared.title);
			return { accepted: true };
		}
		if (behavior !== "interrupt") {
			performSend(text, attachments, behavior);
			return { accepted: true };
		}
		getTransport()
			.request("session.abort", { sessionId })
			.then(() => performSend(text, attachments, "send"))
			.catch((err) => {
				useAppStore.getState().appendErrorTurn(sessionId, errorText(err));
				restoreTextToDraft(text);
			});
		return { accepted: true };
	};

	const removeQueued = (kind: QueueLane, index: number) =>
		getTransport().request("session.removeQueued", { sessionId, kind, index });

	const onEditQueued = (kind: QueueLane, index: number) =>
		void removeQueued(kind, index)
			.then(({ removed }) => {
				if (removed === null) return;
				restoreQueueContentToDraft({ steering: [removed], followUp: [] });
			})
			.catch(() => {});

	const onRemoveQueued = (kind: QueueLane, index: number) =>
		void removeQueued(kind, index).catch(() => {});

	const onAbort = () => {
		void getTransport()
			.request("session.abort", { sessionId, restoreQueue: true })
			.then(({ restoredQueue }) => {
				if (restoredQueue) restoreQueueContentToDraft(restoredQueue);
			})
			.catch(() => {});
	};

	const onDismissHistory = () => {
		closeHistory();
		composerRef.current?.refocus();
	};

	const onHistoryOutsidePress = () => {
		closeHistory();
		setTimeout(() => {
			if (document.activeElement === document.body) composerRef.current?.refocus();
		});
	};

	const onHistoryOpen = () => (historyState.open ? onDismissHistory() : openOverlay(draft));

	const onManageTemplates = () => useAppStore.getState().openSettings(SettingsSection.Templates);

	const onInsertHit = (hit: PromptHit) => {
		composerRef.current?.insertText(hit.text);
		closeHistory();
	};

	const onInsertAndSendHit = (hit: PromptHit) => {
		composerRef.current?.insertAndSubmit(hit.text, isStreaming ? "followUp" : "send");
		closeHistory();
	};

	const onSaveAsTemplateHit = (hit: PromptHit) => {
		closeHistory();
		setSaveAsTemplateHit(hit);
	};

	const onDeleteHistoryChat = async (targetWorkspaceId: string, targetSessionId: string) => {
		try {
			await getTransport().request("session.delete", {
				workspaceId: targetWorkspaceId,
				sessionId: targetSessionId,
			});
			closeHistory();
			useAppStore.getState().deleteChat(targetWorkspaceId, targetSessionId);
		} catch (err) {
			toast.error(errorText(err), translate("chat.view.deleteFailed"));
		}
	};

	const loadTemplate = useCallback(
		(name: string) => getTransport().request("template.get", { workspaceId, name }),
		[workspaceId],
	);
	const applyTemplate = useCallback(
		(template: ParsedTemplate) => composerRef.current?.insertTemplate(template),
		[],
	);
	const { pending: templatePending, pick: onPickTemplate } = useTemplateCommandPicker({
		draft,
		contextKey: `${workspaceId}:${sessionId}`,
		load: loadTemplate,
		onApply: applyTemplate,
	});

	const historyOpenRequest = useAppStore((s) => s.historyOpenRequest);
	const historyOverlayOpen = historyState.open;
	useEffect(() => {
		if (historyOpenRequest?.sessionId !== sessionId) return;
		if (useAppStore.getState().historyOpenRequest !== historyOpenRequest) return;
		useAppStore.getState().clearHistoryOpen();
		if (historyOverlayOpen) cycleScope();
		else composerRef.current?.openHistory();
	}, [historyOpenRequest, sessionId, historyOverlayOpen, cycleScope]);

	const widgetEntries = Object.entries(extUiWidget);
	const disableNotice = () => {
		setDisablingNotice(true);
		getTransport()
			.request("provider.disableWarning", { warning: "anthropicExtraUsage" })
			.then(() => useAppStore.getState().silenceNotice("anthropicExtraUsage"))
			.catch((err) => toast.error(errorText(err), translate("chat.extraUsage.disableFailed")))
			.finally(() => setDisablingNotice(false));
	};
	const focusComposer = useCallback(() => composerRef.current?.refocus(), []);
	// Keep a stable `onTryAgain` identity (it is passed to every transcript row) while always calling the
	// latest `performSend` closure.
	const performSendRef = useRef(performSend);
	useInsertionEffect(() => {
		performSendRef.current = performSend;
	});
	const onTryAgain = useCallback(() => performSendRef.current(TRY_AGAIN_PROMPT, [], "send"), []);

	return (
		<div
			ref={chatViewRef}
			data-testid="chat-view"
			data-line-width-bounded={chatLineWidthBounded}
			data-message-order={chatMessageOrder}
			className="flex h-full min-h-0 min-w-0 flex-col bg-container-workspace-bg [container-type:size]"
		>
			<ChatHeader statusEntries={Object.entries(extUiStatus)} />
			<ChatTranscript
				ref={transcriptRef}
				sessionId={sessionId}
				workspaceId={workspaceId}
				onOpenFile={onOpenFile}
				onOpenBrowser={onOpenBrowser}
				workspaceRoot={workspaceRoot}
				focusComposer={focusComposer}
				openSubagentTranscript={openTranscript}
				resultOpener={resultOpener}
				markResultSeen={markResultSeen}
				onTryAgain={onTryAgain}
				historyOpen={historyState.open}
				stillRunning={stillRunning}
				readMcpOutput={supportsMcp ? readMcpOutput : undefined}
				openMcpSettings={supportsMcp ? openMcpSettings : undefined}
				openProviderSettings={supportsMcp ? openProviderSettings : undefined}
				findModel={findModel}
			/>
			{widgetEntries.length > 0 ? (
				<div className="shrink-0 border-border-default border-t bg-container-elevated-bg px-12 py-4 text-text-muted tr-text-metadata">
					{widgetEntries.map(([key, lines]) => (
						<div key={key}>{lines.join(" ")}</div>
					))}
				</div>
			) : null}
			<QueueStrip queue={queue} onEdit={onEditQueued} onRemove={onRemoveQueued} />
			{resources.visible && !statusOpen ? (
				<ResourcesDock
					commands={resources.groups.commands}
					subagents={resources.groups.subagents}
					freshCommands={freshResults.commands}
					freshSubagents={freshResults.subagents}
					onDismiss={markResultSeen}
					now={now}
					authoritative={resources.authoritative}
					actions={resources.actions}
					onInspect={openDetail}
					onStopCommand={resources.stopCommand}
					onStopSubagent={resources.stopSubagent}
				/>
			) : null}
			{notice === "anthropicExtraUsage" ? (
				<ExtraUsageNotice
					context="chat"
					className="mx-12 mb-8 shrink-0"
					onDismiss={() => useAppStore.getState().dismissSessionNotice(sessionId)}
					onDisable={disableNotice}
					disabling={disablingNotice}
				/>
			) : null}
			<div className="relative shrink-0">
				<HistoryOverlay
					state={historyState}
					workspaceNames={workspaceNames}
					onQueryChange={setQuery}
					onSetScope={setScope}
					onToggleStage={toggleStage}
					onMoveSelection={moveSelection}
					onClose={onDismissHistory}
					onOutsidePress={onHistoryOutsidePress}
					onInsert={onInsertHit}
					onInsertAndSend={onInsertAndSendHit}
					onOpenMessage={openMessage}
					onSaveAsTemplate={onSaveAsTemplateHit}
					onDeleteChat={(wsId, id) => void onDeleteHistoryChat(wsId, id)}
				/>
				<Composer
					ref={composerRef}
					value={draft}
					onChange={(v) => useAppStore.getState().setChatDraft(sessionId, v)}
					onCursorChange={(draft, start, end) =>
						useAppStore
							.getState()
							.rememberComposerCursor(workspaceId, sessionId, { draft, start, end })
					}
					isStreaming={isStreaming}
					growthLimit={composerGrowthLimit}
					commands={mergedCommands}
					templatePending={templatePending}
					mention={mention}
					recentPrompts={recentPrompts}
					models={models}
					modelsRefreshing={modelsRefreshing}
					onRefreshModels={onRefreshModels}
					currentModel={currentModel}
					thinkingLevel={thinkingLevel}
					modelPreferences={modelPreferences}
					onMentionQuery={onMentionQuery}
					onSlashActive={setSlashActive}
					onSelectModel={onSelectModel}
					onSelectThinking={onSelectThinking}
					onSubmit={onSubmit}
					onAbort={onAbort}
					onHistoryOpen={onHistoryOpen}
					onPickTemplate={onPickTemplate}
					onOpenFile={onOpenFile}
					onManageTemplates={onManageTemplates}
					templatesEmpty={templatesEmpty}
				/>
			</div>
			<TemplateEditorDialog
				open={saveAsTemplateHit != null}
				onOpenChange={(open) => {
					if (!open) setSaveAsTemplateHit(null);
				}}
				workspaceId={workspaceId}
				initialBody={saveAsTemplateHit?.text ?? ""}
			/>
		</div>
	);
}
