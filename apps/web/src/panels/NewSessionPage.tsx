import {
	type ModelDefault,
	PROJECT_TEMPLATE_PREVIEW_PROTOCOL_VERSION,
	type SlashCommandInfo,
	type TemplateInfo,
	type TemplateReadLocation,
	type ThinkingLevel,
	type WireModel,
	type Workspace,
} from "@thinkrail/contracts";
import { i18n, useT } from "@thinkrail/locales/react";
import { Button } from "@thinkrail/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@thinkrail/ui/command";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@thinkrail/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@thinkrail/ui/popover";
import { Box, ChevronDown, GitBranch, House, Sparkles, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { mentionCompletionItems, slashCompletionItems } from "@/chat/completionItems";
import { type DefaultPairOption, ModelEffortPicker } from "@/chat/ModelEffortPicker";
import { PromptTokenCard } from "@/chat/PromptTokenCard";
import {
	deriveProjectTrustNotice,
	type ProjectTrustNotice,
	trustEnablesText,
	trustGrantParams,
	untrustedNoticeText,
} from "@/chat/projectTrust";
import {
	imagePasteDropHandlers,
	PROMPT_IMAGE_CHIPS_PADDING,
	PromptImageChips,
	usePromptImages,
} from "@/chat/promptImages";
import { SkillsButton } from "@/chat/SkillsButton";
import { SkillsDialog } from "@/chat/SkillsDialog";
import { useMentionSource } from "@/chat/useMentionSource";
import { useModelCatalog } from "@/chat/useModelCatalog";
import { useModelPreferences } from "@/chat/useModelPreferences";
import { useProjectTrustSummary } from "@/chat/useProjectTrustSummary";
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
	scanPromptTokens,
	slashCommandCatalogOrEmpty,
	stepTemplateSlotSession,
	TemplateSlotHint,
	type TemplateSlotSessionState,
	templateToSlashCommand,
	useCompletion,
	usePendingSelection,
	useSlashCommandCompletion,
	useTemplateCommandPicker,
} from "@/prompt";
import {
	isDefaultWorkspace,
	type NewSessionDraft,
	selectCatalogModel,
	selectPickerModels,
	toast,
	useAppStore,
} from "@/store";
import { createSessionWithSkillBaseline, errorText, getTransport } from "@/transport";
import { BranchPicker } from "./BranchPicker";
import { useBranchList } from "./branches";
import { enterDefaultWorkspace } from "./defaultWorkspace";

type WorkspaceTarget = "worktree" | "default";

export function reconcileModel(
	models: readonly WireModel[],
	model: WireModel,
	catalogFresh: boolean,
): WireModel | "unavailable" | null {
	const found = selectCatalogModel(models, model);
	if (found) return found;
	return catalogFresh && models.length > 0 ? "unavailable" : null;
}

const PILL =
	"flex h-32 min-w-0 items-center gap-8 rounded-sm border border-control-border-default bg-clip-padding bg-control-bg px-8 tr-text-ui text-text-default outline-none transition-colors hover:bg-control-bg-hovered focus-visible:ring-1 focus-visible:ring-focus-ring data-[open=true]:border-control-border-active data-[open=true]:bg-control-bg-selected";

async function refreshProjectWorkspaces(projectId: string): Promise<void> {
	useAppStore.getState().expandProject(projectId);
	const rows = await getTransport().request("workspace.list", { projectId });
	useAppStore.getState().setWorkspaces(projectId, rows);
}

