import {
	INSTRUCTIONS_MAX_BYTES,
	type InstructionDoc,
	type InstructionKind,
	type InstructionsState,
	type LoadedInstructionScope,
} from "@thinkrail/contracts";
import type { MessageKey } from "@thinkrail/locales";
import { useT } from "@thinkrail/locales/react";
import { Button, IconButton } from "@thinkrail/ui/button";
import { Textarea } from "@thinkrail/ui/textarea";
import { IconTooltip } from "@thinkrail/ui/tooltip";
import { cn } from "@thinkrail/ui/utils";
import { ChevronDown, Code, Eye } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { formatBytes } from "@/speech";
import { selectActiveWorkspace, toast, useAppStore } from "@/store";
import { errorText, getTransport, wsErrorCode } from "@/transport";
import { Markdown } from "../chat/Markdown";
import { SettingsGroup, SettingsPageContainer } from "./SettingsGroup";
import { SettingsHint } from "./SettingsHint";
import { SettingsNotice } from "./SettingsNotice";

const SCOPE_TEXT = {
	global: "instructions.scope.global",
	ancestor: "instructions.scope.ancestor",
	project: "instructions.scope.project",
} as const satisfies Record<LoadedInstructionScope, MessageKey>;

const EDITOR_TEXT = {
	agents: {
		title: "instructions.agents.title",
		intro: "instructions.agents.intro",
		placeholder: "instructions.placeholder.agents",
	},
	append: {
		title: "instructions.append.title",
		intro: "instructions.append.intro",
		placeholder: "instructions.placeholder.append",
	},
} as const satisfies Record<
	InstructionKind,
	{ title: MessageKey; intro: MessageKey; placeholder: MessageKey }
>;

type Mode = "source" | "preview";
type Conflict = "none" | "changed";

function baseName(path: string): string {
	return path.split(/[\\/]/).at(-1) ?? path;
}

function KindHint({ kind }: { kind: InstructionKind }) {
	const t = useT();
	const text = EDITOR_TEXT[kind];
	return (
		<SettingsHint
			label={t("instructions.hint", { title: t(text.title) })}
			testId={`instructions-${kind}-hint`}
		>
			<p>{t(text.intro)}</p>
			<p>{t("instructions.fileNote")}</p>
		</SettingsHint>
	);
}

function EmptyBox({ children }: { children: ReactNode }) {
	return (
		<p className="rounded-md border border-border-muted px-12 py-12 tr-text-metadata text-text-muted">
			{children}
		</p>
	);
}

