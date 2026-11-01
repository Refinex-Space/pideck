import { useT } from "@thinkrail/locales/react";
import { selectAnalyticsConsentSupported, toast, useAppStore } from "@/store";
import { getTransport } from "@/transport";
import { SettingsGroup } from "./SettingsGroup";
import { SETTINGS_CARD, SettingsRow } from "./SettingsRow";
import { SettingsSwitch } from "./SettingsSwitch";
import { useAnalyticsConsent } from "./useAnalyticsConsent";

export function PrivacySettings() {
	const t = useT();
	const supported = useAppStore(selectAnalyticsConsentSupported);
	const protocolVersion = useAppStore((s) => s.protocolVersion);
	if (protocolVersion === null) {
		return (
			<div data-testid="settings-privacy" className={SETTINGS_CARD}>
				<div className="flex items-center justify-between gap-12 border-border-muted border-b py-12">
					<span className="tr-text-ui text-text-default">{t("settings.privacy.title")}</span>
					<span className="text-text-muted tr-text-metadata">
						{t("settings.privacy.connectToManage")}
					</span>
				</div>
			</div>
		);
	}
	return supported ? <AdditionalAnalyticsSettings /> : <LegacyPrivacySettings />;
}

function AdditionalAnalyticsSettings() {
	const t = useT();
	const enabled = useAppStore((s) => s.analyticsEnabled);
	const { pending, error, save } = useAnalyticsConsent();

	return (
		<SettingsGroup
			testId="settings-privacy"
			title={t("settings.privacy.title")}
			description={t("panels.analytics.description")}
		>
			<SettingsRow
				label={t("panels.analytics.shareLabel")}
				description={t("panels.analytics.shareDescription")}
				control={
					<SettingsSwitch
						checked={enabled}
						disabled={pending}
						label={t("panels.analytics.shareLabel")}
						testId="analytics-toggle"
						onChange={save}
					/>
				}
			/>
			<p className="py-12 tr-text-metadata text-text-muted">
				{t("panels.analytics.reportDetails")}
			</p>
			{error && (
				<p
					role="alert"
					className="border-border-muted border-t py-12 tr-text-metadata text-feedback-error"
				>
					{error}
				</p>
			)}
		</SettingsGroup>
	);
}

function LegacyPrivacySettings() {
	const t = useT();
	const enabled = useAppStore((s) => s.analyticsEnabled);

	const setEnabled = (analyticsEnabled: boolean) => {
		getTransport()
			.request("settings.update", { config: { analyticsEnabled } })
			.catch(() => toast.error(t("settings.privacy.changeFailed")));
	};

	return (
		<SettingsGroup
			testId="settings-privacy"
			title={t("settings.privacy.title")}
			description={t("panels.analytics.description")}
		>
			<SettingsRow
				label={t("settings.privacy.share")}
				control={
					<SettingsSwitch
						checked={enabled}
						label={t("settings.privacy.share")}
						testId="analytics-toggle"
						onChange={setEnabled}
					/>
				}
			/>
		</SettingsGroup>
	);
}
