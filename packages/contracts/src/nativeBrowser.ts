export interface BrowserSelection {
	pageUrl: string;
	pageTitle: string;
	tagName: string;
	selector: string;
	xpath: string;
	text: string;
	accessibleName: string;
	role: string;
	html: string;
	attributes: Record<string, string>;
	style: Record<string, string>;
	rect: { x: number; y: number; width: number; height: number };
}

export interface BrowserPageState {
	url: string;
	title: string;
	loading: boolean;
	canGoBack: boolean;
	canGoForward: boolean;
	error: string | null;
	crashed?: boolean;
}

export interface BrowserViewport {
	width: number;
	height: number;
	scale: number;
}

export interface BrowserPickerLabels {
	instruction: string;
	background: string;
	color: string;
	font: string;
}

export type BrowserPageEvent =
	| { type: "close" }
	| { type: "state"; state: BrowserPageState }
	| { type: "popup"; url: string }
	| { type: "selection"; selection: BrowserSelection }
	| { type: "picker-cancelled" }
	| { type: "shortcut"; command: "address" | "find" | "close" | "new" };

export interface NativeBrowserPage {
	nativeId(): Promise<number>;
	setCapture(viewport: { width: number; height: number } | null, id?: string): Promise<void>;
	setVisible(visible: boolean): void;
	isVisible(): boolean;
	setActive(active: boolean): void;
	attach(container: HTMLElement | null): void;
	navigate(url: string): void;
	back(): void;
	forward(): void;
	reload(): void;
	stop(): void;
	find(text: string, forward?: boolean): void;
	stopFind(): void;
	openDevTools(): void;
	openExternal(): Promise<void>;
	pick(labels: BrowserPickerLabels): void;
	cancelPick(): void;
	setViewport(viewport: BrowserViewport | null): Promise<void>;
	screenshot(): Promise<string>;
	copyScreenshot(): Promise<void>;
	dispose(): void;
}

export interface NativeBrowserBridge {
	command(workspaceId: string, command: BrowserCommand): Promise<BrowserResult>;
	registerWorkbench(
		handler: (request: BrowserWorkbenchRequest) => Promise<BrowserWorkbenchResult>,
	): () => void;
	create(options: { id: string; onEvent: (event: BrowserPageEvent) => void }): NativeBrowserPage;
}

import type {
	BrowserCommand,
	BrowserResult,
	BrowserWorkbenchRequest,
	BrowserWorkbenchResult,
} from "./browserAutomation";
