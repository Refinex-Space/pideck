import type { Translator } from "@thinkrail/locales/react";

export function formatTokens(count: number): string {
	if (count < 1_000) return count.toString();
	if (count < 9_950) return `${(count / 1_000).toFixed(1)}k`;
	if (count < 999_500) return `${Math.round(count / 1_000)}k`;
	if (count < 9_950_000) return `${(count / 1_000_000).toFixed(1)}M`;
	if (count < 999_500_000) return `${Math.round(count / 1_000_000)}M`;
	if (count < 9_950_000_000) return `${(count / 1_000_000_000).toFixed(1)}B`;
	return `${Math.round(count / 1_000_000_000)}B`;
}

export function formatCost(cost: number): string {
	return `$${cost.toFixed(3)}`;
}

export function formatElapsed(t: Translator, ms: number): string {
	const totalSec = Math.round(ms / 1000);
	const minutes = Math.floor(totalSec / 60);
	const seconds = totalSec % 60;
	return minutes > 0
		? t("chat.elapsed.minutesSeconds", { minutes, seconds })
		: t("chat.elapsed.seconds", { seconds });
}
