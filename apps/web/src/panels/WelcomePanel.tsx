import {
	RiFolderOpenLine as FolderOpen,
	RiHome2Line as House,
	type RemixiconComponentType as LucideIcon,
	RiRocketLine as Rocket,
	RiSparkling2Line as Sparkles,
} from "@remixicon/react";
import { useT } from "@thinkrail/locales/react";
import { LoadingRegion } from "@thinkrail/ui/skeleton";
import { cn } from "@thinkrail/ui/utils";
import { type ComponentPropsWithoutRef, forwardRef, useEffect, useState } from "react";
import { PRODUCT_NAME } from "../constants/branding";
import { BrandLogo } from "../shell/BrandLogo";
import { useAppStore } from "../store";
import { getTransport } from "../transport";
import { AddProjectMenu } from "./AddProjectMenu";
import { enterDefaultWorkspace } from "./defaultWorkspace";
import { NewSessionPage } from "./NewSessionPage";
import { ProjectTrustNotice } from "./ProjectTrustNotice";
import { ProviderWarningBanner } from "./ProviderWarningBanner";
import { useOpenProject } from "./useOpenProject";

const SETUP_PROMPT = "/skill:setting-up-a-project ";

export function WelcomePanel() {
	const t = useT();
	const projects = useAppStore((s) => s.projects);
	const recentProjects = useAppStore((s) => s.recentProjects);
	const selectedProjectId = useAppStore((s) => s.selectedProjectId);
	const draft = useAppStore((s) => s.newSessionDraft);
	const startWorkspace = (projectId: string, prompt: string, note?: string) =>
		useAppStore.getState().openNewSession({
			projectId,
			target: "worktree",
			prompt,
			...(note !== undefined ? { note } : {}),
		});
	const [hasSpecs, setHasSpecs] = useState<boolean | null>(null);

	const project = projects.find((p) => p.id === selectedProjectId) ?? projects[0] ?? null;

	useEffect(() => {
		const projectId = project?.id;
		if (!projectId) {
			setHasSpecs(null);
			return;
		}
		let cancelled = false;
		setHasSpecs(null);
		getTransport()
			.request("project.hasSpecs", { projectId })
			.then((r) => {
				if (!cancelled) setHasSpecs(r.hasSpecs);
			})
			.catch(() => {
				if (!cancelled) setHasSpecs(true);
			});
		return () => {
			cancelled = true;
		};
	}, [project?.id]);

	const { openProject, pickAndOpen, enterHostPath, cloneRepository, dialogs } = useOpenProject(
		(opened) => useAppStore.getState().selectProject(opened.id, { reveal: true }),
	);
	const noProjects = project == null;

	const projectFolderCard = (projectId: string) => (
		<Card
			icon={House}
			title={t("panels.welcome.projectFolderTitle")}
			subtitle={t("panels.welcome.projectFolderSubtitle")}
			onClick={() => void enterDefaultWorkspace(projectId)}
		/>
	);

	const openProjectCard = () => (
		<AddProjectMenu
			recentProjects={recentProjects}
			onOpen={() => void pickAndOpen()}
			onEnterHostPath={enterHostPath}
			onClone={cloneRepository}
			onOpenRecent={(path) => void openProject(path)}
			align="start"
		>
			<Card
				cta
				primary
				icon={FolderOpen}
				title={t("panels.welcome.openProjectTitle")}
				subtitle={t("panels.welcome.openProjectSubtitle")}
			/>
		</AddProjectMenu>
	);

	if (draft) {
		return (
			<NewSessionPage
				key={draft.key}
				draft={draft}
				onClose={() => useAppStore.getState().closeNewSession()}
				onCancel={() => useAppStore.getState().cancelNewSession()}
			/>
		);
	}
	const showBrand = !project || project.name.toLowerCase() === PRODUCT_NAME.toLowerCase();
	return (
		<div
			data-testid="welcome"
			className="flex h-full min-h-0 flex-col items-center justify-center overflow-auto px-24 py-24 text-center"
		>
			<h1
				data-testid="welcome-title"
				className="max-w-[640px] break-words tr-brand-hero text-text-default"
			>
				{showBrand ? (
					<span className="inline-flex items-center justify-center gap-12">
						<BrandLogo className="size-32" testId="welcome-brand-logo" />
						{PRODUCT_NAME}
					</span>
				) : (
					project.name
				)}
			</h1>

			<ProviderWarningBanner />
			{project ? <ProjectTrustNotice projectId={project.id} /> : null}

			<div className="mt-24 flex w-full max-w-[560px] flex-col gap-4 text-left">
				{noProjects ? (
					openProjectCard()
				) : hasSpecs === null ? (
					<>
						<CardSkeleton />
						<CardSkeleton />
					</>
				) : hasSpecs ? (
					<>
						<Card
							cta
							primary
							icon={Rocket}
							title={t("panels.welcome.startBuildingTitle")}
							subtitle={t("panels.welcome.startBuildingSubtitle")}
							onClick={() => startWorkspace(project.id, "")}
						/>
						{projectFolderCard(project.id)}
					</>
				) : (
					<>
						<Card
							cta
							primary
							icon={Sparkles}
							title={t("panels.welcome.setupTitle")}
							tag={t("panels.welcome.setupTag")}
							subtitle={t("panels.welcome.setupSubtitle")}
							onClick={() =>
								startWorkspace(project.id, SETUP_PROMPT, t("panels.welcome.setupNote"))
							}
						/>
						<Card
							icon={Rocket}
							title={t("panels.welcome.startBuildingTitle")}
							subtitle={t("panels.welcome.startBuildingSecondarySubtitle")}
							onClick={() => startWorkspace(project.id, "")}
						/>
						{projectFolderCard(project.id)}
					</>
				)}
			</div>

			{dialogs}
		</div>
	);
}

function CardSkeleton() {
	const t = useT();
	return (
		<LoadingRegion
			rows={2}
			label={t("panels.welcome.loading")}
			className="min-h-64 w-full rounded-lg px-16 py-12"
		/>
	);
}

type CardProps = {
	cta?: boolean;
	primary?: boolean;
	icon: LucideIcon;
	title: string;
	subtitle: string;
	tag?: string;
} & ComponentPropsWithoutRef<"button">;

const Card = forwardRef<HTMLButtonElement, CardProps>(function Card(
	{ cta, primary, icon: Icon, title, subtitle, tag, className, ...rest },
	ref,
) {
	return (
		<button
			ref={ref}
			type="button"
			data-testid={cta ? "welcome-cta" : "welcome-action"}
			{...rest}
			className={cn(
				"relative flex min-h-64 w-full items-start gap-12 rounded-lg border border-transparent bg-clip-padding px-16 py-12 text-left outline-none transition-colors focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-focus-ring hover:bg-control-bg-hovered",
				primary ? "bg-control-bg-selected" : "bg-transparent",
				className,
			)}
		>
			{tag ? (
				<span className="order-last shrink-0 rounded-sm bg-container-elevated-bg px-8 py-2 tr-text-caption text-text-muted">
					{tag}
				</span>
			) : null}
			<Icon
				className={cn("mt-2 size-20 shrink-0", primary ? "text-text-default" : "text-text-muted")}
			/>
			<span className="min-w-0 flex-1">
				<span className="block tr-text-emphasis text-text-default">{title}</span>
				<span className="mt-2 block text-text-muted tr-text-metadata leading-snug">{subtitle}</span>
			</span>
		</button>
	);
});
