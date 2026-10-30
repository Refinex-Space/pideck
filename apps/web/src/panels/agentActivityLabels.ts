import type { Translator } from "@thinkrail/locales/react";
import type { AgentActivityEntry, PathActivity } from "../store";

type Described = Pick<
	PathActivity,
	"kind" | "phase" | "source" | "tool" | "actor" | "range" | "count"
>;

function verb(t: Translator, activity: Described): string {
	const running = activity.phase === "running";
	switch (activity.kind) {
		case "read":
			return running ? t("panels.fileActivity.reading") : t("panels.fileActivity.read");
		case "search":
			if (running) return t("panels.fileActivity.searching");
			return activity.count !== undefined
				? t("panels.fileActivity.matched", { n: activity.count })
				: t("panels.fileActivity.searched");
		case "list":
			return running ? t("panels.fileActivity.listing") : t("panels.fileActivity.listed");
		case "write":
			if (activity.source === "watch") return t("panels.fileActivity.changed");
			if (activity.tool === "write")
				return running ? t("panels.fileActivity.writing") : t("panels.fileActivity.written");
			if (!running && activity.count !== undefined && activity.count > 1)
				return t("panels.fileActivity.editedMany", { n: activity.count });
			return running ? t("panels.fileActivity.editing") : t("panels.fileActivity.edited");
	}
}

function range(t: Translator, activity: Described): string | null {
	if (activity.kind !== "read" || !activity.range) return null;
	const { from, to } = activity.range;
	return to === null
		? t("panels.fileActivity.linesFrom", { from })
		: t("panels.fileActivity.lines", { from, to });
}

/** The one-line description of what the agent did to a path: the row's badge and its tooltip. */
export function agentActivityLabel(
	t: Translator,
	activity: Described | AgentActivityEntry,
): string {
	const parts = [verb(t, activity), range(t, activity)].filter((part): part is string => !!part);
	if (activity.source === "subagent")
		parts.unshift(
			activity.actor
				? t("panels.fileActivity.subagentNamed", { name: activity.actor })
				: t("panels.fileActivity.subagent"),
		);
	return parts.join(" · ");
}
