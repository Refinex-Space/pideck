import {
	type BrowserPageState,
	type BrowserRecordingState,
	type BrowserSelection,
	type BrowserWorkbenchRequest,
	type BrowserWorkbenchResult,
	type NativeBrowserBridge,
	type NativeBrowserPage,
	normalizeBrowserUrl,
} from "@thinkrail/contracts";
import { create } from "zustand";
import { getStablePreferenceAdapter } from "../clientPreferences";
import { randomId } from "../lib";
import { useAppStore } from "../store";

export interface BrowserTab {
	openerId?: string;
	ownerSessionId?: string | undefined;
	activity?: string | undefined;
	hidden?: boolean;
	recording?: BrowserRecordingState | undefined;
	lastRecording?: BrowserRecordingState | undefined;
	generation: number;
	id: string;
	address: string;
	page: BrowserPageState;
	picking: boolean;
	selection: BrowserSelection | null;
	selectionSessionId: string | null;
	responsive: boolean;
	width: number;
	height: number;
	zoom: number | "fit";
	command: { id: string; name: "address" | "find" } | null;
}

interface WorkspaceBrowser {
	tabs: BrowserTab[];
	active: string | null;
}
const EMPTY: WorkspaceBrowser = { tabs: [], active: null };
const pages = new Map<string, NativeBrowserPage>();
const savedDocuments = new Map<string, string>();
const store = create<{ workspaces: Record<string, WorkspaceBrowser> }>(() => ({ workspaces: {} }));
export function nativeBrowserBridge(): NativeBrowserBridge | null {
	const value: unknown = Reflect.get(globalThis, "__THINKRAIL_NATIVE_BROWSER__");
	return value && typeof value === "object" && typeof Reflect.get(value, "create") === "function"
		? (value as NativeBrowserBridge)
		: null;
}
export function useWorkspaceBrowser(workspaceId: string): WorkspaceBrowser {
	return store((state) => state.workspaces[workspaceId] ?? EMPTY);
}
function change(workspaceId: string, update: (workspace: WorkspaceBrowser) => WorkspaceBrowser) {
	store.setState((state) => ({
		workspaces: {
			...state.workspaces,
			[workspaceId]: update(state.workspaces[workspaceId] ?? EMPTY),
		},
	}));
}
export function updateBrowserTab(
	workspaceId: string,
	id: string,
	patch: Partial<BrowserTab>,
): void {
	change(workspaceId, (workspace) => ({
		...workspace,
		tabs: workspace.tabs.map((tab) => {
			if (tab.id !== id) return tab;
			const lastRecording =
				patch.recording?.phase === "completed" && patch.recording.artifact
					? patch.recording
					: tab.lastRecording;
			return {
				...tab,
				...patch,
				lastRecording,
				...(patch.recording?.phase === "cancelled" && lastRecording
					? { recording: lastRecording }
					: {}),
			};
		}),
	}));
	if (
		"responsive" in patch ||
		"width" in patch ||
		"height" in patch ||
		"zoom" in patch ||
		"recording" in patch
	)
		save(workspaceId);
}

export function openBrowserUrl(workspaceId: string, url: string): void {
	const normalized = normalizeBrowserUrl(url);
	if (!normalized || !nativeBrowserBridge()) return;
	const existing = store
		.getState()
		.workspaces[workspaceId]?.tabs.find((tab) => tab.page.url === normalized);
	if (existing) selectBrowserTab(workspaceId, existing.id);
	else createBrowserTab(workspaceId, normalized);
	useAppStore.getState().requestToolView(workspaceId, "browser");
}
function save(workspaceId: string) {
	const workspace = store.getState().workspaces[workspaceId];
	if (!workspace) return;
	const serialized = JSON.stringify({
		version: 1,
		tabs: workspace.tabs.map((tab) => ({
			url: tab.page.url,
			responsive: tab.responsive,
			width: tab.width,
			height: tab.height,
			zoom: tab.zoom,
			recording: tab.lastRecording,
		})),
		activeIndex: workspace.tabs.findIndex((tab) => tab.id === workspace.active),
	});
	if (savedDocuments.get(workspaceId) === serialized) return;
	getStablePreferenceAdapter()?.setItem(`browser:${workspaceId}`, serialized);
	savedDocuments.set(workspaceId, serialized);
}
export function selectBrowserTab(workspaceId: string, id: string): void {
	const before = store.getState().workspaces[workspaceId];
	if (before?.active) pages.get(before.active)?.attach(null);
	change(workspaceId, (workspace) => ({ ...workspace, active: id }));
	save(workspaceId);
}
export function createBrowserTab(workspaceId: string, url = ""): string | null {
	const workspace = store.getState().workspaces[workspaceId] ?? EMPTY;
	if (!nativeBrowserBridge() || workspace.tabs.length >= 16) return null;
	const id = randomId("browser");
	const normalized = normalizeBrowserUrl(url) ?? "";
	const tab: BrowserTab = {
		generation: 0,
		id,
		address: normalized,
		page: {
			url: normalized,
			title: "",
			loading: false,
			canGoBack: false,
			canGoForward: false,
			error: null,
		},
		picking: false,
		selection: null,
		selectionSessionId: null,
		responsive: false,
		width: 1280,
		height: 720,
		zoom: "fit",
		command: null,
	};
	change(workspaceId, (current) => ({ tabs: [...current.tabs, tab], active: id }));
	if (workspace.active) pages.get(workspace.active)?.attach(null);
	save(workspaceId);
	return id;
}
export function closeBrowserTab(workspaceId: string, id: string): void {
	pages.get(id)?.dispose();
	pages.delete(id);
	change(workspaceId, (workspace) => {
		const index = workspace.tabs.findIndex((tab) => tab.id === id);
		const tabs = workspace.tabs.filter((tab) => tab.id !== id);
		return {
			tabs,
			active:
				workspace.active === id
					? (tabs[Math.min(index, tabs.length - 1)]?.id ?? null)
					: workspace.active,
		};
	});
	save(workspaceId);
}

