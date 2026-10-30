import { AGENT_ACTIVITY_PROTOCOL_VERSION } from "@thinkrail/contracts";
import type { MessageKey } from "@thinkrail/locales";
import { useT } from "@thinkrail/locales/react";
import { type FileActivityPreferences, useAppStore } from "../store";
import { SettingsGroup } from "./SettingsGroup";
import { SettingsRow } from "./SettingsRow";
import { SettingsSwitch } from "./SettingsSwitch";

const ROWS: readonly {
	key: Exclude<keyof FileActivityPreferences, "enabled">;
	label: MessageKey;
	description: MessageKey;
}[] = [
	{
		key: "follow",
		label: "settings.fileActivity.follow",
		description: "settings.fileActivity.followDescription",
	},
	{
		key: "expand",
		label: "settings.fileActivity.expand",
		description: "settings.fileActivity.expandDescription",
	},
	{
		key: "reads",
		label: "settings.fileActivity.reads",
		description: "settings.fileActivity.readsDescription",
	},
	{
		key: "writes",
		label: "settings.fileActivity.writes",
		description: "settings.fileActivity.writesDescription",
	},
	{
		key: "subagents",
		label: "settings.fileActivity.subagents",
		description: "settings.fileActivity.subagentsDescription",
	},
	{
		key: "shell",
		label: "settings.fileActivity.shell",
		description: "settings.fileActivity.shellDescription",
	},
	{
		key: "timeline",
		label: "settings.fileActivity.timeline",
		description: "settings.fileActivity.timelineDescription",
	},
	{
		key: "openFiles",
		label: "settings.fileActivity.openFiles",
		description: "settings.fileActivity.openFilesDescription",
	},
];

/**
 * What the Files tree shows of the agent's work. These are viewing choices kept in this client, like
 * the chat's, so they have no host round trip; subagent activity needs a host that reports it.
 */
export function FileActivitySettings() {
	const t = useT();
	const preferences = useAppStore((state) => state.fileActivityPreferences);
	const protocolVersion = useAppStore((state) => state.protocolVersion);
	const subagentsSupported = (protocolVersion ?? 0) >= AGENT_ACTIVITY_PROTOCOL_VERSION;
	const set = (patch: Partial<FileActivityPreferences>) =>
		useAppStore.getState().setFileActivityPreferences({ ...preferences, ...patch });
	return (
		<SettingsGroup title={t("settings.fileActivity.group")} testId="settings-file-activity">
			<SettingsRow
				label={t("settings.fileActivity.enabled")}
				description={t("settings.fileActivity.enabledDescription")}
				control={
					<SettingsSwitch
						checked={preferences.enabled}
						label={t("settings.fileActivity.enabled")}
						testId="file-activity-enabled"
						onChange={(enabled) => set({ enabled })}
					/>
				}
			/>
			{ROWS.map((row) => {
				const unavailable = row.key === "subagents" && !subagentsSupported;
				return (
					<SettingsRow
						key={row.key}
						label={t(row.label)}
						description={
							unavailable ? t("settings.fileActivity.subagentsUnavailable") : t(row.description)
						}
						control={
							<SettingsSwitch
								checked={preferences[row.key]}
								disabled={!preferences.enabled || unavailable}
								label={t(row.label)}
								testId={`file-activity-${row.key}`}
								onChange={(value) => set({ [row.key]: value })}
							/>
						}
					/>
				);
			})}
		</SettingsGroup>
	);
}
