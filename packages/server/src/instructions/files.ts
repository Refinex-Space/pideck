import { createHash } from "node:crypto";
import {
	chmodSync,
	existsSync,
	lstatSync,
	mkdirSync,
	readFileSync,
	realpathSync,
	renameSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { loadProjectContextFiles } from "@earendil-works/pi-coding-agent";
import {
	INSTRUCTIONS_MAX_BYTES,
	type InstructionDoc,
	type InstructionKind,
	type InstructionsState,
	type LoadedInstructionScope,
	type WorkspaceInstructions,
} from "@thinkrail/contracts";
import { CodedError } from "@thinkrail/shared/codedError";

/** Pi's own candidate order for a folder's context file (`loadContextFileFromDir`): the first present one wins. */
const AGENTS_CANDIDATES = [
	"AGENTS.override.md",
	"AGENTS.md",
	"AGENTS.MD",
	"CLAUDE.md",
	"CLAUDE.MD",
];
const AGENTS_DEFAULT = "AGENTS.md";
const APPEND_FILE = "APPEND_SYSTEM.md";
const SYSTEM_FILE = "SYSTEM.md";
const PROJECT_CONFIG_DIR = ".pi";

function isFile(path: string): boolean {
	try {
		return statSync(path).isFile();
	} catch {
		return false;
	}
}

function stripBom(text: string): string {
	return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function hash(content: string): string {
	return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

function readDoc(kind: InstructionKind, agentDir: string): InstructionDoc {
	let path = join(agentDir, APPEND_FILE);
	let ignored: string[] = [];
	if (kind === "agents") {
		// A case-insensitive volume lists `AGENTS.md` and `AGENTS.MD` as one file, not two.
		const seen = new Set<string>();
		const present = AGENTS_CANDIDATES.filter((name) => {
			const key = name.toLowerCase();
			if (seen.has(key) || !isFile(join(agentDir, name))) return false;
			seen.add(key);
			return true;
		});
		path = join(agentDir, present[0] ?? AGENTS_DEFAULT);
		ignored = present.slice(1).map((name) => join(agentDir, name));
	}
	if (!isFile(path)) return { kind, path, exists: false, content: "", revision: "", ignored };
	const content = stripBom(readFileSync(path, "utf8"));
	return { kind, path, exists: true, content, revision: hash(content), ignored };
}

/** Where `kind` lives: its file when it exists, else the agent directory a first save would create. */
export function instructionTarget(
	agentDir: string,
	kind: InstructionKind,
): { path: string; exists: boolean } {
	const { path, exists } = readDoc(kind, agentDir);
	return { path: exists ? path : agentDir, exists };
}

export interface WorkspaceScope {
	cwd: string;
	/** Whether Pi loads this workspace's `.pi` resources. */
	trusted: boolean;
}

function scopeOf(file: string, agentDir: string, cwd: string): LoadedInstructionScope {
	const dir = dirname(file);
	if (dir === resolve(agentDir)) return "global";
	return dir === resolve(cwd) ? "project" : "ancestor";
}

function workspaceInstructions(agentDir: string, scope: WorkspaceScope): WorkspaceInstructions {
	const loaded = loadProjectContextFiles({ cwd: scope.cwd, agentDir }).map((file) => ({
		path: file.path,
		scope: scopeOf(file.path, agentDir, scope.cwd),
		bytes: Buffer.byteLength(file.content),
	}));
	const projectDir = join(resolve(scope.cwd), PROJECT_CONFIG_DIR);
	const projectAppend = join(projectDir, APPEND_FILE);
	const projectSystem = join(projectDir, SYSTEM_FILE);
	const globalSystem = join(agentDir, SYSTEM_FILE);
	// Pi picks the trusted project file first, then the agent directory's, and never merges the two.
	const system =
		scope.trusted && isFile(projectSystem)
			? { path: projectSystem, scope: "project" as const }
			: isFile(globalSystem)
				? { path: globalSystem, scope: "global" as const }
				: undefined;
	return {
		loaded,
		...(isFile(projectAppend)
			? { projectAppend: { path: projectAppend, active: scope.trusted } }
			: {}),
		...(system ? { systemPrompt: system } : {}),
	};
}

export function readInstructions(agentDir: string, scope?: WorkspaceScope): InstructionsState {
	return {
		agentDir,
		agents: readDoc("agents", agentDir),
		append: readDoc("append", agentDir),
		...(scope ? { workspace: workspaceInstructions(agentDir, scope) } : {}),
	};
}

export interface SaveInstruction {
	kind: InstructionKind;
	content: string;
	expectedPath: string;
	expectedRevision: string;
}

/** Writes through a symlink so a rules file the user shares with another agent stays linked. */
function writeAtomically(path: string, content: string): void {
	const real = lstatSync(path, { throwIfNoEntry: false })?.isSymbolicLink()
		? realpathSync(path)
		: path;
	const temp = join(dirname(real), `.${basename(real)}.${process.pid}.${Date.now()}.tmp`);
	try {
		writeFileSync(temp, content, "utf8");
		const mode = statSync(real, { throwIfNoEntry: false })?.mode;
		if (mode !== undefined) chmodSync(temp, mode & 0o777);
		renameSync(temp, real);
	} catch (error) {
		if (existsSync(temp)) unlinkSync(temp);
		throw error;
	}
}

/** Saves one global instruction file. An empty text removes it, since Pi would inject an empty block. */
export function saveInstruction(agentDir: string, request: SaveInstruction): InstructionsState {
	if (Buffer.byteLength(request.content) > INSTRUCTIONS_MAX_BYTES) {
		throw new CodedError(
			"INSTRUCTIONS_TOO_LARGE",
			`The file is larger than ${INSTRUCTIONS_MAX_BYTES} bytes.`,
		);
	}
	const current = readDoc(request.kind, agentDir);
	if (current.path !== request.expectedPath || current.revision !== request.expectedRevision) {
		throw new CodedError("INSTRUCTIONS_CONFLICT", "The file changed on disk since it was loaded.");
	}
	if (request.content.trim() === "") {
		if (current.exists) unlinkSync(current.path);
	} else {
		mkdirSync(agentDir, { recursive: true });
		writeAtomically(
			current.path,
			request.content.endsWith("\n") ? request.content : `${request.content}\n`,
		);
	}
	return readInstructions(agentDir);
}
