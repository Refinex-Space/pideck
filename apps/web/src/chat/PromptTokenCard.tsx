import { useT } from "@thinkrail/locales/react";
import { Popover, PopoverAnchor, PopoverContent } from "@thinkrail/ui/popover";
import { useEffect, useMemo, useState } from "react";
import { platformFamily } from "@/lib";
import type { PromptTokenHit } from "@/prompt";
import { slashCompletionItems } from "./completionItems";

const HOVER_DELAY_MS = 300;

/**
 * The card that explains a coloured token in the composer after a short hover: a command or skill shows its
 * description and source, a file shows its path and how to open it. It anchors to the token's rect and
 * never takes focus, so the caret stays where the user left it.
 */
export function PromptTokenCard({ hit }: { hit: PromptTokenHit | null }) {
	const t = useT();
	const [shown, setShown] = useState<PromptTokenHit | null>(null);
	useEffect(() => {
		if (!hit) {
			setShown(null);
			return;
		}
		const timer = setTimeout(() => setShown(hit), HOVER_DELAY_MS);
		return () => clearTimeout(timer);
	}, [hit]);

	const anchor = useMemo(
		() => ({ current: { getBoundingClientRect: () => shown?.rect ?? new DOMRect() } }),
		[shown],
	);
	if (!shown) return null;

	const { token } = shown;
	const command = token.command;
	const detail = command ? slashCompletionItems(t, [command])[0]?.detail : undefined;
	const title = detail?.title ?? token.path?.split("/").pop() ?? "";
	const body = detail?.body;
	const meta = detail?.meta ?? token.path;

	return (
		<Popover open>
			<PopoverAnchor virtualRef={anchor} />
			<PopoverContent
				side="top"
				align="start"
				sideOffset={6}
				data-testid="prompt-token-card"
				onOpenAutoFocus={(event) => event.preventDefault()}
				onCloseAutoFocus={(event) => event.preventDefault()}
				className="pointer-events-none flex w-[min(22rem,90vw)] flex-col gap-2 px-12 py-8"
			>
				<span className="truncate tr-text-emphasis text-text-default">{title}</span>
				{body ? (
					<span className="line-clamp-4 text-text-muted tr-text-metadata">{body}</span>
				) : null}
				{meta ? (
					<span title={meta} className="truncate text-text-muted tr-code-text tr-text-metadata">
						{meta}
					</span>
				) : null}
				{token.kind === "mention" ? (
					<span className="text-text-muted tr-text-metadata">
						{t("prompt.token.openHint", {
							key: platformFamily() === "apple" ? "⌘" : "Ctrl",
						})}
					</span>
				) : null}
			</PopoverContent>
		</Popover>
	);
}