function InstructionEditor({
	doc,
	workspaceId,
	onState,
	onReload,
}: {
	doc: InstructionDoc;
	workspaceId: string | undefined;
	onState: (state: InstructionsState) => void;
	onReload: () => Promise<void>;
}) {
	const t = useT();
	const text = EDITOR_TEXT[doc.kind];
	const [draft, setDraft] = useState<string | null>(null);
	const [mode, setMode] = useState<Mode>("source");
	const [saving, setSaving] = useState(false);
	const [conflict, setConflict] = useState<Conflict>("none");
	const value = draft ?? doc.content;
	const dirty = draft !== null && draft !== doc.content;
	const tooLarge = new TextEncoder().encode(value).length > INSTRUCTIONS_MAX_BYTES;

	const save = (expected: { path: string; revision: string }): Promise<void> => {
		setSaving(true);
		return getTransport()
			.request("instructions.save", {
				kind: doc.kind,
				content: value,
				expectedPath: expected.path,
				expectedRevision: expected.revision,
				...(workspaceId ? { workspaceId } : {}),
			})
			.then(
				(state) => {
					setDraft(null);
					setConflict("none");
					onState(state);
					toast.success(t("instructions.saved"));
				},
				(error: unknown) => {
					if (wsErrorCode(error) === "INSTRUCTIONS_CONFLICT") setConflict("changed");
					else toast.error(errorText(error), t("instructions.saveFailed"));
				},
			)
			.finally(() => setSaving(false));
	};

	const overwrite = () =>
		getTransport()
			.request("instructions.get", {})
			.then((fresh) => save(fresh[doc.kind]));

	const reveal = () => {
		getTransport()
			.request("instructions.reveal", { kind: doc.kind })
			.catch((error: unknown) => toast.error(errorText(error), t("instructions.revealFailed")));
	};

	const canSave = dirty && !saving && !tooLarge;
	const modes = [
		{ id: "source", icon: Code, label: t("instructions.mode.source") },
		{ id: "preview", icon: Eye, label: t("instructions.mode.preview") },
	] as const;

	return (
		<div data-testid={`instructions-${doc.kind}`} className="flex flex-col gap-12">
			<div className="overflow-hidden rounded-md border border-control-border-default bg-control-bg transition-colors focus-within:border-control-border-active">
				<div className="flex items-center justify-between gap-8 border-border-muted border-b py-4 pr-4 pl-12">
					<IconTooltip label={t("instructions.reveal")} side="bottom" align="start">
						<button
							type="button"
							data-testid={`instructions-${doc.kind}-path`}
							// rtl puts the ellipsis at the start, so a long path keeps its file name visible
							dir="rtl"
							className="min-w-0 truncate text-left tr-code-text text-feedback-info hover:underline"
							onClick={reveal}
						>
							<bdi>{doc.path}</bdi>
						</button>
					</IconTooltip>
					<div className="flex shrink-0 items-center gap-2">
						{modes.map(({ id, icon, label }) => (
							<IconButton
								key={id}
								size="s"
								icon={icon}
								label={label}
								data-testid={`instructions-${doc.kind}-mode-${id}`}
								aria-pressed={mode === id}
								selected={mode === id}
								onClick={() => setMode(id)}
							/>
						))}
					</div>
				</div>
				<div className="h-[320px]">
					{mode === "source" ? (
						<Textarea
							data-testid={`instructions-${doc.kind}-text`}
							aria-label={t(text.title)}
							spellCheck={false}
							value={value}
							placeholder={t(text.placeholder)}
							onChange={(event) => setDraft(event.target.value)}
							onKeyDown={(event) => {
								if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
									event.preventDefault();
									if (canSave) void save({ path: doc.path, revision: doc.revision });
								}
							}}
							className="h-full resize-none rounded-none border-0 bg-transparent px-12 py-12 tr-code-text focus-visible:border-0"
						/>
					) : (
						<div
							data-testid={`instructions-${doc.kind}-preview`}
							className="h-full overflow-auto px-16 py-12"
						>
							{value.trim() === "" ? (
								<p className="tr-text-metadata text-text-muted">{t("instructions.previewEmpty")}</p>
							) : (
								<Markdown text={value} />
							)}
						</div>
					)}
				</div>
			</div>
			{doc.ignored.length > 0 ? (
				<SettingsNotice variant="warning" testId={`instructions-${doc.kind}-ignored`}>
					{t("instructions.ignored", { files: doc.ignored.map(baseName).join(", ") })}
				</SettingsNotice>
			) : null}
			{tooLarge ? (
				<SettingsNotice variant="error" testId={`instructions-${doc.kind}-too-large`}>
					{t("instructions.tooLarge", { max: formatBytes(INSTRUCTIONS_MAX_BYTES) })}
				</SettingsNotice>
			) : null}
			{conflict === "changed" ? (
				<SettingsNotice variant="error" testId={`instructions-${doc.kind}-conflict`}>
					<p>{t("instructions.conflict")}</p>
					<div className="mt-8 flex gap-8">
						<Button
							variant="outline"
							data-testid={`instructions-${doc.kind}-conflict-reload`}
							onClick={() => {
								setDraft(null);
								setConflict("none");
								void onReload();
							}}
						>
							{t("instructions.conflict.reload")}
						</Button>
						<Button
							variant="outline"
							data-testid={`instructions-${doc.kind}-conflict-overwrite`}
							disabled={saving || tooLarge}
							onClick={() => void overwrite()}
						>
							{t("instructions.conflict.overwrite")}
						</Button>
					</div>
				</SettingsNotice>
			) : null}
			<div className="flex items-center gap-8">
				<Button
					variant="primary"
					data-testid={`instructions-${doc.kind}-save`}
					disabled={!canSave}
					onClick={() => void save({ path: doc.path, revision: doc.revision })}
				>
					{t("instructions.save")}
				</Button>
				<Button
					variant="outline"
					data-testid={`instructions-${doc.kind}-revert`}
					disabled={!dirty || saving}
					onClick={() => {
						setDraft(null);
						setConflict("none");
					}}
				>
					{t("instructions.revert")}
				</Button>
			</div>
		</div>
	);
}

function ApplyGroup() {
	const t = useT();
	const [applying, setApplying] = useState(false);
	const apply = () => {
		setApplying(true);
		getTransport()
			.request("instructions.apply", {})
			.then(({ reloaded, deferred, failed }) => {
				if (failed > 0) toast.error(t("instructions.apply.failed", { failed }));
				else
					toast.success(
						t("instructions.apply.done", { reloaded, deferred }),
						t("instructions.apply.doneTitle"),
					);
			})
			.catch((error: unknown) => toast.error(errorText(error), t("instructions.apply.failedTitle")))
			.finally(() => setApplying(false));
	};
	return (
		<SettingsGroup
			testId="instructions-apply"
			title={t("instructions.apply.title")}
			titleAddon={
				<SettingsHint
					label={t("instructions.hint", { title: t("instructions.apply.title") })}
					testId="instructions-apply-hint"
				>
					<p>{t("instructions.apply.description")}</p>
				</SettingsHint>
			}
		>
			<div className="py-12">
				<Button
					variant="outline"
					data-testid="instructions-apply-button"
					disabled={applying}
					onClick={apply}
				>
					{t("instructions.apply.action")}
				</Button>
			</div>
		</SettingsGroup>
	);
}

