import type { SlashCommandInfo, TemplateInfo } from "@thinkrail/contracts";
import { useT } from "@thinkrail/locales/react";
import { Button } from "@thinkrail/ui/button";
import { cn } from "@thinkrail/ui/utils";
import { useState } from "react";
import type { PromptTrigger } from "./triggers";

export type SlashCommandItem = Omit<SlashCommandInfo, "source"> & {
	source: SlashCommandInfo["source"] | "builtin";
};

const MAX_MATCHES = 20;
const GROUP_ORDER: readonly SlashCommandItem["source"][] = [
	"builtin",
	"skill",
	"extension",
	"prompt",
];
const IME_SENTINEL_KEYCODE = 229;

export function isPromptKeyEventComposing(event: {
	isComposing: boolean;
	keyCode: number;
}): boolean {
	return event.isComposing || event.keyCode === IME_SENTINEL_KEYCODE;
}

export async function slashCommandCatalogOrEmpty(
	load: () => Promise<SlashCommandInfo[]>,
): Promise<SlashCommandInfo[]> {
	try {
		return await load();
	} catch {
		return [];
	}
}

function matchRank(name: string, query: string): number {
	const lower = name.toLowerCase();
	if (lower.startsWith(query)) return 0;
	if (lower.slice(lower.indexOf(":") + 1).startsWith(query)) return 1;
	return lower.includes(query) ? 2 : 3;
}

/**
 * The commands a `/` token can pick, grouped by source and best match first inside a group. Pi only runs a
 * command opening the draft, so a mid-text token offers skills alone.
 */
export function matchSlashCommands<T extends SlashCommandItem>(
	trigger: PromptTrigger | null,
	commands: readonly T[],
): T[] {
	if (trigger?.kind !== "slash") return [];
	const query = trigger.query.toLowerCase();
	return commands
		.filter((command) => trigger.leading || command.source === "skill")
		.map((command) => ({ command, rank: matchRank(command.name, query) }))
		.filter(({ rank }) => rank < 3)
		.sort(
			(a, b) =>
				GROUP_ORDER.indexOf(a.command.source) - GROUP_ORDER.indexOf(b.command.source) ||
				a.rank - b.rank,
		)
		.slice(0, MAX_MATCHES)
		.map(({ command }) => command);
}

export function templateToSlashCommand(template: TemplateInfo): SlashCommandInfo {
	return {
		name: template.name,
		...(template.description ? { description: template.description } : {}),
		source: "prompt",
		sourceInfo: {
			path: template.filePath,
			source: "local",
			scope: template.scope === "global" ? "user" : "project",
			origin: "top-level",
		},
	};
}

export type SlashCompletionKeyAction =
	| { type: "none" }
	| { type: "move"; index: number }
	| { type: "select"; index: number }
	| { type: "dismiss" };

export function slashCompletionKeyAction(
	key: string,
	open: boolean,
	activeIndex: number,
	matchCount: number,
): SlashCompletionKeyAction {
	if (!open || matchCount === 0) return { type: "none" };
	if (key === "ArrowDown") return { type: "move", index: (activeIndex + 1) % matchCount };
	if (key === "ArrowUp") {
		return { type: "move", index: (activeIndex - 1 + matchCount) % matchCount };
	}
	if (key === "Enter" || key === "Tab") return { type: "select", index: activeIndex };
	if (key === "Escape") return { type: "dismiss" };
	return { type: "none" };
}

interface CompletionKeyEvent {
	key: string;
	preventDefault: () => void;
	stopPropagation: () => void;
}

/**
 * The keyboard and selection state behind one completion popup. `items` is empty while no trigger is active;
 * `signal` changes whenever the menu should start over (a new query, a new candidate list), which re-arms a
 * dismissed menu and returns the highlight to the first row.
 */
export function useCompletion<T>({
	items,
	signal,
	onSelect,
}: {
	items: readonly T[];
	signal: string;
	onSelect: (item: T) => void;
}) {
	const [activeIndex, setActiveIndex] = useState(0);
	const [dismissed, setDismissed] = useState(false);

	const [lastSignal, setLastSignal] = useState(signal);
	if (lastSignal !== signal) {
		setLastSignal(signal);
		setActiveIndex(0);
		setDismissed(false);
	}

	const open = !dismissed && items.length > 0;
	const visibleActiveIndex = Math.min(activeIndex, Math.max(0, items.length - 1));

	const dismiss = () => setDismissed(true);

	const pick = (item: T) => {
		onSelect(item);
		dismiss();
	};

	const handleKeyDown = (event: CompletionKeyEvent): boolean => {
		const action = slashCompletionKeyAction(event.key, open, visibleActiveIndex, items.length);
		if (action.type === "none") return false;
		event.preventDefault();
		event.stopPropagation();
		if (action.type === "move") setActiveIndex(action.index);
		if (action.type === "dismiss") dismiss();
		if (action.type === "select") {
			const item = items[action.index];
			if (item !== undefined) pick(item);
		}
		return true;
	};

	return { activeIndex: visibleActiveIndex, setActiveIndex, dismiss, handleKeyDown, open, pick };
}

export function useSlashCommandCompletion<T extends SlashCommandItem>({
	trigger,
	commands,
	onSelect,
}: {
	trigger: PromptTrigger | null;
	commands: readonly T[];
	onSelect: (command: T) => void;
}) {
	const slash = trigger?.kind === "slash" ? trigger : null;
	const matches = matchSlashCommands(slash, commands);
	const completion = useCompletion({
		items: matches,
		signal: JSON.stringify([
			slash?.query ?? null,
			slash?.start ?? null,
			matches.map((m) => m.name),
		]),
		onSelect,
	});
	return { ...completion, matches };
}

export function TemplateSlotHint({
	activeIndex,
	count,
	onNext,
	className,
}: {
	activeIndex: number;
	count: number;
	onNext: () => void;
	className?: string;
}) {
	const t = useT();
	return (
		<Button
			variant="outline"
			size="s"
			data-testid="slot-hint"
			onClick={onNext}
			className={cn("shadow-[var(--shadow-md)]", className)}
		>
			{t("prompt.slotHint.label", { index: activeIndex + 1, count })}
		</Button>
	);
}
