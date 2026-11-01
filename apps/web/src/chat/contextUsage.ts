import type { SessionStats } from "@thinkrail/contracts";

export type ContextTone = "info" | "warning" | "error";

export interface ContextSummary {
	/** 0–100, or null while the engine has no estimate (right after a compaction, say). */
	percent: number | null;
	tokens: number | null;
	contextWindow: number;
	tone: ContextTone;
}

export function contextTone(percent: number | null): ContextTone {
	if (percent === null) return "info";
	if (percent >= 95) return "error";
	if (percent >= 80) return "warning";
	return "info";
}

export function formatPercent(percent: number, locale?: string): string {
	return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }).format(
		percent / 100,
	);
}

export function summarizeContext(stats: SessionStats | null): ContextSummary | null {
	const usage = stats?.contextUsage;
	if (!usage) return null;
	return {
		percent: usage.percent === null ? null : Math.min(100, Math.max(0, usage.percent)),
		tokens: usage.tokens,
		contextWindow: usage.contextWindow,
		tone: contextTone(usage.percent),
	};
}
