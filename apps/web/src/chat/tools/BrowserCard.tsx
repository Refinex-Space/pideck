import type { BrowserRecordingState } from "@thinkrail/contracts";
import { resultText, strArg, type ToolRenderProps } from "@thinkrail/extension-api/web";
import { type Translator, useT } from "@thinkrail/locales/react";
import { cn } from "@thinkrail/ui/utils";
import { Globe } from "lucide-react";
import { Collapsible, countLines } from "./Collapsible";
import { ToolFileLink } from "./ToolFileLink";

function record(value: unknown): Record<string, unknown> | null {
	return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}
export function browserToolSummary({ args }: ToolRenderProps, t: Translator): string {
	const action = strArg(args, "action");
	if (action.startsWith("recording")) return t("browser.toolRecording");
	if (action === "screenshot") return t("browser.toolScreenshot");
	if (action === "navigate" || action === "newTab")
		return strArg(args, "url") || t("browser.newTab");
	if (
		[
			"snapshot",
			"getState",
			"evaluate",
			"elementInfo",
			"text",
			"count",
			"help",
			"capabilities",
		].includes(action)
	)
		return t("browser.toolInspect");
	return t("browser.toolOperate");
}
export function BrowserCard(props: ToolRenderProps) {
	const t = useT();
	const details = record(record(props.result)?.details);
	const artifact = record(details?.artifact) ?? record(record(details?.recording)?.artifact);
	const path = typeof artifact?.path === "string" && props.status === "done" ? artifact.path : null;
	const recording = record(details?.recording);
	const phase =
		typeof recording?.phase === "string" &&
		["preparing", "capturing", "finalizing", "completed", "cancelled", "failed"].includes(
			recording.phase,
		)
			? (recording.phase as BrowserRecordingState["phase"])
			: null;
	const snapshot = record(details?.data)?.accessibility;
	const output = phase
		? ""
		: typeof snapshot === "string"
			? snapshot
			: details && Object.keys(details).length
				? JSON.stringify(details, null, 2)
				: resultText(props.result);
	return (
		<div className="flex flex-col gap-8 px-8 py-4" data-testid="tool-browser">
			<div className="flex items-center gap-8 text-text-muted tr-text-metadata">
				<Globe className="size-14 shrink-0" />
				<span>{browserToolSummary(props, t)}</span>
			</div>
			{path && (
				<ToolFileLink
					path={path}
					workspaceRoot={props.workspaceRoot}
					onOpenFile={props.onOpenFile}
					className="text-text-default tr-text-ui"
				/>
			)}
			{phase && (
				<p className="text-text-muted tr-text-ui">
					{t(`browser.recording.${phase}`)}
					{typeof recording?.error === "string" ? ` · ${recording.error}` : ""}
				</p>
			)}
			{output && (
				<Collapsible id={`${props.toolCallId}:browser-output`} lines={countLines(output)}>
					<pre
						className={cn(
							"overflow-auto whitespace-pre-wrap tr-code-text",
							props.status === "error" ? "text-feedback-error" : "text-text-muted",
						)}
					>
						{output}
					</pre>
				</Collapsible>
			)}
		</div>
	);
}
