import { useT } from "@thinkrail/locales/react";
import { IconButton } from "@thinkrail/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@thinkrail/ui/command";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@thinkrail/ui/dialog";
import { cn } from "@thinkrail/ui/utils";
import { CornerDownLeft, Folder, MessageSquare, X } from "lucide-react";
import { type KeyboardEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AttentionDot } from "@/components/AttentionDot";
import { RunningIcon } from "@/components/RunningIcon";
import { chatLabel } from "@/lib";
import { loadProjectWorkspaces } from "@/panels/workspaceActions";
import { useAppStore, workspaceName } from "@/store";
import { useSessionSwitcher } from "./useSessionSwitcher";

export interface SessionSwitcherProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

type Kind = "all" | "sessions" | "projects";
const KINDS: readonly Kind[] = ["all", "sessions", "projects"];
const TAB_LABELS = {
	all: "shell.sessionSwitcher.tabAll",
	sessions: "shell.sessionSwitcher.tabSessions",
	projects: "shell.sessionSwitcher.tabProjects",
} as const;

const ROW_CLASS =
	"group h-40 gap-12 rounded-md px-12 py-0 data-[selected=true]:bg-control-bg-selected";
const HEADING_CLASS =
	"[&_[cmdk-group-heading]]:px-12 [&_[cmdk-group-heading]]:pt-12 [&_[cmdk-group-heading]]:pb-4 [&_[cmdk-group-heading]]:tr-text-metadata";

function Keycap({ children }: { children: string }) {
	return (
		<kbd className="inline-flex h-20 min-w-20 items-center justify-center rounded-sm border border-border-default px-4 tr-text-metadata text-text-muted">
			{children}
		</kbd>
	);
}

function Hint({ label, keys }: { label: string; keys: string[] }) {
	return (
		<span className="flex items-center gap-4">
			<span>{label}</span>
			{keys.map((key) => (
				<Keycap key={key}>{key}</Keycap>
			))}
		</span>
	);
}

