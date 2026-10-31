import { useT } from "@thinkrail/locales/react";
import { BlockFrame, useCopyFeedback } from "@thinkrail/ui/block-frame";
import { IconButton } from "@thinkrail/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@thinkrail/ui/dialog";
import { onThemeSwap } from "@thinkrail/ui/theme";
import { cn } from "@thinkrail/ui/utils";
import { Check, Code, Copy, ImageDown, Maximize2, Workflow } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { downloadDiagram } from "./exportSvg";
import { renderMermaid } from "./mermaid";
import { PanZoomView } from "./PanZoomView";

export function MermaidView({
	source,
	title,
	fallback,
	className,
}: {
	source: string;
	title?: string;
	/** The highlighted source, shown while the diagram renders and in source mode. */
	fallback?: ReactNode;
	className?: string;
}) {
	const t = useT();
	const [svg, setSvg] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [open, setOpen] = useState(false);
	const [showSource, setShowSource] = useState(false);
	const { copied, copy } = useCopyFeedback();

	useEffect(() => {
		let cancelled = false;
		const run = () => {
			renderMermaid(source).then((res) => {
				if (cancelled) return;
				if (res.svg !== undefined) {
					setSvg(res.svg);
					setError(null);
				} else {
					setError(res.error ?? "");
				}
			});
		};
		setSvg(null);
		setError(null);
		run();
		const stopThemeWatch = onThemeSwap(run);
		return () => {
			cancelled = true;
			stopThemeWatch();
		};
	}, [source]);

	if (error !== null) {
		return (
			<div data-testid="mermaid-error" className={cn("flex flex-col gap-4", className)}>
				<span className="text-feedback-error tr-text-metadata">
					{t("visualize.mermaid.renderFailed", {
						error: error || t("visualize.mermaid.renderFailedFallback"),
					})}
				</span>
				<pre className="overflow-auto rounded-md border border-border-muted bg-container-header-bg p-8 tr-code-text text-text-default">
					{source}
				</pre>
			</div>
		);
	}
	const ready = svg !== null;
	const sourceView = !ready || showSource;
	return (
		<BlockFrame
			data-testid="mermaid-block"
			className={cn(!sourceView && "bg-container-workspace-bg", className)}
			toolbar={
				<>
					<IconButton
						size="s"
						icon={sourceView ? Workflow : Code}
						label={t(sourceView ? "visualize.mermaid.showDiagram" : "visualize.mermaid.showSource")}
						data-testid="mermaid-toggle-source"
						aria-pressed={showSource}
						selected={showSource}
						disabled={!ready}
						onClick={() => setShowSource((on) => !on)}
					/>
					<IconButton
						size="s"
						icon={copied ? Check : Copy}
						label={t(copied ? "visualize.mermaid.copied" : "visualize.mermaid.copySource")}
						data-testid="mermaid-copy"
						data-copied={copied || undefined}
						onClick={() => copy(source)}
					/>
					<IconButton
						size="s"
						icon={ImageDown}
						label={t("visualize.mermaid.download")}
						data-testid="mermaid-download"
						disabled={sourceView}
						onClick={() => {
							if (svg !== null) void downloadDiagram(svg, title);
						}}
					/>
					<IconButton
						size="s"
						icon={Maximize2}
						label={t("visualize.mermaid.fullScreenLabel")}
						tooltip={t("visualize.mermaid.fullScreen")}
						data-testid="mermaid-fullscreen"
						disabled={sourceView}
						onClick={() => setOpen(true)}
					/>
				</>
			}
		>
			{sourceView ? (
				(fallback ??
				(ready ? (
					<pre className="overflow-auto p-8 tr-code-text text-text-default">{source}</pre>
				) : (
					<span className="block p-8 text-text-muted tr-text-metadata">
						{t("visualize.mermaid.rendering")}
					</span>
				)))
			) : (
				<div
					data-testid="mermaid-svg"
					className="overflow-auto p-8 [&_svg]:h-auto [&_svg]:max-w-full"
					dangerouslySetInnerHTML={{ __html: svg }}
				/>
			)}
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent
					data-testid="mermaid-fullscreen-dialog"
					className="flex h-[90vh] w-[95vw] max-w-[95vw] flex-col gap-8"
				>
					<DialogHeader>
						<DialogTitle>{title || t("visualize.mermaid.dialogTitle")}</DialogTitle>
					</DialogHeader>
					{svg !== null ? <PanZoomView svg={svg} /> : null}
				</DialogContent>
			</Dialog>
		</BlockFrame>
	);
}
