import type { FileNode } from "@thinkrail/contracts";
import { useT } from "@thinkrail/locales/react";
import { LoadingRegion } from "@thinkrail/ui/skeleton";
import { useEffect, useState } from "react";
import { FileTypeIcon, FolderTypeIcon } from "../fileIcons";
import { useAppStore } from "../store";
import { errorText, getTransport } from "../transport";
import { FileEntryActions } from "./FileEntryActions";
import { openFileInTab } from "./openTabs";

export function FileSearch({
	workspaceId,
	query,
	includeIgnored,
	onDirectory,
}: {
	workspaceId: string;
	query: string;
	includeIgnored: boolean;
	onDirectory(path: string): void;
}) {
	const t = useT();
	const tick = useAppStore((s) => s.fsChangesByWorkspace[workspaceId]?.tick ?? 0);
	const [result, setResult] = useState<{ entries: FileNode[]; truncated: boolean } | null>(null);
	const [error, setError] = useState<string | null>(null);
	useEffect(() => {
		let current = true;
		setResult(null);
		setError(null);
		const timer = window.setTimeout(() => {
			void getTransport()
				.request("fs.search", { workspaceId, query, includeIgnored })
				.then((value) => {
					if (current) setResult(value);
				})
				.catch((failure) => {
					if (current) setError(errorText(failure, t("files.searchFailed")));
				});
		}, 180);
		return () => {
			current = false;
			window.clearTimeout(timer);
		};
	}, [workspaceId, query, includeIgnored, tick, t]);
	return (
		<div
			className="min-h-0 flex-1 overflow-auto p-8"
			data-testid="file-search-results"
			aria-busy={!result && !error}
		>
			{!result && !error ? <LoadingRegion rows={6} /> : null}
			{error ? (
				<p role="alert" className="tr-text-ui text-feedback-error">
					{error}
				</p>
			) : null}
			{result?.entries.length === 0 ? (
				<p className="p-8 tr-text-ui text-text-muted">{t("files.noResults")}</p>
			) : null}
			{result?.truncated ? (
				<p className="p-8 tr-text-metadata text-text-muted">{t("files.partialResults")}</p>
			) : null}
			<ul className="flex flex-col gap-2">
				{result?.entries.map((entry) => (
					<li key={entry.path}>
						<FileEntryActions
							workspaceId={workspaceId}
							path={entry.path}
							kind={entry.kind}
							onOpen={() =>
								entry.kind === "dir"
									? onDirectory(entry.path)
									: void openFileInTab(workspaceId, entry.path, "keep")
							}
						>
							{({ onContextMenu, onKeyDown, trigger }) => (
								<div className="group/entry flex min-w-0 items-center rounded-sm hover:bg-control-bg-hovered">
									<button
										type="button"
										data-testid="file-search-row"
										title={entry.path}
										onContextMenu={onContextMenu}
										onClick={() =>
											entry.kind === "dir"
												? onDirectory(entry.path)
												: void openFileInTab(workspaceId, entry.path, "keep")
										}
										onKeyDown={(event) => {
											onKeyDown(event);
											if (event.defaultPrevented) return;
											if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
											const rows = [
												...(event.currentTarget
													.closest('[data-testid="file-search-results"]')
													?.querySelectorAll<HTMLButtonElement>(
														'[data-testid="file-search-row"]',
													) ?? []),
											];
											const index =
												rows.indexOf(event.currentTarget) + (event.key === "ArrowDown" ? 1 : -1);
											if (rows[index]) {
												event.preventDefault();
												rows[index]?.focus();
											}
										}}
										className="flex min-w-0 flex-1 items-center gap-8 rounded-sm p-8 text-left outline-none focus-visible:ring-1 focus-visible:ring-focus-ring"
									>
										{entry.kind === "dir" ? (
											<FolderTypeIcon path={entry.path} expanded={false} />
										) : (
											<FileTypeIcon path={entry.path} />
										)}
										<span className="flex min-w-0 flex-1 flex-col">
											<span className="truncate tr-text-ui text-text-default">{entry.name}</span>
											<span className="truncate tr-text-metadata text-text-muted">
												{entry.path}
											</span>
										</span>
									</button>
									{trigger}
								</div>
							)}
						</FileEntryActions>
					</li>
				))}
			</ul>
		</div>
	);
}
