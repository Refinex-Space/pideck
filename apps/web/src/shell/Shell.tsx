import { DropdownMenu } from "@thinkrail/ui/dropdown-menu";
import { type ReactNode, useEffect, useState } from "react";
import { getNavigationHistory, goBack, goForward } from "../navigation";
import { NotificationPermissionPrompt, useAttentionNotifications } from "../notifications";
import { AnalyticsConsentDialog } from "../panels/AnalyticsConsentDialog";
import { InterviewPromptDialog } from "../panels/InterviewPromptDialog";
import { preferredSessionTarget } from "../panels/newSessionTarget";
import { SettingsDialog } from "../panels/SettingsDialog";
import { Toaster } from "../panels/Toaster";
import { useBranchStatus } from "../panels/useBranchStatus";
import {
	SettingsSection,
	selectActiveWorkspace,
	selectAnalyticsConsentPromptOpen,
	selectContextProject,
	useAppStore,
} from "../store";
import {
	applyThemePreference,
	clearUserThemes,
	installUserThemes,
	onSystemAppearanceChange,
	readThemeHint,
	writeThemeHint,
} from "../themes";
import { runHostUpdate, supportsHostUpdateRun, supportsUserThemes } from "../transport";
import { UpdateInstallSurfaces, UpdateReadyButton, UpdateSettings, useUpdates } from "../updates";
import { ApplicationMenu, ApplicationMenuItems } from "./ApplicationMenu";
import { AppShortcuts } from "./AppShortcuts";
import { JbcentralQuotaTopbar } from "./JbcentralQuotaTopbar";
import { LayoutSettings } from "./LayoutSettings";
import { useLocalLayoutState } from "./layoutState";
import { LocationBar, LocationDetails } from "./locationBar";
import { NativeWindowControls } from "./NativeWindowControls";
import { NavigationHistoryButtons } from "./NavigationHistoryButtons";
import { PROJECT_HOME_PROJECTS_REGION_ID, ProjectHome } from "./ProjectHome";
import { SessionSwitcher } from "./SessionSwitcher";
import { useCollapsibleRegion } from "./useCollapsibleRegion";
import { useGlobalHotkeys } from "./useGlobalHotkeys";
import { useNativeWindowControls } from "./useNativeWindowControls";
import { WorkspaceWorkbench } from "./WorkspaceWorkbench";

