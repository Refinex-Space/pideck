import { cn } from "@thinkrail/ui/utils";
import { useEffect, useRef, useState } from "react";

const BAR_WIDTH = 2;
const PITCH = 6;

function usePrefersReducedMotion(): boolean {
	const [reduced, setReduced] = useState(
		() =>
			typeof window.matchMedia === "function" &&
			window.matchMedia("(prefers-reduced-motion: reduce)").matches,
	);
	useEffect(() => {
		if (typeof window.matchMedia !== "function") return;
		const query = window.matchMedia("(prefers-reduced-motion: reduce)");
		const onChange = () => setReduced(query.matches);
		query.addEventListener("change", onChange);
		return () => query.removeEventListener("change", onChange);
	}, []);
	return reduced;
}

function draw(canvas: HTMLCanvasElement, levels: readonly number[], reduced: boolean): void {
	const ratio = window.devicePixelRatio || 1;
	const width = canvas.clientWidth;
	const height = canvas.clientHeight;
	if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
		canvas.width = Math.round(width * ratio);
		canvas.height = Math.round(height * ratio);
	}
	const context = canvas.getContext("2d");
	if (!context) return;
	context.setTransform(ratio, 0, 0, ratio, 0, 0);
	context.clearRect(0, 0, width, height);
	context.fillStyle = getComputedStyle(canvas).color;
	const slots = Math.floor(width / PITCH);
	const recent = levels.slice(-slots);
	const offset = slots - recent.length;
	for (let slot = 0; slot < slots; slot++) {
		const level = reduced ? 0 : (recent[slot - offset] ?? 0);
		const barHeight = Math.max(BAR_WIDTH, level * height);
		const x = width - (slots - slot) * PITCH + (PITCH - BAR_WIDTH) / 2;
		context.beginPath();
		context.roundRect(x, (height - barHeight) / 2, BAR_WIDTH, barHeight, BAR_WIDTH / 2);
		context.fill();
	}
}

interface WaveformProps {
	/** Loudness readings, oldest first, 0..1, from the live microphone signal. */
	levels: readonly number[];
	className?: string;
}

/**
 * A rolling loudness strip: every slot is one real reading, silence is a dot and speech grows into a bar,
 * and new readings enter from the right. With reduced motion it stays a still row of dots.
 */
export function Waveform({ levels, className }: WaveformProps) {
	const ref = useRef<HTMLCanvasElement>(null);
	const reduced = usePrefersReducedMotion();
	useEffect(() => {
		const canvas = ref.current;
		if (canvas) draw(canvas, levels, reduced);
	}, [levels, reduced]);
	useEffect(() => {
		const canvas = ref.current;
		if (!canvas) return;
		const observer = new ResizeObserver(() => draw(canvas, levels, reduced));
		observer.observe(canvas);
		return () => observer.disconnect();
	}, [levels, reduced]);
	return (
		<canvas
			ref={ref}
			aria-hidden
			data-testid="dictation-waveform"
			data-reduced-motion={reduced}
			data-peak={Math.max(0, ...levels).toFixed(2)}
			className={cn(
				"h-24 w-[calc(var(--space-64)+var(--space-40))] shrink-0 text-text-muted",
				className,
			)}
		/>
	);
}
