import { useT } from "@thinkrail/locales/react";
import { buttonVariants } from "@thinkrail/ui/button";
import { IconTooltip } from "@thinkrail/ui/tooltip";
import { cn } from "@thinkrail/ui/utils";
import { type ContextSummary, type ContextTone, formatPercent } from "./contextUsage";
import { formatTokens } from "./usageFormat";

const RADIUS = 6;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const PROGRESS_STROKE: Record<ContextTone, string> = {
	info: "stroke-text-default",
	warning: "stroke-feedback-warning",
	error: "stroke-feedback-error",
};

/**
 * The chat's context window as one small ring beside the model: the arc is the share the engine has counted,
 * dark on a light track. Hover or focus names the numbers; a click opens the status dock for the full ledger.
 */
export function ContextRing({
	summary,
	onOpen,
}: {
	summary: ContextSummary | null;
	onOpen?: (() => void) | undefined;
}) {
	const t = useT();
	const percent = summary?.percent ?? null;
	const label =
		summary && percent !== null
			? t("chat.composer.context.used", {
					percent: formatPercent(percent),
					used: summary.tokens === null ? "?" : formatTokens(summary.tokens),
					window: formatTokens(summary.contextWindow),
				})
			: t("status.context.unknown");
	return (
		<IconTooltip label={label} side="top">
			<button
				type="button"
				data-testid="context-ring"
				data-tone={summary?.tone ?? "info"}
				data-percent={percent === null ? undefined : Math.round(percent)}
				aria-label={label}
				onClick={onOpen}
				className={cn(buttonVariants({ variant: "ghost", size: "m", shape: "icon" }), "shrink-0")}
			>
				<svg aria-hidden="true" viewBox="0 0 16 16" className="size-16 -rotate-90 fill-none">
					<circle cx="8" cy="8" r={RADIUS} strokeWidth="2" className="stroke-border-default" />
					{percent === null || percent <= 0 ? null : (
						<circle
							data-testid="context-ring-progress"
							cx="8"
							cy="8"
							r={RADIUS}
							strokeWidth="2"
							strokeLinecap="round"
							strokeDasharray={`${(percent / 100) * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
							className={PROGRESS_STROKE[summary?.tone ?? "info"]}
						/>
					)}
				</svg>
			</button>
		</IconTooltip>
	);
}
