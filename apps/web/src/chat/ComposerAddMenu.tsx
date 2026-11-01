import type { MessageKey } from "@thinkrail/locales";
import { useT } from "@thinkrail/locales/react";
import { IconButton } from "@thinkrail/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@thinkrail/ui/dropdown-menu";
import { AtSign, Blocks, Command, ImagePlus, Plug, Plus, Sparkles } from "lucide-react";
import type { ComponentType } from "react";

export type ComposerAddAction = "images" | "files" | "skills" | "templates" | "commands" | "mcp";

/**
 * Pi dispatches a `/command` or a prompt template only from the start of a message, so those rows wait for an
 * empty draft; images, `@` mentions and skills (which hoist out of mid-text) work anywhere.
 */
export function composerAddAvailability(input: {
	draftEmpty: boolean;
	skillCount: number;
}): Record<Exclude<ComposerAddAction, "mcp">, boolean> {
	return {
		images: true,
		files: true,
		skills: input.skillCount > 0,
		templates: input.draftEmpty,
		commands: input.draftEmpty,
	};
}

interface AddRow {
	action: Exclude<ComposerAddAction, "mcp">;
	icon: ComponentType<{ "aria-hidden"?: boolean }>;
	label: MessageKey;
	hint?: string;
	startOnly?: boolean;
}

const ROWS: readonly AddRow[] = [
	{ action: "images", icon: ImagePlus, label: "chat.composer.add.images" },
	{ action: "files", icon: AtSign, label: "chat.composer.add.files", hint: "@" },
	{ action: "skills", icon: Blocks, label: "chat.composer.add.skills", hint: "/" },
	{
		action: "templates",
		icon: Sparkles,
		label: "chat.composer.add.templates",
		hint: "/",
		startOnly: true,
	},
	{
		action: "commands",
		icon: Command,
		label: "chat.composer.add.commands",
		hint: "/",
		startOnly: true,
	},
];

/** The composer's “+”: what can be put into this message, each row handing the draft to the matching picker. */
export function ComposerAddMenu({
	draftEmpty,
	skillCount,
	showMcp,
	onAction,
	onCloseAutoFocus,
}: {
	draftEmpty: boolean;
	skillCount: number;
	showMcp: boolean;
	onAction: (action: ComposerAddAction) => void;
	onCloseAutoFocus: (event: Event) => void;
}) {
	const t = useT();
	const available = composerAddAvailability({ draftEmpty, skillCount });
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<IconButton
					variant="ghost"
					size="l"
					icon={Plus}
					data-testid="composer-add"
					label={t("chat.composer.add.label")}
				/>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				side="top"
				align="start"
				data-testid="composer-add-menu"
				className="min-w-[14rem]"
				onCloseAutoFocus={onCloseAutoFocus}
			>
				{ROWS.map(({ action, icon: Icon, label, hint, startOnly }) => (
					<DropdownMenuItem
						key={action}
						data-testid={`composer-add-${action}`}
						disabled={!available[action]}
						onSelect={() => onAction(action)}
					>
						<Icon aria-hidden />
						<span className="min-w-0 flex-1 truncate">{t(label)}</span>
						{startOnly && !available[action] ? (
							<span className="shrink-0 text-text-subtle tr-text-metadata">
								{t("chat.composer.add.startOnly")}
							</span>
						) : hint ? (
							<span className="shrink-0 text-text-subtle tr-text-metadata">{hint}</span>
						) : null}
					</DropdownMenuItem>
				))}
				{showMcp ? (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuItem data-testid="composer-add-mcp" onSelect={() => onAction("mcp")}>
							<Plug aria-hidden />
							<span className="min-w-0 flex-1 truncate">{t("chat.composer.add.mcp")}</span>
						</DropdownMenuItem>
					</>
				) : null}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
