import { RiSearchLine as Search } from "@remixicon/react";
import { useT } from "@thinkrail/locales/react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@thinkrail/ui/dialog";
import { cn } from "@thinkrail/ui/utils";
import { type ReactNode, useEffect, useState } from "react";
import { SettingsSection, useAppStore } from "@/store";
import { AppearanceSettings } from "./AppearanceSettings";
import { ChatSettings } from "./ChatSettings";
import { EnvironmentSettings } from "./EnvironmentSettings";
import { ExtensionsSettings } from "./ExtensionsSettings";
import { FeedbackSettings } from "./FeedbackSettings";
import { GithubSettings } from "./GithubSettings";
import { InstructionsSettings } from "./InstructionsSettings";
import { LanguageSettings } from "./LanguageSettings";
import { LspSettings } from "./LspSettings";
import { McpSettings } from "./McpSettings";
import { ModelsSettings } from "./ModelsSettings";
import { NetworkSettings } from "./NetworkSettings";
import { NotificationsSettings } from "./NotificationsSettings";
import { PrivacySettings } from "./PrivacySettings";
import { ProvidersSettings } from "./ProvidersSettings";
import { SkillsSettings } from "./SkillsSettings";
import { SpeechSettings } from "./SpeechSettings";
import { resolveSettingsSection, searchSettingsNavGroups, settingsNavGroups } from "./settingsNav";
import { TemplatesSettings } from "./TemplatesSettings";
import { TerminalSettings } from "./TerminalSettings";
import { WorkspacesSettings } from "./WorkspacesSettings";

