import type {
	DictationResult,
	DictationStarted,
	WsMethodName,
	WsParams,
	WsResult,
} from "@thinkrail/contracts";
import { MicrophoneError, type MicrophoneFailure, type StartCapture } from "./capture";
import {
	createResampler,
	DICTATION_SAMPLE_RATE,
	floatToPcm16,
	levelOf,
	pcm16ToBase64,
} from "./pcm";

export type DictationPhase = "idle" | "starting" | "listening" | "transcribing";

export type DictationProblem =
	| MicrophoneFailure
	| "modelMissing"
	| "engineUnavailable"
	| "busy"
	| "failed";

export interface DictationSnapshot {
	phase: DictationPhase;
	/** Most recent loudness readings, oldest first, each 0..1, measured from the live microphone signal. */
	levels: readonly number[];
}

export interface DictationRequester {
	request<M extends WsMethodName>(method: M, params: WsParams<M>): Promise<WsResult<M>>;
}

export interface DictationControllerDeps {
	requester: DictationRequester;
	startCapture: StartCapture;
	onText: (text: string) => void;
	onProblem: (problem: DictationProblem) => void;
	onChange: (snapshot: DictationSnapshot) => void;
}

/** Audio is shipped in ~100 ms frames: small enough to stay live, large enough to keep the wire quiet. */
const FRAME_SAMPLES = DICTATION_SAMPLE_RATE / 10;
export const LEVEL_HISTORY = 26;

export function problemOf(error: unknown): DictationProblem {
	if (error instanceof MicrophoneError) return error.kind;
	const code = (error as { errorCode?: string } | null)?.errorCode;
	if (code === "SPEECH_MODEL_MISSING") return "modelMissing";
	if (code === "SPEECH_ENGINE_UNAVAILABLE") return "engineUnavailable";
	if (code === "SPEECH_BUSY") return "busy";
	return "failed";
}

/**
 * One dictation at a time: microphone permission first, then a host session, then ~100 ms PCM frames
 * until stop. Audio captured before the host answers is queued, so nothing said early is lost.
 */
export class DictationController {
	private snapshot: DictationSnapshot = { phase: "idle", levels: [] };
	private run = 0;
	private session: DictationStarted | null = null;
	private sessionReady: Promise<DictationStarted> | null = null;
	private resample: ((input: Float32Array) => Float32Array) | null = null;
	private queue: string[] = [];
	private sending: Promise<void> = Promise.resolve();
	private stopCapture: (() => Promise<void>) | null = null;
	private pending = new Float32Array(0);

	constructor(private readonly deps: DictationControllerDeps) {}

	get state(): DictationSnapshot {
		return this.snapshot;
	}

	async start(): Promise<void> {
		if (this.snapshot.phase !== "idle") return;
		const run = ++this.run;
		this.set({ phase: "starting", levels: [] });
		try {
			const capture = await this.deps.startCapture((chunk, rate) => this.onChunk(run, chunk, rate));
			if (run !== this.run) {
				await capture.stop();
				return;
			}
			this.stopCapture = capture.stop;
			this.set({ phase: "listening", levels: [] });
			const ready = this.deps.requester.request("speech.dictationStart", {});
			this.sessionReady = ready;
			const session = await ready;
			if (run !== this.run) {
				this.discardRemote(session.dictationId);
				return;
			}
			this.session = session;
			this.flush();
		} catch (error) {
			if (run === this.run) await this.fail(error);
		}
	}

	async stop(): Promise<void> {
		if (this.snapshot.phase === "starting") return this.cancel();
		if (this.snapshot.phase !== "listening") return;
		const run = this.run;
		this.set({ phase: "transcribing", levels: this.snapshot.levels });
		try {
			await this.releaseMicrophone();
			const session = await this.sessionReady;
			if (!session) throw new Error("dictation session did not start");
			if (run !== this.run) return;
			this.pushFrame(true);
			await this.sending;
			const result: DictationResult = await this.deps.requester.request("speech.dictationStop", {
				dictationId: session.dictationId,
			});
			if (run !== this.run) return;
			this.finish();
			if (result.text) this.deps.onText(result.text);
		} catch (error) {
			if (run === this.run) await this.fail(error);
		}
	}

	/** Drop the utterance without inserting anything (Escape, unmount, send). */
	cancel(): void {
		if (this.snapshot.phase === "idle") return;
		const session = this.session;
		this.finish();
		if (session) this.discardRemote(session.dictationId);
		void this.releaseMicrophone();
	}

	private onChunk(run: number, chunk: Float32Array, rate: number): void {
		if (run !== this.run || this.snapshot.phase !== "listening") return;
		this.resample ??= createResampler(rate, DICTATION_SAMPLE_RATE);
		const samples = this.resample(chunk);
		const levels = [...this.snapshot.levels, levelOf(samples)].slice(-LEVEL_HISTORY);
		this.set({ phase: "listening", levels });
		const merged = new Float32Array(this.pending.length + samples.length);
		merged.set(this.pending);
		merged.set(samples, this.pending.length);
		this.pending = merged;
		while (this.pending.length >= FRAME_SAMPLES) {
			this.enqueue(this.pending.subarray(0, FRAME_SAMPLES));
			this.pending = this.pending.slice(FRAME_SAMPLES);
		}
		this.flush();
	}

	private pushFrame(final: boolean): void {
		if (final && this.pending.length > 0) {
			this.enqueue(this.pending);
			this.pending = new Float32Array(0);
		}
		this.flush();
	}

	private enqueue(samples: Float32Array): void {
		this.queue.push(pcm16ToBase64(floatToPcm16(samples)));
	}

	private flush(): void {
		const session = this.session;
		if (!session) return;
		for (const pcm16 of this.queue.splice(0)) {
			this.sending = this.sending.then(() =>
				this.deps.requester
					.request("speech.dictationAudio", { dictationId: session.dictationId, pcm16 })
					.then(() => undefined),
			);
			this.sending.catch(() => {});
		}
	}

	private async releaseMicrophone(): Promise<void> {
		const stop = this.stopCapture;
		this.stopCapture = null;
		await stop?.().catch(() => {});
	}

	private discardRemote(dictationId: string): void {
		void this.deps.requester.request("speech.dictationCancel", { dictationId }).catch(() => {});
	}

	private finish(): void {
		this.run++;
		this.session = null;
		this.sessionReady = null;
		this.resample = null;
		this.queue = [];
		this.pending = new Float32Array(0);
		this.sending = Promise.resolve();
		this.set({ phase: "idle", levels: [] });
	}

	private async fail(error: unknown): Promise<void> {
		const session = this.session;
		this.finish();
		if (session) this.discardRemote(session.dictationId);
		await this.releaseMicrophone();
		this.deps.onProblem(problemOf(error));
	}

	private set(next: DictationSnapshot): void {
		this.snapshot = next;
		this.deps.onChange(next);
	}
}
