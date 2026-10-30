/** Extension-provided status lines (`ctx.ui.setStatus`); a chat without any renders no header row. */
export function ChatHeader({ statusEntries }: { statusEntries: [string, string][] }) {
	if (statusEntries.length === 0) return null;
	return (
		<div
			data-testid="chat-toolbar"
			className="flex h-panel-header-row shrink-0 items-center justify-end gap-8 overflow-clip bg-container-workspace-bg px-16"
		>
			{statusEntries.map(([key, text]) => (
				<span key={key} className="min-w-0 truncate text-text-muted tr-text-metadata">
					{text}
				</span>
			))}
		</div>
	);
}
