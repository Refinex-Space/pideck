import { RiCloseLine as X } from "@remixicon/react";
import { REQUEST_IMAGE_BASE64_BUDGET } from "@thinkrail/contracts";
import { t as translate, useT } from "@thinkrail/locales/react";
import { IconButton } from "@thinkrail/ui/button";
import { cn } from "@thinkrail/ui/utils";
import { X as CloseIcon } from "lucide-react";
import {
	type ClipboardEvent,
	type DragEvent,
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { FileChip } from "./FileChip";
import { type AttachedImage, fileToAttachedImage } from "./imageAttachment";
import type { ChatAttachment } from "./types";

export interface PromptImage extends AttachedImage {
	id: string;
	name: string;
}

export interface PromptImageError {
	id: string;
	name: string;
	reason: string;
}

export interface PromptImagesController {
	images: PromptImage[];
	pending: number;
	errors: PromptImageError[];
	addFiles: (files: File[]) => void;
	removeImage: (id: string) => void;
	dismissError: (id: string) => void;
	restore: (attachments: ChatAttachment[]) => void;
	reset: () => void;
}

// Adapt a prompt input's paste/drop events onto the controller: forward dropped/pasted image files
// (preventing the default insertion) while leaving text paste/drop untouched. Shared by every
// prompt surface so image attachment behaves identically in the chat composer and the dialogs.
export function imagePasteDropHandlers(controller: Pick<PromptImagesController, "addFiles">): {
	onPaste: (e: ClipboardEvent<HTMLElement>) => void;
	onDrop: (e: DragEvent<HTMLElement>) => void;
} {
	return {
		onPaste: (e) => {
			const files = [...e.clipboardData.files];
			if (files.length === 0) return;
			e.preventDefault();
			controller.addFiles(files);
		},
		onDrop: (e) => {
			const files = [...e.dataTransfer.files];
			if (files.length === 0) return;
			e.preventDefault();
			controller.addFiles(files);
		},
	};
}

export function usePromptImages(): PromptImagesController {
	const [images, setImages] = useState<PromptImage[]>([]);
	const imagesRef = useRef<PromptImage[]>([]);
	const [pending, setPending] = useState(0);
	const [errors, setErrors] = useState<PromptImageError[]>([]);
	// Bumped on reset; a stale-generation decode discards its results (still balancing pending).
	const generation = useRef(0);

	const commit = useCallback((next: PromptImage[]) => {
		imagesRef.current = next;
		setImages(next);
	}, []);

	const addFiles = useCallback(
		(files: File[]) => {
			const picked = files.filter((f) => f.type.startsWith("image/"));
			if (picked.length === 0) return;
			const startedGeneration = generation.current;
			setPending((n) => n + picked.length);
			const decode = async () => {
				const settled = await Promise.allSettled(picked.map(fileToAttachedImage));
				if (startedGeneration !== generation.current) return;
				let used = imagesRef.current.reduce((sum, p) => sum + p.content.data.length, 0);
				const additions: PromptImage[] = [];
				const nextErrors: PromptImageError[] = [];
				settled.forEach((result, i) => {
					const name = picked[i]?.name || translate("chat.promptImages.fallbackName");
					if (result.status !== "fulfilled" || result.value === null) {
						nextErrors.push({
							id: crypto.randomUUID(),
							name,
							reason: translate("chat.promptImages.unsupported"),
						});
						return;
					}
					const size = result.value.content.data.length;
					if (used + size > REQUEST_IMAGE_BASE64_BUDGET) {
						nextErrors.push({
							id: crypto.randomUUID(),
							name,
							reason: translate("chat.promptImages.limitReached"),
						});
						return;
					}
					used += size;
					additions.push({ id: crypto.randomUUID(), name, ...result.value });
				});
				if (additions.length > 0) commit([...imagesRef.current, ...additions]);
				if (nextErrors.length > 0) setErrors((prev) => [...prev, ...nextErrors]);
			};
			void decode().finally(() => setPending((n) => n - picked.length));
		},
		[commit],
	);

	const removeImage = useCallback(
		(id: string) => commit(imagesRef.current.filter((p) => p.id !== id)),
		[commit],
	);

	const dismissError = useCallback(
		(id: string) => setErrors((prev) => prev.filter((p) => p.id !== id)),
		[],
	);

	const restore = useCallback(
		(attachments: ChatAttachment[]) => {
			if (attachments.length === 0) return;
			commit([
				...attachments.map((attachment) => ({ id: crypto.randomUUID(), ...attachment })),
				...imagesRef.current,
			]);
		},
		[commit],
	);

	const reset = useCallback(() => {
		generation.current += 1;
		commit([]);
		setErrors([]);
	}, [commit]);

	return { images, pending, errors, addFiles, removeImage, dismissError, restore, reset };
}

// Padding presets for the chip strip. Both surfaces align the strip with the input field's left
// edge and leave the same 12px gap below it; they differ only in structure — the composer strip
// sits above a `p-12` input shell (so it owns its own left/top padding), while the dialog textarea
// is flush (so only the bottom gap is needed).
export const PROMPT_IMAGE_CHIPS_PADDING = {
	composer: "px-12 pt-12",
	dialog: "pb-12",
} as const;

export function PromptImageChips({
	controller,
	leading,
	testId = "composer-images",
	className = PROMPT_IMAGE_CHIPS_PADDING.composer,
}: {
	controller: PromptImagesController;
	leading?: ReactNode;
	testId?: string;
	className?: string;
}) {
	const t = useT();
	const { images, pending, errors, removeImage, dismissError } = controller;
	if (!leading && images.length === 0 && pending === 0 && errors.length === 0) return null;
	return (
		<div className={cn("flex flex-wrap gap-4", className)} data-testid={testId}>
			{leading}
			{errors.map((err) => (
				<FileChip
					key={err.id}
					data-testid="composer-image-error"
					tone="error"
					icon={false}
					title={t("chat.promptImages.attachFailedDetail", { name: err.name, reason: err.reason })}
					label={t("chat.promptImages.attachFailed", { name: err.name })}
					meta={`— ${err.reason}`}
					trailing={
						<button
							type="button"
							aria-label={t("common.dismiss")}
							onClick={() => dismissError(err.id)}
							className="hover:opacity-80"
						>
							<X className="size-14" />
						</button>
					}
				/>
			))}
			{images.map((img) => (
				<FileChip
					key={img.id}
					data-testid="composer-image"
					data-width={img.width}
					data-height={img.height}
					data-mime={img.content.mimeType}
					title={img.name}
					label={img.name}
					meta={img.width && img.height ? ` · ${img.width}×${img.height}` : undefined}
					trailing={
						<IconButton
							icon={X}
							size="s"
							label={t("chat.promptImages.remove")}
							onClick={() => removeImage(img.id)}
						/>
					}
				/>
			))}
			{pending > 0 ? (
				<FileChip
					data-testid="composer-image-pending"
					label={
						<span className="text-text-muted">
							{t("chat.promptImages.attaching", { count: pending })}
						</span>
					}
				/>
			) : null}
		</div>
	);
}

const STRIP_MASK = {
	none: "",
	start:
		"[-webkit-mask-image:linear-gradient(to_right,transparent,var(--color-text-default)_24px)] [mask-image:linear-gradient(to_right,transparent,var(--color-text-default)_24px)]",
	end: "[-webkit-mask-image:linear-gradient(to_left,transparent,var(--color-text-default)_24px)] [mask-image:linear-gradient(to_left,transparent,var(--color-text-default)_24px)]",
	both: "[-webkit-mask-image:linear-gradient(to_right,transparent,var(--color-text-default)_24px,var(--color-text-default)_calc(100%-24px),transparent)] [mask-image:linear-gradient(to_right,transparent,var(--color-text-default)_24px,var(--color-text-default)_calc(100%-24px),transparent)]",
} as const;

function useStripOverflow(ref: React.RefObject<HTMLDivElement | null>, mounted: boolean) {
	const [state, setState] = useState<keyof typeof STRIP_MASK>("none");
	useEffect(() => {
		const element = ref.current;
		if (!element) return;
		const update = () => {
			const max = element.scrollWidth - element.clientWidth;
			const start = element.scrollLeft > 1;
			const end = element.scrollLeft < max - 1;
			setState(start && end ? "both" : start ? "start" : end ? "end" : "none");
		};
		update();
		element.addEventListener("scroll", update, { passive: true });
		const resize = new ResizeObserver(update);
		resize.observe(element);
		const mutation = new MutationObserver(update);
		mutation.observe(element, { childList: true, subtree: true });
		return () => {
			element.removeEventListener("scroll", update);
			resize.disconnect();
			mutation.disconnect();
		};
	}, [ref, mounted]);
	return state;
}

/**
 * The composer's attachment row: square thumbnails inside the input card, above the text. One row
 * only — extra images scroll sideways and the clipped edge fades out.
 */
export function PromptImageStrip({
	controller,
	leading,
}: {
	controller: PromptImagesController;
	leading?: ReactNode;
}) {
	const t = useT();
	const { images, pending, errors, removeImage, dismissError } = controller;
	const scroller = useRef<HTMLDivElement>(null);
	const empty = !leading && images.length === 0 && pending === 0 && errors.length === 0;
	const fade = useStripOverflow(scroller, !empty);
	if (empty) return null;
	return (
		<div
			ref={scroller}
			data-testid="composer-images"
			className={cn(
				"flex gap-8 overflow-x-auto px-12 pt-12 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
				STRIP_MASK[fade],
			)}
		>
			{leading}
			{errors.map((err) => (
				<FileChip
					key={err.id}
					data-testid="composer-image-error"
					tone="error"
					icon={false}
					title={t("chat.promptImages.attachFailedDetail", { name: err.name, reason: err.reason })}
					label={t("chat.promptImages.attachFailed", { name: err.name })}
					meta={`— ${err.reason}`}
					trailing={
						<button
							type="button"
							aria-label={t("common.dismiss")}
							onClick={() => dismissError(err.id)}
							className="hover:opacity-80"
						>
							<X className="size-14" />
						</button>
					}
				/>
			))}
			{images.map((img) => (
				<div
					key={img.id}
					data-testid="composer-image"
					data-width={img.width}
					data-height={img.height}
					data-mime={img.content.mimeType}
					title={img.name}
					className="group/thumb relative size-64 shrink-0"
				>
					<img
						src={`data:${img.content.mimeType};base64,${img.content.data}`}
						alt=""
						className="size-full rounded-lg object-cover ring-1 ring-border-default ring-inset"
					/>
					<span className="sr-only">
						{img.name}
						{img.width && img.height ? ` · ${img.width}×${img.height}` : ""}
					</span>
					<button
						type="button"
						aria-label={t("chat.promptImages.remove")}
						onClick={() => removeImage(img.id)}
						className="absolute top-2 right-2 flex size-16 items-center justify-center rounded-full bg-container-elevated-bg text-text-muted opacity-0 shadow-[var(--shadow-sm)] outline-none transition-opacity hover:text-text-default focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-focus-ring group-hover/thumb:opacity-100 [@media(hover:none)]:opacity-100"
					>
						<CloseIcon className="size-12" />
					</button>
				</div>
			))}
			{pending > 0 ? (
				<div
					data-testid="composer-image-pending"
					role="status"
					className="flex size-64 shrink-0 items-center justify-center rounded-lg bg-control-bg-selected text-text-muted tr-text-metadata"
				>
					{t("chat.promptImages.attaching", { count: pending })}
				</div>
			) : null}
		</div>
	);
}