export function SessionSwitcher({ open, onOpenChange }: SessionSwitcherProps) {
	const t = useT();
	const projects = useAppStore((state) => state.projects);
	const [query, setQuery] = useState("");
	const [kind, setKind] = useState<Kind>("all");
	const handleClose = useCallback(() => {
		onOpenChange(false);
	}, [onOpenChange]);

	const { groups, navigate } = useSessionSwitcher(open, handleClose);

	useEffect(() => {
		if (!open) {
			setQuery("");
			setKind("all");
		}
	}, [open]);

	const needle = query.trim().toLowerCase();
	const sessions = useMemo(() => {
		const rows = groups.flatMap((group) =>
			group.sessions.map((session) => ({
				session,
				projectName: group.projectName,
				label: chatLabel(t, session.chatTitle, session.firstPrompt),
				workspace: session.workspaceName
					? workspaceName(t, { kind: session.workspaceKind, name: session.workspaceName })
					: "",
			})),
		);
		if (!needle) return rows;
		return rows.filter((row) =>
			[row.label.text, row.session.firstPrompt ?? "", row.projectName, row.workspace].some(
				(field) => field.toLowerCase().includes(needle),
			),
		);
	}, [groups, needle, t]);
	const matchedProjects = useMemo(
		() => projects.filter((project) => !needle || project.name.toLowerCase().includes(needle)),
		[projects, needle],
	);
	const showSessions = kind !== "projects";
	const showProjects = kind !== "sessions";
	const empty =
		(!showSessions || sessions.length === 0) && (!showProjects || matchedProjects.length === 0);

	const openProject = (projectId: string) => {
		useAppStore.getState().selectProject(projectId, { reveal: true });
		void loadProjectWorkspaces(projectId).catch(() => {});
		handleClose();
	};

	const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (query !== "" || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
		event.preventDefault();
		const delta = event.key === "ArrowRight" ? 1 : -1;
		setKind(
			(current) => KINDS[(KINDS.indexOf(current) + delta + KINDS.length) % KINDS.length] ?? current,
		);
	};

	const sessionRow = ({ session, projectName, label, workspace }: (typeof sessions)[number]) => {
		const isRunning = session.attention === "running";
		return (
			<CommandItem
				key={session.sessionId}
				value={`session:${session.sessionId}`}
				data-testid="session-switcher-row"
				data-session-id={session.sessionId}
				className={ROW_CLASS}
				onSelect={() => navigate(session)}
			>
				{isRunning ? (
					<RunningIcon className="size-16 shrink-0 text-text-muted" />
				) : (
					<MessageSquare className="size-16 shrink-0 text-text-muted" />
				)}
				<span
					className="min-w-0 flex-1 truncate tr-text-ui text-text-default"
					data-title-source={label.source}
					title={label.tooltip}
				>
					{label.text}
				</span>
				{isRunning || session.attention === null ? null : <AttentionDot />}
				<span className="max-w-[40%] shrink-0 truncate tr-text-metadata text-text-subtle group-data-[selected=true]:hidden">
					{workspace ? `${projectName} · ${workspace}` : projectName}
				</span>
				<CornerDownLeft className="hidden size-16 shrink-0 text-text-muted group-data-[selected=true]:block" />
			</CommandItem>
		);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className="max-w-[40rem] gap-0 overflow-hidden rounded-xl p-0"
				hideClose
				data-testid="session-switcher"
				onOpenAutoFocus={(event) => {
					event.preventDefault();
					document
						.querySelector<HTMLElement>('[data-testid="session-switcher"] [cmdk-input]')
						?.focus();
				}}
			>
				<DialogTitle className="sr-only">{t("shell.sessionSwitcher.title")}</DialogTitle>
				<Command className="bg-transparent" loop shouldFilter={false} vimBindings={false}>
					<div className="flex items-center gap-8 px-16 pt-12">
						<CommandInput
							bare
							value={query}
							onValueChange={setQuery}
							onKeyDown={onInputKeyDown}
							data-testid="session-switcher-input"
							placeholder={t("shell.sessionSwitcher.placeholder")}
							className="h-40 min-w-0 flex-1 bg-transparent tr-text-reading text-text-default outline-none placeholder:text-text-muted"
						/>
						<DialogClose asChild>
							<IconButton
								variant="ghost"
								size="m"
								icon={X}
								label={t("shell.sessionSwitcher.close")}
								className="shrink-0"
							/>
						</DialogClose>
					</div>
					<div
						role="tablist"
						aria-label={t("shell.sessionSwitcher.title")}
						className="flex items-center gap-4 border-border-default border-b px-12 pt-4 pb-12"
					>
						{KINDS.map((value) => (
							<button
								key={value}
								type="button"
								role="tab"
								tabIndex={-1}
								aria-selected={kind === value}
								data-testid={`session-switcher-tab-${value}`}
								onClick={() => setKind(value)}
								className={cn(
									"h-32 rounded-md px-12 tr-text-ui outline-none transition-colors hover:bg-control-bg-hovered focus-visible:ring-1 focus-visible:ring-focus-ring",
									kind === value ? "bg-control-bg-selected text-text-default" : "text-text-muted",
								)}
							>
								{t(TAB_LABELS[value])}
							</button>
						))}
					</div>
					<CommandList className="h-[min(50vh,420px)] max-h-none px-8 pt-8 pb-8">
						{empty ? (
							<CommandEmpty>
								{needle || projects.length > 0
									? t("shell.sessionSwitcher.noMatches")
									: t("shell.sessionSwitcher.empty")}
							</CommandEmpty>
						) : null}
						{showSessions && sessions.length > 0 ? (
							<CommandGroup
								heading={kind === "all" ? t("shell.sessionSwitcher.tabSessions") : undefined}
								className={HEADING_CLASS}
							>
								{sessions.map(sessionRow)}
							</CommandGroup>
						) : null}
						{showProjects && matchedProjects.length > 0 ? (
							<CommandGroup
								heading={kind === "all" ? t("shell.sessionSwitcher.tabProjects") : undefined}
								className={HEADING_CLASS}
							>
								{matchedProjects.map((project) => (
									<CommandItem
										key={project.id}
										value={`project:${project.id}`}
										data-testid="session-switcher-project"
										className={ROW_CLASS}
										onSelect={() => openProject(project.id)}
									>
										<Folder className="size-16 shrink-0 text-text-muted" />
										<span className="min-w-0 flex-1 truncate tr-text-ui text-text-default">
											{project.name}
										</span>
										<CornerDownLeft className="hidden size-16 shrink-0 text-text-muted group-data-[selected=true]:block" />
									</CommandItem>
								))}
							</CommandGroup>
						) : null}
					</CommandList>
					<div className="flex items-center justify-between border-border-default border-t px-16 py-12 tr-text-metadata text-text-muted">
						<div className="flex items-center gap-16">
							<Hint label={t("shell.sessionSwitcher.hintClose")} keys={["Esc"]} />
							<Hint label={t("shell.sessionSwitcher.hintSwitch")} keys={["←", "→"]} />
						</div>
						<Hint label={t("shell.sessionSwitcher.hintOpen")} keys={["↵"]} />
					</div>
				</Command>
			</DialogContent>
		</Dialog>
	);
}
