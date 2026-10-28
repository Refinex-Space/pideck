import { cn } from "@thinkrail/ui/utils";
import { File, Folder, FolderOpen } from "lucide-react";
import { iconAssets } from "./generated/assets";
import { resolveFileIcon, resolveFolderIcon } from "./resolve";

function MaterialIcon({
	icon,
	className,
}: {
	icon: { dark: string; light: string };
	className?: string | undefined;
}) {
	return (
		<span
			aria-hidden="true"
			data-file-icon={icon.dark}
			className={cn("flex size-16 shrink-0", className)}
		>
			<img
				src={iconAssets[icon.dark]}
				alt=""
				draggable={false}
				className={cn(
					"size-full",
					icon.light !== icon.dark && "[[data-theme-appearance=light]_&]:hidden",
				)}
			/>
			{icon.light !== icon.dark ? (
				<img
					src={iconAssets[icon.light]}
					alt=""
					draggable={false}
					className="hidden size-full [[data-theme-appearance=light]_&]:block"
				/>
			) : null}
		</span>
	);
}

export function FileTypeIcon({
	path,
	className,
}: {
	path: string;
	className?: string | undefined;
}) {
	const icon = resolveFileIcon(path);
	return icon ? (
		<MaterialIcon icon={icon} className={className} />
	) : (
		<File aria-hidden="true" data-file-icon="file" className={cn("size-16 shrink-0", className)} />
	);
}

export function FolderTypeIcon({
	path,
	expanded,
	className,
}: {
	path: string;
	expanded: boolean;
	className?: string | undefined;
}) {
	const icon = resolveFolderIcon(path, expanded);
	const Fallback = expanded ? FolderOpen : Folder;
	return icon ? (
		<MaterialIcon icon={icon} className={className} />
	) : (
		<Fallback
			aria-hidden="true"
			data-file-icon={expanded ? "folder-open" : "folder"}
			className={cn("size-16 shrink-0", className)}
		/>
	);
}