export function recoverBrowserTab(workspaceId: string, id: string): void {
	const tab = store.getState().workspaces[workspaceId]?.tabs.find((tab) => tab.id === id);
	if (!tab) return;
	pages.get(id)?.dispose();
	pages.delete(id);
	updateBrowserTab(workspaceId, id, {
		generation: tab.generation + 1,
		picking: false,
		page: { ...tab.page, loading: false, error: null },
	});
}
export function ensureWorkspaceBrowser(workspaceId: string): void {
	if (store.getState().workspaces[workspaceId]) return;
	const saved = getStablePreferenceAdapter()?.getItem(`browser:${workspaceId}`);
	let restored: unknown;
	try {
		restored = saved ? JSON.parse(saved) : null;
	} catch {
		restored = null;
	}
	if (
		restored &&
		typeof restored === "object" &&
		"tabs" in restored &&
		Array.isArray(restored.tabs)
	) {
		for (const entry of restored.tabs.slice(0, 16)) {
			if (!entry || typeof entry.url !== "string") continue;
			const id = createBrowserTab(workspaceId, entry.url);
			if (!id) continue;
			const recording = entry.recording;
			if (
				recording?.phase === "completed" &&
				typeof recording.id === "string" &&
				recording.artifact?.mimeType === "video/webm" &&
				typeof recording.artifact.path === "string" &&
				recording.artifact.path.length < 4096 &&
				!recording.artifact.path.startsWith("/") &&
				!recording.artifact.path.split(/[\\/]/).includes("..") &&
				Number.isFinite(recording.startedAt) &&
				Number.isFinite(recording.artifact.bytes)
			)
				updateBrowserTab(workspaceId, id, { recording: { ...recording, tabId: id } });
			if (
				Number.isInteger(entry.width) &&
				entry.width >= 240 &&
				entry.width <= 3840 &&
				Number.isInteger(entry.height) &&
				entry.height >= 240 &&
				entry.height <= 3840
			)
				updateBrowserTab(workspaceId, id, {
					responsive: entry.responsive === true,
					width: entry.width,
					height: entry.height,
					zoom: [0.25, 0.5, 0.75, 1, 1.25, 1.5].includes(entry.zoom) ? entry.zoom : "fit",
				});
		}
		const index =
			"activeIndex" in restored && typeof restored.activeIndex === "number"
				? restored.activeIndex
				: 0;
		const active = store.getState().workspaces[workspaceId]?.tabs[index];
		if (active) selectBrowserTab(workspaceId, active.id);
	}
	if (!store.getState().workspaces[workspaceId]?.tabs.length) createBrowserTab(workspaceId);
}
export function browserPage(workspaceId: string, id: string): NativeBrowserPage | null {
	const existing = pages.get(id);
	if (existing) return existing;
	const bridge = nativeBrowserBridge();
	const tab = store.getState().workspaces[workspaceId]?.tabs.find((tab) => tab.id === id);
	if (!bridge || !tab) return null;
	const page = bridge.create({
		id,
		onEvent: (event) => {
			if (event.type === "close") {
				closeBrowserTab(workspaceId, id);
				return;
			}
			if (event.type === "state") {
				change(workspaceId, (workspace) => ({
					...workspace,
					tabs: workspace.tabs.map((tab) =>
						tab.id !== id
							? tab
							: {
									...tab,
									page: event.state,
									address: tab.address === tab.page.url ? event.state.url : tab.address,
								},
					),
				}));
				save(workspaceId);
			} else if (event.type === "selection")
				updateBrowserTab(workspaceId, id, { picking: false, selection: event.selection });
			else if (event.type === "picker-cancelled")
				updateBrowserTab(workspaceId, id, { picking: false });
			else if (event.type === "popup") {
				const popupId = createBrowserTab(workspaceId, event.url);
				if (popupId) {
					updateBrowserTab(workspaceId, popupId, { openerId: id });
					browserPage(workspaceId, popupId);
				}
			} else if (event.type === "shortcut") {
				if (event.command === "close") closeBrowserTab(workspaceId, id);
				else if (event.command === "new") createBrowserTab(workspaceId);
				else
					updateBrowserTab(workspaceId, id, {
						command: { id: randomId("browser-command"), name: event.command },
					});
			}
		},
	});
	pages.set(id, page);
	page.setVisible(!tab.hidden);
	if (tab.page.url) page.navigate(tab.page.url);
	return page;
}