function WorkspaceGroup({
	state,
	hasWorkspace,
}: {
	state: InstructionsState;
	hasWorkspace: boolean;
}) {
	const t = useT();
	const workspace = state.workspace;
	return (
		<SettingsGroup
			testId="instructions-workspace"
			title={t("instructions.workspace.title")}
			titleAddon={
				<SettingsHint
					label={t("instructions.hint", { title: t("instructions.workspace.title") })}
					testId="instructions-workspace-hint"
				>
					<p>{t("instructions.workspace.description")}</p>
				</SettingsHint>
			}
		>
			<div className="flex flex-col gap-12 py-12">
				{!hasWorkspace || !workspace ? (
					<EmptyBox>{t("instructions.workspace.noWorkspace")}</EmptyBox>
				) : workspace.loaded.length === 0 ? (
					<EmptyBox>{t("instructions.workspace.none")}</EmptyBox>
				) : (
					<ol
						data-testid="instructions-loaded"
						className="overflow-hidden rounded-md border border-border-muted"
					>
						{workspace.loaded.map((file, index) => (
							<li
								key={file.path}
								className="flex items-center gap-12 border-border-muted border-b px-12 py-8 last:border-b-0"
							>
								<span className="w-16 shrink-0 text-right tr-text-metadata text-text-subtle tabular-nums">
									{index + 1}
								</span>
								<span className="w-80 shrink-0 tr-text-metadata text-text-muted">
									{t(SCOPE_TEXT[file.scope])}
								</span>
								<span className="min-w-0 flex-1 break-all tr-code-text text-text-default">
									{file.path}
								</span>
								<span className="shrink-0 tr-text-metadata text-text-muted tabular-nums">
									{formatBytes(file.bytes)}
								</span>
							</li>
						))}
					</ol>
				)}
				{workspace?.projectAppend ? (
					<SettingsNotice variant="warning" testId="instructions-project-append">
						{t(
							workspace.projectAppend.active
								? "instructions.projectAppend.active"
								: "instructions.projectAppend.inactive",
							{ path: workspace.projectAppend.path },
						)}
					</SettingsNotice>
				) : null}
				{workspace?.systemPrompt ? (
					<SettingsNotice variant="warning" testId="instructions-system-prompt">
						{t("instructions.systemPrompt", { path: workspace.systemPrompt.path })}
					</SettingsNotice>
				) : null}
			</div>
		</SettingsGroup>
	);
}

export function InstructionsSettings() {
	const t = useT();
	const workspaceId = useAppStore(selectActiveWorkspace)?.id;
	const [state, setState] = useState<InstructionsState | "loading" | "failed">("loading");
	const [appendChoice, setAppendChoice] = useState<boolean | null>(null);

	const load = useCallback(
		() =>
			getTransport()
				.request("instructions.get", workspaceId ? { workspaceId } : {})
				.then(setState, () => setState("failed")),
		[workspaceId],
	);
	useEffect(() => {
		void load();
	}, [load]);

	const appendOpen = appendChoice ?? (typeof state === "object" && state.append.exists);

	if (state === "loading") {
		return (
			<p role="status" className="py-16 tr-text-metadata text-text-muted">
				{t("instructions.loading")}
			</p>
		);
	}
	if (state === "failed") {
		return (
			<SettingsNotice variant="error" testId="instructions-load-failed">
				{t("instructions.loadFailed")}
			</SettingsNotice>
		);
	}
	return (
		<SettingsPageContainer testId="settings-instructions">
			<SettingsGroup title={t("instructions.agents.title")} titleAddon={<KindHint kind="agents" />}>
				<div className="py-12">
					<InstructionEditor
						key={state.agents.path}
						doc={state.agents}
						workspaceId={workspaceId}
						onState={setState}
						onReload={load}
					/>
				</div>
			</SettingsGroup>
			<SettingsGroup title={t("instructions.append.title")} titleAddon={<KindHint kind="append" />}>
				<div className="flex flex-col gap-12 py-12">
					<button
						type="button"
						data-testid="instructions-append-toggle"
						aria-expanded={appendOpen}
						className="flex w-full items-center justify-between gap-8 rounded-md border border-border-muted px-12 py-8 text-left tr-text-ui text-text-default transition-colors hover:bg-control-bg-hovered"
						onClick={() => setAppendChoice(!appendOpen)}
					>
						<span>{t("instructions.append.show")}</span>
						<ChevronDown
							aria-hidden
							className={cn(
								"size-14 shrink-0 text-text-muted transition-transform",
								appendOpen && "rotate-180",
							)}
						/>
					</button>
					{appendOpen ? (
						<InstructionEditor
							doc={state.append}
							workspaceId={workspaceId}
							onState={setState}
							onReload={load}
						/>
					) : null}
				</div>
			</SettingsGroup>
			<WorkspaceGroup state={state} hasWorkspace={workspaceId !== undefined} />
			<ApplyGroup />
		</SettingsPageContainer>
	);
}
