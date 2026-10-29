import { useT } from "@thinkrail/locales/react";
import { Button } from "@thinkrail/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@thinkrail/ui/dialog";
import { useRef, useState } from "react";
import { selectHasUnsavedFiles, useAppStore } from "../store";
import { errorText } from "../transport";
import { type FileOperation, performFileOperation } from "./fileActions";

export type { FileOperation } from "./fileActions";
export function FileOperationDialog({
	workspaceId,
	path,
	kind,
	operation,
	initialContent,
	onClose,
	onRestoreFocus,
}: {
	workspaceId: string;
	path: string;
	kind: "file" | "dir";
	operation: FileOperation;
	initialContent?: string;
	onClose(): void;
	onRestoreFocus?(): void;
}) {
	const t = useT();
	const name = path.split("/").at(-1) ?? path;
	const [value, setValue] = useState(
		operation === "rename" ? name : operation === "move" || operation === "saveAs" ? path : "",
	);
	const blocked = useAppStore(
		(state) =>
			["rename", "move", "trash"].includes(operation) &&
			selectHasUnsavedFiles(state, workspaceId, path),
	);
	const [busy, setBusy] = useState(false);
	const createdFileRef = useRef<string | null>(null);
	const inputRef = useRef<HTMLInputElement | null>(null);
	const [error, setError] = useState<string | null>(null);
	const title =
		operation === "trash"
			? t("files.trashTitle", { name })
			: operation === "move"
				? t("files.moveTitle")
				: t(`files.${operation}`);
	const submit = () => {
		if (busy || blocked || (operation !== "trash" && !value.trim())) return;
		setBusy(true);
		setError(null);
		void performFileOperation({ workspaceId, path, kind, operation, value, initialContent })
			.then((result) => {
				createdFileRef.current = result.createdFile ?? null;
				onClose();
			})
			.catch((failure) => setError(errorText(failure, t("files.operationFailed"))))
			.finally(() => setBusy(false));
	};
	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open && !busy) onClose();
			}}
		>
			<DialogContent
				data-testid="file-operation-dialog"
				className="max-w-[28rem]"
				onOpenAutoFocus={(event) => {
					const input = inputRef.current;
					if (!input) return;
					event.preventDefault();
					input.focus();
					const dot = operation === "rename" && kind === "file" ? value.lastIndexOf(".") : -1;
					input.setSelectionRange(0, dot > 0 ? dot : value.length);
				}}
				onCloseAutoFocus={(event) => {
					if (createdFileRef.current) {
						event.preventDefault();
						useAppStore.getState().requestFileEditorFocus(workspaceId, createdFileRef.current);
					} else if (onRestoreFocus) {
						event.preventDefault();
						onRestoreFocus();
					}
				}}
			>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>
						{operation === "trash" ? t("files.trashDescription") : path}
					</DialogDescription>
				</DialogHeader>
				{operation !== "trash" ? (
					<label className="flex flex-col gap-8 tr-text-ui">
						{operation === "move" || operation === "saveAs"
							? t("files.destination")
							: t("files.name")}
						<input
							ref={inputRef}
							data-testid="file-operation-input"
							value={value}
							disabled={busy}
							onChange={(e) => setValue(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && !e.nativeEvent.isComposing) {
									e.preventDefault();
									void submit();
								}
							}}
							className="h-32 w-full rounded-md border border-control-border-default bg-control-bg px-8 text-text-default outline-none focus:border-control-border-active"
						/>
					</label>
				) : null}
				{blocked ? (
					<p role="alert" className="tr-text-ui text-feedback-warning">
						{t("files.saveBeforeMutation")}
					</p>
				) : null}
				{error ? (
					<p role="alert" className="tr-text-ui text-feedback-error">
						{error}
					</p>
				) : null}
				<DialogFooter>
					<Button variant="outline" disabled={busy} onClick={onClose}>
						{t("common.cancel")}
					</Button>
					<Button
						variant={operation === "trash" ? "destructive" : "primary"}
						data-testid="file-operation-confirm"
						loading={busy}
						disabled={blocked || (operation !== "trash" && !value.trim())}
						onClick={() => void submit()}
					>
						{operation === "trash" ? t("files.trash") : t("common.confirm")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
