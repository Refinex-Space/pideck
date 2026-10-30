import { type BrowserViewport, normalizeBrowserUrl } from "@thinkrail/contracts";
import Electrobun, { BrowserView, Utils } from "electrobun/main";
import { BrowserCdp } from "./cdp";
import { waitForNativeDownload } from "./downloads";
import { nativeDownloadsDirectory } from "./nativeLifecycle";

export function browserDebugPort(): number {
	const port = Number(process.env.ELECTROBUN_CEF_REMOTE_DEBUGGING_PORT);
	if (!Number.isInteger(port) || port < 1024 || port > 65535)
		throw new Error("Browser bootstrap did not allocate its endpoint");
	return port;
}

export function createBrowserController(
	port: number,
	mainViewId: () => number,
	onEvent: (viewId: number, payload: unknown) => void,
) {
	const clients = new Map<number, BrowserCdp>();
	const targets = new Map<number, string>();
	const scales = new Map<number, number>();
	const dialogs = new Map<number, Record<string, unknown>>();
	const observations = new Map<number, { type: string; text: string; timestamp: number }[]>();
	const contexts = new Map<number, number>();
	const worldName = "pideck-browser";
	const attaching = new Map<number, Promise<BrowserCdp>>();
	function ownedView(viewId: number) {
		const view = BrowserView.getById(viewId);
		if (
			!view ||
			view.isRemoved ||
			view.hostWebviewId !== mainViewId() ||
			view.renderer !== "cef" ||
			!view.sandbox
		)
			throw new Error("Browser view is unavailable");
		return view;
	}
	async function attach(viewId: number): Promise<BrowserCdp> {
		ownedView(viewId);
		const existing = clients.get(viewId);
		if (existing) return existing;
		const pending = attaching.get(viewId);
		if (pending) return pending;
		const operation = (async () => {
			const view = ownedView(viewId);
			if (!view.url?.startsWith("about:blank#pideck-browser-"))
				throw new Error("Invalid browser bootstrap");
			let target: { webSocketDebuggerUrl?: unknown } | undefined;
			const deadline = Date.now() + 4000;
			while (!target && Date.now() < deadline) {
				ownedView(viewId);
				const response = await fetch(`http://127.0.0.1:${port}/json/list`, {
					signal: AbortSignal.timeout(1000),
				});
				if (!response.ok) throw new Error("Browser discovery failed");
				const targets: unknown = await response.json();
				if (!Array.isArray(targets)) throw new Error("Invalid browser discovery response");
				target = targets.find((entry) => entry.type === "page" && entry.url === view.url);
				if (!target) await Bun.sleep(50);
			}
			if (!target || typeof target.webSocketDebuggerUrl !== "string")
				throw new Error("Browser target not ready");
			const endpoint = new URL(target.webSocketDebuggerUrl);
			if (
				endpoint.protocol !== "ws:" ||
				!["localhost", "127.0.0.1"].includes(endpoint.hostname) ||
				Number(endpoint.port) !== port
			)
				throw new Error("Invalid browser endpoint");
			const client = await BrowserCdp.connect(endpoint.href);
			try {
				const tree = await client.request("Page.getFrameTree");
				const mainFrame = (
					tree.frameTree as
						| { frame?: { id?: string; url?: string; urlFragment?: string } }
						| undefined
				)?.frame;
				if (`${mainFrame?.url ?? ""}${mainFrame?.urlFragment ?? ""}` !== view.url)
					throw new Error("Browser target identity mismatch");
				ownedView(viewId);
				let frameId = mainFrame?.id;
				let documentRequest: string | undefined;
				let navigationFailed = false;
				client.subscribe((method, params) => {
					if (method === "Page.javascriptDialogOpening") dialogs.set(viewId, params);
					if (method === "Page.javascriptDialogClosed") dialogs.delete(viewId);
					if (method === "Runtime.consoleAPICalled" || method === "Runtime.exceptionThrown") {
						const records = observations.get(viewId) ?? [];
						const args = Array.isArray(params.args) ? params.args : [];
						const text =
							method === "Runtime.exceptionThrown"
								? JSON.stringify(params.exceptionDetails)
								: args.map((value) => String(value.value ?? value.description ?? "")).join(" ");
						records.push({
							type: String(params.type ?? "error"),
							text: text.slice(0, 4000),
							timestamp: Date.now(),
						});
						if (records.length > 200) records.shift();
						observations.set(viewId, records);
					}
					if (method === "Runtime.executionContextsCleared") contexts.delete(viewId);
					if (method === "Runtime.executionContextCreated") {
						const context = params.context as {
							id: number;
							name: string;
							auxData?: { frameId?: string };
						};
						if (context.name === worldName && context.auxData?.frameId === frameId)
							contexts.set(viewId, context.id);
					}
					if (
						method === "Runtime.executionContextDestroyed" &&
						params.executionContextId === contexts.get(viewId)
					)
						contexts.delete(viewId);
					if (method === "disconnected") {
						targets.delete(viewId);
						dialogs.delete(viewId);
						observations.delete(viewId);
						clients.delete(viewId);
						contexts.delete(viewId);
					}

					if (method === "Page.frameStartedLoading" && params.frameId === frameId)
						onEvent(viewId, { kind: "pideck-loading" });
					if (
						method === "Network.requestWillBeSent" &&
						params.type === "Document" &&
						params.frameId === frameId
					) {
						documentRequest = String(params.requestId);
						navigationFailed = false;
					}
					if (
						method === "Network.loadingFailed" &&
						params.requestId === documentRequest &&
						params.errorText !== "net::ERR_ABORTED"
					) {
						navigationFailed = true;
						onEvent(viewId, {
							kind: "pideck-error",
							error: String(params.errorText),
							crashed: false,
						});
					}
					if (method === "disconnected" || method === "Inspector.targetCrashed")
						onEvent(viewId, {
							kind: "pideck-error",
							error: "Browser page disconnected",
							crashed: true,
						});
					if (method === "Page.navigatedWithinDocument" && typeof params.url === "string")
						onEvent(viewId, { kind: "pideck-navigated", url: params.url });
					if (method === "Page.frameNavigated") {
						const frame = params.frame as
							| { id?: string; url?: string; urlFragment?: string; parentId?: string }
							| undefined;
						if (frame?.url && !frame.parentId) {
							frameId = frame.id;
							onEvent(viewId, {
								kind: "pideck-navigated",
								url: `${frame.url}${frame.urlFragment ?? ""}`,
							});
						}
					}
					if (
						method === "Runtime.bindingCalled" &&
						params.name === "__pideckBrowserMessage" &&
						params.executionContextId === contexts.get(viewId) &&
						typeof params.payload === "string" &&
						params.payload.length <= 40000
					) {
						try {
							const payload = JSON.parse(params.payload);
							if (
								[
									"pideck-metadata",
									"pideck-picker",
									"pideck-shortcut",
									"pideck-focus",
									"pideck-close",
								].includes(payload?.kind)
							)
								onEvent(viewId, payload);
						} catch {}
					}
					if (method === "Page.loadEventFired" && !navigationFailed)
						onEvent(viewId, { kind: "pideck-loaded" });
				});
				await client.request("Page.enable");
				await client.request("Runtime.enable");
				await client.request("Network.enable");
				await client.request("Runtime.addBinding", {
					name: "__pideckBrowserMessage",
					executionContextName: worldName,
				});
				const source = `globalThis.__pideckSendToHost = value => globalThis.__pideckBrowserMessage(JSON.stringify(value));\n${view.preload ?? ""}`;
				const closeSource =
					'Object.defineProperty(window, "close", { value: () => window.postMessage({ kind: "pideck-window-close" }, "*"), configurable: true, writable: true });';
				await client.request("Page.addScriptToEvaluateOnNewDocument", { source: closeSource });
				await client.request("Runtime.evaluate", { expression: closeSource });
				await client.request("Page.addScriptToEvaluateOnNewDocument", { source, worldName });
				const isolated = await client.request("Page.createIsolatedWorld", { frameId, worldName });
				contexts.set(viewId, Number(isolated.executionContextId));
				await client.request("Runtime.evaluate", {
					expression: source,
					contextId: isolated.executionContextId,
				});
				clients.set(viewId, client);
				targets.set(viewId, endpoint.pathname.split("/").at(-1) ?? "");
				return client;
			} catch (error) {
				client.close();
				throw error;
			}
		})();
		attaching.set(viewId, operation);
		try {
			return await operation;
		} finally {
			attaching.delete(viewId);
		}
	}
	return {
		download(viewId: number, signal: AbortSignal, timeout: number) {
			ownedView(viewId);
			return waitForNativeDownload(
				Electrobun.events,
				viewId,
				process.platform === "darwin" ? nativeDownloadsDirectory() : Utils.paths.downloads,
				signal,
				timeout,
			);
		},
		inputScale(targetId: string) {
			for (const [viewId, target] of targets)
				if (target === targetId) return scales.get(viewId) ?? 1;
			return 1;
		},
		async session(viewId: number) {
			const client = await attach(viewId);
			const targetId = targets.get(viewId);
			if (!targetId) throw new Error("Browser target is unavailable");
			return { client, targetId };
		},
		dialog(viewId: number) {
			ownedView(viewId);
			return dialogs.get(viewId) ?? null;
		},
		observations(viewId: number) {
			ownedView(viewId);
			return observations.get(viewId) ?? [];
		},
		async recorder() {
			const parent = BrowserView.getById(mainViewId());
			if (!parent) throw new Error("Application window is unavailable");
			const url = `about:blank#pideck-browser-${crypto.randomUUID()}`;
			const view = new BrowserView({
				url,
				hostWebviewId: parent.id,
				windowId: parent.windowId,
				renderer: "cef",
				partition: "persist:default",
				sandbox: true,
				startPassthrough: true,
				autoResize: false,
				frame: { x: -10, y: -10, width: 1, height: 1 },
				navigationRules: JSON.stringify(["^*", url]),
			});
			try {
				const client = await attach(view.id);
				return {
					client,
					dispose: () => {
						clients.get(view.id)?.close();
						clients.delete(view.id);
						targets.delete(view.id);
						view.remove();
					},
				};
			} catch (error) {
				view.remove();
				throw error;
			}
		},
		async url(viewId: number): Promise<string> {
			const client = await attach(viewId);
			const result = await client.request("Page.getFrameTree");
			const frame = (result.frameTree as { frame?: { url?: string; urlFragment?: string } })?.frame;
			const url = frame?.url ? normalizeBrowserUrl(`${frame.url}${frame.urlFragment ?? ""}`) : null;
			if (!url) throw new Error("Page cannot be opened externally");
			return url;
		},
		async history(viewId: number): Promise<{ canGoBack: boolean; canGoForward: boolean }> {
			const client = await attach(viewId);
			const history = await client.request("Page.getNavigationHistory");
			const entries = history.entries as { url: string }[];
			const index = Number(history.currentIndex);
			return {
				canGoBack: entries.slice(0, index).some((entry) => !!normalizeBrowserUrl(entry.url)),
				canGoForward: entries.slice(index + 1).some((entry) => !!normalizeBrowserUrl(entry.url)),
			};
		},
		async script(viewId: number, script: string): Promise<void> {
			if (typeof script !== "string" || script.length > 64000)
				throw new Error("Invalid browser script");
			const client = await attach(viewId);
			const contextId = contexts.get(viewId);
			if (contextId === undefined) return;
			try {
				const result = await client.request("Runtime.evaluate", { expression: script, contextId });
				if (result.exceptionDetails) throw new Error("Browser script failed");
			} catch (error) {
				if (contexts.get(viewId) === contextId) throw error;
			}
		},
		async attach(viewId: number): Promise<void> {
			await attach(viewId);
		},
		async viewport(viewId: number, viewport: BrowserViewport | null): Promise<void> {
			const client = await attach(viewId);
			if (!viewport) {
				await client.request("Emulation.clearDeviceMetricsOverride");
				scales.delete(viewId);
				return;
			}
			const { width, height, scale } = viewport;
			if (
				!Number.isInteger(width) ||
				!Number.isInteger(height) ||
				width < 240 ||
				height < 240 ||
				width > 3840 ||
				height > 3840 ||
				!Number.isFinite(scale) ||
				scale < 0.05 ||
				scale > 2
			)
				throw new Error("Invalid browser viewport");
			await client.request("Emulation.setDeviceMetricsOverride", {
				width,
				height,
				deviceScaleFactor: 1,
				mobile: false,
				scale,
				dontSetVisibleSize: true,
			});
			scales.set(viewId, scale);
		},
		async screenshot(viewId: number): Promise<string> {
			const client = await attach(viewId);
			const result = await client.request("Page.captureScreenshot", {
				format: "png",
				captureBeyondViewport: false,
			});
			if (typeof result.data !== "string" || result.data.length > 24_000_000)
				throw new Error("Browser screenshot unavailable");
			return `data:image/png;base64,${result.data}`;
		},
		detach(viewId: number): void {
			scales.delete(viewId);
			targets.delete(viewId);
			dialogs.delete(viewId);
			observations.delete(viewId);
			clients.get(viewId)?.close();
			clients.delete(viewId);
			contexts.delete(viewId);
		},
		dispose(): void {
			for (const client of clients.values()) client.close();
			clients.clear();
			contexts.clear();
			targets.clear();
			scales.clear();
			dialogs.clear();
			observations.clear();
		},
	};
}
