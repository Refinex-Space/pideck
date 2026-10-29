import type { Workspace } from "@thinkrail/contracts";
import { T, useT } from "@thinkrail/locales/react";
import {
	isExternalWorkspace,
	selectHasUnsavedFiles,
	toast,
	useAppStore,
	workspaceName,
} from "../store";
import { ConfirmDialog } from "./ConfirmDialog";
import { removeWorkspace } from "./workspaceActions";

export function RemoveWorkspaceDialog({
	workspace,
	open,
	onOpenChange,
}: {
	workspace: Workspace;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const t = useT();
	const isExternal = isExternalWorkspace(workspace);
	const unsaved = useAppStore((state) => selectHasUnsavedFiles(state, workspace.id));
	const branch = <span key="branch" className="tr-text-emphasis text-text-default" />;
	return (
		<ConfirmDialog
			open={open}
			onOpenChange={onOpenChange}
			title={
				isExternal
					? t("panels.removeWorkspace.titleExternal", { name: workspaceName(t, workspace) })
					: t("panels.removeWorkspace.title", { name: workspaceName(t, workspace) })
			}
			description={
				unsaved ? (
					t("files.saveBeforeMutation")
				) : (
					<T
						i18nKey={
							isExternal
								? "panels.removeWorkspace.descriptionExternal"
								: "panels.removeWorkspace.description"
						}
						values={{ branch: workspace.branch }}
						components={[branch]}
					/>
				)
			}
			confirmLabel={isExternal ? t("panels.removeWorkspace.confirmExternal") : t("common.remove")}
			destructive
			confirmTestId="confirm-remove"
			confirmDisabled={unsaved}
			onConfirm={() => {
				if (selectHasUnsavedFiles(useAppStore.getState(), workspace.id)) {
					toast.error(t("files.saveBeforeMutation"));
					return;
				}
				removeWorkspace(workspace.id);
			}}
		/>
	);
}
