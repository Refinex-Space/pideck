import { RiArrowDownSLine, RiCircleFill, RiSettings3Line } from "@remixicon/react";
import { useT } from "@thinkrail/locales/react";
import {
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@thinkrail/ui/dropdown-menu";
import { cn } from "@thinkrail/ui/utils";
import { type ReactNode, useState } from "react";
import { PRODUCT_NAME } from "../constants/branding";
import { useAppStore } from "../store";
import { AppearanceQuickMenu, LanguageQuickMenu } from "./ApplicationMenuQuickSettings";
import { BrandLogo } from "./BrandLogo";
import { readSettingsShortcutLabel } from "./useAppShortcuts";

const CONNECTION_LABEL = {
	connected: "shell.connection.connected",
	connecting: "shell.connection.connecting",
	disconnected: "shell.connection.disconnected",
} as const;

export function ApplicationMenu({
	compact = false,
	children,
}: {
	compact?: boolean;
	children?: ReactNode;
}) {
	const t = useT();
	const status = useAppStore((state) => state.status);
	const statusLabel = t(CONNECTION_LABEL[status]);
	return (
		<div
			data-testid="navigation-footer"
			className={cn(
				"window-no-drag flex shrink-0 items-center gap-4 border-t border-border-muted p-8",
				compact && "flex-col p-4",
			)}
		>
			<DropdownMenuTrigger
				data-testid="app-menu"
				aria-label={t("shell.applicationMenu")}
				className={cn(
					"flex h-32 min-w-0 flex-1 items-center gap-8 rounded-md px-8 text-text-default outline-none hover:bg-control-bg-hovered focus-visible:outline-1 focus-visible:outline-focus-ring data-[state=open]:bg-control-bg-selected",
					compact && "w-32 flex-none justify-center px-0",
				)}
			>
				<BrandLogo />
				{!compact ? (
					<>
						<span className="flex-1 text-left tr-text-ui">{PRODUCT_NAME}</span>
						<RiArrowDownSLine className="size-16 text-text-subtle" />
					</>
				) : null}
				<span
					data-testid="connection-status"
					data-status={status}
					role="status"
					aria-label={statusLabel}
					className={cn(
						"flex shrink-0",
						status === "connected"
							? "text-text-subtle"
							: status === "connecting"
								? "text-feedback-warning"
								: "text-feedback-error",
					)}
				>
					<RiCircleFill aria-hidden="true" className="size-6" />
				</span>
			</DropdownMenuTrigger>

			<div
				data-testid="application-status-actions"
				className={cn("flex shrink-0 items-center gap-4", compact && "flex-col")}
			>
				{children}
			</div>
		</div>
	);
}

export function ApplicationMenuItems() {
	const t = useT();
	const status = useAppStore((state) => state.status);
	const [shortcut] = useState(readSettingsShortcutLabel);
	const statusLabel = t(CONNECTION_LABEL[status]);
	return (
		<DropdownMenuContent
			side="top"
			align="start"
			className="w-256 max-w-[calc(100vw-16px)]"
			data-testid="app-menu-content"
		>
			<DropdownMenuLabel className="flex items-center justify-between gap-8">
				<span>{PRODUCT_NAME}</span>
				<span className="tr-text-metadata text-text-subtle">{statusLabel}</span>
			</DropdownMenuLabel>
			<DropdownMenuItem
				data-testid="open-settings"
				aria-label={
					shortcut
						? t("shell.topbar.settingsWithShortcut", { shortcut })
						: t("shell.topbar.settings")
				}
				onSelect={() => useAppStore.getState().openSettings()}
			>
				<RiSettings3Line />
				{t("shell.topbar.settings")}
				{shortcut ? (
					<span className="ml-auto text-text-subtle tr-text-metadata">{shortcut}</span>
				) : null}
			</DropdownMenuItem>
			<AppearanceQuickMenu />
			<LanguageQuickMenu />
		</DropdownMenuContent>
	);
}
