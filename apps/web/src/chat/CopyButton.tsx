import { useT } from "@thinkrail/locales/react";
import { IconButton } from "@thinkrail/ui/button";
import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { copyText } from "@/lib";

export function CopyButton({ getText, label }: { getText: () => string; label?: string }) {
	const t = useT();
	const accessibleLabel = label ?? t("chat.copyMessage");
	const [copied, setCopied] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	useEffect(() => () => (timer.current ? clearTimeout(timer.current) : undefined), []);

	return (
		<IconButton
			size="s"
			icon={copied ? Check : Copy}
			data-testid="chat-copy"
			data-copied={copied || undefined}
			label={accessibleLabel}
			onClick={() => {
				void (async () => {
					if (!(await copyText(getText()))) return;
					setCopied(true);
					if (timer.current) clearTimeout(timer.current);
					timer.current = setTimeout(() => setCopied(false), 1200);
				})();
			}}
			className="shrink-0"
		/>
	);
}
