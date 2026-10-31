import { join } from "node:path";
import { dataDir } from "../persistence";
import { SPEECH_CATALOG } from "./catalog";
import { SpeechService } from "./service";
import { createSherpaEngine } from "./sherpaEngine";

export type { SpeechServiceDeps } from "./service";
export { SpeechService } from "./service";

let service: SpeechService | undefined;

/** The host's one speech service, built on first use so a host that never dictates never loads WASM. */
export function speechService(): SpeechService {
	service ??= new SpeechService({
		root: () => join(dataDir(), "models", "speech"),
		catalog: SPEECH_CATALOG,
		fetch,
		engine: createSherpaEngine(),
	});
	return service;
}

/** Test seam: replace the service before the host boots (see `fake.ts`, used by the e2e host). */
export function setSpeechService(next: SpeechService | undefined): void {
	service?.dispose();
	service = next;
}
