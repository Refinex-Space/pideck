import type { BrowserRecordingState } from "@thinkrail/contracts";
import { useT } from "@thinkrail/locales/react";
import { Button, IconButton } from "@thinkrail/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@thinkrail/ui/dialog";
import { Copy, Play, X } from "lucide-react";
import { useEffect, useState } from "react";
import { copyText } from "../lib";
import { resourceBytesUrl } from "../panels/resourcePane";
import { toast } from "../store";
import { nativeBrowserBridge, updateBrowserTab } from "./state";

const PHASE_LABELS = {
	preparing: "browser.recording.preparing",
	capturing: "browser.recording.capturing",
	finalizing: "browser.recording.finalizing",
	completed: "browser.recording.completed",
	cancelled: "browser.recording.cancelled",
	failed: "browser.recording.failed",
} as const;

export function recordingActive(recording: BrowserRecordingState | undefined): boolean {
	return !!recording && ["preparing", "capturing", "finalizing"].includes(recording.phase);
}
export async function recordingCommand(
	workspaceId: string,
	tabId: string,
	action: "recordingStart" | "recordingStop" | "recordingCancel",
	recordingId?: string,
	viewport?: { width: number; height: number },
) {
	const result = await nativeBrowserBridge()?.command(workspaceId, {
		action,
		tabId,
		...(recordingId ? { recordingId } : {}),
		...(viewport ? { viewport } : {}),
	});
	if (result?.recording) updateBrowserTab(workspaceId, tabId, { recording: result.recording });
}
export function BrowserRecording({
	workspaceId,
	tabId,
	recording,
}: {
	workspaceId: string;
	tabId: string;
	recording: BrowserRecordingState | undefined;
}) {
	const t = useT();
	const [preview, setPreview] = useState(false);
	const [busy, setBusy] = useState(false);
	const [now, setNow] = useState(() => Date.now());
	const active = recordingActive(recording);
	useEffect(() => {
		if (!active) return;
		const timer = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(timer);
	}, [active]);
	if (!recording || recording.phase === "cancelled") return null;
	const elapsed = Math.max(0, Math.floor((now - recording.startedAt) / 1000));
	const run = (action: "recordingStop" | "recordingCancel") => {
		setBusy(true);
		void recordingCommand(workspaceId, tabId, action, recording.id)
			.catch((error) => toast.error(String(error)))
			.finally(() => setBusy(false));
	};
	const artifact = recording.artifact;
	const url = artifact ? resourceBytesUrl(workspaceId, artifact.path) : undefined;
	return (
		<>
			<div
				role="status"
				className="flex shrink-0 items-center gap-8 border-b border-border-muted px-8 py-4 text-text-muted tr-text-caption"
				data-testid="browser-recording-status"
			>
				<span className="min-w-0 flex-1 truncate">
					{t(PHASE_LABELS[recording.phase])}
					{recording.error ? ` · ${recording.error}` : ""}
				</span>
				{recording.phase === "capturing" && (
					<span className="tabular-nums">
						{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
					</span>
				)}
				{active && (
					<IconButton
						icon={X}
						size="s"
						label={t("browser.cancelRecording")}
						disabled={busy || recording.phase === "finalizing"}
						onClick={() => run("recordingCancel")}
					/>
				)}
				{artifact && (
					<Button size="s" variant="ghost" onClick={() => setPreview(true)}>
						<Play className="size-14" />
						{t("browser.previewRecording")}
					</Button>
				)}
			</div>
			<Dialog open={preview} onOpenChange={setPreview}>
				<DialogContent className="max-w-3xl">
					<DialogHeader>
						<DialogTitle>{t("browser.previewRecording")}</DialogTitle>
						<DialogDescription>{artifact?.path}</DialogDescription>
					</DialogHeader>
					{url && (
						<video
							controls
							playsInline
							preload="metadata"
							className="aspect-video w-full rounded-md bg-container-content-bg object-contain"
							aria-label={t("browser.previewRecording")}
						>
							<source src={url} type="video/webm" />
							<track kind="captions" />
						</video>
					)}
					<div className="flex justify-end">
						<Button
							variant="ghost"
							onClick={() => {
								if (artifact) void copyText(artifact.path);
							}}
						>
							<Copy className="size-14" />
							{t("browser.copyRecordingPath")}
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
}
