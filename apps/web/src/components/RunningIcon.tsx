import { useT } from "@thinkrail/locales/react";
import { cn } from "@thinkrail/ui/utils";
import { useId } from "react";
import { BRAND_MARK_SEGMENTS } from "../constants/branding";

const FRAME_HALVES = [
	"M20 195 V110 A90 90 0 0 1 110 20 H650 A90 90 0 0 1 740 110 V552",
	"M20 225 V650 A90 90 0 0 0 110 740 H650 A90 90 0 0 0 740 650 V548",
] as const;

const STROKES: ReadonlyArray<{
	d: string;
	join: "miter" | "round";
	width: number;
	clip: keyof typeof BRAND_MARK_SEGMENTS;
	className: string;
}> = [
	{
		d: "M223.97 634.72 V223.97 H458.68 V341.32 H341.32 V458.68 H223.97",
		join: "miter",
		width: 117.36,
		clip: "p",
		className: "motion-safe:animate-loader-t-stem",
	},
	{
		d: "M576.04 400 V634.72",
		join: "miter",
		width: 117.36,
		clip: "i",
		className: "motion-safe:animate-loader-r-leg",
	},
];

export function RunningIcon({ className }: { className?: string | undefined }) {
	const t = useT();
	const id = useId();
	const clipId = (name: string) => `${id}-${name}`;

	return (
		<span
			data-testid="running-icon"
			data-running="true"
			role="img"
			aria-label={t("components.runningIcon.label")}
			className={cn("inline-flex shrink-0 items-center justify-center", className)}
		>
			<svg aria-hidden="true" viewBox="0 0 760 760" className="size-full">
				<defs>
					{Object.entries(BRAND_MARK_SEGMENTS).map(([name, d]) => (
						<clipPath key={name} id={clipId(name)}>
							<path d={d} fillRule="evenodd" clipRule="evenodd" />
						</clipPath>
					))}
				</defs>
				{FRAME_HALVES.map((d) => (
					<path
						key={d}
						data-testid="running-icon-frame"
						d={d}
						fill="none"
						stroke="currentColor"
						strokeWidth="40"
						strokeLinejoin="round"
						strokeDasharray="1000 1000"
						pathLength="1000"
						className="motion-safe:animate-loader-frame"
					/>
				))}
				<g transform="scale(0.95)">
					{STROKES.map((stroke) => (
						<path
							key={stroke.d}
							d={stroke.d}
							fill="none"
							stroke="currentColor"
							strokeWidth={stroke.width}
							strokeLinejoin={stroke.join}
							strokeDasharray="1000 1000"
							pathLength="1000"
							clipPath={`url(#${clipId(stroke.clip)})`}
							className={stroke.className}
						/>
					))}
				</g>
			</svg>
		</span>
	);
}
