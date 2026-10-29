import { FILE_WORKBENCH_PROTOCOL_VERSION } from "@thinkrail/contracts";
import { t } from "@thinkrail/locales/react";
import type { ResourceTextSelection } from "@thinkrail/resource-renderers";
import { copyText } from "../lib";
import {
	fileDraftKey,
	selectHasUnsavedFiles,
	selectWorkspaceById,
	selectWorkspaceChatTarget,
	selectWorkspaceTick,
	useAppStore,
} from "../store";
import { errorText, getTransport } from "../transport";
import { startChatInTab } from "./openChat";
import { openFileInTab } from "./openTabs";

export function fileReference(
	path: string,
	kind: "file" | "dir",
	selection?: ResourceTextSelection,
	annotation?: string,
): string {
	const named = kind === "dir" ? `${path.replace(/\/$/, "")}/` : path;
	const reference = `@${/\s|["`]/.test(named) ? JSON.stringify(named) : named}`;
	if (!selection) return `${reference} `;
	const fence = "`".repeat(
		Math.max(3, ...[...selection.text.matchAll(/`+/g)].map((match) => match[0].length + 1)),
	);
	return `${reference}:${selection.startLine}-${selection.endLine}${annotation ? ` (${annotation})` : ""}\n${fence}\n${selection.text}\n${fence}\n`;
}

export async function addFileToChat(
	workspaceId: string,
	path: string,
	kind: "file" | "dir",
	selection?: ResourceTextSelection,
): Promise<void> {
	const draft = useAppStore.getState().fileDrafts[fileDraftKey(workspaceId, path)];
	const unsaved = kind === "file" && draft && draft.text !== draft.baseContent;
	const selected =
		selection ??
		(unsaved
			? { text: draft.text, startLine: 1, endLine: Math.max(1, draft.text.split("\n").length) }
			: undefined);
	if (selected && selected.text.length > 32000) throw new Error(t("files.selectionTooLarge"));
	const before = useAppStore.getState();
	let sessionId = selectWorkspaceChatTarget(before, workspaceId);
	if (!sessionId) sessionId = await startChatInTab(workspaceId);
	if (!sessionId) throw new Error(t("files.openChatFailed"));
	useAppStore
		.getState()
		.insertChatText(
			workspaceId,
			sessionId,
			fileReference(path, kind, selected, unsaved ? t("files.unsaved") : undefined),
		);
}

export async function copyFilePath(
	workspaceId: string,
	path: string,
	absolute: boolean,
): Promise<void> {
	const workspace = selectWorkspaceById(useAppStore.getState(), workspaceId);
	if (!workspace) return;
	const root = workspace.worktreePath;
	const base = root.replace(/[\\/]+$/, "") || root;
	const separator = root.includes("\\") ? "\\" : "/";
	const value = absolute
		? path === "."
			? root
			: base.replace(/[\\/]+$/, "") + separator + path.split("/").join(separator)
		: path;
	await copyText(value);
}

export function assertNoFileDrafts(workspaceId: string, path: string): void {
	if (selectHasUnsavedFiles(useAppStore.getState(), workspaceId, path))
		throw new Error(t("files.saveBeforeMutation"));
}

export async function saveFileDraft(workspaceId: string, path: string): Promise<void> {
	const store = useAppStore.getState();
	if ((store.protocolVersion ?? 0) < FILE_WORKBENCH_PROTOCOL_VERSION)
		throw new Error(t("files.hostUpdateRequired"));
	const draft = store.fileDrafts[fileDraftKey(workspaceId, path)];
	if (!draft || draft.saving || draft.text === draft.baseContent) return;
	const savedTick = selectWorkspaceTick(store, workspaceId);
	store.setFileDraftSaving(workspaceId, path, true);
	try {
		const result = await getTransport().request("fs.writeFile", {
			workspaceId,
			path,
			content: draft.text,
			expectedHash: draft.baseHash,
		});
		const current = useAppStore.getState();
		current.finishFileDraftSave(workspaceId, path, draft.text, result.meta.hash ?? "");
		for (const tab of current.tabsByWorkspace[workspaceId] ?? []) {
			if (tab.kind === "file" && tab.path === path)
				current.updateFileTabContent(workspaceId, tab.id, result.content, result.meta, savedTick);
		}
	} catch (error) {
		useAppStore.getState().setFileDraftSaving(workspaceId, path, false, errorText(error));
		throw error;
	}
}

export type FileOperation = "newFile" | "newFolder" | "rename" | "move" | "trash" | "saveAs";
export async function performFileOperation({
	workspaceId,
	path,
	kind,
	operation,
	value,
	initialContent,
}: {
	workspaceId: string;
	path: string;
	kind: "file" | "dir";
	operation: FileOperation;
	value: string;
	initialContent?: string | undefined;
}): Promise<{ createdFile?: string }> {
	let createdFile: string | undefined;
	const parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
	if ((useAppStore.getState().protocolVersion ?? 0) < FILE_WORKBENCH_PROTOCOL_VERSION)
		throw new Error(t("files.hostUpdateRequired"));
	if (["rename", "move", "trash"].includes(operation)) assertNoFileDrafts(workspaceId, path);
	if (operation === "trash") await getTransport().request("fs.trash", { workspaceId, path });
	else if (operation === "move" || operation === "rename") {
		const destination =
			operation === "rename" ? [parent, value.trim()].filter(Boolean).join("/") : value.trim();
		if (operation === "rename" && /[/\\]/.test(value)) throw new Error(t("files.name"));
		assertNoFileDrafts(workspaceId, destination);
		await getTransport().request("fs.move", { workspaceId, path, destination });
	} else {
		const directory = kind === "dir" ? path : parent;
		const destination =
			operation === "saveAs"
				? value.trim()
				: [directory === "." ? "" : directory, value.trim()].filter(Boolean).join("/");
		const created = await getTransport().request("fs.create", {
			workspaceId,
			path: destination,
			kind: operation === "newFolder" ? "dir" : "file",
		});
		if (operation !== "newFolder") {
			const loaded = await getTransport().request("fs.readFile", {
				workspaceId,
				path: created.path,
			});
			if (operation === "saveAs" && initialContent !== undefined) {
				await getTransport().request("fs.writeFile", {
					workspaceId,
					path: created.path,
					content: initialContent,
					expectedHash: loaded.meta.hash ?? "",
				});
			} else
				useAppStore
					.getState()
					.beginFileEdit(workspaceId, created.path, loaded.content, loaded.meta.hash ?? "");
			await openFileInTab(workspaceId, created.path, "keep");
			createdFile = created.path;
			if (operation === "saveAs" && initialContent !== undefined) {
				const state = useAppStore.getState();
				if (state.fileDrafts[fileDraftKey(workspaceId, path)]?.text === initialContent)
					state.discardFileDraft(workspaceId, path);
			}
		}
		useAppStore.getState().setFilesTreeExpanded(workspaceId, [directory], true);
	}
	return createdFile ? { createdFile } : {};
}
