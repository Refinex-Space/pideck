import type {
	AskUserQuestionResult,
	ChatContinuation,
	ChatHandoffDetails,
	ContinueInWorkspaceRequestDetails,
	McpReadOutputResult,
	WireModel,
} from "@thinkrail/contracts";
import { type ComponentType, createContext, useContext } from "react";
import type { RevealBlock } from "./scrollGeometry";

export interface ChatRevealOptions {
	block: RevealBlock;
	provenance: "automatic-attention" | "user-navigation";
	runway: "preserve" | "release";
	stability: "none" | "bounded";
	topInset?: number;
}

export type ResultTarget =
	| { kind: "command"; id: string }
	| { kind: "subagent"; childSessionId: string };

export interface WorkspaceChatTarget {
	workspaceId: string;
	projectId: string;
	sessionId: string;
}

export interface ChatActions {
	answerQuestion: (toolCallId: string, result: AskUserQuestionResult) => Promise<void>;
	cancelAutomaticReveal: () => void;
	focusComposer: () => void;
	openSubagentTranscript: (childSessionId: string) => void;
	resultOpener: (target: ResultTarget) => (() => void) | undefined;
	revealChatElement: (element: HTMLElement, options: ChatRevealOptions) => void;
	readMcpOutput?: ((toolCallId: string) => Promise<McpReadOutputResult>) | undefined;
	openMcpSettings?: (() => void) | undefined;
	openProviderSettings?: (() => void) | undefined;
	findModel?: ((ref: string) => WireModel | null) | undefined;
	/** Continue in workspace: the host-owned phase of an operation, where it went, and how to ask again. */
	continuationOf?: ((operationId: string) => ChatContinuation | undefined) | undefined;
	openContinuation?: ((continuation: ChatContinuation) => void) | undefined;
	retryContinuation?: ((details: ContinueInWorkspaceRequestDetails) => void) | undefined;
	openHandoffSource?: ((details: ChatHandoffDetails) => void) | undefined;
	openWorkspace?: ((target: WorkspaceChatTarget) => void) | undefined;
	WorkspaceName?: ComponentType<{ workspaceId: string; fallback: string }> | undefined;
}

export const ChatActionsContext = createContext<ChatActions | null>(null);

export function useChatActions(): ChatActions | null {
	return useContext(ChatActionsContext);
}
