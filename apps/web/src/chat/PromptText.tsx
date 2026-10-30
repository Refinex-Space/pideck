import { cn } from "@thinkrail/ui/utils";
import { promptSegments, scanPromptTokens } from "@/prompt";
import { workspaceFileTarget } from "./fileTargets";

const TOKEN_CLASS = "rounded-xs bg-feedback-info-subtle text-feedback-info";

/** A sent `@mention` is a path-shaped word: a separator or a file extension. `@alice` stays plain. */
function looksLikePath(path: string): boolean {
	return /[\\/]/.test(path) || /\.[A-Za-z0-9]+$/.test(path);
}

/**
 * A sent prompt with the same tokens the composer coloured: a skill reference, and an `@path` that opens in
 * the workbench when it is a file of this workspace. Display only, so a word that merely looks like a path is
 * the worst case, and the text itself is untouched.
 */
export function PromptText({
	text,
	workspaceRoot,
	onOpenFile,
}: {
	text: string;
	workspaceRoot?: string | undefined;
	onOpenFile?: ((path: string) => void) | undefined;
}) {
	const tokens = scanPromptTokens(text, { commands: [], anySkill: true, hasPath: looksLikePath });
	if (tokens.length === 0) return text;
	return promptSegments(text, tokens).map((segment) => {
		const { token } = segment;
		if (!token) return segment.text;
		const target =
			token.kind === "mention" && token.path && onOpenFile
				? workspaceFileTarget(token.path, workspaceRoot)
				: null;
		if (target && onOpenFile) {
			return (
				<button
					key={segment.start}
					type="button"
					data-testid="user-mention"
					data-token-kind="mention"
					data-path={target}
					title={target}
					onClick={() => onOpenFile(target)}
					className={cn(
						TOKEN_CLASS,
						"cursor-pointer outline-none hover:bg-feedback-info-muted focus-visible:ring-1 focus-visible:ring-focus-ring",
					)}
				>
					{segment.text}
				</button>
			);
		}
		return (
			<span
				key={segment.start}
				data-testid="user-token"
				data-token-kind={token.kind}
				className={TOKEN_CLASS}
			>
				{segment.text}
			</span>
		);
	});
}
