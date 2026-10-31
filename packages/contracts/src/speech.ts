export type SpeechLanguage = "en" | "zh";

/** `failed` is a download that stopped on its own; a user cancel returns to `absent`. */
export type SpeechModelState = "absent" | "downloading" | "ready" | "failed";

export type SpeechFailure = "network" | "integrity" | "disk";

export interface SpeechModel {
	id: string;
	name: string;
	languages: SpeechLanguage[];
	sizeBytes: number;
	/** Host the files are fetched from, shown so the user knows where the download goes. */
	source: string;
	state: SpeechModelState;
	downloadedBytes: number;
	failure?: SpeechFailure;
}

export interface SpeechStatus {
	/** `unavailable` when the host cannot load its recognizer runtime; models can still be managed. */
	engine: "ready" | "unavailable";
	models: SpeechModel[];
	/** The ready model dictation uses: the stored choice, else the first ready model. */
	activeModelId: string | null;
}

export interface DictationStarted {
	dictationId: string;
	/** Mono 16-bit little-endian PCM at this rate is what `speech.dictationAudio` expects. */
	sampleRate: number;
}

export interface DictationResult {
	text: string;
}
