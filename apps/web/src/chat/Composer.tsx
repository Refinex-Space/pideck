import { RiSparkling2Line as Sparkles } from "@remixicon/react";
import type { ComposerGrowthLimit, ThinkingLevel, WireModel } from "@thinkrail/contracts";
import type { MessageKey } from "@thinkrail/locales";
import { useT } from "@thinkrail/locales/react";
import { IconButton } from "@thinkrail/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@thinkrail/ui/popover";
import { cn } from "@thinkrail/ui/utils";
import { ChevronDown, CornerDownLeft, Mic } from "lucide-react";
import {
	forwardRef,
	type KeyboardEvent,
	useCallback,
	useEffect,
	useId,
	useImperativeHandle,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { RunningIcon } from "@/components/RunningIcon";
import {
	applyPromptCompletion,
	applyTemplateSlotEdit,
	beginTemplateSlotSession,
	CompletionMenu,
	detectPromptTrigger,
	finalizeTemplateSlotSession,
	highlightSegments,
	hoistSkillReference,
	isPromptKeyEventComposing,
	optionId,
	type ParsedTemplate,
	PromptField,
	type PromptTokenHit,
	promptSegments,
	type SlashCommandItem,
	scanPromptTokens,
	stepTemplateSlotSession,
	TemplateSlotHint,
	type TemplateSlotSessionState,
	useCompletion,
	usePendingSelection,
	useSlashCommandCompletion,
} from "@/prompt";
import {
	insertDictation,
	useDictation,
	useSpeechStatus,
	useSpeechSupported,
	Waveform,
} from "@/speech";
import {
	type MentionCandidate,
	mentionCompletionItems,
	slashCompletionItems,
} from "./completionItems";
import { FileChip } from "./FileChip";
import {
	ModelEffortPicker,
	type ModelEffortPickerHandle,
	type ModelSelection,
} from "./ModelEffortPicker";
import { isModelCommand, parseModelCommand } from "./nativeCommands";
import { PromptTokenCard } from "./PromptTokenCard";
import { imagePasteDropHandlers, PromptImageStrip, usePromptImages } from "./promptImages";
import type { ChatAttachment } from "./types";
import type { MentionSource } from "./useMentionSource";
import type { ModelPreferences } from "./useModelPreferences";

export type SubmitBehavior = "send" | "steer" | "followUp" | "interrupt";

export type ComposerSubmitDisposition = { accepted: true } | { accepted: false; reason: string };

const COMPOSER_EDITOR_LIMIT_CLASS = {
	compact: "max-h-[calc(6lh+var(--space-12)+var(--space-12))]",
	roomy: "max-h-[calc(10lh+var(--space-12)+var(--space-12))]",
	"half-chat":
		"max-h-[calc(50cqh-var(--space-16)-var(--space-16)-var(--space-4)-var(--space-4)-var(--space-4)-var(--space-4))]",
} satisfies Record<ComposerGrowthLimit, string>;

const STREAMING_SEND_MODES = [
	{
		behavior: "steer" as const,
		name: "chat.composer.mode.steer",
		meaning: "chat.composer.mode.steerMeaning",
		keys: "Enter",
		testid: "send-mode-steer",
	},
	{
		behavior: "followUp" as const,
		name: "chat.composer.mode.queue",
		meaning: "chat.composer.mode.queueMeaning",
		keys: "Cmd/Ctrl+Enter",
		testid: "send-mode-queue",
	},
	{
		behavior: "interrupt" as const,
		name: "chat.composer.mode.interrupt",
		meaning: "chat.composer.mode.interruptMeaning",
		keys: "Cmd/Ctrl+Shift+Enter",
		testid: "send-mode-interrupt",
	},
] satisfies {
	behavior: SubmitBehavior;
	name: MessageKey;
	meaning: MessageKey;
	keys: string;
	testid: string;
}[];

interface ComposerProps {
	value: string;
	onChange: (value: string) => void;
	onCursorChange?: (draft: string, start: number, end: number) => void;
	isStreaming: boolean;
	growthLimit: ComposerGrowthLimit;
	commands: SlashCommandItem[];
	templatePending: boolean;
	mention: MentionSource;
	recentPrompts: string[];
	models: WireModel[];
	modelsRefreshing: boolean;
	onRefreshModels: (force: boolean) => void;
	currentModel: WireModel | null;
	thinkingLevel: ThinkingLevel;
	modelPreferences: ModelPreferences;
	onMentionQuery: (query: string | null) => void;
	onSlashActive: (active: boolean) => void;
	onSelectModel: (selection: ModelSelection) => void;
	onSelectThinking: (level: ThinkingLevel) => void;
	onSubmit: (
		text: string,
		attachments: ChatAttachment[],
		behavior: SubmitBehavior,
	) => ComposerSubmitDisposition;
	onAbort: () => void;
	onHistoryOpen?: () => void;
	onPickTemplate?: (name: string) => void;
	onOpenFile?: ((path: string) => void) | undefined;
	onManageTemplates?: () => void;
	templatesEmpty?: boolean;
}

export interface ComposerHandle {
	insertText: (text: string) => void;
	insertAndSubmit: (text: string, behavior: SubmitBehavior) => void;
	insertTemplate: (parsed: ParsedTemplate) => void;
	restoreAttachments: (attachments: ChatAttachment[]) => void;
	openHistory: () => void;
	focusRange: (start: number, end: number) => void;
	refocus: () => void;
}

export const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer(
	{
		value,
		onChange,
		onCursorChange,
		isStreaming,
		growthLimit,
		commands,
		templatePending,
		mention,
		recentPrompts,
		models,
		modelsRefreshing,
		onRefreshModels,
		currentModel,
		thinkingLevel,
		modelPreferences,
		onMentionQuery,
		onSlashActive,
		onSelectModel,
		onSelectThinking,
		onSubmit,
		onAbort,
		onHistoryOpen,
		onPickTemplate,
		onOpenFile,
		onManageTemplates,
		templatesEmpty,
	},
	handleRef,
) {
	const t = useT();
	const ref = useRef<HTMLTextAreaElement>(null);
	const pickerRef = useRef<ModelEffortPickerHandle>(null);
	const [caret, setCaret] = useState(0);
	const attachedImages = usePromptImages();
	const { images } = attachedImages;
	const [submitError, setSubmitError] = useState<string | null>(null);
	const pendingImages = attachedImages.pending;
	useEffect(() => {
		if (images.length === 0) setSubmitError(null);
	}, [images.length]);
	const [sendMenuOpen, setSendMenuOpen] = useState(false);
	const [tokenHit, setTokenHit] = useState<PromptTokenHit | null>(null);
	const recallIdxRef = useRef<number | null>(null);
	const [slotSession, setSlotSession] = useState<TemplateSlotSessionState | null>(null);
	const slots = slotSession?.slots ?? null;
	const slotIdx = slotSession?.activeIndex ?? 0;
	const editorSizerRef = useRef<HTMLDivElement | null>(null);
	const [draftNeedsExpansion, setDraftNeedsExpansion] = useState(false);
	const expanded = isStreaming || draftNeedsExpansion;
	const measureDraftExpansion = useCallback(() => {
		const sizer = editorSizerRef.current;
		if (!sizer) return;
		const styles = getComputedStyle(sizer);
		const oneLineHeight =
			Number.parseFloat(styles.lineHeight) +
			Number.parseFloat(styles.paddingTop) +
			Number.parseFloat(styles.paddingBottom);
		setDraftNeedsExpansion(value.includes("\n") || sizer.scrollHeight > oneLineHeight + 1);
	}, [value]);

	useLayoutEffect(() => {
		const sizer = editorSizerRef.current;
		if (!sizer) return;
		measureDraftExpansion();
		const observer = new ResizeObserver(measureDraftExpansion);
		observer.observe(sizer);
		return () => observer.disconnect();
	}, [measureDraftExpansion]);

	const trigger = detectPromptTrigger(value, caret);
	const mentionTrigger = trigger?.kind === "mention" ? trigger : null;
	const mentionQuery = mentionTrigger?.query ?? null;
	const slashActive = trigger?.kind === "slash";

	useEffect(() => onMentionQuery(mentionQuery), [mentionQuery, onMentionQuery]);
	useEffect(() => onSlashActive(slashActive), [slashActive, onSlashActive]);

	const focusSelection = usePendingSelection(ref, setCaret);
	const speechSupported = useSpeechSupported();
	const speechStatus = useSpeechStatus();
	const draftRef = useRef({ value, slotSession });
	useEffect(() => {
		draftRef.current = { value, slotSession };
	});

	const replaceDraft = useCallback(
		(text: string, caret?: number) => {
			recallIdxRef.current = null;
			setSlotSession(null);
			setSubmitError(null);
			onChange(text);
			focusSelection(caret ?? text.length);
		},
		[onChange, focusSelection],
	);

	const insertSpoken = (text: string) => {
		const { value: draft, slotSession: session } = draftRef.current;
		const next = insertDictation(draft, ref.current?.selectionEnd ?? draft.length, text);
		if (next.value === draft) return;
		recallIdxRef.current = null;
		setSubmitError(null);
		if (session) setSlotSession(applyTemplateSlotEdit(draft, next.value, next.caret, session));
		onChange(next.value);
		focusSelection(next.caret);
	};
	const dictation = useDictation(insertSpoken, speechStatus?.activeModelId != null);
	const dictating = dictation.phase === "listening" || dictation.phase === "starting";

	const canSubmit = (raw: string) =>
		!templatePending && pendingImages === 0 && (!!raw.trim() || images.length > 0);
	const canSend = canSubmit(value);

	const openModelPicker = (query: string) => {
		replaceDraft("");
		pickerRef.current?.open(query);
	};

	const submitText = (raw: string, behavior: SubmitBehavior) => {
		if (!canSubmit(raw)) return;
		const text = hoistSkillReference(raw.trim(), commands);
		const modelQuery = parseModelCommand(text);
		if (modelQuery !== null) {
			openModelPicker(modelQuery);
			return;
		}
		const disposition = onSubmit(
			text,
			images.map(({ name, content }) => ({ name, content })),
			behavior,
		);
		if (!disposition.accepted) {
			setSubmitError(disposition.reason);
			return;
		}
		setSubmitError(null);
		dictation.cancel();
		onChange("");
		attachedImages.reset();
		recallIdxRef.current = null;
		setSlotSession(null);
	};

	const pickMention = (c: MentionCandidate) => {
		if (!mentionTrigger) return;
		const insert = c.kind === "dir" ? `@${c.path}/` : `@${c.path}`;
		const next = applyPromptCompletion(value, mentionTrigger, insert, c.kind !== "dir");
		replaceDraft(next.value, next.caret);
	};

	const mentionItemsRaw = mentionTrigger ? mention.candidates : [];
	const mentionCompletion = useCompletion({
		items: mentionItemsRaw,
		signal: JSON.stringify([
			mentionTrigger?.start ?? null,
			mentionQuery,
			mentionItemsRaw.map((candidate) => candidate.path),
		]),
		onSelect: pickMention,
	});

	const slashCompletion = useSlashCommandCompletion({
		trigger,
		commands,
		onSelect: (command) => {
			if (isModelCommand(command)) openModelPicker("");
			else if (command.source === "prompt" && onPickTemplate) onPickTemplate(command.name);
			else if (trigger?.kind === "slash") {
				const next = applyPromptCompletion(value, trigger, `/${command.name}`, true);
				replaceDraft(next.value, next.caret);
			}
		},
	});

	const mentionOpen = mentionCompletion.open;
	const menuOpen = mentionOpen || slashCompletion.open;

	const openHistory = () => {
		mentionCompletion.dismiss();
		slashCompletion.dismiss();
		onHistoryOpen?.();
	};

	useImperativeHandle(handleRef, () => ({
		focusRange: (start, end) => {
			setSlotSession(null);
			const textarea = ref.current;
			if (!textarea) return;
			textarea.focus();
			textarea.setSelectionRange(start, end);
			setCaret(start);
			onCursorChange?.(textarea.value, start, end);
		},
		insertText: (text: string) => replaceDraft(text),
		insertAndSubmit: (text: string, behavior: SubmitBehavior) =>
			canSubmit(text) ? submitText(text, behavior) : replaceDraft(text),
		insertTemplate: (parsed: ParsedTemplate) => {
			const transition = beginTemplateSlotSession(parsed);
			recallIdxRef.current = null;
			setSubmitError(null);
			onChange(transition.value);
			setSlotSession(transition.session);
			focusSelection(transition.selection.start, transition.selection.end);
		},
		restoreAttachments: (attachments: ChatAttachment[]) => {
			if (attachments.length === 0) return;
			attachedImages.restore(attachments);
			setSubmitError(null);
			focusSelection(caret);
		},
		openHistory,
		refocus: () => {
			const slot = slots?.[slotIdx];
			if (slot) focusSelection(slot.start, slot.end);
			else focusSelection(caret);
		},
	}));

	const submit = (behavior: SubmitBehavior) => {
		submitText(finalizeTemplateSlotSession(value, slotSession), behavior);
	};

	const stepSlot = (direction: 1 | -1) => {
		if (!slotSession) return;
		const transition = stepTemplateSlotSession(value, slotSession, direction);
		if (transition.value !== value) onChange(transition.value);
		setSlotSession(transition.session);
		focusSelection(transition.selection.start, transition.selection.end);
	};

	const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
		if (isPromptKeyEventComposing(e.nativeEvent)) return;
		if (e.key === "Escape" && dictating) {
			e.preventDefault();
			dictation.cancel();
			return;
		}
		if (slots && !menuOpen) {
			if (e.key === "Tab") {
				e.preventDefault();
				stepSlot(e.shiftKey ? -1 : 1);
				return;
			}
			if (e.key === "Escape") {
				e.preventDefault();
				setSlotSession(null);
				return;
			}
		}
		if (mentionCompletion.handleKeyDown(e)) return;
		if (slashCompletion.handleKeyDown(e)) return;
		const recallAt = recallIdxRef.current;
		if (e.key === "ArrowUp" && (value === "" || recallAt !== null) && recentPrompts.length > 0) {
			e.preventDefault();
			setSlotSession(null);
			const next = recallAt === null ? 0 : Math.min(recallAt + 1, recentPrompts.length - 1);
			const text = recentPrompts[next] ?? "";
			recallIdxRef.current = next;
			onChange(text);
			focusSelection(text.length);
			return;
		}
		if (e.key === "ArrowDown" && recallAt !== null) {
			e.preventDefault();
			setSlotSession(null);
			if (recallAt === 0) {
				recallIdxRef.current = null;
				onChange("");
				focusSelection(0);
			} else {
				const next = recallAt - 1;
				const text = recentPrompts[next] ?? "";
				recallIdxRef.current = next;
				onChange(text);
				focusSelection(text.length);
			}
			return;
		}
		if (e.key === "Enter" && e.shiftKey && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			submit(isStreaming ? "interrupt" : "send");
			return;
		}
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			const behavior: SubmitBehavior = isStreaming
				? e.metaKey || e.ctrlKey
					? "followUp"
					: "steer"
				: "send";
			submit(behavior);
		}
	};

	const menuId = useId();
	const tokens = scanPromptTokens(value, { commands, hasPath: mention.hasPath });
	const segments = promptSegments(
		value,
		tokens,
		slots ? highlightSegments(value, slots, slotIdx) : undefined,
	);
	const mentionItems = mentionCompletionItems(mention.candidates);
	const slashItems = slashCompletionItems(t, slashCompletion.matches);

	const showStop = isStreaming && !canSend;
	const { onPaste, onDrop } = imagePasteDropHandlers(attachedImages);

	return (
		<div
			data-testid="chat-composer"
			data-expanded={expanded}
			data-streaming={isStreaming}
			className="relative mx-auto flex w-full max-w-[var(--chat-transcript-width)] shrink-0 flex-col bg-container-workspace-bg"
		>
			{mentionOpen ? (
				<CompletionMenu
					testId="mention-menu"
					itemTestId="mention-item"
					listboxId={menuId}
					label={t("prompt.completion.label.mention")}
					items={mentionItems}
					activeIndex={mentionCompletion.activeIndex}
					onActivate={mentionCompletion.setActiveIndex}
					onSelect={(index) => {
						const candidate = mention.candidates[index];
						if (candidate) pickMention(candidate);
					}}
					className="absolute bottom-full left-12 mb-4"
					footer={
						mention.truncated ? (
							<span
								data-testid="mention-truncated"
								className="shrink-0 border-border-default border-t px-12 py-4 text-text-muted tr-text-metadata"
							>
								{t("prompt.completion.truncated")}
							</span>
						) : null
					}
				/>
			) : slashCompletion.open ? (
				<CompletionMenu
					testId="slash-menu"
					itemTestId="slash-command"
					listboxId={menuId}
					label={t("prompt.completion.label.slash")}
					items={slashItems}
					activeIndex={slashCompletion.activeIndex}
					onActivate={slashCompletion.setActiveIndex}
					onSelect={(index) => {
						const command = slashCompletion.matches[index];
						if (command) slashCompletion.pick(command);
					}}
					className="absolute bottom-full left-12 mb-4"
					footer={
						templatesEmpty && onManageTemplates ? (
							<button
								type="button"
								data-testid="slash-templates-empty"
								onClick={() => {
									replaceDraft("");
									onManageTemplates();
								}}
								className="flex w-full shrink-0 items-center gap-8 border-border-default border-t px-12 py-8 text-left text-text-muted tr-text-metadata hover:bg-control-bg-hovered hover:text-text-default"
							>
								<Sparkles className="size-12 shrink-0" />
								<span className="truncate">{t("chat.composer.noTemplates")}</span>
							</button>
						) : null
					}
				/>
			) : null}

			<PromptTokenCard hit={menuOpen ? null : tokenHit} />

			{slots && !menuOpen ? (
				<TemplateSlotHint
					activeIndex={slotIdx}
					count={slots.length}
					onNext={() => stepSlot(1)}
					className="absolute bottom-full left-12 mb-4"
				/>
			) : null}

			<div className="p-chat-gutter">
				<div
					data-testid="chat-composer-shell"
					className="relative grid grid-cols-[minmax(0,1fr)_auto] grid-rows-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-4"
				>
					<div
						data-testid="chat-input-surface"
						className="relative col-span-2 col-start-1 row-start-1 flex min-h-0 flex-col overflow-hidden rounded-xl bg-control-bg shadow-[var(--shadow-sm)] ring-1 ring-inset ring-control-border-default transition-shadow duration-[var(--motion-duration-normal)] focus-within:ring-control-border-active tr-text-ui"
					>
						<PromptImageStrip
							controller={attachedImages}
							leading={
								submitError ? (
									<FileChip
										data-testid="composer-command-error"
										tone="error"
										icon={false}
										title={submitError}
										label={submitError}
									/>
								) : null
							}
						/>
						<div
							className={cn(
								"flex min-h-0 items-end overflow-hidden",
								expanded && growthLimit === "half-chat" && "max-h-[50cqh]",
								COMPOSER_EDITOR_LIMIT_CLASS[growthLimit],
							)}
						>
							<PromptField
								ref={ref}
								data-testid="chat-input"
								value={value}
								segments={segments}
								onTokenHover={setTokenHit}
								onTokenActivate={(token) => {
									if (token.kind === "mention" && token.path && onOpenFile) onOpenFile(token.path);
								}}
								fieldClassName="px-12 py-12 tr-text-ui"
								wrapperClassName="relative min-h-0 min-w-0 flex-1 self-stretch overflow-hidden"
								textareaClassName={cn(
									"absolute inset-0 size-full rounded-sm",
									expanded ? "whitespace-pre-wrap" : "whitespace-nowrap",
								)}
								onSelect={(e) =>
									onCursorChange?.(
										e.currentTarget.value,
										e.currentTarget.selectionStart,
										e.currentTarget.selectionEnd,
									)
								}
								onFocus={(e) =>
									onCursorChange?.(
										e.currentTarget.value,
										e.currentTarget.selectionStart,
										e.currentTarget.selectionEnd,
									)
								}
								onChange={(e) => {
									const next = e.target.value;
									const nextCaret = e.target.selectionStart;
									setSubmitError(null);
									const recalled = recallIdxRef.current;
									if (recalled !== null && next !== recentPrompts[recalled]) {
										recallIdxRef.current = null;
									}
									if (slotSession) {
										setSlotSession(applyTemplateSlotEdit(value, next, nextCaret, slotSession));
									}
									onChange(next);
									setCaret(nextCaret);
								}}
								onKeyUp={(e) => setCaret(e.currentTarget.selectionStart)}
								onClick={(e) => setCaret(e.currentTarget.selectionStart)}
								onKeyDown={onKeyDown}
								onPaste={onPaste}
								onDrop={onDrop}
								rows={1}
								aria-autocomplete="list"
								aria-controls={menuOpen ? menuId : undefined}
								aria-activedescendant={
									menuOpen
										? optionId(
												menuId,
												mentionOpen ? mentionCompletion.activeIndex : slashCompletion.activeIndex,
											)
										: undefined
								}
								placeholder={
									isStreaming
										? t("chat.composer.placeholderStreaming")
										: expanded
											? t("chat.composer.placeholderExpanded")
											: t("chat.composer.placeholder")
								}
							>
								<div
									ref={editorSizerRef}
									data-testid="chat-input-sizer"
									aria-hidden
									className="invisible w-full whitespace-pre-wrap break-words px-12 py-12 tr-text-ui"
								>
									{`${value}\u200b`}
								</div>
							</PromptField>
							<div
								className={cn(
									"flex shrink-0 items-center gap-4 pr-8",
									expanded ? "self-end pb-8" : "self-center",
								)}
							>
								{/* One slot: Stop while the agent runs with nothing to send, Send otherwise. */}
								{showStop ? (
									<IconButton
										variant="ghost"
										size="m"
										icon={RunningIcon}
										data-testid="chat-abort"
										label={t("chat.composer.stop")}
										onClick={onAbort}
										className="text-primary"
									/>
								) : null}
								{dictating ? (
									<Waveform levels={dictation.levels} className="max-sm:hidden" />
								) : null}
								<div
									data-testid="chat-send-pill"
									data-armed={canSend}
									hidden={showStop}
									className="flex shrink-0 items-center gap-2"
								>
									<span
										className={cn(
											"flex transition-transform duration-[var(--motion-duration-normal)] ease-[var(--motion-ease-out)]",
											canSend ? "scale-100" : "scale-90",
										)}
									>
										<IconButton
											variant="ghost"
											size="m"
											icon={CornerDownLeft}
											data-testid="chat-send"
											label={isStreaming ? t("chat.composer.steer") : t("chat.composer.send")}
											onClick={() => submit(isStreaming ? "steer" : "send")}
											disabled={!canSend}
											className={cn(
												"button-disabled:pointer-events-auto",
												canSend && "text-text-default",
											)}
										/>
									</span>
									{isStreaming ? (
										<Popover open={sendMenuOpen} onOpenChange={setSendMenuOpen}>
											<PopoverTrigger asChild>
												<IconButton
													size="m"
													icon={ChevronDown}
													data-testid="send-menu"
													label={t("chat.composer.sendOptions")}
												/>
											</PopoverTrigger>
											<PopoverContent side="top" align="end" className="w-[320px] p-4">
												<div className="flex flex-col gap-2">
													{STREAMING_SEND_MODES.map((mode) => (
														<button
															key={mode.behavior}
															type="button"
															data-testid={mode.testid}
															disabled={!canSend}
															onClick={() => {
																setSendMenuOpen(false);
																submit(mode.behavior);
															}}
															className="group flex w-full flex-col gap-2 rounded-sm px-8 py-4 text-left hover:bg-control-bg-hovered disabled:pointer-events-none"
														>
															<span className="flex w-full items-baseline justify-between gap-8">
																<span className="text-text-default tr-text-ui group-disabled:text-control-disabled-text">
																	{t(mode.name)}
																</span>
																<span className="shrink-0 text-text-muted tr-text-metadata group-disabled:text-control-disabled-text">
																	{mode.keys}
																</span>
															</span>
															<span className="text-text-muted tr-text-metadata group-disabled:text-control-disabled-text">
																{t(mode.meaning)}
															</span>
														</button>
													))}
												</div>
											</PopoverContent>
										</Popover>
									) : null}
								</div>
								{speechSupported ? (
									<IconButton
										variant="ghost"
										size="m"
										icon={Mic}
										data-testid="chat-dictate"
										data-phase={dictation.phase}
										aria-pressed={dictating}
										label={
											dictating
												? t("chat.composer.dictate.stop")
												: dictation.phase === "transcribing"
													? t("chat.composer.dictate.transcribing")
													: t("chat.composer.dictate.start")
										}
										loading={dictation.phase === "transcribing"}
										onClick={dictation.toggle}
										tone={dictating ? "info" : undefined}
									/>
								) : null}
								<span role="status" className="sr-only">
									{dictating ? t("chat.composer.dictate.listening") : ""}
								</span>
							</div>
						</div>
					</div>
					<div className="col-start-1 row-start-2 flex min-w-0 items-center self-end">
						<ModelEffortPicker
							ref={pickerRef}
							models={models}
							current={currentModel}
							level={thinkingLevel}
							refreshing={modelsRefreshing}
							onRefresh={onRefreshModels}
							onSelect={onSelectModel}
							onSelectLevel={onSelectThinking}
							preferences={modelPreferences}
							className="max-w-[60vw] px-4 sm:max-w-[320px]"
						/>
					</div>
				</div>
			</div>
		</div>
	);
});
