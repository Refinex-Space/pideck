import type {
	BrowserPageState,
	NativeBrowserBridge,
	NativeBrowserPage,
} from "@thinkrail/contracts";

function runBrowserProbe(url: string) {
	const globals = globalThis as typeof globalThis & {
		__THINKRAIL_NATIVE_BROWSER__?: NativeBrowserBridge;
		__electrobunSendToHost?: (value: unknown) => void;
	};
	const send = (value: unknown) =>
		globals.__electrobunSendToHost?.({ kind: "pideck-browser-probe", value });
	const bridge = globals.__THINKRAIL_NATIVE_BROWSER__;
	if (!bridge) {
		send({ error: "Browser bridge missing" });
		return;
	}
	const container = document.createElement("div");
	Object.assign(container.style, {
		position: "fixed",
		left: "300px",
		top: "100px",
		width: "800px",
		height: "600px",
		zIndex: "500",
	});
	document.body.append(container);
	let picking = false;
	let cancellations = 0;
	let page: NativeBrowserPage;
	page = bridge.create({
		id: "native-probe",
		onEvent(event) {
			if (event.type === "picker-cancelled") cancellations++;
			if (event.type === "state") {
				send({ state: event.state });
				if (event.state.title === "PiDeck browser fixture" && !event.state.loading && !picking) {
					picking = true;
					const beforePicking = cancellations;
					page.pick({
						instruction: "Click to select · Esc to cancel",
						color: "Color",
						background: "Background",
						font: "Font",
					});
					if (cancellations !== beforePicking) {
						send({ error: "Starting the picker cancelled its active state" });
						return;
					}
					send({
						phase: "picking",
						geometry: {
							visible: container.checkVisibility(),
							rect: container.getBoundingClientRect().toJSON(),
							canvas: container.innerHTML,
							guest: document.querySelector("electrobun-webview")?.getAttribute("style"),
							modal: document
								.querySelector(
									'[role="dialog"][data-state="open"],[role="alertdialog"],[data-native-browser-hidden]',
								)
								?.outerHTML.slice(0, 300),
						},
					});
				}
			} else if (event.type === "selection") {
				void (async () => {
					await page.setViewport({ width: 393, height: 852, scale: 0.5 });
					await new Promise((resolve) => setTimeout(resolve, 200));
					await page.setViewport({ width: 393, height: 852, scale: 1 });
					container.style.overflow = "auto";
					await new Promise((resolve) => setTimeout(resolve, 200));
					container.scrollTop = 200;
					await new Promise((resolve) => setTimeout(resolve, 200));
					const screenshot = await page.screenshot();
					send({
						phase: "complete",
						selection: event.selection,
						screenshot,
						scrollTop: container.scrollTop,
						scrollHeight: container.scrollHeight,
						clientHeight: container.clientHeight,
						canvas: container.innerHTML,
					});
				})().catch((error: unknown) => send({ error: String(error) }));
			}
		},
	});
	page.attach(container);
	page.navigate(url);
}

function runBrowserCloseProbe(url: string) {
	const globals = globalThis as typeof globalThis & {
		__THINKRAIL_NATIVE_BROWSER__?: NativeBrowserBridge;
		__electrobunSendToHost?: (value: unknown) => void;
	};
	const send = (value: unknown) =>
		globals.__electrobunSendToHost?.({ kind: "pideck-browser-probe", value });
	const bridge = globals.__THINKRAIL_NATIVE_BROWSER__;
	if (!bridge) {
		send({ error: "Browser bridge missing" });
		return;
	}
	void (async () => {
		const container = document.createElement("div");
		Object.assign(container.style, {
			position: "fixed",
			left: "300px",
			top: "100px",
			width: "800px",
			height: "600px",
		});
		document.body.append(container);
		const create = async (id: string) => {
			let loaded = false;
			let failure: string | null = null;
			const page = bridge.create({
				id,
				onEvent(event) {
					if (event.type !== "state") return;
					failure = event.state.error;
					loaded = event.state.title === "PiDeck browser fixture" && !event.state.loading;
				},
			});
			page.navigate(`${url}?tab=${id}`);
			const deadline = Date.now() + 15000;
			while (!loaded) {
				if (failure || Date.now() > deadline) throw new Error(failure ?? `Page ${id} did not load`);
				await new Promise((resolve) => setTimeout(resolve, 50));
			}
			return page;
		};
		const first = await create("close-first");
		first.attach(container);
		const second = await create("close-second");
		first.attach(null);
		second.attach(container);
		send({ phase: "closing-first" });
		first.dispose();
		await new Promise((resolve) => setTimeout(resolve, 1000));
		await second.screenshot();
		const active = await create("close-active");
		second.attach(null);
		active.attach(container);
		active.dispose();
		active.dispose();
		await new Promise((resolve) => setTimeout(resolve, 1000));
		second.attach(container);
		await second.screenshot();
		send({ phase: "closing-last" });
		second.dispose();
		await new Promise((resolve) => setTimeout(resolve, 1000));
		const reopened = await create("close-reopened");
		await reopened.screenshot();
		reopened.dispose();
		await new Promise((resolve) => setTimeout(resolve, 1000));
		const blank = bridge.create({ id: "close-blank", onEvent() {} });
		const blankDeadline = Date.now() + 15000;
		while (true) {
			try {
				await blank.screenshot();
				break;
			} catch (error) {
				if (
					!(error instanceof Error) ||
					error.message !== "Browser is not ready" ||
					Date.now() > blankDeadline
				)
					throw error;
				await new Promise((resolve) => setTimeout(resolve, 50));
			}
		}
		blank.dispose();
		await new Promise((resolve) => setTimeout(resolve, 1000));
		container.remove();
		send({ phase: "close-complete" });
	})().catch((error: unknown) => send({ error: String(error) }));
}

