import { RiCoinsLine as Coins, RiLoader4Line as Loader } from "@remixicon/react";
import type { JbcentralQuotaSnapshot } from "@thinkrail/contracts";
import { localeOf, type Translator, useT } from "@thinkrail/locales/react";
import { IconTooltip } from "@thinkrail/ui/tooltip";
import { cn } from "@thinkrail/ui/utils";
import { formatJbcentralQuota } from "./jbcentralQuota";

export type JbcentralQuotaViewSnapshot = JbcentralQuotaSnapshot | { state: "loading" };

function observedLabel(t: Translator, observedAt: number): string {
	return new Date(observedAt).toLocaleTimeString(localeOf(t), {
		hour: "numeric",
		minute: "2-digit",
		second: "2-digit",
	});
}

export function JbcentralQuotaIndicator({
	snapshot,
	onRetry,
	compact = false,
}: {
	snapshot: JbcentralQuotaViewSnapshot;
	onRetry: () => void;
	compact?: boolean;
}) {
	const t = useT();
	if (snapshot.state === "hidden") return null;
	if (snapshot.state === "loading") {
		return (
			<IconTooltip label={t("shell.jbcentralQuota.loadingTooltip")}>
				<span
					data-testid="jbcentral-quota"
					data-state="loading"
					className={cn(
						"inline-flex shrink-0 items-center gap-4 whitespace-nowrap text-text-muted tr-text-ui",
						compact && "size-28 justify-center",
					)}
				>
					<Loader className="size-14 animate-spin" aria-hidden="true" />
					<span className={compact ? "sr-only" : undefined}>
						{t("shell.jbcentralQuota.loading")}
					</span>
				</span>
			</IconTooltip>
		);
	}
	if (snapshot.state === "unavailable") {
		return (
			<IconTooltip label={t("shell.jbcentralQuota.unavailableTooltip")}>
				<button
					type="button"
					data-testid="jbcentral-quota"
					data-state="unavailable"
					onClick={onRetry}
					className={cn(
						"inline-flex shrink-0 items-center gap-4 whitespace-nowrap rounded-sm text-text-muted tr-text-ui outline-none hover:text-text-default focus-visible:ring-1 focus-visible:ring-focus-ring",
						compact && "size-28 justify-center",
					)}
				>
					<Coins className="size-14" aria-hidden="true" />
					<span className={compact ? "sr-only" : undefined}>
						{t("shell.jbcentralQuota.unavailable")}
					</span>
					<span className={compact ? "sr-only" : "hidden sm:inline"}>
						{t("shell.jbcentralQuota.retrySuffix")}
					</span>
				</button>
			</IconTooltip>
		);
	}

	const value = formatJbcentralQuota(snapshot.remaining, snapshot.total, localeOf(t));
	const stale = snapshot.state === "stale";
	const content = (
		<>
			<Coins className="size-14 text-text-muted" aria-hidden="true" />
			<span className={compact ? "sr-only" : undefined}>{value}</span>
			<span className={compact ? "sr-only" : "hidden sm:inline"}>
				{t("shell.jbcentralQuota.creditsUnit")}
			</span>
			{stale ? (
				<span
					data-testid="jbcentral-quota-stale-marker"
					className="size-6 rounded-full bg-feedback-warning"
					aria-hidden="true"
				/>
			) : null}
		</>
	);
	const observed = observedLabel(t, snapshot.observedAt);
	const label = stale
		? t("shell.jbcentralQuota.staleLabel", { value })
		: t("shell.jbcentralQuota.availableLabel", { value, time: observed });
	const className = cn(
		"inline-flex shrink-0 items-center gap-4 whitespace-nowrap text-text-default tr-text-ui",
		compact && "size-28 justify-center",
	);

	return (
		<IconTooltip
			label={
				compact
					? label
					: stale
						? t("shell.jbcentralQuota.staleTooltip", { time: observed })
						: t("shell.jbcentralQuota.availableTooltip", { time: observed })
			}
		>
			{stale ? (
				<button
					type="button"
					data-testid="jbcentral-quota"
					data-state="stale"
					aria-label={label}
					onClick={onRetry}
					className={`${className} rounded-sm outline-none hover:text-text-default focus-visible:ring-1 focus-visible:ring-focus-ring`}
				>
					{content}
				</button>
			) : (
				<span data-testid="jbcentral-quota" data-state="available" className={className}>
					{content}
				</span>
			)}
		</IconTooltip>
	);
}
