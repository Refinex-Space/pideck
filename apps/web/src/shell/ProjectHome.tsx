import { useT } from "@thinkrail/locales/react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@thinkrail/ui/resizable";
import { type ReactNode, useState } from "react";
import { QuietScrollArea } from "../components/QuietScrollArea";
import { ProjectTree } from "../panels/ProjectTree";
import { WelcomePanel } from "../panels/WelcomePanel";
import {
	AuxiliaryRail,
	AuxiliaryRailToolButton,
	type AuxiliaryRailToolEntry,
	DEFAULT_LAYOUT_PRESET_ID,
	LAYOUT_LIMITS,
	layoutPresetForViewport,
	projectWorkbenchRatio,
	resolveLayoutPreset,
} from "./layout";
import type { CollapsibleRegion } from "./useCollapsibleRegion";

export const PROJECT_HOME_PROJECTS_REGION_ID = "welcome-left";
const PROJECT_HOME_AUTOSAVE_ID = "thinkrail-shell-welcome";
const PROJECTS_PANE_ID = "project-home-projects";
const PROJECTS_RAIL_ENTRY_KEY = "projects";
const PROJECTS_PANE_MIN_PERCENT = LAYOUT_LIMITS.minSideWidth * 100;
const WELCOME_MIN_PERCENT = 40;

export function ProjectHome({
	projects,
	workspaceHeader,
	navigationActions,
	navigationFooter,
	collapsedNavigationFooter,
}: {
	projects: CollapsibleRegion<HTMLDivElement>;
	workspaceHeader: (historyControls?: ReactNode) => ReactNode;
	navigationActions: ReactNode;
	navigationFooter: ReactNode;
	collapsedNavigationFooter: ReactNode;
}) {
	const t = useT();
	const [defaultProjectsPercent] = useState(() => {
		const width = typeof window === "undefined" ? undefined : window.innerWidth;
		const preset = layoutPresetForViewport(
			resolveLayoutPreset(DEFAULT_LAYOUT_PRESET_ID, []),
			width,
		);
		return projectWorkbenchRatio(preset.left.width, width ?? 0, width ?? 0) * 100;
	});
	const {
		collapsed,
		contentRef,
		onCollapse,
		onDragging,
		onExpand,
		panelRef,
		railRef,
		regionRef,
		toggle,
	} = projects;
	const entry: AuxiliaryRailToolEntry = {
		key: PROJECTS_RAIL_ENTRY_KEY,
		region: "left",
		kind: "tool",
		groupId: null,
		tool: "projects",
		tab: null,
		selected: true,
		expanded: !collapsed,
	};
	const rail = () => (
		<AuxiliaryRail
			orientation="horizontal"
			region="left"
			entries={[entry]}
			renderEntry={(_, control) => (
				<AuxiliaryRailToolButton
					ref={railRef}
					entry={entry}
					controls={PROJECTS_PANE_ID}
					control={control}
					onActivate={toggle}
				/>
			)}
		/>
	);
	return (
		<div
			data-testid="welcome-shell-layout"
			data-left-collapsed={collapsed}
			data-navigation-expanded={!collapsed}
			className="flex h-full min-h-0 min-w-0"
		>
			{collapsed ? (
				<div className="flex h-full w-40 shrink-0 flex-col bg-container-sidebar-bg">
					<div className="min-h-0 flex-1" />
					{collapsedNavigationFooter}
				</div>
			) : null}
			<ResizablePanelGroup
				direction="horizontal"
				autoSaveId={PROJECT_HOME_AUTOSAVE_ID}
				className="min-h-0 min-w-0 flex-1"
			>
				<ResizablePanel
					ref={panelRef}
					id="left"
					order={1}
					defaultSize={defaultProjectsPercent}
					minSize={PROJECTS_PANE_MIN_PERCENT}
					collapsedSize={0}
					collapsible
					onCollapse={onCollapse}
					onExpand={onExpand}
				>
					<section
						ref={regionRef}
						id={PROJECTS_PANE_ID}
						aria-label={t("shell.projectHome.projects")}
						aria-hidden={collapsed || undefined}
						inert={collapsed ? true : undefined}
						className="flex h-full min-h-0 flex-col bg-container-sidebar-bg"
					>
						<div
							data-testid="navigation-chrome"
							className="window-drag flex h-topbar-row shrink-0 items-center px-8"
						>
							<div
								data-testid="navigation-window-inset-left"
								aria-hidden="true"
								className="w-window-chrome-inset-left shrink-0"
							/>
							{!collapsed ? (
								<>
									{rail()}
									{navigationActions}
								</>
							) : null}
						</div>
						<div
							ref={contentRef}
							tabIndex={-1}
							className="flex min-h-0 flex-1 flex-col outline-none"
						>
							<QuietScrollArea
								data-testid="left-nav"
								className="min-h-0 flex-1"
								viewportClassName="px-8 py-12"
							>
								<ProjectTree />
							</QuietScrollArea>
						</div>
						{!collapsed ? navigationFooter : null}
					</section>
				</ResizablePanel>
				<ResizableHandle
					direction="horizontal"
					data-testid="resize-left"
					aria-hidden={collapsed}
					tabIndex={collapsed ? -1 : 0}
					onDragging={onDragging}
					{...(collapsed ? { className: "hidden" } : {})}
				/>
				<ResizablePanel
					id="welcome"
					order={2}
					defaultSize={100 - defaultProjectsPercent}
					minSize={WELCOME_MIN_PERCENT}
				>
					<div className="flex h-full min-h-0 flex-col bg-container-content-bg">
						{workspaceHeader(
							collapsed ? (
								<>
									{rail()}
									{navigationActions}
								</>
							) : undefined,
						)}
						<div className="min-h-0 flex-1">
							<WelcomePanel />
						</div>
					</div>
				</ResizablePanel>
			</ResizablePanelGroup>
		</div>
	);
}
