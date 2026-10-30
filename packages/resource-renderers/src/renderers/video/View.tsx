import { useT } from "@thinkrail/locales/react";
import { useState } from "react";
import type { ResourceViewProps } from "../../registry";

export default function VideoView({ resource, content }: ResourceViewProps) {
	const t = useT();
	const [failed, setFailed] = useState(false);
	if (content.kind !== "bytes")
		return <p className="p-16 text-text-muted tr-text-ui">{t("viewer.binary.unavailable")}</p>;
	return (
		<div
			className="flex h-full min-h-0 flex-col items-center justify-center gap-12 bg-container-workspace-bg p-16"
			data-testid="video-resource"
		>
			<video
				key={content.hash}
				controls
				playsInline
				preload="metadata"
				className="min-h-0 max-w-full flex-1 object-contain"
				aria-label={resource.path}
				onError={() => setFailed(true)}
				onLoadedData={() => setFailed(false)}
			>
				<source src={content.url} type="video/webm" />
				<track kind="captions" />
			</video>
			{failed && (
				<p role="alert" className="text-feedback-error tr-text-ui">
					{t("viewer.video.failed")}
				</p>
			)}
			<a
				href={content.url}
				download={resource.path.split("/").at(-1)}
				className="shrink-0 text-text-muted underline tr-text-ui"
			>
				{t("viewer.binary.openExternally")}
			</a>
		</div>
	);
}
