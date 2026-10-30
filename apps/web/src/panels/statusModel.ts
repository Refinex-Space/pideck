import type { GitFileChange, SessionStats } from "@thinkrail/contracts";
import { formatCost, formatTokens } from "../chat/usageFormat";

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

export type LedgerKey = "input" | "output" | "cacheRead" | "cacheWrite" | "cost" | "messages";

export interface LedgerRow {
	key: LedgerKey;
	text: string;
}

/** What the engine reports for the whole chat, so an empty counter is left out rather than shown as 0. */
export function ledgerRows(stats: SessionStats): LedgerRow[] {
	const rows: LedgerRow[] = [];
	const { input, output, cacheRead, cacheWrite } = stats.tokens;
	if (input > 0) rows.push({ key: "input", text: formatTokens(input) });
	if (output > 0) rows.push({ key: "output", text: formatTokens(output) });
	if (cacheRead > 0) rows.push({ key: "cacheRead", text: formatTokens(cacheRead) });
	if (cacheWrite > 0) rows.push({ key: "cacheWrite", text: formatTokens(cacheWrite) });
	if (stats.cost > 0) rows.push({ key: "cost", text: formatCost(stats.cost) });
	rows.push({ key: "messages", text: String(stats.totalMessages) });
	return rows;
}

export interface ChangesSummary {
	files: number;
	added: number;
	removed: number;
}

export function summarizeChanges(changes: readonly GitFileChange[]): ChangesSummary {
	let added = 0;
	let removed = 0;
	for (const change of changes) {
		added += change.added ?? 0;
		removed += change.removed ?? 0;
	}
	return { files: changes.length, added, removed };
}
