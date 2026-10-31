import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type { InstructionKind, InstructionsState } from "@thinkrail/contracts";
import {
	readInstructions as readFrom,
	type SaveInstruction,
	saveInstruction as saveTo,
	instructionTarget as targetIn,
	type WorkspaceScope,
} from "./files";

export type { SaveInstruction, WorkspaceScope } from "./files";

/** The global instruction files in Pi's agent directory, plus what a workspace's chats would load. */
export function readInstructions(scope?: WorkspaceScope): InstructionsState {
	return readFrom(getAgentDir(), scope);
}

export function saveInstruction(
	request: SaveInstruction,
	scope?: WorkspaceScope,
): InstructionsState {
	saveTo(getAgentDir(), request);
	return readInstructions(scope);
}

/** What the file manager should show for `kind`: the file (selected) when it exists, else the agent directory. */
export function instructionTarget(kind: InstructionKind): { path: string; exists: boolean } {
	return targetIn(getAgentDir(), kind);
}
