import { rm } from "node:fs/promises";
import type {
	BrowserCommand,
	BrowserEngineResult,
	BrowserRecordingState,
	BrowserRecordingStep,
	BrowserResult,
	BrowserScope,
	BrowserWorkbenchRequest,
	BrowserWorkbenchResult,
} from "@thinkrail/contracts";
import type { Page } from "playwright-core";
import type { BrowserCdp } from "./cdp";
import type { createBrowserController } from "./main";
import { sealWebmDuration } from "./webm";

interface Dependencies {
	releasePointer(page: Page, x: number, y: number): Promise<void>;
	completed(
		scope: BrowserScope,
		command: BrowserCommand,
		result: BrowserEngineResult,
		signal: AbortSignal,
	): Promise<BrowserResult>;
	controller: ReturnType<typeof createBrowserController>;
	workbench(request: BrowserWorkbenchRequest): Promise<BrowserWorkbenchResult>;
	connect(
		viewId: number,
		scope: BrowserScope,
		signal: AbortSignal,
	): Promise<{ page: Page; close(): Promise<void> }>;
	operate(page: Page, command: BrowserCommand, signal: AbortSignal): Promise<unknown>;
	temporaryFile(extension: string): Promise<string>;
}
interface Job {
	scope: BrowserScope;
	viewId: number;
	state: BrowserRecordingState;
	cancel: AbortController;
	stop: AbortController;
	done: Promise<void>;
	artifact?: BrowserEngineResult["temporaryArtifact"];
}

function encoderBootstrap(width: number, height: number, fps: number, binding: string) {
	const send = (message: unknown) => Reflect.get(globalThis, binding)(JSON.stringify(message));
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	document.body.append(canvas);
	const context = canvas.getContext("2d", { alpha: false });
	if (!context || !MediaRecorder.isTypeSupported("video/webm;codecs=vp8"))
		throw new Error("WebM recording is unavailable");
	const stream = canvas.captureStream(fps);
	const recorder = new MediaRecorder(stream, {
		mimeType: "video/webm;codecs=vp8",
		videoBitsPerSecond: Math.min(16000000, Math.max(2500000, width * height * fps * 0.25)),
	});
	let image: HTMLImageElement | null = null;
	let queue = Promise.resolve();
	let timer: ReturnType<typeof setInterval> | undefined;
	let started = false;
	let startedAt = 0;
	let durationMs = 0;
	recorder.ondataavailable = (event) => {
		if (!event.data.size) return;
		queue = queue.then(async () => {
			const bytes = new Uint8Array(await event.data.arrayBuffer());
			let raw = "";
			for (let offset = 0; offset < bytes.length; offset += 32768)
				raw += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
			send({ kind: "chunk", data: btoa(raw) });
		});
	};
	recorder.onerror = () => send({ kind: "error" });
	recorder.onstop = () => {
		clearInterval(timer);
		for (const track of stream.getTracks()) track.stop();
		void queue.then(() => send({ kind: "done", durationMs })).catch(() => send({ kind: "error" }));
	};
	Reflect.set(globalThis, "__pideckEncoder", {
		async frame(data: string) {
			const next = new Image();
			next.src = `data:image/png;base64,${data}`;
			await next.decode();
			image = next;
			context.drawImage(image, 0, 0, width, height);
			if (!started) {
				started = true;
				startedAt = performance.now();
				recorder.start(500);
				timer = setInterval(() => {
					if (image) context.drawImage(image, 0, 0, width, height);
				}, 1000 / fps);
			}
		},
		stop() {
			durationMs = performance.now() - startedAt;
			if (started && recorder.state !== "inactive") recorder.stop();
			else send({ kind: "error" });
		},
	});
}

function cursorScript(id: string) {
	const element = document.createElement("div");
	element.id = id;
	element.setAttribute("aria-hidden", "true");
	Object.assign(element.style, {
		position: "fixed",
		left: "20px",
		top: "20px",
		width: "24px",
		height: "28px",
		pointerEvents: "none",
		zIndex: "2147483647",
		contain: "strict",
	});
	element.attachShadow({ mode: "closed" }).innerHTML =
		'<svg xmlns="http://www.w3.org/2000/svg" width="24" height="28" viewBox="0 0 24 28"><path d="M2 2v22l6-6 5 9 4-2-5-9h9Z" fill="black" stroke="white" stroke-width="2"/></svg>';
	document.documentElement.append(element);
	const move = (event: MouseEvent) => {
		element.style.left = `${event.clientX}px`;
		element.style.top = `${event.clientY}px`;
	};
	const down = () => {
		element.style.filter = "drop-shadow(0 0 5px white)";
	};
	const up = () => {
		element.style.filter = "none";
	};
	document.addEventListener("mousemove", move, true);
	document.addEventListener("mousedown", down, true);
	document.addEventListener("mouseup", up, true);
	Reflect.set(globalThis, id, () => {
		document.removeEventListener("mousemove", move, true);
		document.removeEventListener("mousedown", down, true);
		document.removeEventListener("mouseup", up, true);
		element.remove();
		Reflect.deleteProperty(globalThis, id);
	});
}

