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
import { useEffect, useState } from "react";
import { fileDraftKey, persistFileDrafts, persistFileWordWrap, toast, useAppStore } from "../store";
import { saveFileDraft } from "./fileActions";

export function FileDraftGuard() {
	const t = useT();
	useEffect(() => {
		let timer: number | undefined;
		let warned = false;
		const persist = () => {
			try {
				const state = useAppStore.getState();
				persistFileDrafts(state.fileDrafts);
				persistFileWordWrap(state.fileWordWrap);
				warned = false;
			} catch {
				if (!warned) toast.error(t("files.storageFailed"));
				warned = true;
			}
		};
		const unsubscribe = useAppStore.subscribe((state, before) => {
			if (state.fileDrafts === before.fileDrafts && state.fileWordWrap === before.fileWordWrap)
				return;
			window.clearTimeout(timer);
			timer = window.setTimeout(persist, 250);
		});
		const beforeUnload = (event: BeforeUnloadEvent) => {
			persist();
			if (
				Object.values(useAppStore.getState().fileDrafts).some(
					(draft) => draft.saving || draft.text !== draft.baseContent,
				)
			) {
				event.preventDefault();
				event.returnValue = "";
			}
		};
		window.addEventListener("beforeunload", beforeUnload);
		return () => {
			unsubscribe();
			window.clearTimeout(timer);
			persist();
			window.removeEventListener("beforeunload", beforeUnload);
		};
	}, [t]);
	return null;
}

export function useFileClose() {
	const t = useT();
	const [pending, setPending] = useState<{
		workspaceId: string;
		path: string;
		close(): void;
	} | null>(null);
	const draft = useAppStore((s) =>
		pending ? s.fileDrafts[fileDraftKey(pending.workspaceId, pending.path)] : undefined,
	);
	const requestClose = (workspaceId: string, path: string, close: () => void) => {
		const draft = useAppStore.getState().fileDrafts[fileDraftKey(workspaceId, path)];
		if (draft && (draft.text !== draft.baseContent || draft.saving))
			setPending({ workspaceId, path, close });
		else {
			if (draft) useAppStore.getState().discardFileDraft(workspaceId, path);
			close();
		}
	};
	const finish = (discard: boolean) => {
		if (!pending) return;
		const current =
			useAppStore.getState().fileDrafts[fileDraftKey(pending.workspaceId, pending.path)];
		if (current?.saving) return;
		if (discard) useAppStore.getState().discardFileDraft(pending.workspaceId, pending.path);
		pending.close();
		setPending(null);
	};
	const save = () => {
		if (!pending) return;
		void saveFileDraft(pending.workspaceId, pending.path)
			.then(() => {
				const current =
					useAppStore.getState().fileDrafts[fileDraftKey(pending.workspaceId, pending.path)];
				if (!current || (!current.saving && current.text === current.baseContent)) finish(true);
			})
			.catch(() => {});
	};
	const dialog = pending ? (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open && !draft?.saving) setPending(null);
			}}
		>
			<DialogContent data-testid="file-unsaved-dialog" className="max-w-[28rem]">
				<DialogHeader>
					<DialogTitle>{t("files.unsavedTitle")}</DialogTitle>
					<DialogDescription>
						{t("files.unsavedDescription", { path: pending.path })}
					</DialogDescription>
				</DialogHeader>
				{draft?.error ? (
					<p role="alert" className="tr-text-ui text-feedback-error">
						{draft.error}
					</p>
				) : null}
				<DialogFooter>
					<Button variant="outline" disabled={draft?.saving} onClick={() => setPending(null)}>
						{t("common.cancel")}
					</Button>
					<Button variant="ghost" disabled={draft?.saving} onClick={() => finish(true)}>
						{t("files.discardClose")}
					</Button>
					<Button loading={draft?.saving === true} onClick={() => void save()}>
						{t("files.saveClose")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	) : null;
	return { requestClose, dialog };
}

export function FileDraftMark({ workspaceId, path }: { workspaceId: string; path: string }) {
	const t = useT();
	const dirty = useAppStore((s) => {
		const draft = s.fileDrafts[fileDraftKey(workspaceId, path)];
		return !!draft && draft.text !== draft.baseContent;
	});
	return dirty ? (
		<span
			data-testid="file-dirty-mark"
			role="img"
			aria-label={t("files.unsaved")}
			className="size-6 shrink-0 rounded-full bg-text-muted"
		/>
	) : null;
}
