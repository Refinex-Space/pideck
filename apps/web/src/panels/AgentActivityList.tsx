import { useT } from "@thinkrail/locales/react";
import { IconButton } from "@thinkrail/ui/button";
import { ChevronDown, ChevronRight, Eye, FolderOpen, Pencil, Search, X } from "lucide-react";
import { useState } from "react";
import { useNow } from "../components/useNow";
import { type AgentActivityEntry, activityVisible, useAppStore } from "../store";
import { agentActivityLabel } from "./agentActivityLabels";
import { openFileInTab } from "./openTabs";
import { useAgentActivity } from "./useAgentActivity";

const LIST_ROWS = 8;

const KIND_ICON = {
	read: Eye,
	search: Search,
	list: FolderOpen,
	write: Pencil,
} as const;

function splitPath(path: string): { name: string; dir: string } {
	const cut = path.lastIndexOf("/");
	return cut < 0 ? { name: path, dir: "" } : { name: path.slice(cut + 1), dir: path.slice(0, cut) };
}

function Ago({ entry, now }: { entry: AgentActivityEntry; now: number }) {
	const t = useT();
	const seconds = Math.max(0, Math.round((now - entry.startedAt) / 1000));
	return (
		<span className="shrink-0 tr-text-metadata text-text-subtle">
			{seconds < 10
				? t("panels.fileActivity.list.now")
				: seconds < 60
					? t("panels.fileActivity.list.seconds", { n: seconds })
					: t("panels.fileActivity.list.minutes", { n: Math.round(seconds / 60) })}
		</span>
	);
}

/**
 * The latest things the agent did to the workspace's files, under the tree: what a lit row cannot
 * keep showing once it fades, and a way to open any of it. Settled work only; a row is one click away
 * from the file in the tree and in a preview tab.
 */
export function AgentActivityList({ workspaceId }: { workspaceId: string }) {
	const t = useT();
	const { recent, preferences } = useAgentActivity(workspaceId);
	const [open, setOpen] = useState(true);
	const now = useNow();
	const rows = recent.filter((entry) => activityVisible(entry, preferences)).slice(-LIST_ROWS);
	if (!preferences.enabled || !preferences.timeline || rows.length === 0) return null;
	const Chevron = open ? ChevronDown : ChevronRight;
	const show = (entry: AgentActivityEntry) => {
		const directory = entry.kind === "list" || entry.expandSelf;
		useAppStore.getState().showFilesPath(workspaceId, entry.path, directory ? "dir" : "file");
		if (!directory) void openFileInTab(workspaceId, entry.path, "preview");
	};
	return (
		<section
			data-testid="agent-activity-list"
			className="flex max-h-[45%] shrink-0 flex-col border-border-default border-t"
		>
			<div className="flex h-panel-header-row shrink-0 items-center gap-4 px-12">
				<button
					type="button"
					aria-expanded={open}
					data-testid="agent-activity-toggle"
					onClick={() => setOpen((value) => !value)}
					className="flex min-w-0 flex-1 items-center gap-4 rounded-sm text-left tr-text-ui text-text-muted outline-none hover:text-text-default focus-visible:ring-1 focus-visible:ring-focus-ring"
				>
					<Chevron aria-hidden="true" className="size-14 shrink-0" />
					<span className="truncate">{t("panels.fileActivity.list.title")}</span>
					<span className="tr-text-metadata text-text-subtle">{rows.length}</span>
				</button>
				<IconButton
					icon={X}
					size="s"
					label={t("panels.fileActivity.list.clear")}
					data-testid="agent-activity-clear"
					onClick={() => useAppStore.getState().clearAgentActivityRecent(workspaceId)}
				/>
			</div>
			{open ? (
				<ul className="flex min-h-0 flex-col gap-2 overflow-y-auto px-8 pb-8">
					{[...rows].reverse().map((entry) => {
						const Icon = KIND_ICON[entry.kind];
						const { name, dir } = splitPath(entry.path);
						return (
							<li key={entry.id}>
								<button
									type="button"
									data-testid="agent-activity-row"
									data-kind={entry.kind}
									data-path={entry.path}
									aria-label={t("panels.fileActivity.list.open", { path: entry.path })}
									title={entry.path}
									onClick={() => show(entry)}
									className="flex h-panel-row w-full min-w-0 items-center gap-6 rounded-sm px-4 text-left tr-text-ui text-text-muted outline-none hover:bg-control-bg-hovered focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-focus-ring"
								>
									<Icon aria-hidden="true" className="size-14 shrink-0" />
									<span className="flex min-w-0 flex-1 items-baseline gap-4">
										<span className="shrink-0 text-text-default">{name}</span>
										{dir ? <span className="min-w-0 truncate text-text-subtle">{dir}</span> : null}
									</span>
									<span className="shrink-0 truncate tr-text-metadata">
										{agentActivityLabel(t, entry)}
									</span>
									<Ago entry={entry} now={now} />
								</button>
							</li>
						);
					})}
				</ul>
			) : null}
		</section>
	);
}
