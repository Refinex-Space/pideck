import type { MessageKey } from "@thinkrail/locales";
import { useT } from "@thinkrail/locales/react";
import { useEffect, useRef, useState } from "react";
import { SettingsSection, toast, useAppStore } from "@/store";
import { getTransport } from "@/transport";
import { startMicrophoneCapture } from "./capture";
import {
	DictationController,
	type DictationPhase,
	type DictationProblem,
	type DictationSnapshot,
} from "./dictationController";

const PROBLEM_TEXT = {
	denied: "speech.problem.denied",
	unavailable: "speech.problem.unavailable",
	insecure: "speech.problem.insecure",
	modelMissing: "speech.problem.modelMissing",
	engineUnavailable: "speech.problem.engineUnavailable",
	busy: "speech.problem.busy",
	failed: "speech.problem.failed",
} as const satisfies Record<DictationProblem, MessageKey>;

const IDLE: DictationSnapshot = { phase: "idle", levels: [] };

export interface Dictation {
	phase: DictationPhase;
	levels: readonly number[];
	/** Start when idle, stop and transcribe while listening; ignored while transcribing. */
	toggle: () => void;
	cancel: () => void;
}

/** Composer-facing dictation: owns one controller for the mounted composer and drops it on unmount. */
export function useDictation(onText: (text: string) => void, modelReady: boolean): Dictation {
	const t = useT();
	const [snapshot, setSnapshot] = useState<DictationSnapshot>(IDLE);
	const latest = useRef({ onText, modelReady, t });
	useEffect(() => {
		latest.current = { onText, modelReady, t };
	});
	const [controller] = useState(
		() =>
			new DictationController({
				requester: { request: (method, params) => getTransport().request(method, params) },
				startCapture: startMicrophoneCapture,
				onText: (text) => latest.current.onText(text),
				onChange: setSnapshot,
				onProblem: (problem) => {
					if (problem === "modelMissing")
						useAppStore.getState().openSettings(SettingsSection.Speech);
					toast.error(latest.current.t(PROBLEM_TEXT[problem]));
				},
			}),
	);
	useEffect(() => () => controller.cancel(), [controller]);
	return {
		phase: snapshot.phase,
		levels: snapshot.levels,
		toggle: () => {
			if (snapshot.phase === "idle") {
				if (!latest.current.modelReady) {
					useAppStore.getState().openSettings(SettingsSection.Speech);
					toast.info(latest.current.t(PROBLEM_TEXT.modelMissing));
					return;
				}
				void controller.start();
			} else if (snapshot.phase === "listening") void controller.stop();
			else if (snapshot.phase === "starting") controller.cancel();
		},
		cancel: () => controller.cancel(),
	};
}
