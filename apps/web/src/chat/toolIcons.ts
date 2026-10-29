import {
	Bot,
	FilePen,
	FilePlus,
	FileText,
	Globe,
	ListChecks,
	type LucideIcon,
	Plug,
	Search,
	Terminal,
	Wrench,
} from "lucide-react";

const TOOL_ICONS: Readonly<Record<string, LucideIcon>> = {
	bash: Terminal,
	read: FileText,
	write: FilePlus,
	edit: FilePen,
	grep: Search,
	find: Search,
	ls: Search,
	web_search: Globe,
	fetch_content: Globe,
	get_search_content: Globe,
	Agent: Bot,
	get_subagent_result: Bot,
	list_mcp_resources: Plug,
	list_mcp_resource_templates: Plug,
	read_mcp_resource: Plug,
	tool_search: Search,
	todo: ListChecks,
};

/** One quiet line icon per tool family, so a settled step reads by shape instead of a success tick. */
export function toolIcon(toolName: string): LucideIcon {
	if (Object.hasOwn(TOOL_ICONS, toolName)) return TOOL_ICONS[toolName] ?? Wrench;
	if (toolName.startsWith("spec_")) return FileText;
	if (toolName.startsWith("mcp__")) return Plug;
	return Wrench;
}
