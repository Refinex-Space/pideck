import type { SpeechFailure, SpeechModel } from "@thinkrail/contracts";
import type { MessageKey } from "@thinkrail/locales";
import { useT } from "@thinkrail/locales/react";
import { Button, IconButton } from "@thinkrail/ui/button";
import { PopoverTrigger } from "@thinkrail/ui/popover";
import { Check, Download, Trash2 } from "lucide-react";
import { useState } from "react";
import { formatBytes, speechActions, useSpeechStatus } from "@/speech";
import { toast } from "@/store";
import { errorText } from "@/transport";
import { ConfirmPopover } from "./ConfirmPopover";
import { SettingsGroup, SettingsPageContainer } from "./SettingsGroup";
import { SettingsNotice } from "./SettingsNotice";
import { SettingsRow } from "./SettingsRow";

const FAILURE_TEXT = {
	network: "speech.failure.network",
	integrity: "speech.failure.integrity",
	disk: "speech.failure.disk",
} as const satisfies Record<SpeechFailure, MessageKey>;

const LANGUAGE_TEXT = {
	en: "speech.language.en",
	zh: "speech.language.zh",
} as const satisfies Record<SpeechModel["languages"][number], MessageKey>;

function ModelRow({
	model,
	active,
	busy,
	onRun,
}: {
	model: SpeechModel;
	active: boolean;
	busy: boolean;
	onRun: (action: () => Promise<unknown>) => void;
}) {
	const t = useT();
	const [confirming, setConfirming] = useState(false);
	const percent = Math.floor((model.downloadedBytes / model.sizeBytes) * 100);
	const languages = model.languages.map((language) => t(LANGUAGE_TEXT[language])).join(" · ");
	const facts = t("speech.model.facts", {
		languages,
		size: formatBytes(model.sizeBytes),
		source: model.source,
	});
	const failure = model.failure ? t(FAILURE_TEXT[model.failure]) : null;
	return (
		<SettingsRow
			testId={`speech-model-${model.id}`}
			label={model.name}
			description={
				<>
					<span>{facts}</span>
					{failure ? (
						<span role="alert" className="mt-2 block text-feedback-error">
							{failure}
						</span>
					) : null}
				</>
			}
			control={
				model.state === "downloading" ? (
					<div className="flex items-center gap-12">
						<progress
							data-testid="speech-progress"
							aria-label={t("speech.progress", { name: model.name })}
							max={model.sizeBytes}
							value={model.downloadedBytes}
							className="h-4 w-160 overflow-hidden rounded-full [&::-moz-progress-bar]:bg-feedback-info [&::-webkit-progress-bar]:bg-control-bg-selected [&::-webkit-progress-value]:bg-feedback-info"
						/>
						<span className="w-40 text-right tr-text-metadata text-text-muted tabular-nums">
							{percent}%
						</span>
						<Button
							variant="outline"
							data-testid="speech-cancel"
							onClick={() => onRun(() => speechActions.cancelDownload(model.id))}
						>
							{t("speech.cancel")}
						</Button>
					</div>
				) : model.state === "ready" ? (
					<div className="flex items-center gap-8">
						{active ? (
							<span
								data-testid="speech-active"
								className="flex items-center gap-4 px-8 tr-text-ui text-text-muted"
							>
								<Check aria-hidden className="size-16" />
								{t("speech.inUse")}
							</span>
						) : (
							<Button
								variant="outline"
								data-testid="speech-use"
								disabled={busy}
								onClick={() => onRun(() => speechActions.select(model.id))}
							>
								{t("speech.use")}
							</Button>
						)}
						<ConfirmPopover
							open={confirming}
							onOpenChange={setConfirming}
							title={t("speech.deleteTitle", { name: model.name })}
							description={t("speech.deleteDescription", { size: formatBytes(model.sizeBytes) })}
							confirmLabel={t("speech.delete")}
							destructive
							confirmTestId="speech-delete-confirm"
							onConfirm={() => onRun(() => speechActions.remove(model.id))}
							align="end"
						>
							<PopoverTrigger asChild>
								<IconButton
									icon={Trash2}
									data-testid="speech-delete"
									label={t("speech.deleteLabel", { name: model.name })}
									disabled={busy}
								/>
							</PopoverTrigger>
						</ConfirmPopover>
					</div>
				) : (
					<Button
						variant="outline"
						iconLeft={Download}
						data-testid="speech-download"
						disabled={busy}
						onClick={() => onRun(() => speechActions.download(model.id))}
					>
						{model.state === "failed" ? t("speech.retry") : t("speech.download")}
					</Button>
				)
			}
		/>
	);
}

export function SpeechSettings() {
	const t = useT();
	const status = useSpeechStatus();
	const [busy, setBusy] = useState(false);
	const run = (action: () => Promise<unknown>) => {
		setBusy(true);
		action()
			.catch((error: unknown) => toast.error(errorText(error), t("speech.actionFailed")))
			.finally(() => setBusy(false));
	};
	return (
		<SettingsPageContainer testId="settings-speech">
			<SettingsGroup title={t("speech.title")} description={t("speech.intro")}>
				{status?.engine === "unavailable" ? (
					<SettingsNotice variant="warning" testId="speech-engine-unavailable" className="my-12">
						{t("speech.engineUnavailable")}
					</SettingsNotice>
				) : null}
				{status ? (
					status.models.map((model) => (
						<ModelRow
							key={model.id}
							model={model}
							active={model.id === status.activeModelId}
							busy={busy}
							onRun={run}
						/>
					))
				) : (
					<p role="status" className="py-16 tr-text-metadata text-text-muted">
						{t("speech.loading")}
					</p>
				)}
			</SettingsGroup>
			<SettingsGroup title={t("speech.privacyTitle")}>
				<p className="py-12 tr-text-metadata text-text-muted">{t("speech.privacy")}</p>
			</SettingsGroup>
		</SettingsPageContainer>
	);
}
