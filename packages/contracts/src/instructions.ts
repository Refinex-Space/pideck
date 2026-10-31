/** A global instruction file Pi reads from its agent directory. */
export type InstructionKind = "agents" | "append";

/** Larger files are refused: they are injected into every request of every chat. */
export const INSTRUCTIONS_MAX_BYTES = 200_000;

export interface InstructionDoc {
	kind: InstructionKind;
	/** The file Pi reads for this kind, and the one a save writes (a symlink is written through). */
	path: string;
	exists: boolean;
	content: string;
	/** Content hash a save must echo back; empty when the file does not exist. */
	revision: string;
	/** `agents` only: lower-priority candidates in the same folder that Pi ignores. */
	ignored: string[];
}

/** `global` is the agent directory, `project` the chat's working directory, `ancestor` anything above it. */
export type LoadedInstructionScope = "global" | "ancestor" | "project";

export interface LoadedInstructionFile {
	path: string;
	scope: LoadedInstructionScope;
	bytes: number;
}

export interface WorkspaceInstructions {
	/** Context files in the order Pi injects them. */
	loaded: LoadedInstructionFile[];
	/** The project's `.pi/APPEND_SYSTEM.md`; `active` only once the project is trusted, and it then replaces the global one. */
	projectAppend?: { path: string; active: boolean };
	/** A `SYSTEM.md` that replaces Pi's default system prompt for chats in this workspace. */
	systemPrompt?: { path: string; scope: "global" | "project" };
}

export interface InstructionsState {
	agentDir: string;
	agents: InstructionDoc;
	append: InstructionDoc;
	/** Present only when the request named a workspace. */
	workspace?: WorkspaceInstructions;
}

/** How a reload of the open chats went; a busy chat reloads once it is idle. */
export interface InstructionsApplyResult {
	reloaded: number;
	deferred: number;
	failed: number;
}