export function NewSessionPage({
	draft,
	onClose,
	onCancel,
}: {
	draft: NewSessionDraft;
	/** The page is finished with (a workspace was created, or its project went away). */
	onClose: () => void;
	/** The user backed out; the caller returns to wherever they came from. */
	onCancel: () => void;
}) {
	const t = useT();
	const projects = useAppStore((s) => s.projects);
	const protocolVersion = useAppStore((s) => s.protocolVersion);

	const [selectedProjectId, setSelectedProjectId] = useState(draft.projectId);
	const [target, setTarget] = useState<WorkspaceTarget>(draft.target);
	const [baseRef, setBaseRef] = useState<string>("");
	const [prompt, setPrompt] = useState(draft.prompt);
	const [caret, setCaret] = useState(draft.prompt.length);
	const [tokenHit, setTokenHit] = useState<PromptTokenHit | null>(null);
	const [skillCommands, setSkillCommands] = useState<SlashCommandInfo[]>([]);
	const [templates, setTemplates] = useState<TemplateInfo[]>([]);
	const [slotSession, setSlotSession] = useState<TemplateSlotSessionState | null>(null);
	const [model, setModel] = useState<WireModel | null>(null);
	const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevel>("medium");
	const [hostDefault, setHostDefault] = useState<ModelDefault | null>(null);
	const [explicitPair, setExplicitPair] = useState(false);
	const pendingDefault = useRef<(() => void) | null>(null);
	const pickExplicitly = useCallback(() => {
		pendingDefault.current?.();
		pendingDefault.current = null;
		setExplicitPair(true);
	}, []);
	const attachedImages = usePromptImages();
	const [creating, setCreating] = useState(false);
	const [trusting, setTrusting] = useState(false);
	const [manageSkills, setManageSkills] = useState(false);
	const promptRef = useRef<HTMLTextAreaElement>(null);
	const hostDefaultAsked = useRef(false);
	const updatePromptDraft = useCallback(
		(nextPrompt: string, nextSlotSession: TemplateSlotSessionState | null) => {
			setPrompt(nextPrompt);
			setSlotSession(nextSlotSession);
		},
		[],
	);

	const focusPromptSelection = usePendingSelection(promptRef);

	const supportsProjectTemplatePreview =
		protocolVersion !== null && protocolVersion >= PROJECT_TEMPLATE_PREVIEW_PROTOCOL_VERSION;
	const loadTemplate = useCallback(
		(name: string) => {
			const location: TemplateReadLocation = supportsProjectTemplatePreview
				? { projectId: selectedProjectId }
				: {};
			return getTransport().request("template.get", { ...location, name });
		},
		[selectedProjectId, supportsProjectTemplatePreview],
	);
	const applyTemplate = useCallback(
		(template: ParsedTemplate) => {
			const transition = beginTemplateSlotSession(template);
			updatePromptDraft(transition.value, transition.session);
			focusPromptSelection(transition.selection.start, transition.selection.end);
		},
		[focusPromptSelection, updatePromptDraft],
	);
	const { pending: templatePending, pick: pickTemplate } = useTemplateCommandPicker({
		draft: prompt,
		contextKey: `${selectedProjectId}:${supportsProjectTemplatePreview ? "project" : "global"}`,
		load: loadTemplate,
		onApply: applyTemplate,
	});
	const commands = useMemo(
		() => [...skillCommands, ...templates.map(templateToSlashCommand)],
		[skillCommands, templates],
	);
	const trigger = detectPromptTrigger(prompt, caret);
	const mentionTrigger = trigger?.kind === "mention" ? trigger : null;
	const slashActive = trigger?.kind === "slash";
	const mentionWorkspaceId = useAppStore(
		(state) => state.workspaces[selectedProjectId]?.find(isDefaultWorkspace)?.id ?? null,
	);
	const mention = useMentionSource(mentionWorkspaceId, prompt, mentionTrigger?.query ?? null);
	const mentionCandidates = mentionTrigger ? mention.candidates : [];
	const mentionCompletion = useCompletion({
		items: mentionCandidates,
		signal: JSON.stringify([
			mentionTrigger?.start ?? null,
			mentionTrigger?.query ?? null,
			mentionCandidates.map((candidate) => candidate.path),
		]),
		onSelect: (candidate) => {
			if (!mentionTrigger) return;
			const insert = candidate.kind === "dir" ? `@${candidate.path}/` : `@${candidate.path}`;
			const next = applyPromptCompletion(prompt, mentionTrigger, insert, candidate.kind !== "dir");
			updatePromptDraft(next.value, null);
			focusPromptSelection(next.caret);
		},
	});
	const slashCompletion = useSlashCommandCompletion({
		trigger,
		commands,
		onSelect: (command) => {
			if (command.source === "prompt") {
				void pickTemplate(command.name);
				return;
			}
			if (trigger?.kind !== "slash") return;
			const next = applyPromptCompletion(prompt, trigger, `/${command.name}`, true);
			updatePromptDraft(next.value, null);
			focusPromptSelection(next.caret);
		},
	});
	const menuId = useId();
	const menuOpen = mentionCompletion.open || slashCompletion.open;
	const segments = promptSegments(
		prompt,
		scanPromptTokens(prompt, { commands, hasPath: mention.hasPath }),
		slotSession ? highlightSegments(prompt, slotSession.slots, slotSession.activeIndex) : undefined,
	);

	const stepPromptSlot = (direction: 1 | -1) => {
		if (!slotSession) return;
		const transition = stepTemplateSlotSession(prompt, slotSession, direction);
		updatePromptDraft(transition.value, transition.session);
		focusPromptSelection(transition.selection.start, transition.selection.end);
	};

	useEffect(() => {
		if (projects.some((p) => p.id === selectedProjectId)) return;
		onClose();
		toast.info(i18n.t("panels.newWorkspace.projectClosed"));
	}, [projects, selectedProjectId, onClose]);

	useEffect(() => {
		let cancelled = false;
		setSkillCommands([]);
		setTemplates([]);
		void slashCommandCatalogOrEmpty(() =>
			getTransport().request("skill.list", { projectId: selectedProjectId }),
		).then((commands) => {
			if (!cancelled) setSkillCommands(commands);
		});
		return () => {
			cancelled = true;
		};
	}, [selectedProjectId]);

	useEffect(() => {
		if (useAppStore.getState().workspaces[selectedProjectId]) return;
		let cancelled = false;
		getTransport()
			.request("workspace.list", { projectId: selectedProjectId })
			.then((rows) => {
				if (!cancelled) useAppStore.getState().setWorkspaces(selectedProjectId, rows);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [selectedProjectId]);

	useEffect(() => {
		if (!slashActive) return;
		let cancelled = false;
		const location: TemplateReadLocation = supportsProjectTemplatePreview
			? { projectId: selectedProjectId }
			: {};
		getTransport()
			.request("template.list", location)
			.then(({ templates: nextTemplates }) => {
				if (!cancelled) setTemplates(nextTemplates);
			})
			.catch(() => {
				if (!cancelled) setTemplates([]);
			});
		return () => {
			cancelled = true;
		};
	}, [selectedProjectId, slashActive, supportsProjectTemplatePreview]);

	const trustSummary = useProjectTrustSummary(selectedProjectId, true);

	const {
		models: allModels,
		refreshing: modelsRefreshing,
		refresh: onRefreshModels,
		fresh: catalogFresh,
	} = useModelCatalog(true);
	const hiddenModels = useAppStore((s) => s.hiddenModels);
	const visibleModels = useMemo(
		() => selectPickerModels(allModels, hiddenModels, []),
		[allModels, hiddenModels],
	);
	const models = useMemo(
		() => selectPickerModels(allModels, hiddenModels, [model]),
		[allModels, hiddenModels, model],
	);
	const modelPreferences = useModelPreferences(visibleModels);

	const applyHostDefault = useCallback(() => {
		let cancelled = false;
		const cancel = () => {
			cancelled = true;
		};
		pendingDefault.current?.();
		pendingDefault.current = cancel;
		setExplicitPair(false);
		getTransport()
			.request("model.default", {})
			.then((d) => {
				setHostDefault(d);
				if (cancelled) return;
				pendingDefault.current = null;
				setModel(d.model);
				setThinkingLevel(d.thinkingLevel);
			})
			.catch(() => {});
		return cancel;
	}, []);

	const defaultOption: DefaultPairOption = {
		resolved: hostDefault,
		active: !explicitPair,
		onSelect: () => {
			applyHostDefault();
		},
	};

	useEffect(() => {
		return applyHostDefault();
	}, [applyHostDefault]);

	useEffect(() => {
		if (!model) return;
		const next = reconcileModel(allModels, model, catalogFresh);
		if (next === null) return;
		if (next !== "unavailable") {
			if (next !== model) setModel(next);
			return;
		}
		if (hostDefaultAsked.current) return;
		hostDefaultAsked.current = true;
		return applyHostDefault();
	}, [allModels, model, catalogFresh, applyHostDefault]);

	useEffect(() => {
		if (!model) return;
		if (model.thinkingLevels.includes(thinkingLevel)) return;
		let cancelled = false;
		getTransport()
			.request("model.clampThinking", {
				provider: model.provider,
				id: model.id,
				level: thinkingLevel,
			})
			.then((r) => {
				if (!cancelled) setThinkingLevel(r.level);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [model, thinkingLevel]);

	const prefetchBase = (ref: string) => {
		if (!ref) return;
		getTransport()
			.request("git.prefetch", { projectId: selectedProjectId, ref })
			.catch(() => {});
	};

	const selectBaseRef = (ref: string) => {
		setBaseRef(ref);
		if (branches?.remote.includes(ref)) prefetchBase(ref);
	};

	const {
		branches,
		refreshing,
		refresh: refreshBranches,
	} = useBranchList(selectedProjectId, (list) => {
		setBaseRef(list.defaultBranch);
		prefetchBase(list.defaultBranch);
	});
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape" || event.defaultPrevented) return;
			if (
				document.querySelector(
					'[role="dialog"], [role="menu"], [role="listbox"], [data-radix-popper-content-wrapper]',
				)
			)
				return;
			onCancel();
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [onCancel]);
	const submitEnabled = !creating && !templatePending && attachedImages.pending === 0;

	const create = async () => {
		if (!submitEnabled) return;
		setCreating(true);
		const text = hoistSkillReference(
			finalizeTemplateSlotSession(prompt, slotSession).trim(),
			commands,
		);
		const attachments = attachedImages.images.map(({ name, content }) => ({ name, content }));
		let workspace: Workspace;
		if (target === "default") {
			const def = await enterDefaultWorkspace(selectedProjectId);
			if (!def) {
				setCreating(false);
				return;
			}
			workspace = def;
		} else {
			useAppStore.getState().beginWorktreeCreation(selectedProjectId);
			const createWorktree = async () =>
				getTransport().request("workspace.create", {
					projectId: selectedProjectId,
					...(baseRef ? { baseRef } : {}),
				});
			const created = await createWorktree()
				.catch((err: unknown) => {
					toast.error(errorText(err), t("panels.newWorkspace.createFailed"));
					setCreating(false);
					return null;
				})
				.finally(() => useAppStore.getState().endWorktreeCreation(selectedProjectId));
			if (!created) return;
			workspace = created;
		}

		const store = useAppStore.getState();
		if (target === "worktree") {
			void refreshProjectWorkspaces(workspace.projectId).catch(() => {});
			store.activateWorkspace(workspace);
		}
		onClose();

		store.beginChatStart(workspace.id);
		const startChat = async () => {
			const { result: session, syncedTick } = await createSessionWithSkillBaseline({
				workspaceId: workspace.id,
				...(model && explicitPair ? { model, thinkingLevel } : {}),
			});
			store.openChatSession(
				workspace.id,
				session.sessionId,
				session.model,
				session.thinkingLevel,
				syncedTick,
			);
			if (!text && attachments.length === 0) return;
			store.appendUserMessage(
				session.sessionId,
				text,
				attachments.length > 0 ? attachments : undefined,
			);
			getTransport()
				.request("session.prompt", {
					sessionId: session.sessionId,
					text,
					...(attachments.length > 0 ? { images: attachments.map((a) => a.content) } : {}),
				})
				.catch((err) => store.appendErrorTurn(session.sessionId, errorText(err)));
		};
		await startChat()
			.catch((err: unknown) =>
				toast.error(errorText(err), t("panels.newWorkspace.chatStartFailed")),
			)
			.finally(() => useAppStore.getState().endChatStart(workspace.id));
	};

	const trustProject = async (notice: Extract<ProjectTrustNotice, { kind: "untrusted" }>) => {
		if (trusting) return;
		setTrusting(true);
		const trust = async () => {
			const updated = await getTransport().request(
				"project.setTrust",
				trustGrantParams(selectedProjectId, notice),
			);
			useAppStore.getState().applyProjectUpdated(updated);
			const commands = await slashCommandCatalogOrEmpty(() =>
				getTransport().request("skill.list", { projectId: selectedProjectId }),
			);
			setSkillCommands(commands);
		};
		await trust()
			.catch((err: unknown) => toast.error(errorText(err), t("panels.newWorkspace.trustFailed")))
			.finally(() => setTrusting(false));
	};

	const selectedProject = projects.find((p) => p.id === selectedProjectId);
	const trustNotice = deriveProjectTrustNotice(selectedProject, trustSummary);
	const trustEnables = trustNotice.kind === "untrusted" ? trustEnablesText(t, trustNotice) : null;
	const isolated = target === "worktree";

	return (
		<form
			aria-label={
				isolated ? t("panels.newWorkspace.titleIsolated") : t("panels.newWorkspace.titleDefault")
			}
			onSubmit={(event) => event.preventDefault()}
			data-testid="new-workspace-page"
			className="flex h-full min-h-0 flex-col items-center overflow-auto px-24 py-24"
		>
			<div className="my-auto flex w-full max-w-[720px] flex-col gap-16">
				<h1 className="sr-only">
					{isolated
						? t("panels.newWorkspace.titleIsolated")
						: t("panels.newWorkspace.titleDefault")}
				</h1>

				{trustNotice.kind === "untrusted" ? (
					<div
						data-testid="ws-trust-notice"
						className="flex w-full flex-col gap-8 rounded-lg border border-feedback-warning-muted bg-container-elevated-bg px-12 py-8 text-left"
					>
						<div className="flex items-start gap-8">
							<TriangleAlert className="mt-2 size-14 shrink-0 text-feedback-warning" aria-hidden />
							<span className="flex min-w-0 flex-1 flex-col gap-2">
								<span className="tr-text-ui text-text-default">
									{untrustedNoticeText(t, trustNotice)} {t("panels.newWorkspace.trustUnaffected")}
								</span>
								{trustEnables ? (
									<span className="text-text-muted tr-text-metadata">{trustEnables}</span>
								) : null}
							</span>
						</div>
						<div className="flex justify-end">
							<Button
								variant="outline"
								size="m"
								data-testid="ws-trust-project"
								disabled={trusting}
								onClick={() => void trustProject(trustNotice)}
							>
								{t("panels.newWorkspace.trustProject")}
							</Button>
						</div>
					</div>
				) : null}

				<div className="relative flex flex-col rounded-xl border border-control-border-default bg-control-bg focus-within:border-control-border-active">
					{draft.note ? (
						<p
							data-testid="ws-prompt-note"
							className="m-8 mb-0 flex items-start gap-8 rounded-md border border-primary-muted bg-clip-padding bg-primary-subtle px-12 py-8 text-left text-text-muted tr-text-metadata leading-snug"
						>
							<Sparkles className="mt-2 size-14 shrink-0 text-primary" />
							<span>{draft.note}</span>
						</p>
					) : null}
					<PromptImageChips
						controller={attachedImages}
						testId="ws-prompt-images"
						className={PROMPT_IMAGE_CHIPS_PADDING.dialog}
					/>
					<PromptField
						ref={promptRef}
						autoFocus
						data-testid="ws-prompt"
						value={prompt}
						segments={segments}
						onTokenHover={setTokenHit}
						disabled={creating}
						fieldClassName="px-16 pt-16 pb-8 tr-text-ui"
						wrapperClassName="relative"
						textareaClassName="block min-h-[136px] w-full rounded-none"
						{...imagePasteDropHandlers(attachedImages)}
						onChange={(e) => {
							const next = e.target.value;
							const nextSlotSession = slotSession
								? applyTemplateSlotEdit(prompt, next, e.target.selectionStart, slotSession)
								: null;
							updatePromptDraft(next, nextSlotSession);
							setCaret(e.target.selectionStart);
						}}
						onKeyUp={(e) => setCaret(e.currentTarget.selectionStart)}
						onClick={(e) => setCaret(e.currentTarget.selectionStart)}
						placeholder={t("panels.newWorkspace.promptPlaceholder")}
						spellCheck={false}
						rows={5}
						aria-autocomplete="list"
						aria-controls={menuOpen ? menuId : undefined}
						aria-activedescendant={
							menuOpen
								? optionId(
										menuId,
										mentionCompletion.open
											? mentionCompletion.activeIndex
											: slashCompletion.activeIndex,
									)
								: undefined
						}
						onKeyDown={(e) => {
							if (isPromptKeyEventComposing(e.nativeEvent)) return;
							if (slotSession && !menuOpen) {
								if (e.key === "Tab") {
									e.preventDefault();
									e.stopPropagation();
									stepPromptSlot(e.shiftKey ? -1 : 1);
									return;
								}
								if (e.key === "Escape") {
									e.preventDefault();
									e.stopPropagation();
									updatePromptDraft(prompt, null);
									return;
								}
							}
							if (mentionCompletion.handleKeyDown(e)) return;
							if (slashCompletion.handleKeyDown(e)) return;

							if (e.key === "Enter" && !e.shiftKey) {
								e.preventDefault();
								if (submitEnabled) void create();
							}
						}}
					/>
					<PromptTokenCard hit={menuOpen ? null : tokenHit} />
					{mentionCompletion.open ? (
						<CompletionMenu
							testId="mention-menu"
							itemTestId="mention-item"
							listboxId={menuId}
							label={t("prompt.completion.label.mention")}
							items={mentionCompletionItems(mentionCandidates)}
							activeIndex={mentionCompletion.activeIndex}
							onActivate={mentionCompletion.setActiveIndex}
							onSelect={(index) => {
								const candidate = mentionCandidates[index];
								if (candidate) mentionCompletion.pick(candidate);
							}}
							className="absolute top-full left-8 z-50 mt-4"
						/>
					) : slashCompletion.open ? (
						<CompletionMenu
							testId="slash-menu"
							itemTestId="slash-command"
							listboxId={menuId}
							label={t("prompt.completion.label.slash")}
							items={slashCompletionItems(t, slashCompletion.matches)}
							activeIndex={slashCompletion.activeIndex}
							onActivate={slashCompletion.setActiveIndex}
							onSelect={(index) => {
								const command = slashCompletion.matches[index];
								if (command) slashCompletion.pick(command);
							}}
							className="absolute top-full left-8 z-50 mt-4"
						/>
					) : slotSession ? (
						<TemplateSlotHint
							activeIndex={slotSession.activeIndex}
							count={slotSession.slots.length}
							onNext={() => stepPromptSlot(1)}
							className="absolute top-full left-8 z-50 mt-4"
						/>
					) : null}
					<div className="flex flex-wrap items-center gap-8 p-8">
						<div className="flex min-w-0 flex-1 flex-wrap items-center gap-8">
							<ModelEffortPicker
								models={models}
								current={model}
								level={thinkingLevel}
								refreshing={modelsRefreshing}
								onRefresh={onRefreshModels}
								onSelect={({ model: next, level }) => {
									pickExplicitly();
									setModel(next);
									if (level) setThinkingLevel(level);
								}}
								onSelectLevel={(level) => {
									pickExplicitly();
									setThinkingLevel(level);
								}}
								preferences={modelPreferences}
								defaultOption={defaultOption}
								container={null}
								className="max-w-full"
							/>
						</div>
						<Button
							variant="ghost"
							size="l"
							data-testid="cancel-new-workspace"
							disabled={creating}
							onClick={onCancel}
							className="shrink-0"
						>
							{t("common.cancel")}
						</Button>
						<Button
							variant="primary"
							size="l"
							data-testid="create-workspace"
							disabled={!submitEnabled}
							loading={creating}
							onClick={() => void create()}
							className="shrink-0"
						>
							{creating ? (
								isolated ? (
									t("panels.newWorkspace.creating")
								) : (
									t("panels.newWorkspace.starting")
								)
							) : (
								<>
									{isolated ? t("panels.newWorkspace.create") : t("panels.newWorkspace.start")}
									<span className="inline-flex h-16 min-w-16 items-center justify-center rounded-sm bg-on-primary-soft px-4 tr-code-text">
										↵
									</span>
								</>
							)}
						</Button>
					</div>
				</div>

				<div className="flex flex-wrap items-center gap-8">
					<TargetPicker target={target} onSelect={setTarget} />
					<ProjectPicker
						projects={projects}
						current={selectedProject?.name ?? t("panels.newWorkspace.projectFallback")}
						container={null}
						onSelect={setSelectedProjectId}
					/>
					{isolated ? (
						<BranchPicker
							branches={branches}
							selected={baseRef}
							label={t("panels.newWorkspace.baseLabel")}
							testid="ws-branch-picker"
							triggerClassName={`${PILL} max-w-[220px]`}
							refreshing={refreshing}
							container={null}
							onSelect={selectBaseRef}
							onRefresh={refreshBranches}
						/>
					) : null}
					<SkillsButton
						onOpen={() => setManageSkills(true)}
						testId="ws-manage-skills"
						className="ml-auto"
					/>
				</div>
			</div>
			<SkillsDialog
				projectId={selectedProjectId}
				open={manageSkills}
				onOpenChange={setManageSkills}
			/>
		</form>
	);
}

function TargetPicker({
	target,
	onSelect,
}: {
	target: WorkspaceTarget;
	onSelect: (target: WorkspaceTarget) => void;
}) {
	const t = useT();
	const Icon = target === "worktree" ? GitBranch : House;
	return (
		<DropdownMenu>
			<DropdownMenuTrigger data-testid="ws-target" className={`${PILL} max-w-[220px]`}>
				<Icon className="size-16 shrink-0 text-text-muted" />
				<span className="truncate">
					{target === "worktree"
						? t("panels.newWorkspace.targetIsolated")
						: t("panels.newWorkspace.targetDefault")}
				</span>
				<ChevronDown className="size-16 shrink-0 text-text-muted" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start">
				<DropdownMenuRadioGroup
					value={target}
					onValueChange={(value) => onSelect(value as WorkspaceTarget)}
				>
					<DropdownMenuRadioItem value="worktree" data-testid="ws-target-worktree">
						<GitBranch />
						{t("panels.newWorkspace.targetIsolated")}
					</DropdownMenuRadioItem>
					<DropdownMenuRadioItem value="default" data-testid="ws-target-default">
						<House />
						{t("panels.newWorkspace.targetDefault")}
					</DropdownMenuRadioItem>
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function ProjectPicker({
	projects,
	current,
	container,
	onSelect,
}: {
	projects: { id: string; name: string }[];
	current: string;
	container: HTMLElement | null;
	onSelect: (projectId: string) => void;
}) {
	const t = useT();
	const [open, setOpen] = useState(false);
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				data-testid="ws-project-picker"
				data-open={open}
				className={`${PILL} max-w-[180px]`}
			>
				<span className="flex size-[18px] shrink-0 items-center justify-center rounded-sm bg-primary">
					<Box className="size-12 text-text-on-primary" />
				</span>
				<span className="truncate">{current}</span>
				<ChevronDown className="size-16 shrink-0 text-text-muted" />
			</PopoverTrigger>
			<PopoverContent align="start" container={container} className="w-[280px] p-0">
				<Command>
					<CommandInput placeholder={t("panels.newWorkspace.searchProjects")} />
					<CommandList>
						<CommandEmpty>{t("panels.newWorkspace.noProjects")}</CommandEmpty>
						<CommandGroup>
							{projects.map((p) => (
								<CommandItem
									key={p.id}
									value={p.name}
									data-testid="ws-project-option"
									onSelect={() => {
										onSelect(p.id);
										setOpen(false);
									}}
								>
									<Box className="size-14 shrink-0 text-text-muted" />
									<span className="truncate">{p.name}</span>
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
