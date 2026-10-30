import { isLocalBrowserUrl, normalizeBrowserUrl } from "@thinkrail/contracts";
import { useT } from "@thinkrail/locales/react";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@thinkrail/ui/context-menu";
import { memo, type ReactNode, useMemo } from "react";
import { type Components, defaultUrlTransform } from "react-markdown";
import { copyText } from "../lib";
import { isWindowsAbsolutePath, workspaceFileTarget } from "./fileTargets";
import { BlockMarkdown } from "./Markdown";

export function assistantUrlTransform(
	value: string,
	property: string,
	node: { tagName: string },
): string {
	if (property === "href" && node.tagName === "a") {
		try {
			if (isWindowsAbsolutePath(decodeURIComponent(value))) return value;
		} catch {
			return defaultUrlTransform(value);
		}
	}
	return defaultUrlTransform(value);
}

interface MarkdownNode {
	type: string;
	url?: string;
	children?: MarkdownNode[];
	position?: { start: { offset?: number }; end: { offset?: number } };
}

const URL_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]+:/;

function writtenDestination(source: string, node: MarkdownNode): string | null {
	const start = node.position?.start.offset;
	const end = node.position?.end.offset;
	if (start === undefined || end === undefined || source[start] !== "[") return null;
	let from: number;
	let to = end;
	if (node.type === "link") {
		const labelEnd = node.children?.at(-1)?.position?.end.offset ?? start + 1;
		if (source.slice(labelEnd, labelEnd + 2) !== "](" || source[end - 1] !== ")") return null;
		from = labelEnd + 2;
		to = end - 1;
	} else {
		const labelEnd = source.indexOf("]:", start);
		if (labelEnd < 0 || labelEnd >= end) return null;
		from = labelEnd + 2;
	}
	const rest = source.slice(from, to).trimStart();
	if (rest.startsWith("<")) {
		const close = rest.indexOf(">");
		return close < 0 ? null : rest.slice(1, close);
	}
	return rest.split(/\s/, 1)[0] || null;
}

export function remarkWrittenPathDestinations() {
	return (tree: MarkdownNode, file: { value?: unknown }) => {
		const source = String(file.value ?? "");
		const visit = (node: MarkdownNode) => {
			if (node.type === "link" || node.type === "definition") {
				const written = writtenDestination(source, node);
				if (written?.includes("\\") && !URL_SCHEME.test(written)) node.url = written;
			}
			for (const child of node.children ?? []) visit(child);
		};
		visit(tree);
	};
}

const ASSISTANT_REMARK_PLUGINS = [remarkWrittenPathDestinations];

export function assistantFileTarget(
	href: string | undefined,
	workspaceRoot: string | undefined,
): string | null {
	const candidate = href?.trim();
	if (!candidate || !workspaceRoot || candidate.startsWith("#") || candidate.startsWith("//")) {
		return null;
	}
	const encodedPath = candidate.split(/[?#]/, 1)[0];
	if (!encodedPath) return null;
	try {
		return workspaceFileTarget(decodeURIComponent(encodedPath), workspaceRoot);
	} catch {
		return null;
	}
}

function AssistantLink({
	href,
	children,
	workspaceRoot,
	onOpenFile,
	onOpenBrowser,
}: {
	href?: string | undefined;
	children?: ReactNode;
	workspaceRoot?: string | undefined;
	onOpenFile?: ((path: string) => void) | undefined;
	onOpenBrowser?: ((url: string) => void) | undefined;
}) {
	const t = useT();
	const target = assistantFileTarget(href, workspaceRoot);
	if (!target || !onOpenFile) {
		const safeHref = href === undefined ? undefined : defaultUrlTransform(href);
		const browserUrl = safeHref ? normalizeBrowserUrl(safeHref) : null;
		const local = browserUrl && isLocalBrowserUrl(browserUrl);
		const link = (
			<a
				href={safeHref}
				target="_blank"
				rel="noopener noreferrer"
				onClick={(event) => {
					if (
						local &&
						onOpenBrowser &&
						!event.ctrlKey &&
						!event.metaKey &&
						!event.shiftKey &&
						!event.altKey
					) {
						event.preventDefault();
						onOpenBrowser(browserUrl);
					}
				}}
			>
				{children}
			</a>
		);
		if (!browserUrl || !onOpenBrowser) return link;
		return (
			<ContextMenu>
				<ContextMenuTrigger asChild>{link}</ContextMenuTrigger>
				<ContextMenuContent>
					<ContextMenuItem onSelect={() => onOpenBrowser(browserUrl)}>
						{t("browser.openHere")}
					</ContextMenuItem>
					<ContextMenuItem
						onSelect={() => window.open(browserUrl, "_blank", "noopener,noreferrer")}
					>
						{t("browser.external")}
					</ContextMenuItem>
					<ContextMenuItem
						onSelect={() => {
							void copyText(browserUrl);
						}}
					>
						{t("browser.copyUrl")}
					</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>
		);
	}
	return (
		<button
			type="button"
			data-testid="chat-file-link"
			data-path={target}
			onClick={() => onOpenFile(target)}
			className="cursor-pointer text-left text-primary underline"
		>
			{children}
		</button>
	);
}

export const AssistantMarkdown = memo(function AssistantMarkdown({
	text,
	workspaceRoot,
	onOpenFile,
	onOpenBrowser,
}: {
	text: string;
	workspaceRoot?: string | undefined;
	onOpenFile?: ((path: string) => void) | undefined;
	onOpenBrowser?: ((url: string) => void) | undefined;
}) {
	const components = useMemo<Components>(
		() => ({
			a: ({ href, children }) => (
				<AssistantLink
					href={href}
					workspaceRoot={workspaceRoot}
					onOpenFile={onOpenFile}
					onOpenBrowser={onOpenBrowser}
				>
					{children}
				</AssistantLink>
			),
		}),
		[workspaceRoot, onOpenFile, onOpenBrowser],
	);
	return (
		<BlockMarkdown
			text={text}
			remarkPlugins={ASSISTANT_REMARK_PLUGINS}
			urlTransform={assistantUrlTransform}
			components={components}
		/>
	);
});
