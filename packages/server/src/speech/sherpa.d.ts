declare module "sherpa-onnx" {
	interface OnlineStream {
		acceptWaveform(sampleRate: number, samples: Float32Array): void;
		inputFinished(): void;
		free(): void;
	}
	interface OnlineRecognizer {
		createStream(): OnlineStream;
		isReady(stream: OnlineStream): boolean;
		decode(stream: OnlineStream): void;
		getResult(stream: OnlineStream): { text: string };
		free(): void;
	}
	export function createOnlineRecognizer(config: {
		featConfig: { sampleRate: number; featureDim: number };
		modelConfig: {
			transducer: { encoder: string; decoder: string; joiner: string };
			tokens: string;
			numThreads: number;
			provider: string;
			debug: number;
		};
		decodingMethod: string;
		enableEndpoint: number;
	}): OnlineRecognizer;
}
