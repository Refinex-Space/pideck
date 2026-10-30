import type { SubagentResourceSummary } from "@thinkrail/contracts";
import {
	createContext,
	type ReactNode,
	use,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";
import { useNow } from "@/components/useNow";
import type { ResultTarget } from "./ChatActions";
import { RunModelLabel } from "./ModelEffortLabel";
import { CommandLogView, type Resource, ResourceDetailDialog } from "./resources";
import { SubagentTranscriptDialog, SubagentTranscriptPane } from "./SubagentTranscriptDialog";
import { useChatResources, useCommandLog } from "./useChatResources";
import { inspectedResult, useFreshResults } from "./useFreshResults";

export type ChatResources = ReturnType<typeof useChatResources>;

export interface ChatResourcesScope {
	workspaceId: string;
	sessionId: string;
	resources: ChatResources;
	fresh: ReturnType<typeof useFreshResults>;
	now: number;
	/** Opens a command's output or a subagent's transcript in the detail dialog. */
	openDetail: (target: ResultTarget) => void;
	/** Opens a subagent's transcript even when the resource roster no longer lists it. */
	openTranscript: (childSessionId: string) => void;
	/** Reveals the status dock, where the roster and the MCP servers live. */
	openStatus: () => void;
	/** The dock is open and already lists the running work, so the composer's task strip steps aside. */
	statusOpen: boolean;
}

const ChatResourcesContext = createContext<ChatResourcesScope | null>(null);

function renderSubagentModel({ model, thinkingLevel }: SubagentResourceSummary) {
	return <RunModelLabel model={model} thinkingLevel={thinkingLevel} />;
}

function findResource(groups: ChatResources["groups"], target: ResultTarget): Resource | null {
	if (target.kind === "command") {
		const summary = [...groups.commands, ...groups.finishedCommands].find(
			(command) => command.id === target.id,
		);
		return summary ? { kind: "command", summary } : null;
	}
	const summary = [...groups.subagents, ...groups.finishedSubagents].find(
		(child) => child.childSessionId === target.childSessionId,
	);
	return summary ? { kind: "subagent", summary } : null;
}

function targetKey(target: ResultTarget): string {
	return target.kind === "command" ? `command:${target.id}` : `subagent:${target.childSessionId}`;
}

/**
 * One chat's background resources for everything beside it: the transcript, the composer's task strip
 * and the status dock share this single sync, so Stop and MCP actions show the same pending state
 * everywhere. It also owns the detail dialog (command output, subagent transcript) that any of them opens.
 */
export function ChatResourcesProvider({
	workspaceId,
	sessionId,
	onOpenStatus,
	statusOpen,
	children,
}: {
	workspaceId: string;
	sessionId: string;
	onOpenStatus: () => void;
	statusOpen: boolean;
	children: ReactNode;
}) {
	const resources = useChatResources(workspaceId, sessionId);
	const fresh = useFreshResults(
		workspaceId,
		sessionId,
		resources.groups,
		resources.visible && resources.authoritative,
	);
	const now = useNow();
	const [selection, setSelection] = useState<{ key: string; target: ResultTarget } | null>(null);
	const [transcriptChildId, setTranscriptChildId] = useState<string | null>(null);
	const scopeKey = `${workspaceId}:${sessionId}`;
	const [openedFor, setOpenedFor] = useState(scopeKey);
	if (openedFor !== scopeKey) {
		setOpenedFor(scopeKey);
		setSelection(null);
		setTranscriptChildId(null);
	}
	const markSeen = fresh.markSeen;

	const detail = selection ? findResource(resources.groups, selection.target) : null;
	const commandId = detail?.kind === "command" ? detail.summary.id : null;
	const commandLog = useCommandLog(workspaceId, sessionId, commandId);
	const inspected = selection
		? inspectedResult(
				resources.groups,
				selection.target.kind === "command" ? selection.target.id : null,
				selection.target.kind === "subagent" ? selection.target.childSessionId : null,
			)
		: null;
	const inspectedKey = inspected ? targetKey(inspected) : null;
	useEffect(() => {
		if (inspected) markSeen(inspected);
	}, [inspectedKey, markSeen]);
	useEffect(() => {
		if (resources.knownUnsupported) setSelection(null);
	}, [resources.knownUnsupported]);

	const openDetail = useCallback(
		(target: ResultTarget) => setSelection({ key: targetKey(target), target }),
		[],
	);
	const value = useMemo<ChatResourcesScope>(
		() => ({
			workspaceId,
			sessionId,
			resources,
			fresh,
			now,
			openDetail,
			openTranscript: setTranscriptChildId,
			openStatus: onOpenStatus,
			statusOpen,
		}),
		[workspaceId, sessionId, resources, fresh, now, openDetail, onOpenStatus, statusOpen],
	);

	const stopSelected = () => {
		if (!detail) return;
		if (detail.kind === "command") resources.stopCommand(detail.summary.id);
		else resources.stopSubagent(detail.summary.childSessionId);
	};

	return (
		<ChatResourcesContext value={value}>
			{children}
			{detail ? (
				<ResourceDetailDialog
					key={selection?.key}
					resource={detail}
					now={now}
					authoritative={resources.authoritative}
					actions={resources.actions}
					onStop={stopSelected}
					onOpenChange={(open) => {
						if (!open) setSelection(null);
					}}
					renderSubagentModel={renderSubagentModel}
				>
					{detail.kind === "command" ? (
						<CommandLogView {...commandLog} onRetry={commandLog.retry} />
					) : (
						<SubagentTranscriptPane
							key={detail.summary.childSessionId}
							workspaceId={workspaceId}
							parentSessionId={sessionId}
							childSessionId={detail.summary.childSessionId}
						/>
					)}
				</ResourceDetailDialog>
			) : null}
			{transcriptChildId ? (
				<SubagentTranscriptDialog
					key={`${scopeKey}:${transcriptChildId}`}
					workspaceId={workspaceId}
					parentSessionId={sessionId}
					childSessionId={transcriptChildId}
					onOpenChange={(open) => {
						if (!open) setTranscriptChildId(null);
					}}
				/>
			) : null}
		</ChatResourcesContext>
	);
}

/** The chat's resources scope; absent where no chat is shown (a workspace's empty center). */
export function useOptionalChatResources(): ChatResourcesScope | null {
	return use(ChatResourcesContext);
}

export function useChatResourcesScope(): ChatResourcesScope {
	const scope = use(ChatResourcesContext);
	if (!scope) throw new Error("ChatView must render inside a ChatResourcesProvider.");
	return scope;
}
