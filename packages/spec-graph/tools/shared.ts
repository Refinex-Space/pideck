import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import { indexSections, type SectionIndex, SpecIndex, type SpecType } from "../core/index.ts";

const indexes = new Map<string, SpecIndex>();

export const MAX_SECTION_INDEX_ROOTS = 4;

const sectionIndexes = new Map<string, SectionIndex>();

export function getIndex(root: string): SpecIndex {
	let index = indexes.get(root);
	if (!index) {
		index = new SpecIndex(root);
		indexes.set(root, index);
	}
	return index;
}

export function getSectionIndex(root: string): SectionIndex {
	const next = indexSections(getIndex(root).contentEntries(), sectionIndexes.get(root));
	sectionIndexes.delete(root);
	sectionIndexes.set(root, next);
	for (const oldest of sectionIndexes.keys()) {
		if (sectionIndexes.size <= MAX_SECTION_INDEX_ROOTS) break;
		sectionIndexes.delete(oldest);
	}
	return next;
}

export function textResult<T>(text: string, details: T): AgentToolResult<T> {
	return { content: [{ type: "text", text }], details };
}

export function errorResult(message: string): AgentToolResult<{ error: string }> {
	return { content: [{ type: "text", text: `Error: ${message}` }], details: { error: message } };
}

const SCAFFOLD_HEADINGS: Record<SpecType, string[]> = {
	"module-design": ["Responsibility", "Boundary"],
	"submodule-design": ["Responsibility", "Boundary"],
	"architecture-design": ["Drivers", "Decisions", "Invariants", "Out of scope"],
	"goal-and-requirements": ["Goal", "Scope"],
	"task-spec": ["Purpose", "Open items"],
};

export function scaffoldBody(type: SpecType): string {
	const headings = SCAFFOLD_HEADINGS[type];
	if (!headings || headings.length === 0) return "";
	return `${headings.map((h) => `## ${h}\n`).join("\n")}`;
}
