import { existsSync, readFileSync, statSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { SpeechFailure, SpeechModel, SpeechStatus } from "@thinkrail/contracts";
import { CodedError } from "@thinkrail/shared/codedError";
import { logger } from "../log";
import { type CatalogModel, modelBytes, modelSource } from "./catalog";
import { DownloadFailure, downloadModel, READY_MARKER } from "./download";
import {
	pcm16ToFloat,
	type RecognitionStream,
	type Recognizer,
	SPEECH_SAMPLE_RATE,
	type SpeechEngine,
} from "./engine";

const log = logger("speech");

const PROGRESS_PUBLISH_MS = 250;
const MAX_CHUNK_BYTES = 128 * 1024;
export const MAX_DICTATION_SECONDS = 300;
export const DICTATION_IDLE_MS = 30_000;
const RECOGNIZER_IDLE_MS = 60_000;
const SELECTION_FILE = "selection.json";

export interface SpeechServiceDeps {
	/** Directory holding one sub-directory per installed model, plus the selection record. */
	root: () => string;
	catalog: readonly CatalogModel[];
	fetch: typeof fetch;
	engine: SpeechEngine;
}

interface Download {
	controller: AbortController;
	downloadedBytes: number;
	lastPublish: number;
}

interface Dictation {
	id: string;
	modelId: string;
	stream: RecognitionStream;
	samples: number;
	idle: ReturnType<typeof setTimeout>;
}

export class SpeechService {
	private readonly downloads = new Map<string, Download>();
	private readonly failures = new Map<string, SpeechFailure>();
	private dictation: Dictation | null = null;
	private recognizer: {
		modelId: string;
		ready: Promise<Recognizer>;
		idle?: ReturnType<typeof setTimeout>;
	} | null = null;
	private publisher: (status: SpeechStatus) => void = () => {};
	private engineReady: boolean | null = null;

	constructor(private readonly deps: SpeechServiceDeps) {}

	setPublisher(publisher: (status: SpeechStatus) => void): void {
		this.publisher = publisher;
	}

	async status(): Promise<SpeechStatus> {
		if (this.engineReady === null) this.engineReady = await this.deps.engine.available();
		return this.snapshot();
	}

	async download(modelId: string): Promise<SpeechStatus> {
		const model = this.requireModel(modelId);
		if (this.downloads.has(modelId) || this.isInstalled(model)) return this.status();
		const download: Download = {
			controller: new AbortController(),
			downloadedBytes: 0,
			lastPublish: 0,
		};
		this.downloads.set(modelId, download);
		this.failures.delete(modelId);
		void this.runDownload(model, download);
		return this.status();
	}

	async cancelDownload(modelId: string): Promise<SpeechStatus> {
		this.requireModel(modelId);
		this.downloads.get(modelId)?.controller.abort();
		return this.status();
	}

	async delete(modelId: string): Promise<SpeechStatus> {
		this.requireModel(modelId);
		this.downloads.get(modelId)?.controller.abort();
		if (this.dictation?.modelId === modelId) this.discardDictation();
		if (this.recognizer?.modelId === modelId) this.disposeRecognizer();
		this.failures.delete(modelId);
		await rm(this.modelDir(modelId), { recursive: true, force: true });
		if (this.storedSelection() === modelId) await this.storeSelection(null);
		return this.publish();
	}

	async select(modelId: string): Promise<SpeechStatus> {
		const model = this.requireModel(modelId);
		if (!this.isInstalled(model))
			throw new CodedError("SPEECH_MODEL_MISSING", "Model is not downloaded.");
		await this.storeSelection(modelId);
		return this.publish();
	}

	async dictationStart(): Promise<{ dictationId: string; sampleRate: number }> {
		if (this.dictation) throw new CodedError("SPEECH_BUSY", "Another dictation is running.");
		const modelId = this.activeModelId();
		if (!modelId) throw new CodedError("SPEECH_MODEL_MISSING", "No speech model is downloaded.");
		await this.status();
		const unavailable = new CodedError(
			"SPEECH_ENGINE_UNAVAILABLE",
			"The speech runtime could not be loaded.",
		);
		if (this.engineReady === false) throw unavailable;
		const recognizer = await this.recognizerFor(modelId).catch((error: unknown) => {
			log.warn(`speech model ${modelId} failed to load`, error);
			throw unavailable;
		});
		if (this.dictation) throw new CodedError("SPEECH_BUSY", "Another dictation is running.");
		const id = crypto.randomUUID();
		this.dictation = {
			id,
			modelId,
			stream: recognizer.createStream(),
			samples: 0,
			idle: this.armIdle(id),
		};
		return { dictationId: id, sampleRate: SPEECH_SAMPLE_RATE };
	}

	dictationAudio(dictationId: string, pcm16: string): void {
		const dictation = this.requireDictation(dictationId);
		const bytes = Buffer.from(pcm16, "base64");
		if (bytes.byteLength > MAX_CHUNK_BYTES) throw new Error("Audio chunk is too large.");
		const samples = pcm16ToFloat(bytes);
		dictation.samples += samples.length;
		if (dictation.samples > MAX_DICTATION_SECONDS * SPEECH_SAMPLE_RATE) {
			this.discardDictation();
			throw new Error("Dictation exceeded the maximum length.");
		}
		dictation.stream.accept(samples);
		clearTimeout(dictation.idle);
		dictation.idle = this.armIdle(dictationId);
	}

	dictationStop(dictationId: string): { text: string } {
		const dictation = this.requireDictation(dictationId);
		this.dictation = null;
		clearTimeout(dictation.idle);
		this.touchRecognizer();
		return { text: dictation.stream.finish() };
	}

	dictationCancel(dictationId: string): void {
		if (this.dictation?.id === dictationId) this.discardDictation();
	}

	dispose(): void {
		for (const download of this.downloads.values()) download.controller.abort();
		this.discardDictation();
		this.disposeRecognizer();
	}

	private async runDownload(model: CatalogModel, download: Download): Promise<void> {
		try {
			await mkdir(this.deps.root(), { recursive: true });
			await downloadModel({
				model,
				dir: this.modelDir(model.id),
				fetch: this.deps.fetch,
				signal: download.controller.signal,
				onProgress: (bytes) => {
					download.downloadedBytes = bytes;
					const now = Date.now();
					if (now - download.lastPublish < PROGRESS_PUBLISH_MS) return;
					download.lastPublish = now;
					this.publish();
				},
			});
			if (!this.storedSelection() && !this.activeModelId()) await this.storeSelection(model.id);
		} catch (error) {
			if (!download.controller.signal.aborted) {
				const failure = error instanceof DownloadFailure ? error.failure : "disk";
				this.failures.set(model.id, failure);
				log.warn(`speech model ${model.id} download failed (${failure})`, error);
			}
		} finally {
			this.downloads.delete(model.id);
			this.publish();
		}
	}

	private snapshot(): SpeechStatus {
		return {
			engine: this.engineReady === false ? "unavailable" : "ready",
			models: this.deps.catalog.map((model) => this.describe(model)),
			activeModelId: this.activeModelId(),
		};
	}

	private describe(model: CatalogModel): SpeechModel {
		const base = {
			id: model.id,
			name: model.name,
			languages: [...model.languages],
			sizeBytes: modelBytes(model),
			source: modelSource(model),
		};
		const download = this.downloads.get(model.id);
		if (download)
			return { ...base, state: "downloading", downloadedBytes: download.downloadedBytes };
		if (this.isInstalled(model))
			return { ...base, state: "ready", downloadedBytes: base.sizeBytes };
		const failure = this.failures.get(model.id);
		return failure
			? { ...base, state: "failed", downloadedBytes: 0, failure }
			: { ...base, state: "absent", downloadedBytes: 0 };
	}

	private publish(): SpeechStatus {
		const status = this.snapshot();
		this.publisher(status);
		return status;
	}

	private requireModel(modelId: string): CatalogModel {
		const model = this.deps.catalog.find((candidate) => candidate.id === modelId);
		if (!model) throw new Error(`Unknown speech model: ${modelId}`);
		return model;
	}

	private modelDir(modelId: string): string {
		return join(this.deps.root(), modelId);
	}

	private isInstalled(model: CatalogModel): boolean {
		const dir = this.modelDir(model.id);
		return (
			existsSync(join(dir, READY_MARKER)) &&
			model.files.every((file) => {
				try {
					return statSync(join(dir, file.name)).size === file.size;
				} catch {
					return false;
				}
			})
		);
	}

	private activeModelId(): string | null {
		const stored = this.storedSelection();
		const installed = this.deps.catalog.filter((model) => this.isInstalled(model));
		return installed.find((model) => model.id === stored)?.id ?? installed[0]?.id ?? null;
	}

	private storedSelection(): string | null {
		try {
			const value = JSON.parse(readFileSync(join(this.deps.root(), SELECTION_FILE), "utf8")) as {
				selected?: unknown;
			};
			return typeof value.selected === "string" ? value.selected : null;
		} catch {
			return null;
		}
	}

	private async storeSelection(modelId: string | null): Promise<void> {
		await mkdir(this.deps.root(), { recursive: true });
		await writeFile(
			join(this.deps.root(), SELECTION_FILE),
			`${JSON.stringify({ selected: modelId })}\n`,
		);
	}

	private requireDictation(dictationId: string): Dictation {
		if (this.dictation?.id !== dictationId)
			throw new CodedError("SPEECH_DICTATION_UNKNOWN", "Dictation is not active.");
		return this.dictation;
	}

	private armIdle(dictationId: string): ReturnType<typeof setTimeout> {
		const timer = setTimeout(() => this.dictationCancel(dictationId), DICTATION_IDLE_MS);
		timer.unref?.();
		return timer;
	}

	private discardDictation(): void {
		const dictation = this.dictation;
		if (!dictation) return;
		this.dictation = null;
		clearTimeout(dictation.idle);
		dictation.stream.discard();
		this.touchRecognizer();
	}

	private recognizerFor(modelId: string): Promise<Recognizer> {
		if (this.recognizer?.modelId !== modelId) {
			this.disposeRecognizer();
			const ready = this.deps.engine.load(this.modelDir(modelId));
			this.recognizer = { modelId, ready };
			ready.catch(() => {
				if (this.recognizer?.ready === ready) this.recognizer = null;
			});
		}
		clearTimeout(this.recognizer?.idle);
		return this.recognizer.ready;
	}

	private touchRecognizer(): void {
		const current = this.recognizer;
		if (!current) return;
		clearTimeout(current.idle);
		current.idle = setTimeout(() => {
			if (!this.dictation && this.recognizer === current) this.disposeRecognizer();
		}, RECOGNIZER_IDLE_MS);
		current.idle.unref?.();
	}

	private disposeRecognizer(): void {
		const current = this.recognizer;
		this.recognizer = null;
		if (!current) return;
		clearTimeout(current.idle);
		current.ready.then(
			(recognizer) => recognizer.dispose(),
			() => {},
		);
	}
}