function runAutomationWorkbench() {
	const bridge = Reflect.get(globalThis, "__THINKRAIL_NATIVE_BROWSER__") as NativeBrowserBridge;
	const send = (value: unknown) =>
		Reflect.get(globalThis, "__electrobunSendToHost")({ kind: "pideck-browser-probe", value });
	const tabs = new Map<string, { page: NativeBrowserPage; state: BrowserPageState }>();
	const container = document.createElement("div");
	Object.assign(container.style, {
		position: "fixed",
		left: "300px",
		top: "100px",
		width: "700px",
		height: "500px",
		zIndex: "500",
	});
	document.body.append(container);
	bridge.registerWorkbench(async (request) => {
		let id = request.tabId;
		if (request.action === "new") {
			id = crypto.randomUUID();
			const key = id;
			const page = bridge.create({
				id,
				onEvent: (event) => {
					const tab = tabs.get(key);
					if (tab && event.type === "close") {
						tab.page.dispose();
						tabs.delete(key);
					}
					if (tab && event.type === "state") tab.state = event.state;
				},
			});
			tabs.set(id, {
				page,
				state: {
					url: "",
					title: "",
					loading: false,
					canGoBack: false,
					canGoForward: false,
					error: null,
				},
			});
			page.attach(container);
			await page.nativeId();
			await page.setViewport({ width: 1280, height: 720, scale: 0.5 });
		}
		const tab = id ? tabs.get(id) : undefined;
		if (tab) {
			if (request.action === "close") {
				tab.page.dispose();
				if (id) tabs.delete(id);
			} else if (request.action === "capture")
				await tab.page.setCapture(request.viewport ?? null, request.captureId);
			else if (request.action === "activate") tab.page.setVisible(request.visible !== false);
			else if (request.action === "viewport")
				await tab.page.setViewport(request.viewport ? { ...request.viewport, scale: 0.5 } : null);
			else if (request.action === "activity") {
				if (request.method === "copy-fixture") await tab.page.copyScreenshot();
				else tab.page.setActive(request.active === true);
			}
		}
		return {
			tabs: [...tabs].map(([id, tab]) => ({
				id,
				url: tab.state.url,
				title: tab.state.title,
				visible: tab.page.isVisible(),
			})),
			tabId: id,
			viewId: tab && request.action !== "close" ? await tab.page.nativeId() : undefined,
		};
	});
	send({ phase: "automation-ready" });
}

export function browserProbeScript(url: string, close = false, automation = false): string {
	const parsed = new URL(url);
	if (parsed.hostname !== "127.0.0.1" || parsed.protocol !== "http:")
		throw new Error("Browser probe requires a loopback fixture");
	return automation
		? `setTimeout(${runAutomationWorkbench.toString()},1000)`
		: `(${(close ? runBrowserCloseProbe : runBrowserProbe).toString()})(${JSON.stringify(url)})`;
}

function runBrowserVideoProbe(data: string) {
	const send = (value: unknown) =>
		Reflect.get(
			globalThis,
			"__electrobunSendToHost",
		)({ kind: "pideck-browser-probe", value: { systemVideo: value } });
	void (async () => {
		const overlay = document.createElement("div");
		overlay.setAttribute("data-native-browser-hidden", "");
		Object.assign(overlay.style, {
			position: "fixed",
			inset: "0",
			zIndex: "10000",
			background: "white",
		});
		const video = document.createElement("video");
		const bytes = Uint8Array.from(atob(data.slice("data:video/webm;base64,".length)), (character) =>
			character.charCodeAt(0),
		);
		const mediaUrl = URL.createObjectURL(new Blob([bytes], { type: "video/webm" }));
		video.src = mediaUrl;
		video.muted = true;
		video.playsInline = true;
		video.controls = true;
		Object.assign(video.style, { width: "640px", height: "480px" });
		overlay.append(video);
		document.body.append(overlay);
		try {
			await new Promise<void>((resolve, reject) => {
				const timer = setTimeout(
					() => reject(new Error("System renderer cannot decode WebM")),
					10000,
				);
				video.onloadeddata = () => {
					clearTimeout(timer);
					resolve();
				};
				video.onerror = () => {
					clearTimeout(timer);
					reject(new Error("System renderer rejected WebM"));
				};
			});
			await video.play();
			const deadline = Date.now() + 5000;
			while (video.currentTime < 0.2 && Date.now() < deadline)
				await new Promise((resolve) => setTimeout(resolve, 50));
			video.pause();
			const played = video.currentTime;
			video.currentTime = 0.1;
			await new Promise<void>((resolve, reject) => {
				const timer = setTimeout(() => reject(new Error("System renderer cannot seek WebM")), 5000);
				video.onseeked = () => {
					clearTimeout(timer);
					resolve();
				};
			});
			const passed =
				video.videoWidth === 640 &&
				video.videoHeight === 480 &&
				Number.isFinite(video.duration) &&
				played > 0.05;
			send({
				passed,
				width: video.videoWidth,
				height: video.videoHeight,
				duration: video.duration,
				played,
				seeked: video.currentTime,
			});
		} finally {
			URL.revokeObjectURL(mediaUrl);
			overlay.remove();
		}
	})().catch((error) => send({ passed: false, error: String(error) }));
}

export function browserVideoProbeScript(data: string): string {
	if (!data.startsWith("data:video/webm;base64,") || data.length > 2_000_000)
		throw new Error("Invalid video fixture");
	return `(${runBrowserVideoProbe.toString()})(${JSON.stringify(data)})`;
}