export function Shell() {
	useLocalLayoutState();
	useAttentionNotifications();
	const status = useAppStore((s) => s.status);
	const analyticsConsentOpen = useAppStore(selectAnalyticsConsentPromptOpen);
	const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
	const activeWorkspace = useAppStore(selectActiveWorkspace);
	const contextProject = useAppStore(selectContextProject);
	const {
		review: openReview,
		url: openReviewUrl,
		status: branchStatus,
		noteOpenReview,
		refreshBranchStatus,
	} = useBranchStatus(activeWorkspace, status, { pollChecks: true });
	const locationReview =
		openReview && openReviewUrl ? { ...openReview, url: openReviewUrl } : openReview;
	const hasActiveWorkspace = activeWorkspaceId != null;
	useEffect(() => {
		if (hasActiveWorkspace) useAppStore.getState().closeNewSession();
	}, [hasActiveWorkspace]);
	const protocolVersion = useAppStore((s) => s.protocolVersion);
	const updates = useUpdates(supportsHostUpdateRun(protocolVersion) ? runHostUpdate : null);
	const windowControls = useNativeWindowControls();
	const startNewWorkspace = (projectId: string) =>
		useAppStore
			.getState()
			.openNewSession({ projectId, target: preferredSessionTarget(projectId), prompt: "" });
	const sessionSwitcherOpen = useAppStore((s) => s.sessionSwitcherOpen);

	const homeProjects = useCollapsibleRegion<HTMLDivElement>(PROJECT_HOME_PROJECTS_REGION_ID);

	const [themeHint] = useState(readThemeHint);
	const welcomeGeneration = useAppStore((s) => s.welcomeGeneration);
	const theme = useAppStore((s) => s.theme);
	const themeMode = useAppStore((s) => s.themeMode);
	const systemThemePair = useAppStore((s) => s.systemThemePair);
	const userThemes = useAppStore((s) => s.userThemes);
	const userThemesUnsupported = welcomeGeneration > 0 && !supportsUserThemes(protocolVersion);
	useEffect(() => {
		if (userThemes) installUserThemes(userThemes.files);
		else if (userThemesUnsupported) clearUserThemes();
		const preference =
			welcomeGeneration === 0
				? themeHint
				: { theme, themeMode, ...(systemThemePair ? { systemThemePair } : {}) };
		const apply = () => applyThemePreference(preference);
		apply();
		if (welcomeGeneration > 0) writeThemeHint(preference);
		return preference.themeMode === "system" ? onSystemAppearanceChange(apply) : undefined;
	}, [
		themeHint,
		welcomeGeneration,
		theme,
		themeMode,
		systemThemePair,
		userThemes,
		userThemesUnsupported,
	]);
	useGlobalHotkeys({
		onProjects: hasActiveWorkspace
			? () => {
					if (!activeWorkspaceId) return;
					useAppStore.getState().enqueueLayoutIntent({
						kind: "toggle-side",
						workspaceId: activeWorkspaceId,
						side: "left",
					});
				}
			: homeProjects.toggle,
		...(hasActiveWorkspace
			? {
					onWorkspace: () => {
						if (!activeWorkspaceId) return;
						useAppStore.getState().enqueueLayoutIntent({
							kind: "toggle-side",
							workspaceId: activeWorkspaceId,
							side: "right",
						});
					},
					onBottom: () => {
						if (!activeWorkspaceId) return;
						useAppStore.getState().enqueueLayoutIntent({
							kind: "toggle-bottom",
							workspaceId: activeWorkspaceId,
						});
					},
				}
			: {}),
		...(contextProject ? { onNewWorkspace: () => startNewWorkspace(contextProject.id) } : {}),
		onSessionSwitcher: () => useAppStore.getState().toggleSessionSwitcher(),
		onBack: () => {
			if (getNavigationHistory().canGoBack) goBack();
		},
		onForward: () => {
			if (getNavigationHistory().canGoForward) goForward();
		},
	});
	const footer = (compact: boolean) => (
		<ApplicationMenu compact={compact}>
			{updates ? (
				<UpdateReadyButton
					compact
					updates={updates}
					onOpen={() => useAppStore.getState().openSettings(SettingsSection.Updates)}
				/>
			) : null}
			<JbcentralQuotaTopbar compact />
		</ApplicationMenu>
	);
	const navigationActions = <NavigationHistoryButtons />;
	const statusEnvironment = contextProject ? (
		<LocationDetails
			project={contextProject}
			workspace={activeWorkspace}
			review={activeWorkspace ? locationReview : null}
			branchStatus={branchStatus}
			noteOpenReview={noteOpenReview}
			refreshBranchStatus={refreshBranchStatus}
		/>
	) : null;
	const locationBar = (placement: "header" | "tabs") =>
		contextProject ? (
			<LocationBar
				placement={placement}
				project={contextProject}
				workspace={activeWorkspace}
				review={activeWorkspace ? locationReview : null}
				branchStatus={branchStatus}
				noteOpenReview={noteOpenReview}
				refreshBranchStatus={refreshBranchStatus}
				onNewWorkspace={() => startNewWorkspace(contextProject.id)}
			/>
		) : null;
	const workspaceLocation = locationBar("tabs");
	const workspaceHeader = (historyControls?: ReactNode) => (
		<div
			data-testid="topbar"
			className="window-drag relative flex h-topbar-row min-w-0 shrink-0 select-none items-center bg-container-content-bg px-8"
		>
			<div
				data-testid="window-chrome-inset-left"
				aria-hidden="true"
				className="workspace-chrome-inset w-window-chrome-inset-left shrink-0"
			/>
			{historyControls}
			{locationBar("header") ?? <div className="flex-1" />}
			<div
				data-testid="window-chrome-inset-right"
				aria-hidden="true"
				className="w-window-chrome-inset-right shrink-0"
			/>
		</div>
	);
	return (
		<DropdownMenu>
			<div data-testid="shell" className="relative flex h-full min-h-0 min-w-0 flex-col">
				{hasActiveWorkspace && activeWorkspaceId ? (
					<div data-testid="workspace-shell-layout" className="h-full min-h-0 min-w-0">
						<WorkspaceWorkbench
							workspaceId={activeWorkspaceId}
							workspaceLocation={workspaceLocation}
							statusEnvironment={statusEnvironment}
							navigationActions={navigationActions}
							navigationFooter={footer(false)}
						/>
					</div>
				) : (
					<ProjectHome
						projects={homeProjects}
						workspaceHeader={workspaceHeader}
						navigationActions={navigationActions}
						navigationFooter={footer(false)}
					/>
				)}
				{windowControls ? (
					<NativeWindowControls
						state={windowControls.state}
						onMinimize={windowControls.minimize}
						onToggleMaximize={windowControls.toggleMaximize}
						onClose={windowControls.close}
					/>
				) : null}
				<SettingsDialog
					layoutSettings={<LayoutSettings />}
					updateSettings={updates ? <UpdateSettings updates={updates} /> : undefined}
				/>
				{analyticsConsentOpen ? <AnalyticsConsentDialog /> : <InterviewPromptDialog />}
				<SessionSwitcher
					open={sessionSwitcherOpen}
					onOpenChange={(open) => {
						const store = useAppStore.getState();
						if (open) store.openSessionSwitcher();
						else store.closeSessionSwitcher();
					}}
				/>
				<NotificationPermissionPrompt />
				<Toaster />
				<UpdateInstallSurfaces updates={updates} />
				<AppShortcuts />
				<ApplicationMenuItems />
			</div>
		</DropdownMenu>
	);
}
