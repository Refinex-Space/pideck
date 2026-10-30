import type { Translator } from "@thinkrail/locales/react";
import { Blocks, Command, Puzzle, Sparkles } from "lucide-react";
import { FileTypeIcon, FolderTypeIcon } from "@/fileIcons";
import type { CompletionItem, SlashCommandItem } from "@/prompt";

export interface MentionCandidate {
	path: string;
	name: string;
	kind: "file" | "dir";
}

const ICON = "size-16";

const COMMAND_ICON = {
	builtin: <Command aria-hidden className={ICON} />,
	skill: <Blocks aria-hidden className={ICON} />,
	extension: <Puzzle aria-hidden className={ICON} />,
	prompt: <Sparkles aria-hidden className={ICON} />,
} satisfies Record<SlashCommandItem["source"], React.ReactNode>;

function groupLabel(t: Translator, source: SlashCommandItem["source"]): string {
	switch (source) {
		case "builtin":
			return t("prompt.completion.group.builtin");
		case "skill":
			return t("prompt.completion.group.skill");
		case "extension":
			return t("prompt.completion.group.extension");
		case "prompt":
			return t("prompt.completion.group.template");
	}
}

function scopeLabel(t: Translator, command: SlashCommandItem): string {
	if (command.source === "builtin") return t("prompt.slashMenu.builtinSource");
	switch (command.sourceInfo.scope) {
		case "user":
			return t("prompt.completion.scope.user");
		case "project":
			return t("prompt.completion.scope.project");
		case "temporary":
			return t("prompt.completion.scope.temporary");
	}
}

export function slashCompletionItems(
	t: Translator,
	commands: readonly SlashCommandItem[],
): CompletionItem[] {
	return commands.map((command) => ({
		key: `${command.source}:${command.sourceInfo.path}:${command.name}`,
		label: `/${command.name}`,
		secondary: command.description,
		tag: scopeLabel(t, command),
		icon: COMMAND_ICON[command.source],
		group: groupLabel(t, command.source),
		source: command.source,
		detail: {
			title: `/${command.name}`,
			body: command.description,
			meta: command.source === "builtin" ? undefined : command.sourceInfo.path,
		},
	}));
}

function parentDirectory(path: string): string | undefined {
	const trimmed = path.replace(/\/$/, "");
	const slash = trimmed.lastIndexOf("/");
	return slash > 0 ? trimmed.slice(0, slash) : undefined;
}

export function mentionCompletionItems(candidates: readonly MentionCandidate[]): CompletionItem[] {
	return candidates.map((candidate) => ({
		key: candidate.path,
		label: candidate.kind === "dir" ? `${candidate.name}/` : candidate.name,
		secondary: parentDirectory(candidate.path),
		icon:
			candidate.kind === "dir" ? (
				<FolderTypeIcon path={candidate.path} expanded={false} />
			) : (
				<FileTypeIcon path={candidate.path} />
			),
		group: "",
		detail: parentDirectory(candidate.path)
			? { title: candidate.name, meta: candidate.path }
			: undefined,
	}));
}
