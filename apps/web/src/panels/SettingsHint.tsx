import { IconButton } from "@thinkrail/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@thinkrail/ui/popover";
import { Info } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

const CLOSE_DELAY_MS = 120;

/** An info icon that opens an explanation on hover or focus and pins it on click, so a page stays terse. */
export function SettingsHint({
	label,
	testId,
	children,
}: {
	/** Accessible name of the icon. */
	label: string;
	testId?: string;
	children: ReactNode;
}) {
	const [hovering, setHovering] = useState(false);
	const [pinned, setPinned] = useState(false);
	const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	useEffect(() => () => (closeTimer.current ? clearTimeout(closeTimer.current) : undefined), []);

	const enter = (event: React.PointerEvent) => {
		if (event.pointerType !== "mouse") return;
		if (closeTimer.current) clearTimeout(closeTimer.current);
		setHovering(true);
	};
	// The gap between icon and card must not close the card on the way across.
	const leave = () => {
		if (closeTimer.current) clearTimeout(closeTimer.current);
		closeTimer.current = setTimeout(() => setHovering(false), CLOSE_DELAY_MS);
	};

	return (
		<Popover
			open={hovering || pinned}
			onOpenChange={(next) => {
				if (next) return;
				setPinned(false);
				setHovering(false);
			}}
		>
			<PopoverTrigger asChild>
				<IconButton
					size="s"
					icon={Info}
					label={label}
					tooltip={null}
					data-testid={testId}
					aria-expanded={hovering || pinned}
					onPointerEnter={enter}
					onPointerLeave={leave}
					onClick={(event) => {
						event.preventDefault();
						setPinned((was) => !was);
					}}
				/>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				data-testid={testId ? `${testId}-content` : undefined}
				className="flex w-[340px] max-w-[calc(100vw-32px)] flex-col gap-8 p-12 tr-text-metadata text-text-muted"
				onOpenAutoFocus={(event) => event.preventDefault()}
				onPointerEnter={enter}
				onPointerLeave={leave}
			>
				{children}
			</PopoverContent>
		</Popover>
	);
}
