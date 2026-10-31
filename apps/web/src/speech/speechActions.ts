import type { SpeechStatus } from "@thinkrail/contracts";
import { getTransport } from "@/transport";
import { applySpeechStatus } from "./speechStatus";

type ModelAction = "speech.download" | "speech.cancelDownload" | "speech.delete" | "speech.select";

async function run(method: ModelAction, modelId: string): Promise<SpeechStatus> {
	const status = await getTransport().request(method, { modelId });
	applySpeechStatus(status);
	return status;
}

/** Model management is host-owned; each call returns the new status, which the push channel repeats. */
export const speechActions = {
	download: (modelId: string) => run("speech.download", modelId),
	cancelDownload: (modelId: string) => run("speech.cancelDownload", modelId),
	remove: (modelId: string) => run("speech.delete", modelId),
	select: (modelId: string) => run("speech.select", modelId),
};