async function delay(ms: number, signal: AbortSignal) {
	signal.throwIfAborted();
	if (!Number.isFinite(ms) || ms < 0 || ms > 90000) throw new Error("Invalid recording delay");
	await new Promise<void>((resolve, reject) => {
		const abort = () => {
			clearTimeout(timer);
			reject(signal.reason);
		};
		const timer = setTimeout(() => {
			signal.removeEventListener("abort", abort);
			resolve();
		}, ms);
		signal.addEventListener("abort", abort, { once: true });
	});
}

export class BrowserRecorder {
	private readonly jobs = new Map<string, Job>();
	constructor(private readonly deps: Dependencies) {}
	isRecording(viewId: number) {
		return [...this.jobs.values()].some(
			(job) =>
				job.viewId === viewId && ["preparing", "capturing", "finalizing"].includes(job.state.phase),
		);
	}
	async execute(
		scope: BrowserScope,
		command: BrowserCommand,
		viewId: number,
	): Promise<BrowserEngineResult> {
		if (command.action === "recordingStart") {
			if (this.isRecording(viewId)) throw new Error("This tab is already recording");
			const fps = command.fps ?? 15;
			const duration = command.maxDurationMs ?? 90000;
			if (
				!Number.isInteger(fps) ||
				fps < 5 ||
				fps > 30 ||
				!Number.isInteger(duration) ||
				duration < 100 ||
				duration > 90000 ||
				(command.actions?.length ?? 0) > 100
			)
				throw new Error("Invalid recording limits");
			const id = crypto.randomUUID();
			const job: Job = {
				scope,
				viewId,
				state: { id, tabId: command.tabId ?? "", phase: "preparing", startedAt: Date.now() },
				cancel: new AbortController(),
				stop: new AbortController(),
				done: Promise.resolve(),
			};
			this.jobs.set(id, job);
			job.done = this.run(job, command, fps, duration);
			return { recording: { ...job.state } };
		}
		const job = this.jobs.get(command.recordingId ?? "");
		if (
			!job ||
			job.scope.workspaceId !== scope.workspaceId ||
			job.viewId !== viewId ||
			(scope.sessionId && job.scope.sessionId !== scope.sessionId)
		)
			throw new Error("Recording is unavailable in this browser session");
		if (command.action === "recordingCancel") {
			job.cancel.abort();
			job.stop.abort();
			await job.done;
		}
		if (command.action === "recordingStop") {
			job.stop.abort();
			await job.done;
		}
		return {
			recording: { ...job.state },
			...(job.artifact && !job.state.artifact ? { temporaryArtifact: job.artifact } : {}),
		};
	}
	private async publish(job: Job) {
		await this.deps.workbench({
			action: "recording",
			workspaceId: job.scope.workspaceId,
			tabId: job.state.tabId,
			recording: { ...job.state },
		});
	}
	private async run(job: Job, command: BrowserCommand, fps: number, maxDuration: number) {
		let connection: Awaited<ReturnType<Dependencies["connect"]>> | undefined;
		let encoder: Awaited<ReturnType<Dependencies["controller"]["recorder"]>> | undefined;
		let source: BrowserCdp | undefined;
		let unsubscribe: (() => void) | undefined;
		let lifecycle: (() => void) | undefined;
		let stopEncoderListener: (() => void) | undefined;
		let sink: ReturnType<ReturnType<typeof Bun.file>["writer"]> | undefined;
		let timer: ReturnType<typeof setTimeout> | undefined;
		let temporaryPath: string | undefined;
		const cursorId = `pideck-cursor-${job.state.id}`;
		const cancel = job.cancel.signal;
		let bytes = 0;
		let frameCount = 0;
		let pushing = false;
		let push = Promise.resolve();
		let encoderError: Error | undefined;
		let capturedAt = 0;
		let encodedDuration = 0;
		let lastFrameAt = 0;
		const interrupt = () => {
			void connection?.close();
		};
		try {
			await this.publish(job);
			connection = await this.deps.connect(job.viewId, job.scope, cancel);
			const { page } = connection;
			const dimensions =
				command.viewport ??
				(await page.evaluate(() => ({ width: innerWidth, height: innerHeight })));
			if (
				dimensions.width < 240 ||
				dimensions.height < 240 ||
				dimensions.width > 3840 ||
				dimensions.height > 3840
			)
				throw new Error("Recording requires a viewport between 240 and 3840 CSS pixels");
			await this.deps.workbench({
				action: "capture",
				captureId: job.state.id,
				workspaceId: job.scope.workspaceId,
				tabId: job.state.tabId,
				viewport: dimensions,
			});
			source = (await this.deps.controller.session(job.viewId)).client;
			lifecycle = source.subscribe((method) => {
				if (method === "disconnected") {
					job.cancel.abort();
					job.stop.abort();
				}
			});
			if (command.showCursor !== false)
				await this.deps.controller.script(
					job.viewId,
					`(${cursorScript.toString()})(${JSON.stringify(cursorId)})`,
				);
			encoder = await this.deps.controller.recorder();
			cancel.throwIfAborted();
			const binding = `pideckEncoder${job.state.id.replaceAll("-", "")}`;
			await encoder.client.request("Runtime.addBinding", { name: binding });
			temporaryPath = await this.deps.temporaryFile("webm");
			sink = Bun.file(temporaryPath).writer();
			let done: () => void = () => {};
			const encoded = new Promise<void>((resolve) => {
				done = resolve;
			});
			stopEncoderListener = encoder.client.subscribe((method, params) => {
				if (method === "disconnected") {
					encoderError = new Error("Video encoder disconnected");
					job.stop.abort();
					done();
					return;
				}
				if (
					method !== "Runtime.bindingCalled" ||
					params.name !== binding ||
					typeof params.payload !== "string"
				)
					return;
				try {
					const message = JSON.parse(params.payload);
					if (message.kind === "chunk" && typeof message.data === "string") {
						const chunk = Buffer.from(message.data, "base64");
						bytes += chunk.length;
						if (bytes > 256 * 1024 * 1024) throw new Error("Recording exceeds 256 MB");
						sink?.write(chunk);
					} else if (message.kind === "done") {
						if (typeof message.durationMs === "number") encodedDuration = message.durationMs;
						done();
					} else if (message.kind === "error") throw new Error("Video encoder failed");
				} catch (error) {
					encoderError = error instanceof Error ? error : new Error("Invalid encoder output");
					job.stop.abort();
					done();
				}
			});
			await encoder.client.request("Runtime.evaluate", {
				expression: `(${encoderBootstrap.toString()})(${dimensions.width},${dimensions.height},${fps},${JSON.stringify(binding)})`,
				awaitPromise: true,
			});
			const encoderClient = encoder.client;
			unsubscribe = source.subscribe((method, params) => {
				if (method !== "Page.screencastFrame") return;
				void source
					?.request("Page.screencastFrameAck", { sessionId: params.sessionId })
					.catch(() => {});
				if (
					pushing ||
					typeof params.data !== "string" ||
					cancel.aborted ||
					Date.now() - lastFrameAt < 1000 / fps
				)
					return;
				lastFrameAt = Date.now();
				pushing = true;
				push = encoderClient
					.request("Runtime.evaluate", {
						expression: `globalThis.__pideckEncoder.frame(${JSON.stringify(params.data)})`,
						awaitPromise: true,
					})
					.then((result) => {
						if (result.exceptionDetails) throw new Error("Could not encode the browser frame");
						frameCount++;
					})
					.catch((error) => {
						encoderError = error;
						job.stop.abort();
					})
					.finally(() => {
						pushing = false;
					});
			});
			await source.request("Page.startScreencast", {
				format: "png",
				maxWidth: dimensions.width,
				maxHeight: dimensions.height,
				everyNthFrame: 1,
			});
			const firstFrameDeadline = Date.now() + 10000;
			while (!frameCount && Date.now() < firstFrameDeadline && !encoderError)
				await delay(25, cancel);
			if (!frameCount || encoderError)
				throw encoderError ?? new Error("The browser did not produce a recording frame");
			capturedAt = Date.now();
			job.stop.signal.addEventListener("abort", interrupt, { once: true });
			job.state.phase = "capturing";
			job.state.startedAt = capturedAt;
			await this.publish(job);
			timer = setTimeout(() => job.stop.abort(), maxDuration);
			const signal = AbortSignal.any([cancel, job.stop.signal]);
			if (command.actions?.length) {
				try {
					const pointer = { x: 20, y: 20 };
					for (const step of command.actions) {
						signal.throwIfAborted();
						await this.step(page, step, signal, pointer);
						await delay(step.delayAfterMs ?? 100, signal);
					}
					await delay(command.settleMs ?? 500, signal);
				} catch (error) {
					if (!job.stop.signal.aborted) throw error;
				}
			} else if (!signal.aborted)
				await new Promise<void>((resolve) =>
					signal.addEventListener("abort", () => resolve(), { once: true }),
				);
			cancel.throwIfAborted();
			job.state.phase = "finalizing";
			await this.publish(job);
			await source.request("Page.stopScreencast");
			unsubscribe();
			unsubscribe = undefined;
			await push;
			await encoder.client.request("Runtime.evaluate", {
				expression: "globalThis.__pideckEncoder.stop()",
			});
			let finishTimer: ReturnType<typeof setTimeout> | undefined;
			try {
				await Promise.race([
					encoded,
					new Promise<never>((_, reject) => {
						finishTimer = setTimeout(() => reject(new Error("Video encoding timed out")), 10000);
					}),
				]);
			} finally {
				clearTimeout(finishTimer);
			}
			await sink.end();
			sink = undefined;
			cancel.throwIfAborted();
			if (encoderError) throw encoderError;
			if (bytes < 100 || frameCount < 1) throw new Error("Recording contained no video");
			const durationMs = encodedDuration || Date.now() - capturedAt;
			await sealWebmDuration(temporaryPath, durationMs);
			job.artifact = {
				temporaryPath,
				mimeType: "video/webm",
				bytes,
				...dimensions,
				durationMs,
			};
		} catch (error) {
			job.state.phase = cancel.aborted ? "cancelled" : "failed";
			if (!cancel.aborted)
				job.state.error = error instanceof Error ? error.message : "Recording failed";
		} finally {
			clearTimeout(timer);
			job.stop.signal.removeEventListener("abort", interrupt);
			unsubscribe?.();
			stopEncoderListener?.();
			await source?.request("Page.stopScreencast").catch(() => {});
			await this.deps.controller
				.script(job.viewId, `globalThis[${JSON.stringify(cursorId)}]?.()`)
				.catch(() => {});
			try {
				await sink?.end();
			} catch {}
			encoder?.dispose();
			await connection?.close();
			await this.deps
				.workbench({
					action: "capture",
					captureId: job.state.id,
					workspaceId: job.scope.workspaceId,
					tabId: job.state.tabId,
					viewport: null,
				})
				.catch(() => {});
			if (job.artifact && job.state.phase === "finalizing") {
				try {
					cancel.throwIfAborted();
					const completed = await this.deps.completed(
						job.scope,
						command,
						{ recording: { ...job.state, phase: "completed" }, temporaryArtifact: job.artifact },
						cancel,
					);
					job.state = completed.recording ?? { ...job.state, phase: "completed" };
				} catch (error) {
					job.state.phase = cancel.aborted ? "cancelled" : "failed";
					if (!cancel.aborted)
						job.state.error = error instanceof Error ? error.message : "Saving recording failed";
				}
			}
			if (job.state.phase === "cancelled") job.artifact = undefined;
			lifecycle?.();
			if (!job.artifact && temporaryPath) await rm(temporaryPath, { force: true });
			await this.publish(job).catch(() => {});
			setTimeout(
				() => {
					this.jobs.delete(job.state.id);
					if (temporaryPath) void rm(temporaryPath, { force: true }).catch(() => {});
				},
				10 * 60 * 1000,
			).unref();
		}
	}
	private async step(
		page: Page,
		step: BrowserRecordingStep,
		signal: AbortSignal,
		pointer: { x: number; y: number },
	) {
		const selector = step.selector ? page.locator(step.selector) : null;
		const duration = step.durationMs ?? 0;
		if (!Number.isFinite(duration) || duration < 0 || duration > 90000)
			throw new Error("Invalid recording action duration");
		const animate = async (
			from: { x: number; y: number },
			to: { x: number; y: number },
			apply: (x: number, y: number) => Promise<void>,
		) => {
			if (![from.x, from.y, to.x, to.y].every(Number.isFinite))
				throw new Error("Invalid recording coordinates");
			const count = Math.max(1, Math.ceil(duration / 25));
			for (let index = 1; index <= count; index++) {
				signal.throwIfAborted();
				const progress = index / count;
				const eased = progress * progress * (3 - 2 * progress);
				await apply(from.x + (to.x - from.x) * eased, from.y + (to.y - from.y) * eased);
				if (duration) await delay(duration / count, signal);
			}
		};
		const selectorPoint = async () => {
			if (!selector) throw new Error("Recording action requires a selector");
			await selector.scrollIntoViewIfNeeded();
			const box = await selector.boundingBox();
			if (!box) throw new Error("Recording target is not visible");
			return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
		};
		if (step.type === "wait") return delay(step.durationMs ?? 500, signal);
		if (step.type === "move" || step.type === "hover") {
			const target = selector
				? await selectorPoint()
				: { x: step.x ?? Number.NaN, y: step.y ?? Number.NaN };
			await animate({ ...pointer }, target, (x, y) => page.mouse.move(x, y));
			Object.assign(pointer, target);
			return;
		}
		if (step.type === "drag") {
			const path = step.path ?? [
				{ x: step.x ?? Number.NaN, y: step.y ?? Number.NaN },
				{ x: step.toX ?? Number.NaN, y: step.toY ?? Number.NaN },
			];
			if (
				path.length < 2 ||
				path.length > 500 ||
				path.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))
			)
				throw new Error("Invalid recording drag path");
			const first = path[0];
			if (!first) throw new Error("Empty drag path");
			await page.mouse.move(first.x, first.y);
			Object.assign(pointer, first);
			await page.mouse.down();
			try {
				for (const point of path.slice(1)) {
					signal.throwIfAborted();
					await page.mouse.move(point.x, point.y);
					Object.assign(pointer, point);
					if (duration) await delay(duration / (path.length - 1), signal);
				}
			} finally {
				await page.mouse.up().catch(() => this.deps.releasePointer(page, pointer.x, pointer.y));
			}
			return;
		}
		if (step.type === "scroll" || step.type === "scrollTo") {
			const from = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
			const to =
				step.type === "scroll"
					? { x: from.x + (step.deltaX ?? 0), y: from.y + (step.deltaY ?? 0) }
					: selector
						? await selector.evaluate((element) => {
								const rect = element.getBoundingClientRect();
								return { x: scrollX + rect.x, y: scrollY + rect.y };
							})
						: { x: step.x ?? from.x, y: step.y ?? from.y };
			await animate(from, to, (x, y) =>
				page.evaluate((position) => scrollTo(position.x, position.y), { x, y }),
			);
			return;
		}
		if (step.type === "wheel") {
			const times = step.times ?? 1;
			if (!Number.isInteger(times) || times < 1 || times > 100)
				throw new Error("Invalid recording wheel count");
			for (let index = 0; index < times; index++) {
				signal.throwIfAborted();
				await page.mouse.wheel(step.deltaX ?? 0, step.deltaY ?? 0);
				if (step.intervalMs) await delay(step.intervalMs, signal);
			}
			return;
		}
		if (step.type === "click")
			Object.assign(pointer, selector ? await selectorPoint() : { x: step.x, y: step.y });
		const action = step.type === "type" ? "fill" : step.doubleClick ? "dblclick" : step.type;
		await this.deps.operate(
			page,
			{
				action,
				locator: step.selector ? { selector: step.selector } : undefined,
				text: step.text,
				x: step.x,
				y: step.y,
				button: step.button,
				state: step.state,
				timeoutMs: Math.min(step.timeoutMs ?? 5000, 30000),
			},
			signal,
		);
	}
	async release(scope: BrowserScope) {
		const jobs = [...this.jobs.values()].filter(
			(job) =>
				job.scope.workspaceId === scope.workspaceId &&
				job.scope.sessionId === scope.sessionId &&
				["preparing", "capturing", "finalizing"].includes(job.state.phase),
		);
		for (const job of jobs) {
			job.cancel.abort();
			job.stop.abort();
		}
		await Promise.all(jobs.map((job) => job.done));
	}
	async dispose() {
		for (const job of this.jobs.values()) {
			job.cancel.abort();
			job.stop.abort();
		}
		await Promise.all([...this.jobs.values()].map((job) => job.done));
		this.jobs.clear();
	}
}