export function SettingsDialog({ updateSettings }: { updateSettings?: ReactNode }) {
	const t = useT();
	const [query, setQuery] = useState("");
	const open = useAppStore((s) => s.settingsOpen);
	const section = useAppStore((s) => s.settingsSection);
	const protocolVersion = useAppStore((s) => s.protocolVersion);
	const filteredGroups = settingsNavGroups(protocolVersion, updateSettings !== undefined);
	const selectedSection = resolveSettingsSection(section, filteredGroups);
	const visibleGroups = searchSettingsNavGroups(filteredGroups, query, t);
	const feedbackVisible = t("settings.dialog.interviewCta")
		.toLocaleLowerCase()
		.includes(query.trim().toLocaleLowerCase());
	const feedbackActive = selectedSection === SettingsSection.Feedback;
	useEffect(() => {
		if (!open) setQuery("");
	}, [open]);

	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				if (!o) useAppStore.getState().closeSettings();
			}}
		>
			<DialogContent
				data-testid="settings-dialog"
				onEscapeKeyDown={(event) => {
					if (
						document.activeElement instanceof HTMLElement &&
						document.activeElement.hasAttribute("data-settings-draft-input")
					) {
						event.preventDefault();
					} else if (query) {
						event.preventDefault();
						setQuery("");
					}
				}}
				className="flex h-[80vh] max-h-[800px] w-[calc(100%_-_32px)] max-w-[64rem] flex-col gap-0 overflow-hidden p-0"
			>
				<DialogHeader className="border-border-muted border-b px-24 py-12">
					<DialogTitle>{t("settings.dialog.title")}</DialogTitle>
				</DialogHeader>

				<div className="flex min-h-0 flex-1 flex-col md:flex-row">
					<div className="flex shrink-0 flex-col border-border-muted border-b bg-container-sidebar-bg md:w-208 md:border-r md:border-b-0">
						<div className="relative m-12">
							<Search
								aria-hidden
								className="pointer-events-none absolute top-8 left-8 size-16 text-text-muted"
							/>
							<input
								type="search"
								data-testid="settings-search"
								aria-label={t("settings.dialog.search")}
								placeholder={t("settings.dialog.search")}
								value={query}
								onChange={(event) => setQuery(event.target.value)}
								className="h-32 w-full rounded-md border border-control-border-default bg-control-bg pr-8 pl-32 tr-text-ui text-text-default outline-none placeholder:text-text-muted focus-visible:border-control-border-active"
							/>
						</div>
						<nav
							aria-label={t("settings.dialog.sectionsLabel")}
							className="flex min-h-0 flex-1 gap-4 overflow-x-auto px-12 pb-12 md:flex-col md:gap-16 md:overflow-x-visible md:overflow-y-auto"
						>
							{visibleGroups.map((group) => (
								<div key={group.label} className="flex shrink-0 md:flex-col">
									<span className="hidden px-8 py-4 tr-text-metadata text-text-subtle md:block">
										{t(group.label)}
									</span>
									<div className="flex gap-4 md:flex-col md:gap-2">
										{group.sections.map(({ id, label, icon: Icon }) => {
											const active = selectedSection === id;
											return (
												<button
													key={id}
													type="button"
													data-testid={`settings-nav-${id}`}
													data-active={active}
													aria-current={active ? "page" : undefined}
													onClick={() => useAppStore.getState().setSettingsSection(id)}
													className={cn(
														"flex shrink-0 items-center gap-8 rounded-md px-8 py-6 text-left tr-text-ui outline-none transition-colors focus-visible:ring-1 focus-visible:ring-focus-ring md:min-h-32 md:w-full",
														active
															? "bg-control-bg-selected text-text-default"
															: "text-text-muted hover:bg-control-bg-hovered hover:text-text-default",
													)}
												>
													<Icon className="size-16 shrink-0" />
													{t(label)}
												</button>
											);
										})}
									</div>
								</div>
							))}

							{visibleGroups.length === 0 && !feedbackVisible ? (
								<p role="status" className="px-8 py-12 tr-text-metadata text-text-muted">
									{t("settings.dialog.noResults")}
								</p>
							) : null}
							{feedbackVisible ? (
								<button
									type="button"
									data-testid="settings-nav-feedback"
									data-active={feedbackActive}
									aria-current={feedbackActive ? "page" : undefined}
									onClick={() =>
										useAppStore.getState().setSettingsSection(SettingsSection.Feedback)
									}
									className={cn(
										"shrink-0 rounded-md px-8 py-8 text-left outline-none transition-colors focus-visible:ring-1 focus-visible:ring-focus-ring md:mt-auto",
										feedbackActive ? "bg-control-bg-selected" : "hover:bg-control-bg-hovered",
									)}
								>
									<span className="tr-text-ui text-text-muted">
										{t("settings.dialog.interviewCta")}
									</span>
								</button>
							) : null}
						</nav>
					</div>

					<div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-16 md:p-24">
						{selectedSection === SettingsSection.Models ? (
							<ModelsSettings />
						) : selectedSection === SettingsSection.Providers ? (
							<ProvidersSettings />
						) : selectedSection === SettingsSection.Mcp ? (
							<McpSettings />
						) : selectedSection === SettingsSection.Lsp ? (
							<LspSettings />
						) : selectedSection === SettingsSection.Skills ? (
							<SkillsSettings />
						) : selectedSection === SettingsSection.Instructions ? (
							<InstructionsSettings />
						) : selectedSection === SettingsSection.Templates ? (
							<TemplatesSettings />
						) : selectedSection === SettingsSection.Environment ? (
							<EnvironmentSettings />
						) : selectedSection === SettingsSection.Network ? (
							<NetworkSettings />
						) : selectedSection === SettingsSection.Extensions ? (
							<ExtensionsSettings />
						) : selectedSection === SettingsSection.Chat ? (
							<ChatSettings />
						) : selectedSection === SettingsSection.Appearance ? (
							<AppearanceSettings />
						) : selectedSection === SettingsSection.Language ? (
							<LanguageSettings />
						) : selectedSection === SettingsSection.Terminal ? (
							<TerminalSettings />
						) : selectedSection === SettingsSection.Speech ? (
							<SpeechSettings />
						) : selectedSection === SettingsSection.Workspaces ? (
							<WorkspacesSettings />
						) : selectedSection === SettingsSection.Github ? (
							<GithubSettings />
						) : selectedSection === SettingsSection.Notifications ? (
							<NotificationsSettings />
						) : selectedSection === SettingsSection.Privacy ? (
							<PrivacySettings />
						) : selectedSection === SettingsSection.Updates && updateSettings !== undefined ? (
							updateSettings
						) : selectedSection === SettingsSection.Feedback ? (
							<FeedbackSettings />
						) : (
							<AppearanceSettings />
						)}
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
