import {
	type BrowserCommand,
	type BrowserPageState,
	type BrowserResult,
	type BrowserViewport,
	type BrowserWorkbenchRequest,
	type BrowserWorkbenchResult,
	type NativeBrowserBridge,
	normalizeBrowserUrl,
} from "@thinkrail/contracts";
import type { WebviewTagElement } from "electrobun/view";
import { browserMessage, readBrowserSelection } from "./browserMessages";
import { CANCEL_PICKER_SCRIPT, pickerScript } from "./browserPicker";

interface BrowserRpc {
	command(workspaceId: string, command: BrowserCommand): Promise<BrowserResult>;
	external(viewId: number): Promise<unknown>;
	history(viewId: number): Promise<{ canGoBack: boolean; canGoForward: boolean }>;
	script(viewId: number, script: string): Promise<unknown>;
	subscribe(listener: (viewId: number, payload: unknown) => void): () => void;
	attach(viewId: number): Promise<unknown>;
	viewport(viewId: number, viewport: BrowserViewport | null): Promise<unknown>;
	screenshot(viewId: number): Promise<string>;
	copyScreenshot(viewId: number): Promise<unknown>;
	detach(viewId: number): Promise<unknown>;
}

const MODAL_LAYERS =
	'[role="dialog"][data-state="open"],[role="alertdialog"],[data-native-browser-hidden]';

function guestPreload() {
	if (typeof Reflect.get(window, "__pideckSendToHost") !== "function") return;
	if (Reflect.get(window, "__pideckPreloadInstalled")) return;
	Reflect.set(window, "__pideckPreloadInstalled", true);
	const send = (value: unknown) =>
		(window as unknown as { __pideckSendToHost?: (value: unknown) => void }).__pideckSendToHost?.(
			value,
		);
	window.addEventListener("focus", (event) => {
		if (event.isTrusted) send({ kind: "pideck-focus", focused: true });
	});
	window.addEventListener("blur", (event) => {
		if (event.isTrusted) send({ kind: "pideck-focus", focused: false });
	});
	let lastUrl = "";
	window.addEventListener("message", (event) => {
		if (event.source === window && event.data?.kind === "pideck-window-close")
			send({ kind: "pideck-close" });
	});
	let lastTitle = "";
	const metadata = () => {
		if (lastUrl === location.href && lastTitle === document.title) return;
		lastUrl = location.href;
		lastTitle = document.title;
		send({ kind: "pideck-metadata", url: lastUrl, title: lastTitle });
	};
	window.addEventListener("DOMContentLoaded", () => {
		metadata();
		if (document.head)
			new MutationObserver(metadata).observe(document.head, {
				subtree: true,
				childList: true,
				characterData: true,
			});
	});
	window.addEventListener("load", metadata);
	window.addEventListener("popstate", metadata);
	window.addEventListener("hashchange", metadata);
	window.addEventListener(
		"keydown",
		(event) => {
			if (
				!event.isTrusted ||
				!(event.metaKey || event.ctrlKey) ||
				event.altKey ||
				event.shiftKey ||
				event.repeat
			)
				return;
			const commands: Record<string, string> = { l: "address", f: "find", w: "close", t: "new" };
			const command = commands[event.key.toLowerCase()];
			if (!command) return;
			event.preventDefault();
			event.stopImmediatePropagation();
			send({ kind: "pideck-shortcut", command });
		},
		true,
	);
}