export function browserSelectionText(selection: BrowserSelection): string {
	const data = JSON.stringify(selection, null, 2).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
	return `\n<web-page-element>\n${data}\n</web-page-element>\n`;
}

useAppStore.subscribe((state, previous) => {
	if (state.removedWorkspaceIds === previous.removedWorkspaceIds) return;
	for (const workspaceId of Object.keys(state.removedWorkspaceIds)) {
		for (const tab of store.getState().workspaces[workspaceId]?.tabs ?? [])
			closeBrowserTab(workspaceId, tab.id);
		getStablePreferenceAdapter()?.removeItem(`browser:${workspaceId}`);
		savedDocuments.delete(workspaceId);
	}
});

async function browserWorkbench(request: BrowserWorkbenchRequest): Promise<BrowserWorkbenchResult> {
	const { workspaceId } = request;
	if (useAppStore.getState().removedWorkspaceIds[workspaceId])
		throw new Error("Browser workspace has been removed");
	ensureWorkspaceBrowser(workspaceId);
	let id = request.tabId;
	if (request.action === "new") {
		const before = store.getState().workspaces[workspaceId]?.active;
		id = createBrowserTab(workspaceId) ?? undefined;
		if (id) updateBrowserTab(workspaceId, id, { responsive: true });
		if (request.visible === false && before) selectBrowserTab(workspaceId, before);
		else useAppStore.getState().requestToolView(workspaceId, "browser");
	}
	const tab = store.getState().workspaces[workspaceId]?.tabs.find((tab) => tab.id === id);
	if (id && tab) {
		if (request.action === "close") closeBrowserTab(workspaceId, id);
		else if (request.action === "owner")
			updateBrowserTab(workspaceId, id, { ownerSessionId: request.sessionId });
		else if (request.action === "activity") {
			updateBrowserTab(workspaceId, id, {
				activity: request.active && request.sessionId ? request.method : undefined,
			});
			if (request.active) browserPage(workspaceId, id)?.cancelPick();
			browserPage(workspaceId, id)?.setActive(request.active === true);
		} else if (request.action === "recording") {
			if (
				!tab.recording ||
				!request.recording ||
				tab.recording.id === request.recording.id ||
				tab.recording.startedAt <= request.recording.startedAt
			)
				updateBrowserTab(workspaceId, id, { recording: request.recording });
		} else if (request.action === "activate") {
			updateBrowserTab(workspaceId, id, { hidden: request.visible === false });
			browserPage(workspaceId, id)?.setVisible(request.visible !== false);
			if (request.visible !== false) {
				selectBrowserTab(workspaceId, id);
				useAppStore.getState().requestToolView(workspaceId, "browser");
			}
		} else if (request.action === "capture")
			await browserPage(workspaceId, id)?.setCapture(request.viewport ?? null, request.captureId);
		else if (request.action === "viewport") {
			updateBrowserTab(workspaceId, id, {
				responsive: !!request.viewport,
				...(request.viewport ?? {}),
				zoom: "fit",
			});
			await browserPage(workspaceId, id)?.setViewport(
				request.viewport ? { ...request.viewport, scale: 1 } : null,
			);
		}
	}
	const tabs = (store.getState().workspaces[workspaceId]?.tabs ?? []).map((tab) => ({
		id: tab.id,
		url: tab.page.url,
		title: tab.page.title,
		active: store.getState().workspaces[workspaceId]?.active === tab.id,
		...(tab.openerId ? { openerId: tab.openerId } : {}),
		visible: pages.get(tab.id)?.isVisible() ?? false,
		...(tab.responsive ? { viewport: { width: tab.width, height: tab.height } } : {}),
		...(tab.ownerSessionId ? { ownerSessionId: tab.ownerSessionId } : {}),
	}));
	const viewId =
		id && ["get", "new"].includes(request.action)
			? await browserPage(workspaceId, id)?.nativeId()
			: undefined;
	if (id && request.action === "new")
		await browserPage(workspaceId, id)?.setViewport({ width: 1280, height: 720, scale: 1 });
	return { tabs, ...(id ? { tabId: id } : {}), ...(viewId !== undefined ? { viewId } : {}) };
}
nativeBrowserBridge()?.registerWorkbench?.(browserWorkbench);
