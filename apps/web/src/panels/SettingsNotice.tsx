import {
	RiErrorWarningLine as AlertCircle,
	RiAlertLine as AlertTriangle,
	RiCheckLine as Check,
	RiInformationLine as Info,
} from "@remixicon/react";
import { cn } from "@thinkrail/ui/utils";
import type { ReactNode } from "react";

export type SettingsNoticeVariant = "neutral" | "info" | "success" | "warning" | "error";

const VARIANT_STYLES: Record<SettingsNoticeVariant, { bg: string; icon: string; border: string }> =
	{
		neutral: { bg: "bg-control-bg", icon: "text-text-muted", border: "border-border-muted" },
		info: { bg: "bg-control-bg", icon: "text-feedback-info", border: "border-feedback-info-muted" },
		success: {
			bg: "bg-control-bg",
			icon: "text-feedback-success",
			border: "border-feedback-success-muted",
		},
		warning: {
			bg: "bg-control-bg",
			icon: "text-feedback-warning",
			border: "border-feedback-warning-muted",
		},
		error: {
			bg: "bg-control-bg",
			icon: "text-feedback-error",
			border: "border-feedback-error-muted",
		},
	};

const VARIANT_ICONS: Record<SettingsNoticeVariant, typeof Info> = {
	neutral: Info,
	info: Info,
	success: Check,
	warning: AlertTriangle,
	error: AlertCircle,
};

export interface SettingsNoticeProps {
	variant: SettingsNoticeVariant;
	icon?: ReactNode;
	hideIcon?: boolean;
	children: ReactNode;
	action?: ReactNode;
	testId?: string;
	className?: string;
}

export function SettingsNotice({
	variant,
	icon,
	hideIcon = false,
	children,
	action,
	testId,
	className,
}: SettingsNoticeProps) {
	const styles = VARIANT_STYLES[variant];
	const IconComponent = VARIANT_ICONS[variant];

	return (
		<div
			data-testid={testId}
			data-variant={variant}
			className={cn(
				"flex items-start gap-8 rounded-sm border px-12 py-8",
				styles.bg,
				styles.border,
				className,
			)}
		>
			{!hideIcon && (
				<span className={cn("mt-2 shrink-0", styles.icon)}>
					{icon ?? <IconComponent className="size-14" />}
				</span>
			)}
			<div className="flex min-w-0 flex-1 flex-col gap-4">
				<div className="tr-text-ui text-text-default">{children}</div>
				{action && <div className="flex items-center gap-8">{action}</div>}
			</div>
		</div>
	);
}
