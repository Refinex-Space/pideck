import { type EditorInfo, FILE_WORKBENCH_PROTOCOL_VERSION } from "@thinkrail/contracts";
import { useT } from "@thinkrail/locales/react";
import { IconButton } from "@thinkrail/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuLabel,
	ContextMenuSeparator,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
	ContextMenuTrigger,
} from "@thinkrail/ui/context-menu";
import {
	Copy,
	ExternalLink,
	FilePlus,
	FolderInput,
	FolderPlus,
	MessageSquarePlus,
	MoreHorizontal,
	Pencil,
	Trash2,
} from "lucide-react";
import {
	type KeyboardEvent,
	type MouseEvent,
	type ReactNode,
	useEffect,
	useRef,
	useState,
} from "react";
import { useShallow } from "zustand/react/shallow";
import { selectWorkspaceDraftPaths, selectWorkspaceProject, toast, useAppStore } from "../store";
import { errorText, getTransport } from "../transport";
import { type FileOperation, FileOperationDialog } from "./FileOperationDialog";
import { addFileToChat, copyFilePath } from "./fileActions";
import { openFileInTab } from "./openTabs";

export function FileEntryActions({
	workspaceId,
	path,
	kind,
	onOpen,
	children,
}: {
	workspaceId: string;
	path: string;
	kind: "file" | "dir";
	onOpen?(): void;
	children?: (props: {
		onContextMenu(event: MouseEvent): void;
		onKeyDown(event: KeyboardEvent): void;
		trigger: ReactNode;
	}) => ReactNode;
}) {
	const t = useT();
	const [open, setOpen] = useState(false);
	const routedFocus = useRef(false);
	const [invokedFrom, setInvokedFrom] = useState<HTMLElement | null>(null);
	const projectName = useAppStore((s) =>
		path === "." ? selectWorkspaceProject(s, workspaceId)?.name : undefined,
	);
	const unsavedPaths = useAppStore(
		useShallow((state) => (path === "." ? selectWorkspaceDraftPaths(state, workspaceId) : [])),
	);
	const [operation, setOperation] = useState<FileOperation | null>(null);
	const [editors, setEditors] = useState<EditorInfo[]>([]);
	const supported = useAppStore((s) => (s.protocolVersion ?? 0) >= FILE_WORKBENCH_PROTOCOL_VERSION);
	useEffect(() => {
		if (!open) return;
		let current = true;
		void getTransport()
			.request("editor.list", {})
			.then((value) => {
				if (current) setEditors(value.filter((editor) => editor.kind === "gui"));
			})
			.catch(() => {});
		return () => {
			current = false;
		};
	}, [open]);
	const chooseOperation = (next: FileOperation) => {
		routedFocus.current = true;
		setOperation(next);
	};
	const run = (action: () => Promise<unknown>) => {
		void action().catch((error) => toast.error(errorText(error, t("files.operationFailed"))));
	};
	const trigger = (
		<span>
			<IconButton
				onFocus={(event) => {
					setInvokedFrom(event.currentTarget);
				}}
				icon={MoreHorizontal}
				label={t("files.more")}
				data-testid="file-actions-trigger"
				aria-haspopup="menu"
				aria-expanded={open}
				size="s"
				wrapTrigger
				variant={children ? "row" : "ghost"}
				className="shrink-0"
				onClick={(event) => {
					const box = event.currentTarget.getBoundingClientRect();
					event.currentTarget.dispatchEvent(
						new window.MouseEvent("contextmenu", {
							bubbles: true,
							clientX: box.left,
							clientY: box.bottom,
						}),
					);
				}}
			/>
		</span>
	);
	return (
		<>
			<ContextMenu modal={false} onOpenChange={setOpen}>
				<ContextMenuTrigger asChild>
					<div data-file-menu-open={open || undefined}>
						{children
							? children({
									trigger,
									onKeyDown: (event) => {
										if (
											!supported ||
											path === "." ||
											event.altKey ||
											event.ctrlKey ||
											event.metaKey ||
											event.shiftKey
										)
											return;
										if (event.key === "F2" || event.key === "Delete") {
											event.preventDefault();
											event.stopPropagation();
											setInvokedFrom(event.currentTarget as HTMLElement);
											setOperation(event.key === "F2" ? "rename" : "trash");
										}
									},
									onContextMenu: (event) => {
										setInvokedFrom(event.currentTarget as HTMLElement);
									},
								})
							: trigger}
					</div>
				</ContextMenuTrigger>
				<ContextMenuContent
					data-testid="file-actions-menu"
					onCloseAutoFocus={(event) => {
						if (routedFocus.current) {
							event.preventDefault();
							routedFocus.current = false;
						}
					}}
				>
					<ContextMenuLabel className="max-w-288 truncate">
						{path === "." ? (projectName ?? t("files.root")) : path}
					</ContextMenuLabel>
					{unsavedPaths.length ? (
						<>
							<ContextMenuLabel>{t("files.unsaved")}</ContextMenuLabel>
							{unsavedPaths.map((savedPath) => (
								<ContextMenuItem
									key={savedPath}
									data-testid="file-recover-draft"
									className="max-w-288 truncate"
									title={savedPath}
									onSelect={() => {
										routedFocus.current = true;
										run(async () => {
											await openFileInTab(workspaceId, savedPath, "keep");
											useAppStore.getState().requestFileEditorFocus(workspaceId, savedPath);
										});
									}}
								>
									{savedPath}
								</ContextMenuItem>
							))}
							<ContextMenuSeparator />
						</>
					) : null}
					{kind === "file" || onOpen ? (
						<ContextMenuItem
							onSelect={() =>
								onOpen ? onOpen() : run(() => openFileInTab(workspaceId, path, "keep"))
							}
						>
							{t("files.open")}
						</ContextMenuItem>
					) : null}
					<ContextMenuItem
						data-testid="file-add-to-chat"
						onSelect={() => {
							routedFocus.current = true;
							run(() => addFileToChat(workspaceId, path, kind));
						}}
					>
						<MessageSquarePlus />
						{t("files.addToChat")}
					</ContextMenuItem>
					<ContextMenuSeparator />
					<ContextMenuItem
						data-testid="file-copy-relative"
						onSelect={() => run(() => copyFilePath(workspaceId, path, false))}
					>
						<Copy />
						{t("files.copyRelativePath")}
					</ContextMenuItem>
					<ContextMenuItem
						data-testid="file-copy-absolute"
						onSelect={() => run(() => copyFilePath(workspaceId, path, true))}
					>
						<Copy />
						{t("files.copyAbsolutePath")}
					</ContextMenuItem>
					<ContextMenuItem
						disabled={!supported}
						onSelect={() => run(() => getTransport().request("fs.reveal", { workspaceId, path }))}
					>
						<ExternalLink />
						{t("files.reveal")}
					</ContextMenuItem>
					<ContextMenuSub>
						<ContextMenuSubTrigger disabled={!supported}>
							{t("files.openWith")}
						</ContextMenuSubTrigger>
						<ContextMenuSubContent>
							{editors.length ? (
								editors.map((editor) => (
									<ContextMenuItem
										key={editor.id}
										onSelect={() =>
											run(() =>
												getTransport().request("fs.openIn", {
													workspaceId,
													path,
													editor: editor.id,
												}),
											)
										}
									>
										{editor.label}
									</ContextMenuItem>
								))
							) : (
								<ContextMenuItem disabled>{t("files.noEditors")}</ContextMenuItem>
							)}
						</ContextMenuSubContent>
					</ContextMenuSub>
					{supported ? (
						<>
							<ContextMenuSeparator />
							<ContextMenuItem
								data-testid="file-new-file"
								onSelect={() => chooseOperation("newFile")}
							>
								<FilePlus />
								{t("files.newFile")}
							</ContextMenuItem>
							<ContextMenuItem
								data-testid="file-new-folder"
								onSelect={() => chooseOperation("newFolder")}
							>
								<FolderPlus />
								{t("files.newFolder")}
							</ContextMenuItem>
							{path !== "." ? (
								<>
									<ContextMenuItem
										data-testid="file-rename"
										onSelect={() => chooseOperation("rename")}
									>
										<Pencil />
										{t("files.rename")}
									</ContextMenuItem>
									<ContextMenuItem data-testid="file-move" onSelect={() => chooseOperation("move")}>
										<FolderInput />
										{t("files.move")}
									</ContextMenuItem>
									<ContextMenuSeparator />
									<ContextMenuItem
										data-testid="file-trash"
										className="text-feedback-error"
										onSelect={() => chooseOperation("trash")}
									>
										<Trash2 />
										{t("files.trash")}
									</ContextMenuItem>
								</>
							) : null}
						</>
					) : null}
				</ContextMenuContent>
			</ContextMenu>
			{operation ? (
				<FileOperationDialog
					workspaceId={workspaceId}
					path={path}
					kind={kind}
					operation={operation}
					onClose={() => setOperation(null)}
					onRestoreFocus={() => {
						const target = invokedFrom;
						if (target?.isConnected) target.focus();
					}}
				/>
			) : null}
		</>
	);
}
