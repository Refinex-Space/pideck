import { copyFile, lstat, mkdtemp, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import {
	type BrowserCommand,
	type BrowserEngine,
	type BrowserEngineResult,
	type BrowserLocator,
	type BrowserScope,
	type BrowserTextMatcher,
	type BrowserWorkbenchRequest,
	type BrowserWorkbenchResult,
	normalizeBrowserUrl,
} from "@thinkrail/contracts";
import type { Browser, FrameLocator, Locator, Page } from "playwright-core";
import { BrowserCdp } from "./cdp";
import { clipboardShortcut, copyBrowserSelection, pasteBrowserText } from "./clipboard";
import { browserElementAtPoint, browserMediaSource, describeBrowserElement } from "./elements";
import { createBrowserInputTransport } from "./inputTransport";
import type { createBrowserController } from "./main";
import { BrowserRecorder } from "./recording";

export function textMatcher(
	value: string | BrowserTextMatcher | undefined,
): string | RegExp | undefined {
	if (!value || typeof value === "string") return value;
	if (value.source.length > 2000 || !/^[imsu]*$/.test(value.flags ?? ""))
		throw new Error("Invalid browser text matcher");
	return new RegExp(value.source, value.flags);
}
export function locate(
	page: Page | FrameLocator | Locator,
	input: BrowserLocator,
	depth = 0,
): Locator {
	if (depth > 12) throw new Error("Browser locator nesting is too deep");
	let root: Page | FrameLocator | Locator = input.scope
		? locate(page, input.scope, depth + 1)
		: page;
	for (const frame of input.frames ?? []) root = root.frameLocator(frame);
	const exact = input.exact;
	let locator: Locator;
	if (input.selector) locator = root.locator(input.selector);
	else if (input.role)
		locator = root.getByRole(input.role as Parameters<Page["getByRole"]>[0], {
			name: textMatcher(input.name),
			exact,
		});
	else if (input.text !== undefined)
		locator = root.getByText(textMatcher(input.text) ?? "", { exact });
	else if (input.label !== undefined)
		locator = root.getByLabel(textMatcher(input.label) ?? "", { exact });
	else if (input.placeholder !== undefined)
		locator = root.getByPlaceholder(textMatcher(input.placeholder) ?? "", { exact });
	else if (input.testId !== undefined) locator = root.getByTestId(input.testId);
	else if (input.alt !== undefined)
		locator = root.getByAltText(textMatcher(input.alt) ?? "", { exact });
	else if (input.title !== undefined)
		locator = root.getByTitle(textMatcher(input.title) ?? "", { exact });
	else throw new Error("Provide an observed locator");
	if (
		input.has ||
		input.hasNot ||
		input.visible !== undefined ||
		input.hasText !== undefined ||
		input.hasNotText !== undefined
	)
		locator = locator.filter({
			has: input.has ? locate(root, input.has, depth + 1) : undefined,
			hasText: textMatcher(input.hasText),
			hasNotText: textMatcher(input.hasNotText),
			hasNot: input.hasNot ? locate(root, input.hasNot, depth + 1) : undefined,
			visible: input.visible,
		});
	if (input.and) locator = locator.and(locate(root, input.and, depth + 1));
	if (input.or) locator = locator.or(locate(root, input.or, depth + 1));
	if (input.last) locator = locator.last();
	if (input.nth !== undefined) locator = locator.nth(input.nth);
	return locator;
}
function required<T>(value: T | undefined, field: string): T {
	if (value === undefined) throw new Error(`Browser command requires ${field}`);
	return value;
}

function pageFunction(script: string): (arg: unknown) => unknown {
	if (script.length > 64000) throw new Error("Browser evaluation exceeds 64 KB");
	// Compile only; Playwright serializes the function and executes its body in the guest.
	return new Function("arg", `return (${script})(arg)`) as (arg: unknown) => unknown;
}
function elementFunction(script: string): (element: Element, arg: unknown) => unknown {
	if (script.length > 64000) throw new Error("Browser evaluation exceeds 64 KB");
	return new Function("element", "arg", `return (${script})(element, arg)`) as (
		element: Element,
		arg: unknown,
	) => unknown;
}
function boundedNumber(value: number | undefined, fallback: number, min: number, max: number) {
	const result = value ?? fallback;
	if (!Number.isFinite(result) || result < min || result > max)
		throw new Error("Browser numeric argument is out of range");
	return result;
}

export interface BrowserAutomationOptions {
	port: number;
	runtimeDir: string;
	controller: ReturnType<typeof createBrowserController>;
	workbench(request: BrowserWorkbenchRequest): Promise<BrowserWorkbenchResult>;
}

export function createBrowserEngine(
	options: BrowserAutomationOptions,
): BrowserEngine & { dispose(): Promise<void> } {
	const { controller, workbench } = options;
	const connections = new Map<Browser, BrowserScope>();
	const pageViews = new WeakMap<Page, number>();
	const clipboards = new Map<string, string>();
	const temporaryDirectories = new Set<string>();
	let recordingFinished:
		| Parameters<NonNullable<BrowserEngine["onRecordingFinished"]>>[0]
		| undefined;
	const clipboardKey = (scope: BrowserScope) => `${scope.workspaceId}/${scope.sessionId}`;
	let driver: Promise<typeof import("playwright-core")> | undefined;
	let transport: Promise<Awaited<ReturnType<typeof createBrowserInputTransport>>> | undefined;
	let downloadClient: Promise<BrowserCdp> | undefined;
	async function connect(viewId: number, scope: BrowserScope, signal: AbortSignal) {
		signal.throwIfAborted();
		const { targetId } = await controller.session(viewId);
		driver ??= import(pathToFileURL(join(options.runtimeDir, "playwright-core", "index.mjs")).href);
		transport ??= createBrowserInputTransport(options.port, controller.inputScale).catch(
			(error) => {
				transport = undefined;
				throw error;
			},
		);
		const browser = await (await driver).chromium.connectOverCDP((await transport).endpoint, {
			noDefaults: true,
			isLocal: true,
			timeout: 10000,
		});
		connections.set(browser, scope);
		const abort = () => {
			void browser.close().catch(() => {});
		};
		signal.addEventListener("abort", abort, { once: true });
		const close = async () => {
			signal.removeEventListener("abort", abort);
			connections.delete(browser);
			await browser.close().catch(() => {});
		};
		try {
			signal.throwIfAborted();
			const context = browser.contexts()[0];
			if (!context) throw new Error("CEF browser context is unavailable");
			const observe = (page: Page) => {
				page.on("dialog", () => {});
				page.setDefaultTimeout(5000);
			};
			context.on("page", observe);
			for (const page of context.pages()) observe(page);
			for (const page of context.pages()) {
				const session = await context.newCDPSession(page);
				try {
					const result = await session.send("Target.getTargetInfo");
					if (result.targetInfo.targetId === targetId) {
						pageViews.set(page, viewId);
						return { page, close };
					}
				} finally {
					await session.detach();
				}
			}
			throw new Error("Owned browser target is unavailable");
		} catch (error) {
			await close();
			throw error;
		}
	}
	async function temporaryFile(extension: string) {
		const directory = await mkdtemp(join(tmpdir(), "pideck-browser-"));
		temporaryDirectories.add(directory);
		setTimeout(
			() => {
				if (temporaryDirectories.delete(directory))
					void rm(directory, { recursive: true, force: true }).catch(() => {});
			},
			10 * 60 * 1000,
		).unref();
		return join(directory, `artifact.${extension}`);
	}
	async function releasePointer(page: Page, x: number, y: number) {
		const viewId = pageViews.get(page);
		if (viewId === undefined) return;
		try {
			const { client, targetId } = await controller.session(viewId);
			const scale = controller.inputScale(targetId);
			await client.request("Input.dispatchMouseEvent", {
				type: "mouseReleased",
				button: "left",
				buttons: 0,
				x: x * scale,
				y: y * scale,
				clickCount: 1,
			});
		} catch {}
	}
	async function operate(
		page: Page,
		command: BrowserCommand,
		signal: AbortSignal,
	): Promise<unknown> {
		signal.throwIfAborted();
		const timeout = boundedNumber(command.timeoutMs, 5000, 1, 30000);
		const target = () => locate(page, required(command.locator, "locator"));
		const position = () => ({ x: required(command.x, "x"), y: required(command.y, "y") });
		const pointer = {
			timeout,
			button: command.button,
			modifiers: command.modifiers,
			force: command.force,
		};
		const modifiedPointer = async (action: () => Promise<void>) => {
			const modifiers = command.modifiers ?? [];
			try {
				for (const key of modifiers) await page.keyboard.down(key);
				await action();
			} finally {
				for (const key of [...modifiers].reverse()) await page.keyboard.up(key).catch(() => {});
			}
		};
		switch (command.action) {
			case "navigate": {
				const url =
					command.url === "about:blank"
						? command.url
						: normalizeBrowserUrl(required(command.url, "url"));
				if (!url) throw new Error("Invalid browser URL");
				if (url.startsWith("file:"))
					throw new Error(
						"Agent navigation supports HTTP(S) and about:blank; local files require explicit user opening",
					);
				await page.goto(url, { waitUntil: "domcontentloaded", timeout });
				break;
			}
			case "back":
				await page.goBack({ waitUntil: "domcontentloaded", timeout });
				break;
			case "forward":
				await page.goForward({ waitUntil: "domcontentloaded", timeout });
				break;
			case "reload":
				await page.reload({ waitUntil: "domcontentloaded", timeout });
				break;
			case "click":
				if (command.locator) await target().click(pointer);
				else {
					const { x, y } = position();
					await modifiedPointer(() => page.mouse.click(x, y, { button: command.button }));
				}
				break;
			case "dblclick":
				if (command.locator) await target().dblclick(pointer);
				else {
					const { x, y } = position();
					await modifiedPointer(() => page.mouse.dblclick(x, y, { button: command.button }));
				}
				break;
			case "fill":
				await target().fill(required(command.text, "text"), { timeout });
				break;
			case "type":
				if (command.locator)
					await target().pressSequentially(required(command.text, "text"), { timeout });
				else await page.keyboard.insertText(required(command.text, "text"));
				break;
			case "press":
				if (command.locator) await target().press(required(command.key, "key"), { timeout });
				else await page.keyboard.press(required(command.key, "key"));
				break;
			case "hover":
				if (command.locator)
					await target().hover({ timeout, modifiers: command.modifiers, force: command.force });
				else {
					const { x, y } = position();
					await page.mouse.move(x, y);
				}
				break;
			case "select":
				return target().selectOption(
					required(command.values, "values").map((value) =>
						typeof value === "string" ? { value } : value,
					),
					{ timeout },
				);
			case "check":
				await target().check({ timeout, force: command.force });
				break;
			case "uncheck":
				await target().uncheck({ timeout, force: command.force });
				break;
			case "count":
				return target().count();
			case "text":
				return target().innerText({ timeout });
			case "textContent":
				return target().textContent({ timeout });
			case "allTextContents":
				return target().allTextContents();
			case "all":
				if (command.locator?.nth !== undefined || command.locator?.last)
					return (await target().count()) ? [command.locator] : [];
				return Array.from({ length: Math.min(await target().count(), 500) }, (_, nth) => ({
					...command.locator,
					nth,
				}));
			case "attribute":
				return target().getAttribute(required(command.attribute, "attribute"), { timeout });
			case "visible":
				return target().isVisible();
			case "enabled":
				return target().isEnabled({ timeout });
			case "evaluate":
				return command.locator
					? target().evaluate(elementFunction(required(command.script, "script")), command.arg, {
							timeout,
						})
					: page.evaluate(pageFunction(required(command.script, "script")), command.arg);
			case "waitFor":
				await target().waitFor({
					state:
						command.state === "load" || command.state === "domcontentloaded"
							? "visible"
							: command.state,
					timeout,
				});
				break;
			case "waitForURL":
				await page.waitForURL(required(command.url, "url"), {
					waitUntil: "domcontentloaded",
					timeout,
				});
				break;
			case "waitForLoadState":
				await page.waitForLoadState(
					command.state === "domcontentloaded" ? "domcontentloaded" : "load",
					{ timeout },
				);
				break;
			case "waitForTimeout":
				await new Promise<void>((resolve, reject) => {
					const abort = () => {
						clearTimeout(timer);
						reject(signal.reason);
					};
					const timer = setTimeout(() => {
						signal.removeEventListener("abort", abort);
						resolve();
					}, timeout);
					signal.addEventListener("abort", abort, { once: true });
				});
				break;
			case "expectNavigation": {
				const trigger = required(command.trigger, "trigger");
				if (!["click", "press", "navigate", "select"].includes(trigger.action))
					throw new Error("Unsupported navigation trigger");
				const wait = command.url
					? page.waitForURL(command.url, { waitUntil: "domcontentloaded", timeout })
					: page.waitForLoadState("domcontentloaded", { timeout });
				wait.catch(() => {});
				const result = await operate(page, trigger, signal);
				await wait;
				return result;
			}
			case "move": {
				const { x, y } = position();
				await page.mouse.move(x, y);
				break;
			}
			case "scroll": {
				if (command.locator) await target().hover({ timeout });
				else if (command.x !== undefined && command.y !== undefined)
					await page.mouse.move(command.x, command.y);
				await page.mouse.wheel(command.deltaX ?? 0, required(command.deltaY, "deltaY"));
				break;
			}
			case "scrollTo":
				if (command.locator)
					await target().evaluate((element, pos) => element.scrollTo(pos.x, pos.y), {
						x: command.x ?? 0,
						y: command.y ?? 0,
					});
				else
					await page.evaluate((pos) => scrollTo(pos.x, pos.y), {
						x: command.x ?? 0,
						y: command.y ?? 0,
					});
				break;
			case "drag": {
				const { x, y } = command.path?.[0] ?? position();
				let last = { x, y };
				await page.mouse.move(x, y);
				await page.mouse.down();
				try {
					signal.throwIfAborted();
					for (const point of command.path?.slice(1) ?? [
						{ x: required(command.toX, "toX"), y: required(command.toY, "toY") },
					]) {
						signal.throwIfAborted();
						last = point;
						await page.mouse.move(point.x, point.y, { steps: 10 });
					}
				} finally {
					await page.mouse.up().catch(() => releasePointer(page, last.x, last.y));
				}
				break;
			}
			case "upload":
				await target().setInputFiles(required(command.files, "files"), { timeout });
				break;
			case "elementInfo": {
				if (command.locator) {
					const element = target();
					const info = await element.evaluate(describeBrowserElement);
					return {
						...info,
						boundingBox: await element.boundingBox(),
						selector: { ...info.selector, frameSelectors: command.locator.frames ?? [] },
					};
				}
				const found = await browserElementAtPoint(
					page,
					required(command.x, "x"),
					required(command.y, "y"),
				);
				try {
					const info = await found.element.evaluate(describeBrowserElement);
					return {
						...info,
						boundingBox: await found.element.boundingBox(),
						selector: { ...info.selector, frameSelectors: found.frames },
					};
				} finally {
					await found.element.dispose();
				}
			}
			case "snapshot": {
				const root = command.locator ? target() : page.locator("body");
				const raw = await root.ariaSnapshot({ timeout });
				const accessibility = (
					await root
						.locator('input[type="password"],input[autocomplete="one-time-code"]')
						.evaluateAll((fields, snapshot) => {
							for (const field of fields) {
								const value = (field as HTMLInputElement).value;
								if (!value) continue;
								for (const encoded of [
									JSON.stringify(value),
									JSON.stringify(value).slice(1, -1),
									value,
								])
									snapshot = snapshot.replaceAll(encoded, "[redacted]");
							}
							return snapshot;
						}, raw)
				).slice(0, 100000);
				const elements = await root
					.locator("a,button,input,select,textarea,[role],[data-testid],iframe,canvas")
					.evaluateAll((elements) =>
						elements.slice(0, 200).map((element) => ({
							tag: element.tagName.toLowerCase(),
							text: element.textContent?.trim().slice(0, 160),
							attributes: Object.fromEntries(
								[
									"id",
									"name",
									"type",
									"role",
									"href",
									"placeholder",
									"aria-label",
									"data-testid",
								].flatMap((name) =>
									element.hasAttribute(name) ? [[name, element.getAttribute(name)]] : [],
								),
							),
						})),
					);
				return {
					url: page.url(),
					accessibility,
					elements,
					frames: page.frames().map((frame) => ({ name: frame.name(), url: frame.url() })),
				};
			}
			case "getState":
				return {
					url: page.url(),
					title: await page.title(),
					viewport: await page.evaluate(() => ({
						width: innerWidth,
						height: innerHeight,
						deviceScaleFactor: devicePixelRatio,
					})),
				};
			default:
				throw new Error(`Unsupported page operation: ${command.action}`);
		}
		return { url: page.url() };
	}
	const recorder = new BrowserRecorder({
		controller,
		workbench,
		connect,
		operate,
		releasePointer,
		temporaryFile,
		completed: (scope, command, result, signal) =>
			recordingFinished
				? recordingFinished(scope, command, result, signal)
				: Promise.resolve(result),
	});
	return {
		async releaseArtifact(path) {
			const directory = dirname(path);
			if (!basename(path).startsWith("artifact.") || !temporaryDirectories.has(directory)) return;
			try {
				await rm(directory, { recursive: true, force: true });
				temporaryDirectories.delete(directory);
			} catch {}
		},
		onRecordingFinished(handler) {
			recordingFinished = handler;
			return () => {
				if (recordingFinished === handler) recordingFinished = undefined;
			};
		},
		workbench,
		async execute(scope, command, viewId, outerSignal) {
			outerSignal.throwIfAborted();
			const { client } = await controller.session(viewId);
			const lifetime = new AbortController();
			const signal = AbortSignal.any([
				outerSignal,
				lifetime.signal,
				...(["evaluate", "download", "downloadMedia"].includes(command.action)
					? [
							AbortSignal.timeout(
								command.action === "evaluate"
									? Math.min(command.timeoutMs ?? 5000, 30000)
									: boundedNumber(command.timeoutMs, 15000, 1, 120000),
							),
						]
					: []),
			]);
			const unsubscribe = client.subscribe((method) => {
				if (method === "disconnected") lifetime.abort();
			});
			const interrupt = () => {
				if (command.action === "evaluate")
					void client.request("Runtime.terminateExecution").catch(() => {});
			};
			signal.addEventListener("abort", interrupt, { once: true });
			try {
				if (command.action.startsWith("recording")) return recorder.execute(scope, command, viewId);
				if (command.action === "back" || command.action === "forward") {
					const history = await controller.history(viewId);
					if (!(command.action === "back" ? history.canGoBack : history.canGoForward))
						return { data: history };
				}
				if (command.action === "getDialog") return { data: controller.dialog(viewId) };
				if (command.action === "handleDialog") {
					const { client } = await controller.session(viewId);
					await client.request("Page.handleJavaScriptDialog", {
						accept: required(command.accept, "accept"),
						promptText: command.text,
					});
					return { data: { handled: true } };
				}
				if (command.action === "console") return { data: controller.observations(viewId) };
				if (command.action === "clipboardRead")
					return { data: clipboards.get(clipboardKey(scope)) ?? "" };
				if (command.action === "clipboardWrite") {
					clipboards.set(clipboardKey(scope), required(command.text, "text").slice(0, 1000000));
					return { data: { written: true } };
				}
				if (command.action === "viewport") {
					if (recorder.isRecording(viewId))
						throw new Error("Finish recording before changing its viewport");
					const viewport = command.viewport ?? null;
					if (viewport) {
						boundedNumber(viewport.width, 1280, 240, 3840);
						boundedNumber(viewport.height, 720, 240, 3840);
					}
					await workbench({
						action: "viewport",
						workspaceId: scope.workspaceId,
						tabId: command.tabId,
						viewport,
					});
					return { data: { viewport } };
				}
				const connection = await connect(viewId, scope, signal);
				try {
					const { page } = connection;
					const clipboardAction =
						command.action === "press"
							? clipboardShortcut(command.key ?? "", process.platform)
							: null;
					if (command.action === "paste" || clipboardAction === "paste") {
						if (command.locator) await locate(page, command.locator).focus();
						await pasteBrowserText(page, clipboards.get(clipboardKey(scope)) ?? "");
						return { data: { pasted: true } };
					}
					if (clipboardAction === "copy" || clipboardAction === "cut") {
						if (command.locator) await locate(page, command.locator).focus();
						const text = await copyBrowserSelection(page, clipboardAction === "cut");
						if (text !== null) clipboards.set(clipboardKey(scope), text);
						return { data: { copied: text !== null } };
					}
					if (command.action === "screenshot") {
						const captureId = crypto.randomUUID();
						const viewport = await page.evaluate(() => ({
							width: innerWidth,
							height: innerHeight,
						}));
						await workbench({
							action: "capture",
							workspaceId: scope.workspaceId,
							tabId: command.tabId,
							viewport,
							captureId,
						});
						try {
							const point =
								!command.locator && command.x !== undefined && command.y !== undefined
									? await browserElementAtPoint(page, command.x, command.y)
									: null;
							let bytes: Buffer;
							try {
								bytes = point
									? await point.element.screenshot({ type: "png", scale: "css", timeout: 10000 })
									: command.locator
										? await locate(page, command.locator).screenshot({
												type: "png",
												scale: "css",
												timeout: 10000,
											})
										: await page.screenshot({
												type: "png",
												scale: "css",
												fullPage: command.fullPage,
												clip: command.clip,
												timeout: 10000,
											});
							} finally {
								await point?.element.dispose();
							}
							if (bytes.length > 18_000_000)
								throw new Error("Screenshot exceeds 18 MB; use a clip or element locator");
							const result: BrowserEngineResult = {
								image: { data: bytes.toString("base64"), mimeType: "image/png" },
							};
							if (command.outputPath) {
								const temporaryPath = await temporaryFile("png");
								await Bun.write(temporaryPath, bytes);
								result.temporaryArtifact = {
									temporaryPath,
									mimeType: "image/png",
									bytes: bytes.length,
								};
							}
							return result;
						} finally {
							await workbench({
								action: "capture",
								workspaceId: scope.workspaceId,
								tabId: command.tabId,
								viewport: null,
								captureId,
							});
						}
					}
					if (command.action === "download") {
						const trigger = required(command.trigger, "trigger");
						if (!["click", "press", "navigate"].includes(trigger.action))
							throw new Error("Download trigger must be click, press or navigate");
						if (!transport) throw new Error("Browser transport is unavailable");
						downloadClient ??= BrowserCdp.connect((await transport).browserEndpoint);
						const downloads = await downloadClient;
						await downloads.request("Browser.setDownloadBehavior", {
							behavior: "default",
							eventsEnabled: true,
						});
						const source = (await controller.session(viewId)).client;
						const tree = await source.request("Page.getFrameTree");
						const frames = new Set<string>();
						const collect = (node: unknown) => {
							if (!node || typeof node !== "object") return;
							const frame = Reflect.get(node, "frame");
							if (frame && typeof frame.id === "string") frames.add(frame.id);
							const children = Reflect.get(node, "childFrames");
							if (Array.isArray(children)) children.forEach(collect);
						};
						collect(tree.frameTree);
						let guid: string | undefined;
						const cancel = () => {
							if (guid) void downloads.request("Browser.cancelDownload", { guid }).catch(() => {});
						};
						const unlisten = downloads.subscribe((method, params) => {
							if (
								method === "Browser.downloadWillBegin" &&
								typeof params.frameId === "string" &&
								frames.has(params.frameId) &&
								typeof params.guid === "string"
							) {
								guid = params.guid;
								if (signal.aborted) cancel();
							}
						});
						const ticket = controller.download(
							viewId,
							signal,
							boundedNumber(command.timeoutMs, 15000, 1, 120000),
						);
						signal.addEventListener("abort", cancel, { once: true });
						try {
							await operate(page, trigger, signal);
							const download = await ticket.result;
							const temporaryPath = await temporaryFile("download");
							await copyFile(download.path, temporaryPath);
							if ((await lstat(download.path)).ino === download.ino) await unlink(download.path);
							return {
								data: { suggestedFilename: download.filename },
								temporaryArtifact: {
									temporaryPath,
									filename: download.filename,
									mimeType: "application/octet-stream",
									bytes: download.bytes,
								},
							};
						} catch (error) {
							cancel();
							throw error;
						} finally {
							signal.removeEventListener("abort", cancel);
							unlisten();
							ticket.dispose();
						}
					}
					if (command.action === "downloadMedia") {
						const point = command.locator
							? null
							: await browserElementAtPoint(
									page,
									required(command.x, "x"),
									required(command.y, "y"),
								);
						let media: { url: string };
						try {
							media = point
								? await point.element.evaluate(browserMediaSource)
								: await locate(page, required(command.locator, "locator")).evaluate(
										browserMediaSource,
									);
						} finally {
							await point?.element.dispose();
						}
						const url = new URL(media.url);
						if (!["http:", "https:", "blob:", "data:"].includes(url.protocol))
							throw new Error("Unsupported media URL");
						const temporaryPath = await temporaryFile("media");
						let filename = url.pathname.split("/").at(-1)?.slice(0, 180) || "media.bin";
						let bytes = 0;
						if (url.protocol === "data:") {
							const match =
								/^data:((?:image|audio|video)\/[a-z0-9.+-]+)(;base64)?,([\s\S]*)$/i.exec(media.url);
							if (!match || media.url.length > 24_000_000) throw new Error("Invalid inline media");
							const data = match[2]
								? Buffer.from(match[3] ?? "", "base64")
								: Buffer.from(decodeURIComponent(match[3] ?? ""));
							bytes = data.length;
							await Bun.write(temporaryPath, data);
							const extension = match[1]?.split("/")[1]?.replace("svg+xml", "svg") ?? "bin";
							filename = `media.${extension}`;
						} else {
							const { client } = await controller.session(viewId);
							const tree = await client.request("Page.getFrameTree");
							const frameId = (tree.frameTree as { frame: { id: string } }).frame.id;
							const loaded = await client.request("Network.loadNetworkResource", {
								frameId,
								url: media.url,
								options: { disableCache: false, includeCredentials: true },
							});
							const resource = loaded.resource as {
								success?: boolean;
								stream?: string;
								httpStatusCode?: number;
							};
							if (
								!resource.success ||
								!resource.stream ||
								(resource.httpStatusCode !== undefined && resource.httpStatusCode >= 400)
							)
								throw new Error("Media download failed");
							const handle = resource.stream;
							const sink = Bun.file(temporaryPath).writer();
							const cancel = () => {
								void client.request("IO.close", { handle }).catch(() => {});
							};
							signal.addEventListener("abort", cancel, { once: true });
							try {
								while (true) {
									signal.throwIfAborted();
									const part = await client.request("IO.read", { handle, size: 1024 * 1024 });
									if (typeof part.data !== "string") throw new Error("Invalid media stream");
									const chunk = Buffer.from(part.data, part.base64Encoded ? "base64" : "utf8");
									bytes += chunk.length;
									if (bytes > 256 * 1024 * 1024) throw new Error("Media exceeds 256 MB");
									sink.write(chunk);
									if (part.eof) break;
								}
							} finally {
								signal.removeEventListener("abort", cancel);
								await sink.end();
								await client.request("IO.close", { handle }).catch(() => {});
							}
						}
						return {
							temporaryArtifact: {
								temporaryPath,
								filename,
								mimeType: "application/octet-stream",
								bytes,
							},
						};
					}
					const data = await operate(page, command, signal);
					if (JSON.stringify(data)?.length > 200000)
						throw new Error("Browser result is too large; narrow the query");
					return { data };
				} finally {
					await connection.close();
				}
			} finally {
				unsubscribe();
				signal.removeEventListener("abort", interrupt);
			}
		},
		async release(scope, final = false) {
			await recorder.release(scope);
			for (const [browser, owner] of connections)
				if (owner.sessionId === scope.sessionId && owner.workspaceId === scope.workspaceId)
					await browser.close().catch(() => {});
			if (final) clipboards.delete(clipboardKey(scope));
		},
		async dispose() {
			await recorder.dispose();
			await Promise.all([...connections.keys()].map((browser) => browser.close().catch(() => {})));
			await Promise.all(
				[...temporaryDirectories].map((directory) =>
					rm(directory, { recursive: true, force: true }),
				),
			);
			connections.clear();
			(await transport?.catch(() => undefined))?.dispose();
			(await downloadClient?.catch(() => undefined))?.close();
			temporaryDirectories.clear();
			clipboards.clear();
		},
	};
}
