export type MicrophoneFailure = "denied" | "unavailable" | "insecure";

export class MicrophoneError extends Error {
	readonly kind: MicrophoneFailure;

	constructor(kind: MicrophoneFailure, options?: ErrorOptions) {
		super(`microphone ${kind}`, options);
		this.name = "MicrophoneError";
		this.kind = kind;
	}
}

export interface Capture {
	stop: () => Promise<void>;
}

/** Chunks arrive at the device's own sample rate, which is reported with every chunk. */
export type StartCapture = (
	onChunk: (samples: Float32Array, sampleRate: number) => void,
) => Promise<Capture>;

const WORKLET_SOURCE = `
class PcmTap extends AudioWorkletProcessor {
	constructor() {
		super();
		this.buffer = new Float32Array(2400);
		this.filled = 0;
	}
	process(inputs) {
		const channel = inputs[0] && inputs[0][0];
		if (!channel) return true;
		for (let i = 0; i < channel.length; i++) {
			this.buffer[this.filled++] = channel[i];
			if (this.filled === this.buffer.length) {
				this.port.postMessage(this.buffer.slice());
				this.filled = 0;
			}
		}
		return true;
	}
}
registerProcessor("pideck-pcm-tap", PcmTap);
`;

function classify(error: unknown): MicrophoneError {
	const name = error instanceof DOMException ? error.name : "";
	if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError")
		return new MicrophoneError("denied", { cause: error });
	return new MicrophoneError("unavailable", { cause: error });
}

/** Microphone → AudioWorklet → mono float chunks. Echo cancellation and noise suppression stay on. */
export const startMicrophoneCapture: StartCapture = async (onChunk) => {
	if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
		throw new MicrophoneError("insecure");
	const stream = await navigator.mediaDevices
		.getUserMedia({
			audio: {
				channelCount: 1,
				echoCancellation: true,
				noiseSuppression: true,
				autoGainControl: true,
			},
		})
		.catch((error: unknown) => {
			throw classify(error);
		});
	const context = new AudioContext();
	const release = async () => {
		for (const track of stream.getTracks()) track.stop();
		await context.close().catch(() => {});
	};
	try {
		const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: "text/javascript" }));
		try {
			await context.audioWorklet.addModule(url);
		} finally {
			URL.revokeObjectURL(url);
		}
		const tap = new AudioWorkletNode(context, "pideck-pcm-tap", { numberOfOutputs: 0 });
		tap.port.onmessage = (event: MessageEvent<Float32Array>) =>
			onChunk(event.data, context.sampleRate);
		context.createMediaStreamSource(stream).connect(tap);
		await context.resume();
		return {
			stop: async () => {
				tap.port.onmessage = null;
				tap.disconnect();
				await release();
			},
		};
	} catch (error) {
		await release();
		throw classify(error);
	}
};
