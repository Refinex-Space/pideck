export type BrowserAction =
	| "capabilities"
	| "all"
	| "allTextContents"
	| "textContent"
	| "expectNavigation"
	| "waitForTimeout"
	| "downloadMedia"
	| "help"
	| "list"
	| "newTab"
	| "claimTab"
	| "activateTab"
	| "close"
	| "finalize"
	| "navigate"
	| "back"
	| "forward"
	| "reload"
	| "snapshot"
	| "getState"
	| "click"
	| "dblclick"
	| "fill"
	| "type"
	| "press"
	| "hover"
	| "select"
	| "check"
	| "uncheck"
	| "count"
	| "text"
	| "attribute"
	| "visible"
	| "enabled"
	| "evaluate"
	| "waitFor"
	| "waitForURL"
	| "waitForLoadState"
	| "move"
	| "scroll"
	| "scrollTo"
	| "drag"
	| "screenshot"
	| "elementInfo"
	| "getDialog"
	| "handleDialog"
	| "upload"
	| "download"
	| "console"
	| "clipboardRead"
	| "clipboardWrite"
	| "paste"
	| "viewport"
	| "visibility"
	| "recordingStart"
	| "recordingStatus"
	| "recordingStop"
	| "recordingCancel";

export interface BrowserTextMatcher {
	source: string;
	flags?: string;
}
export interface BrowserLocator {
	and?: BrowserLocator;
	or?: BrowserLocator;
	hasNot?: BrowserLocator;
	last?: boolean;
	visible?: boolean;
	selector?: string;
	role?: string;
	name?: string | BrowserTextMatcher;
	text?: string | BrowserTextMatcher;
	label?: string | BrowserTextMatcher;
	placeholder?: string | BrowserTextMatcher;
	testId?: string;
	alt?: string | BrowserTextMatcher;
	title?: string | BrowserTextMatcher;
	exact?: boolean;
	frames?: string[];
	scope?: BrowserLocator;
	has?: BrowserLocator;
	hasText?: string | BrowserTextMatcher;
	hasNotText?: string | BrowserTextMatcher;
	nth?: number;
}

export interface BrowserRecordingStep {
	button?: "left" | "middle" | "right";
	doubleClick?: boolean;
	path?: { x: number; y: number }[];
	times?: number;
	intervalMs?: number;
	state?: "attached" | "detached" | "visible" | "hidden";
	timeoutMs?: number;
	type:
		| "wait"
		| "click"
		| "type"
		| "hover"
		| "move"
		| "scroll"
		| "scrollTo"
		| "wheel"
		| "drag"
		| "waitFor";
	selector?: string;
	text?: string;
	x?: number;
	y?: number;
	toX?: number;
	toY?: number;
	deltaX?: number;
	deltaY?: number;
	durationMs?: number;
	delayAfterMs?: number;
}

export interface BrowserCommand {
	force?: boolean;
	action: BrowserAction;
	tabId?: string;
	url?: string;
	locator?: BrowserLocator;
	text?: string;
	key?: string;
	attribute?: string;
	script?: string;
	arg?: unknown;
	values?: (string | { value?: string; label?: string; index?: number })[];
	path?: { x: number; y: number }[];
	files?: string[];
	x?: number;
	y?: number;
	toX?: number;
	toY?: number;
	deltaX?: number;
	deltaY?: number;
	button?: "left" | "middle" | "right";
	modifiers?: ("Alt" | "Control" | "Meta" | "Shift")[];
	timeoutMs?: number;
	state?: "attached" | "detached" | "visible" | "hidden" | "load" | "domcontentloaded";
	accept?: boolean;
	fullPage?: boolean;
	visible?: boolean;
	keep?: string[];
	viewport?: { width: number; height: number } | null;
	clip?: { x: number; y: number; width: number; height: number };
	outputPath?: string;
	trigger?: BrowserCommand;
	recordingId?: string;
	fps?: number;
	maxDurationMs?: number;
	settleMs?: number;
	showCursor?: boolean;
	actions?: BrowserRecordingStep[];
}

export interface BrowserTabInfo {
	openerId?: string;
	active?: boolean;
	visible?: boolean;
	viewport?: { width: number; height: number };
	id: string;
	url: string;
	title: string;
	ownerSessionId?: string;
}
export interface BrowserScope {
	workspaceId: string;
	sessionId: string;
	workspacePath: string;
}
export interface BrowserArtifact {
	filename?: string;
	path: string;
	mimeType: "video/webm" | "image/png" | "application/octet-stream";
	width?: number;
	height?: number;
	durationMs?: number;
	bytes: number;
}
export interface BrowserRecordingState {
	id: string;
	tabId: string;
	phase: "preparing" | "capturing" | "finalizing" | "completed" | "cancelled" | "failed";
	startedAt: number;
	error?: string;
	artifact?: BrowserArtifact;
}
export interface BrowserResult {
	data?: unknown;
	image?: { data: string; mimeType: "image/png" };
	artifact?: BrowserArtifact;
	recording?: BrowserRecordingState;
}
export interface BrowserEngineResult extends BrowserResult {
	temporaryArtifact?: Omit<BrowserArtifact, "path"> & { temporaryPath: string };
}
export interface BrowserWorkbenchRequest {
	captureId?: string;
	action:
		| "list"
		| "new"
		| "get"
		| "close"
		| "activate"
		| "owner"
		| "activity"
		| "capture"
		| "viewport"
		| "recording";
	workspaceId: string;
	tabId?: string;
	sessionId?: string;
	visible?: boolean;
	active?: boolean;
	method?: string;
	viewport?: { width: number; height: number } | null;
	recording?: BrowserRecordingState;
}
export interface BrowserWorkbenchResult {
	tabs: BrowserTabInfo[];
	tabId?: string;
	viewId?: number;
}

export interface BrowserEngine {
	releaseArtifact?(temporaryPath: string): Promise<void>;
	onRecordingFinished?(
		handler: (
			scope: BrowserScope,
			command: BrowserCommand,
			result: BrowserEngineResult,
			signal?: AbortSignal,
		) => Promise<BrowserResult>,
	): () => void;
	workbench(request: BrowserWorkbenchRequest): Promise<BrowserWorkbenchResult>;
	execute(
		scope: BrowserScope,
		command: BrowserCommand,
		viewId: number,
		signal: AbortSignal,
	): Promise<BrowserEngineResult>;
	release(scope: BrowserScope, final?: boolean): Promise<void>;
}

export interface BrowserHostControl {
	execute(workspaceId: string, command: BrowserCommand): Promise<BrowserResult>;
}
