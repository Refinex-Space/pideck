import { useT } from "@thinkrail/locales/react";
import { IconTooltip } from "@thinkrail/ui/tooltip";
import { cn } from "@thinkrail/ui/utils";
import { useNow } from "@/components/useNow";
import { relativeTime } from "@/lib";
import { CopyButton } from "./CopyButton";

/**
 * The hover strip under a message: time and copy on the user's side (right), copy and time on the
 * assistant's (left). It reserves its row so revealing it never shifts the transcript.
 */
export function MessageActionBar({
	side,
	getText,
	timestamp,
}: {
	side: "left" | "right";
	getText: () => string;
	timestamp?: number | undefined;
}) {
	const t = useT();
	const now = useNow();
	const time = timestamp ? (
		<IconTooltip label={new Date(timestamp).toLocaleString()} wrapTrigger>
			<span data-testid="message-time" className="px-4 tr-text-metadata text-text-subtle">
				{relativeTime(t, timestamp, now)}
			</span>
		</IconTooltip>
	) : null;
	return (
		<div
			data-testid="message-actions"
			className={cn(
				"flex h-24 items-center gap-2 opacity-0 transition-opacity duration-[var(--motion-duration-fast)] focus-within:opacity-100 group-hover/message:opacity-100",
				side === "right" ? "justify-end" : "justify-start",
			)}
		>
			{side === "right" ? time : null}
			<CopyButton getText={getText} />
			{side === "left" ? time : null}
		</div>
	);
}
