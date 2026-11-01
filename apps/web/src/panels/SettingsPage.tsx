import { RiSearchLine as Search } from "@remixicon/react";
import { useT } from "@thinkrail/locales/react";
import { Button } from "@thinkrail/ui/button";
import { cn } from "@thinkrail/ui/utils";
import { ChevronLeft } from "lucide-react";
import { type ReactNode, useEffect, useInsertionEffect, useRef, useState } from "react";
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

function SectionPanel({
	section,
	updateSettings,
}: {
	section: SettingsSection;
	updateSettings?: ReactNode;
}) {
	switch (section) {
		case SettingsSection.Models:
			return <ModelsSettings />;
		case SettingsSection.Providers:
			return <ProvidersSettings />;
		case SettingsSection.Mcp:
			return <McpSettings />;
		case SettingsSection.Lsp:
			return <LspSettings />;
		case SettingsSection.Skills:
			return <SkillsSettings />;
		case SettingsSection.Instructions:
			return <InstructionsSettings />;
		case SettingsSection.Templates:
			return <TemplatesSettings />;
		case SettingsSection.Environment:
			return <EnvironmentSettings />;
		case SettingsSection.Network:
			return <NetworkSettings />;
		case SettingsSection.Extensions:
			return <ExtensionsSettings />;
		case SettingsSection.Chat:
			return <ChatSettings />;
		case SettingsSection.Language:
			return <LanguageSettings />;
		case SettingsSection.Terminal:
			return <TerminalSettings />;
		case SettingsSection.Speech:
			return <SpeechSettings />;
		case SettingsSection.Workspaces:
			return <WorkspacesSettings />;
		case SettingsSection.Github:
			return <GithubSettings />;
		case SettingsSection.Notifications:
			return <NotificationsSettings />;
		case SettingsSection.Privacy:
			return <PrivacySettings />;
		case SettingsSection.Updates:
			return updateSettings ?? <AppearanceSettings />;
		case SettingsSection.Feedback:
			return <FeedbackSettings />;
		default:
			return <AppearanceSettings />;
	}
}

/**
 * Settings as a full page laid over the shell: the left column wears the navigation sidebar's surface and chrome,
 * the right column is the canvas. It is a modal layer (`aria-modal`), so global shortcuts and Escape handling
 * treat it like the dialog it replaced, and the app underneath stays mounted but inert.
 */
export function SettingsPage({ updateSettings }: { updateSettings?: ReactNode }) {
	const open = useAppStore((s) => s.settingsOpen);
	return open ? <SettingsPageContent updateSettings={updateSettings} /> : null;
}

function SettingsPageContent({ updateSettings }: { updateSettings?: ReactNode }) {
	const t = useT();
	const [query, setQuery] = useState("");
	const queryRef = useRef(query);
	useInsertionEffect(() => {
		queryRef.current = query;
	});
	const rootRef = useRef<HTMLDivElement>(null);
	const section = useAppStore((s) => s.settingsSection);
	const protocolVersion = useAppStore((s) => s.protocolVersion);
	const groups = settingsNavGroups(protocolVersion, updateSettings !== undefined);
	const selectedSection = resolveSettingsSection(section, groups);
	const visibleGroups = searchSettingsNavGroups(groups, query, t);
	const feedbackVisible = t("settings.dialog.interviewCta")
		.toLocaleLowerCase()
		.includes(query.trim().toLocaleLowerCase());
	const feedbackActive = selectedSection === SettingsSection.Feedback;
	const activeLabel = feedbackActive
		? "settings.dialog.interviewCta"
		: groups.flatMap((group) => group.sections).find((entry) => entry.id === selectedSection)
				?.label;

	useEffect(() => {
		const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		rootRef.current?.focus({ preventScroll: true });
		return () => {
			if (previous?.isConnected) previous.focus({ preventScroll: true });
		};
	}, []);

	// A nested Radix layer (dialog, popover, menu) consumes Escape first and marks it handled.
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape" || event.defaultPrevented || event.isComposing) return;
			const active = document.activeElement;
			if (active instanceof HTMLElement && active.hasAttribute("data-settings-draft-input")) return;
			// Consumed: later listeners (the new-session page) must not also act on this Escape.
			event.preventDefault();
			if (queryRef.current) setQuery("");
			else useAppStore.getState().closeSettings();
		};
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, []);

	return (
		<div
			ref={rootRef}
			role="dialog"
			aria-modal="true"
			data-modal-layer=""
			data-state="open"
			aria-label={t("settings.dialog.title")}
			tabIndex={-1}
			data-testid="settings-page"
			className="absolute inset-0 z-30 flex flex-col bg-container-content-bg text-text-default outline-none md:flex-row"
		>
			<div
				data-testid="settings-sidebar"
				className="flex shrink-0 flex-col border-border-muted border-b md:w-288 md:border-r md:border-b-0"
			>
				<div className="window-drag flex h-topbar-row shrink-0 items-center px-8">
					<div aria-hidden="true" className="w-window-chrome-inset-left shrink-0" />
					<Button
						variant="ghost"
						size="m"
						iconLeft={ChevronLeft}
						data-testid="settings-back"
						className="window-no-drag"
						onClick={() => useAppStore.getState().closeSettings()}
					>
						{t("settings.page.back")}
					</Button>
				</div>
				<div className="relative mx-12 mb-8">
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
						className="h-32 w-full rounded-lg border border-control-border-default bg-control-bg pr-8 pl-32 tr-text-ui text-text-default outline-none placeholder:text-text-muted focus-visible:ring-1 focus-visible:ring-focus-ring"
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
							onClick={() => useAppStore.getState().setSettingsSection(SettingsSection.Feedback)}
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

			<div className="flex min-h-0 min-w-0 flex-1 flex-col">
				<div className="window-drag flex h-topbar-row shrink-0 items-center">
					<div className="flex-1" />
					<div aria-hidden="true" className="w-window-chrome-inset-right shrink-0" />
				</div>
				<div data-testid="settings-content" className="min-h-0 flex-1 overflow-y-auto">
					<div className="mx-auto flex w-full max-w-[46rem] flex-col gap-24 px-16 pt-8 pb-32 md:px-24">
						{activeLabel ? (
							<h1 data-testid="settings-page-title" className="tr-heading-md text-text-default">
								{t(activeLabel)}
							</h1>
						) : null}
						<SectionPanel section={selectedSection} updateSettings={updateSettings} />
					</div>
				</div>
			</div>
		</div>
	);
}