export function createNativeBrowserBridge(rpc: BrowserRpc): NativeBrowserBridge & {
	closeFocusedPage(): boolean;
	workbench(request: BrowserWorkbenchRequest): Promise<BrowserWorkbenchResult>;
} {
	let handler: ((request: BrowserWorkbenchRequest) => Promise<BrowserWorkbenchResult>) | null =
		null;
	let focused: { id: string; visible(): boolean; close(): void } | null = null;
	document.addEventListener(
		"pointerdown",
		() => {
			focused = null;
		},
		true,
	);
	document.addEventListener(
		"focusin",
		() => {
			focused = null;
		},
		true,
	);
	return Object.freeze({
		command: rpc.command,
		registerWorkbench(next: (request: BrowserWorkbenchRequest) => Promise<BrowserWorkbenchResult>) {
			handler = next;
			return () => {
				if (handler === next) handler = null;
			};
		},
		async workbench(request: BrowserWorkbenchRequest) {
			if (!handler) throw new Error("Browser workbench is not ready");
			return handler(request);
		},
		closeFocusedPage() {
			const current = focused;
			focused = null;
			if (!current?.visible()) return false;
			current.close();
			return true;
		},
		create({ onEvent }: Parameters<NativeBrowserBridge["create"]>[0]) {
			const element: WebviewTagElement = document.createElement("electrobun-webview");
			const maskId = crypto.randomUUID();
			const spacer = document.createElement("div");
			spacer.setAttribute("aria-hidden", "true");
			spacer.style.pointerEvents = "none";
			const masks = Array.from({ length: 4 }, () => {
				const mask = document.createElement("div");
				mask.dataset.nativeBrowserMask = maskId;
				Object.assign(mask.style, { position: "fixed", pointerEvents: "none" });
				document.body.append(mask);
				return mask;
			});
			const bootstrapUrl = `about:blank#pideck-browser-${crypto.randomUUID()}`;
			element.setAttribute("src", bootstrapUrl);
			element.setAttribute("renderer", "cef");
			element.setAttribute("sandbox", "");
			element.setAttribute("partition", "persist:default");
			element.setAttribute("preload", `(${guestPreload.toString()})()`);
			element.setAttribute(
				"navigation-rules",
				JSON.stringify(["^*", "about:blank*", "https://*", "http://*", "file://*"]),
			);
			element.setAttribute(
				"masks",
				`[role="menu"],[role="tooltip"],[data-radix-popper-content-wrapper],[data-native-browser-mask="${maskId}"]`,
			);
			Object.assign(element.style, {
				position: "fixed",
				left: "0",
				top: "0",
				width: "1px",
				height: "1px",
				visibility: "hidden",
				pointerEvents: "none",
			});
			let container: HTMLElement | null = null;
			let disposed = false;
			let ready = false;
			let initializing = false;
			let wantedUrl: string | null = null;
			let pickingRun: string | null = null;
			let viewport: BrowserViewport | null = null;
			let capture: { width: number; height: number } | null = null;
			const captures = new Map<string, { width: number; height: number }>();
			let presented = true;
			let active = false;
			let surface = { width: 1280, height: 720 };
			let state: BrowserPageState = {
				url: "",
				title: "",
				loading: false,
				canGoBack: false,
				canGoForward: false,
				error: null,
			};
			const publish = (patch: Partial<BrowserPageState>) => {
				if (disposed) return;
				state = { ...state, ...patch };
				onEvent({ type: "state", state });
			};
			const failure = (error: unknown) => {
				clearTimeout(loadTimer);
				publish({
					loading: false,
					error: error instanceof Error ? error.message : String(error),
					crashed: !ready,
				});
			};
			const execute = (script: string) => {
				if (!ready || element.webviewId === null) return;
				void rpc.script(element.webviewId, script).catch(failure);
			};
			const cancelPick = (notify = true) => {
				pickingRun = null;
				execute(CANCEL_PICKER_SCRIPT);
				if (notify) onEvent({ type: "picker-cancelled" });
			};
			async function navigationState() {
				if (!ready || element.webviewId === null) return;
				try {
					publish(await rpc.history(element.webviewId));
				} catch (error) {
					failure(error);
				}
			}
			let loadTimer: ReturnType<typeof setTimeout> | undefined;
			const navigate = (url: string) => {
				const normalized = normalizeBrowserUrl(url);
				if (!normalized) {
					failure(new Error("Invalid browser URL"));
					return;
				}
				cancelPick();
				wantedUrl = normalized;
				publish({ url: normalized, loading: true, error: null });
				if (ready) element.loadURL(normalized);
				clearTimeout(loadTimer);
				loadTimer = setTimeout(
					() => publish({ loading: false, error: "Page did not finish loading" }),
					30000,
				);
			};
			const initialize = () => {
				if (!ready && !initializing) {
					const id = element.webviewId;
					if (id === null) return;
					initializing = true;
					void rpc
						.attach(id)
						.then(() => {
							if (disposed) {
								void rpc.detach(id);
								return;
							}
							ready = true;
							if (wantedUrl) element.loadURL(wantedUrl);
						})
						.catch(failure);
				}
			};
			element.on("new-window-open", (event) => {
				const message = browserMessage(event.detail);
				const url = normalizeBrowserUrl(
					typeof event.detail === "string" && !message ? event.detail : String(message?.url ?? ""),
				);
				if (url) onEvent({ type: "popup", url });
			});
			const unsubscribe = rpc.subscribe((viewId, payload) => {
				if (viewId !== element.webviewId) return;
				const message = browserMessage(payload);
				if (!message || disposed) return;
				if (message.kind === "pideck-focus") {
					if (message.focused === true)
						focused = {
							id: maskId,
							visible: () =>
								!!container?.isConnected &&
								container.checkVisibility?.() !== false &&
								!document.querySelector(`${MODAL_LAYERS},[role="menu"]`),
							close: () => onEvent({ type: "shortcut", command: "close" }),
						};
					else if (focused?.id === maskId) focused = null;
					return;
				}
				if (message.kind === "pideck-error" && typeof message.error === "string") {
					clearTimeout(loadTimer);
					publish({ loading: false, error: message.error, crashed: message.crashed === true });
					return;
				}
				if (message.kind === "pideck-loading") {
					publish({ loading: true, error: null });
					return;
				}
				if (message.kind === "pideck-close") {
					onEvent({ type: "close" });
					return;
				}
				if (message.kind === "pideck-loaded") {
					clearTimeout(loadTimer);
					publish({ loading: false });
					void navigationState();
					return;
				}
				if (message.kind === "pideck-navigated" && typeof message.url === "string") {
					const url = normalizeBrowserUrl(message.url);
					if (url) {
						wantedUrl = url;
						publish({ url });
						void navigationState();
						cancelPick();
					}
					return;
				}
				if (
					message.kind === "pideck-metadata" &&
					typeof message.url === "string" &&
					typeof message.title === "string"
				) {
					const url = normalizeBrowserUrl(message.url);
					if (url) publish({ title: message.title.slice(0, 500) });
				} else if (message.kind === "pideck-picker" && pickingRun && message.run === pickingRun) {
					const value = browserMessage(message.value);
					const selection = readBrowserSelection(value?.selection);
					pickingRun = null;
					if (selection)
						onEvent({
							type: "selection",
							selection: { ...selection, pageUrl: state.url, pageTitle: state.title },
						});
					else onEvent({ type: "picker-cancelled" });
				} else if (
					message.kind === "pideck-shortcut" &&
					["address", "find", "close", "new"].includes(String(message.command))
				) {
					onEvent({
						type: "shortcut",
						command: message.command as "address" | "find" | "close" | "new",
					});
				}
			});
			const sync = () => {
				if (disposed) return;
				initialize();
				const rect = container?.getBoundingClientRect();
				const modal = document.querySelector(MODAL_LAYERS);
				const visible = !!(
					container?.isConnected &&
					presented &&
					rect &&
					rect.width > 0 &&
					rect.height > 0 &&
					wantedUrl &&
					!modal &&
					container.checkVisibility?.() !== false
				);
				element.toggleHidden(!visible && !capture && !active);
				element.togglePassthrough(!visible);
				if ((capture || active) && !visible) {
					const bounds = capture ?? surface;
					Object.assign(element.style, {
						visibility: "visible",
						pointerEvents: "none",
						left: "0px",
						top: "0px",
						width: `${bounds.width}px`,
						height: `${bounds.height}px`,
					});
					for (const [index, mask] of masks.entries())
						Object.assign(mask.style, {
							left: "0px",
							top: "0px",
							width: index ? "0px" : `${bounds.width}px`,
							height: index ? "0px" : `${bounds.height}px`,
						});
					element.syncDimensions(true);
					return;
				}
				if (!visible || !rect) return;
				if (!container) return;
				const width =
					capture?.width ?? (viewport ? viewport.width * viewport.scale : container.clientWidth);
				const height =
					capture?.height ?? (viewport ? viewport.height * viewport.scale : container.clientHeight);
				surface = { width, height };
				spacer.style.width = `${width}px`;
				spacer.style.height = `${height}px`;
				const right = rect.x + container.clientWidth;
				const bottom = rect.y + container.clientHeight;
				const regions = [
					[0, 0, innerWidth, rect.y],
					[0, bottom, innerWidth, Math.max(0, innerHeight - bottom)],
					[0, rect.y, rect.x, container.clientHeight],
					[right, rect.y, Math.max(0, innerWidth - right), container.clientHeight],
				];
				for (const [index, mask] of masks.entries()) {
					const region = regions[index];
					if (region)
						Object.assign(mask.style, {
							left: `${region[0]}px`,
							top: `${region[1]}px`,
							width: `${region[2]}px`,
							height: `${region[3]}px`,
						});
				}
				Object.assign(element.style, {
					visibility: "visible",
					pointerEvents: "auto",
					left: `${rect.x + Math.max(0, (container.clientWidth - width) / 2) - container.scrollLeft}px`,
					top: `${rect.y - container.scrollTop}px`,
					width: `${width}px`,
					height: `${height}px`,
				});
				element.syncDimensions(true);
			};
			document.body.append(element);
			const timer = setInterval(sync, 100);
			const layers = new MutationObserver(sync);
			layers.observe(document.body, {
				childList: true,
				subtree: true,
				attributes: true,
				attributeFilter: ["data-state"],
			});
			const setCapture = async (
				next: { width: number; height: number } | null,
				id = "recording",
			) => {
				if (!ready || element.webviewId === null) throw new Error("Browser is not ready");
				if (next) captures.set(id, next);
				else captures.delete(id);
				capture = captures.values().next().value ?? null;
				await rpc.viewport(element.webviewId, capture ? { ...capture, scale: 1 } : viewport);
				sync();
				await new Promise((resolve) => setTimeout(resolve, 50));
			};
			const captureImage = async <T>(operation: (viewId: number) => Promise<T>): Promise<T> => {
				if (!ready || element.webviewId === null) throw new Error("Browser is not ready");
				cancelPick();
				const id = crypto.randomUUID();
				const dimensions = capture ?? viewport;
				try {
					if (dimensions) await setCapture(dimensions, id);
					return await operation(element.webviewId);
				} finally {
					if (dimensions) await setCapture(null, id);
				}
			};
			return {
				async nativeId() {
					const deadline = Date.now() + 15000;
					while (!ready && !disposed && Date.now() < deadline && !state.crashed)
						await new Promise((resolve) => setTimeout(resolve, 50));
					if (!ready || disposed || element.webviewId === null)
						throw new Error("Browser page is unavailable");
					return element.webviewId;
				},
				setVisible(visible: boolean) {
					presented = visible;
					sync();
				},
				isVisible() {
					return !!(
						presented &&
						wantedUrl &&
						container?.isConnected &&
						container.clientWidth &&
						container.clientHeight &&
						container.checkVisibility?.() !== false &&
						!document.querySelector(MODAL_LAYERS)
					);
				},
				setActive(value: boolean) {
					active = value;
					sync();
				},
				setCapture,
				attach(slot: HTMLElement | null) {
					container?.removeEventListener("scroll", sync);
					spacer.remove();
					container = slot;
					if (slot) {
						slot.append(spacer);
						slot.addEventListener("scroll", sync);
					}
					if (!slot) cancelPick();
					sync();
				},
				navigate,
				back() {
					cancelPick();
					element.goBack();
				},
				forward() {
					cancelPick();
					element.goForward();
				},
				reload() {
					cancelPick();
					publish({ loading: true, error: null });
					element.reload();
				},
				stop() {
					clearTimeout(loadTimer);
					if (!ready) {
						wantedUrl = null;
						publish({ url: "", loading: false });
						return;
					}
					execute("window.stop()");
					publish({ loading: false });
				},
				find(text: string, forward = true) {
					element.findInPage(text, { forward });
				},
				stopFind() {
					element.stopFindInPage();
				},
				openDevTools() {
					element.openDevTools();
				},
				async openExternal() {
					if (element.webviewId !== null) await rpc.external(element.webviewId);
				},
				cancelPick,
				pick(labels: Parameters<import("@thinkrail/contracts").NativeBrowserPage["pick"]>[0]) {
					cancelPick(false);
					pickingRun = crypto.randomUUID();
					const style = getComputedStyle(document.documentElement);
					execute(
						pickerScript(
							labels,
							{
								accent: style.getPropertyValue("--info"),
								surface: style.getPropertyValue("--elevated"),
								text: style.getPropertyValue("--text"),
								border: style.getPropertyValue("--border"),
							},
							pickingRun,
						),
					);
				},
				async setViewport(next: BrowserViewport | null) {
					if (element.webviewId === null || !ready) throw new Error("Browser is not ready");
					if (!capture) await rpc.viewport(element.webviewId, next);
					viewport = next;
					sync();
				},
				async screenshot() {
					return captureImage(rpc.screenshot);
				},
				async copyScreenshot() {
					await captureImage(rpc.copyScreenshot);
				},
				dispose() {
					if (disposed) return;
					disposed = true;
					if (focused?.id === maskId) focused = null;
					layers.disconnect();
					container?.removeEventListener("scroll", sync);
					spacer.remove();
					for (const mask of masks) mask.remove();
					unsubscribe();
					clearInterval(timer);
					clearTimeout(loadTimer);
					if (element.webviewId !== null) void rpc.detach(element.webviewId).catch(() => {});
					element.remove();
					container = null;
				},
			};
		},
	});
}
