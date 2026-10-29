import {
	RiMoreLine as MoreVertical,
	RiPencilLine as Pencil,
	RiDeleteBin6Line as Trash2,
} from "@remixicon/react";
import {
	isSessionWorking,
	type SessionStateRecord,
	type SessionSummary,
	type Workspace,
} from "@thinkrail/contracts";
import { useT } from "@thinkrail/locales/react";
import { IconButton } from "@thinkrail/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@thinkrail/ui/dropdown-menu";
import { cn } from "@thinkrail/ui/utils";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { AttentionDot } from "@/components/AttentionDot";
import { RunningIcon } from "@/components/RunningIcon";
import { prepareChatTitle } from "../chat/chatTitle";
import { chatLabel } from "../lib";
import { type ClosedChat, selectWorkspaceChatTab, toast, useAppStore } from "../store";
import { errorText, getTransport } from "../transport";

const SESSIONS_SHOWN = 8;
const NO_CLOSED: ClosedChat[] = [];

export interface WorkspaceChat {
	sessionId: string;
	open: boolean;
	name: string;
	firstPrompt: string | undefined;
}

/** Whether the workspace's chats stand in for its own row (a project folder, or any workspace with several). */
export function workspaceListsChats(
	workspace: Pick<Workspace, "kind">,
	chatCount: number,
): boolean {
	const userOwned = workspace.kind === "default" || workspace.kind === "external";
	return chatCount > 0 && (userOwned || chatCount >= 2);
}

/**
 * Every chat the host holds for a workspace, newest first, not only the ones this window has opened: the host
 * list is fetched when the row mounts and again whenever this window's own chats change.
 */
