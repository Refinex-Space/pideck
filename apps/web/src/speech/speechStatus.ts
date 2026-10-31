import { SPEECH_PROTOCOL_VERSION, type SpeechStatus, WS_CHANNELS } from "@thinkrail/contracts";
import { useEffect } from "react";
import { create } from "zustand";
import { useAppStore } from "@/store";
import { getTransport } from "@/transport";

interface SpeechStatusState {
	status: SpeechStatus | null;
}

const useSpeechStatusStore = create<SpeechStatusState>(() => ({ status: null }));

export const applySpeechStatus = (status: SpeechStatus): void =>
	useSpeechStatusStore.setState({ status });

let consumers = 0;
let unsubscribe: (() => void) | null = null;

function connect(): void {
	const transport = getTransport();
	unsubscribe = transport.subscribe(WS_CHANNELS.speechStatus, (data) =>
		applySpeechStatus(data as SpeechStatus),
	);
}

/** Whether the connected host speaks the dictation protocol; older hosts show no voice UI at all. */
export function useSpeechSupported(): boolean {
	const version = useAppStore((state) => state.protocolVersion);
	return version !== null && version >= SPEECH_PROTOCOL_VERSION;
}

/** The host's speech state: one shared push subscription for every mounted consumer, re-read on reconnect. */
export function useSpeechStatus(): SpeechStatus | null {
	const supported = useSpeechSupported();
	const generation = useAppStore((state) => state.connectionGeneration);
	const status = useSpeechStatusStore((state) => state.status);
	useEffect(() => {
		if (!supported) return;
		if (consumers++ === 0) connect();
		return () => {
			if (--consumers === 0) {
				unsubscribe?.();
				unsubscribe = null;
			}
		};
	}, [supported]);
	useEffect(() => {
		if (!supported) return;
		let current = true;
		getTransport()
			.request("speech.get", {})
			.then((next) => current && applySpeechStatus(next))
			.catch(() => {});
		return () => {
			current = false;
		};
	}, [supported, generation]);
	return supported ? status : null;
}
