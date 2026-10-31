import { useT } from "@thinkrail/locales/react";
import { BlockFrame, useCopyFeedback } from "@thinkrail/ui/block-frame";
import { IconButton } from "@thinkrail/ui/button";
import { Check, Copy } from "lucide-react";
import type { ReactNode } from "react";

/** A bordered code block whose hover toolbar names the language and copies the code. */
export function CodeFrame({
	code,
	lang,
	children,
}: {
	code: string;
	lang?: string | undefined;
	children: ReactNode;
}) {
	const t = useT();
	const { copied, copy } = useCopyFeedback();
	return (
		<BlockFrame
			data-testid="code-block"
			className="my-8"
			toolbar={
				<>
					{lang ? (
						<span data-testid="code-lang" className="px-4 text-text-subtle tr-text-metadata">
							{lang}
						</span>
					) : null}
					<IconButton
						size="s"
						icon={copied ? Check : Copy}
						data-testid="code-copy"
						data-copied={copied || undefined}
						label={copied ? t("chat.code.copied") : t("chat.code.copy")}
						onClick={() => copy(code)}
					/>
				</>
			}
		>
			{children}
		</BlockFrame>
	);
}