export function useWorkspaceChats(workspaceId: string): WorkspaceChat[] {
	const tabs = useAppStore((s) => s.tabsByWorkspace[workspaceId]);
	const closed = useAppStore((s) => s.closedChatsByWorkspace[workspaceId] ?? NO_CLOSED);
	const deleted = useAppStore((s) => s.deletedSessionsByWorkspace[workspaceId]);
	const [summaries, setSummaries] = useState<SessionSummary[]>([]);

	const openIds: string[] = [];
	for (const tab of tabs ?? []) if (tab.kind === "chat") openIds.push(tab.sessionId);
	const changeKey = `${openIds.join(",")}|${closed.map((chat) => chat.sessionId).join(",")}`;
	useEffect(() => {
		let cancelled = false;
		void getTransport()
			.request("session.list", { workspaceId })
			.then((rows) => {
				if (!cancelled) setSummaries(rows);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [workspaceId, changeKey]);

	const chats = new Map<string, WorkspaceChat>();
	for (const row of [...summaries].sort((a, b) => b.updatedAt - a.updatedAt)) {
		if (deleted?.[row.sessionId]) continue;
		chats.set(row.sessionId, {
			sessionId: row.sessionId,
			open: false,
			name: row.title,
			firstPrompt: row.firstPrompt,
		});
	}
	for (const tab of tabs ?? []) {
		if (tab.kind !== "chat" || deleted?.[tab.sessionId]) continue;
		const known = chats.get(tab.sessionId);
		chats.set(tab.sessionId, {
			sessionId: tab.sessionId,
			open: true,
			name: tab.name || known?.name || "",
			firstPrompt: known?.firstPrompt,
		});
	}
	for (const chat of closed) {
		if (chats.has(chat.sessionId) || deleted?.[chat.sessionId]) continue;
		chats.set(chat.sessionId, {
			sessionId: chat.sessionId,
			open: false,
			name: chat.title,
			firstPrompt: chat.firstPrompt,
		});
	}
	return [...chats.values()];
}

/**
 * The chats of one workspace, listed under its row (or in its place for a project folder): the chat is the
 * navigable unit, the folder is only where it runs.
 */
export function WorkspaceSessions({
	workspace,
	chats,
}: {
	workspace: Workspace;
	chats: WorkspaceChat[];
}) {
	const t = useT();
	const [showAll, setShowAll] = useState(false);
	const states = useAppStore((s) => s.sessionStateByWorkspace[workspace.id]);
	const currentSessionId = useAppStore((s) =>
		s.activeWorkspaceId === workspace.id
			? (selectWorkspaceChatTab(s, workspace.id)?.sessionId ?? null)
			: null,
	);
	if (!workspaceListsChats(workspace, chats.length)) return null;

	const shown = showAll ? chats : chats.slice(0, SESSIONS_SHOWN);
	return (
		<ul data-testid="workspace-sessions" className="mt-2 flex flex-col gap-2">
			{shown.map((chat) => (
				<SessionRow
					key={chat.sessionId}
					workspace={workspace}
					chat={chat}
					record={states?.[chat.sessionId]}
					active={currentSessionId === chat.sessionId}
				/>
			))}
			{chats.length > SESSIONS_SHOWN && !showAll ? (
				<li>
					<button
						type="button"
						data-testid="workspace-sessions-more"
						onClick={() => setShowAll(true)}
						className="flex h-panel-row w-full items-center rounded-md pl-32 text-left text-text-subtle tr-text-metadata hover:bg-control-bg-hovered hover:text-text-muted"
					>
						{t("panels.projectTree.showMore", { count: chats.length - SESSIONS_SHOWN })}
					</button>
				</li>
			) : null}
		</ul>
	);
}

function SessionRow({
	workspace,
	chat,
	record,
	active,
}: {
	workspace: Workspace;
	chat: WorkspaceChat;
	record: SessionStateRecord | undefined;
	active: boolean;
}) {
	const t = useT();
	const [menuOpen, setMenuOpen] = useState(false);
	const [editing, setEditing] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);
	const cancelBlurRef = useRef(false);
	const label = chatLabel(t, chat.name, record?.firstPrompt ?? chat.firstPrompt);
	const attention =
		record !== undefined && (record.state.needsInput !== null || record.state.completionUnread);

	useEffect(() => {
		if (!editing) return;
		const frame = requestAnimationFrame(() => {
			inputRef.current?.focus();
			inputRef.current?.select();
		});
		return () => cancelAnimationFrame(frame);
	}, [editing]);

	const open = () =>
		useAppStore
			.getState()
			.activateWorkspaceFromRoute(
				{ id: workspace.id, projectId: workspace.projectId },
				chat.sessionId,
			);
	const commitRename = () => {
		if (cancelBlurRef.current) {
			cancelBlurRef.current = false;
			setEditing(false);
			return;
		}
		const prepared = prepareChatTitle(inputRef.current?.value ?? "");
		setEditing(false);
		if ("reason" in prepared || prepared.title === chat.name) return;
		void getTransport()
			.request("session.rename", {
				workspaceId: workspace.id,
				sessionId: chat.sessionId,
				title: prepared.title,
			})
			.catch((error) => toast.error(errorText(error), t("shell.workbench.chatRenameFailed")));
	};
	const onNameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		event.stopPropagation();
		if (event.key === "Enter") {
			event.preventDefault();
			inputRef.current?.blur();
		} else if (event.key === "Escape") {
			event.preventDefault();
			cancelBlurRef.current = true;
			inputRef.current?.blur();
		}
	};
	const trash = () => {
		void getTransport()
			.request("session.delete", { workspaceId: workspace.id, sessionId: chat.sessionId })
			.then(() => useAppStore.getState().deleteChat(workspace.id, chat.sessionId))
			.catch((error) => toast.error(errorText(error), t("shell.chatHistory.deleteFailed")));
	};

	return (
		<li>
			<div
				data-testid="workspace-session"
				data-session-id={chat.sessionId}
				data-active={active}
				data-open={chat.open}
				data-row
				className={cn(
					"group relative flex h-panel-row min-w-0 items-center gap-8 rounded-md pr-4 pl-32 transition-colors",
					active || menuOpen ? "bg-control-bg-selected" : "hover:bg-control-bg-hovered",
				)}
			>
				{editing ? (
					<input
						ref={inputRef}
						data-testid="workspace-session-name-input"
						type="text"
						spellCheck={false}
						aria-label={t("workbench.tab.chatName")}
						defaultValue={chat.name}
						onKeyDown={onNameKeyDown}
						onBlur={commitRename}
						className={cn(
							"min-w-0 flex-1 border-0 bg-transparent p-0 tr-text-ui outline-none",
							active ? "text-text-default" : "text-text-muted",
						)}
					/>
				) : (
					<button
						type="button"
						onClick={open}
						title={label.tooltip ?? label.text}
						className={cn(
							"flex h-full min-w-0 flex-1 items-center gap-8 text-left tr-text-ui outline-none focus-visible:outline-1 focus-visible:outline-focus-ring",
							active ? "text-text-default" : "text-text-muted",
						)}
					>
						<span data-title-source={label.source} className="min-w-0 flex-1 truncate">
							{label.text}
						</span>
					</button>
				)}
				{record && isSessionWorking(record.state) ? (
					<RunningIcon className="size-12 shrink-0 text-text-muted" />
				) : null}
				{attention ? <AttentionDot /> : null}
				<span
					className={cn(
						"flex shrink-0 items-center",
						"[@media(hover:hover)]:absolute [@media(hover:hover)]:top-1/2 [@media(hover:hover)]:right-4 [@media(hover:hover)]:-translate-y-1/2 [@media(hover:hover)]:rounded-sm [@media(hover:hover)]:pl-4 [@media(hover:hover)]:group-hover:bg-control-bg-hovered",
						(active || menuOpen) && "[@media(hover:hover)]:group-hover:bg-control-bg-selected",
						menuOpen && "[@media(hover:hover)]:bg-control-bg-selected",
						!menuOpen && "[@media(hover:hover)]:hidden [@media(hover:hover)]:group-hover:flex",
					)}
				>
					<DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
						<DropdownMenuTrigger asChild>
							<IconButton
								icon={MoreVertical}
								label={t("panels.projectTree.sessionActions", { name: label.text })}
								tooltip={null}
								variant="ghost"
								size="s"
								data-testid="workspace-session-menu"
							/>
						</DropdownMenuTrigger>
						<DropdownMenuContent
							align="end"
							data-testid="workspace-session-actions"
							onCloseAutoFocus={(event) => event.preventDefault()}
						>
							<DropdownMenuItem
								data-testid="workspace-session-rename"
								onSelect={() => {
									cancelBlurRef.current = false;
									setEditing(true);
								}}
							>
								<Pencil />
								{t("common.rename")}
							</DropdownMenuItem>
							<DropdownMenuItem data-testid="workspace-session-trash" onSelect={trash}>
								<Trash2 />
								{t("shell.chatHistory.trashChat")}
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</span>
			</div>
		</li>
	);
}
