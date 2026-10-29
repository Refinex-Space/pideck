import {
	RiArrowRightUpLine as ArrowUpRight,
	RiBracesLine as Braces,
	RiClipboardLine as ClipboardPaste,
	RiCommandLine as Command,
	RiFileCopyLine as Copy,
	RiEyeLine as Eye,
	RiLinkM as Link2,
	type RemixiconComponentType as LucideIcon,
	RiChatNewLine as MessageSquarePlus,
	RiScissorsLine as Scissors,
} from "@remixicon/react";
import { t } from "@thinkrail/locales/react";
import type * as monaco from "monaco-editor/editor/editor.api.js";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import menuChrome from "./monacoChrome.css?inline";

const svg = (icon: LucideIcon) => renderToStaticMarkup(createElement(icon, { size: 14 }));

const COMMENT_ICON = svg(MessageSquarePlus);

const MONACO_ICONS = new Map<string, string>([
	["Copy", svg(Copy)],
	["Cut", svg(Scissors)],
	["Paste", svg(ClipboardPaste)],
	["Go to Definition", svg(ArrowUpRight)],
	["Go to References", svg(Link2)],
	["Go to Symbol", svg(Braces)],
	["Peek", svg(Eye)],
	["Command Palette", svg(Command)],
]);

function menuIcon(label: string, icons: ReadonlyMap<string, string>): string | undefined {
	return label === t("review.widget.commentOnSelection") || label === t("files.addSelectionToChat")
		? COMMENT_ICON
		: icons.get(label === t("common.copy") ? "Copy" : label);
}

const MENU_CSS =
	menuChrome +
	".editor-menu-icon{display:inline-flex;align-items:center;justify-content:center;width:14px;margin:0 var(--space-8) 0 var(--space-2);flex-shrink:0;color:inherit}";

function menuRoots(): (Document | ShadowRoot)[] {
	const roots: (Document | ShadowRoot)[] = [document];
	for (const host of document.querySelectorAll<HTMLElement>(".shadow-root-host")) {
		if (host.shadowRoot) roots.push(host.shadowRoot);
	}
	return roots;
}

function ensureStyle(root: Document | ShadowRoot): void {
	const parent = root instanceof Document ? root.head : root;
	if (parent.querySelector("style[data-editor-menu-icons]")) return;
	const style = document.createElement("style");
	style.dataset.editorMenuIcons = "true";
	style.textContent = MENU_CSS;
	parent.appendChild(style);
}

function decorateOpenMenus(icons: ReadonlyMap<string, string>): void {
	for (const root of menuRoots()) {
		const rows = root.querySelectorAll<HTMLElement>(
			".monaco-menu .action-menu-item:not([data-tr-icons])",
		);
		if (rows.length === 0) continue;
		ensureStyle(root);
		for (const row of rows) {
			row.dataset.trIcons = "true";
			const label = row.querySelector<HTMLElement>(":scope > .action-label");
			if (!label?.textContent) continue;
			const holder = document.createElement("span");
			holder.className = "editor-menu-icon";
			holder.ariaHidden = "true";
			const icon = menuIcon(label.textContent.trim().replace(/[.…]+$/u, ""), icons);
			if (icon) holder.innerHTML = icon;
			label.before(holder);
		}
	}
}

export function decorateEditorContextMenus(
	codeEditor: monaco.editor.ICodeEditor,
): monaco.IDisposable {
	const host = codeEditor.getDomNode();
	const suppressCloseHover = (event: Event) => {
		if (
			event.target instanceof Element &&
			event.target.closest(".find-widget .codicon-widget-close")
		)
			event.stopImmediatePropagation();
	};
	const hoverEvents = ["mouseenter", "mouseover", "pointerenter", "pointerover"];
	for (const event of hoverEvents) host?.addEventListener(event, suppressCloseHover, true);
	const subscription = codeEditor.onContextMenu(() => {
		const icons = new Map(MONACO_ICONS);
		const actionIcons = new Map([
			["editor.action.quickCommand", svg(Command)],
			["editor.action.clipboardCopyAction", svg(Copy)],
			["editor.action.clipboardCutAction", svg(Scissors)],
			["editor.action.clipboardPasteAction", svg(ClipboardPaste)],
		]);
		for (const action of codeEditor.getSupportedActions()) {
			const icon = actionIcons.get(action.id);
			if (icon) icons.set(action.label.replace(/[.…]+$/u, ""), icon);
		}
		requestAnimationFrame(() => decorateOpenMenus(icons));
		setTimeout(() => decorateOpenMenus(icons), 80);
	});
	return {
		dispose() {
			subscription.dispose();
			for (const event of hoverEvents) host?.removeEventListener(event, suppressCloseHover, true);
		},
	};
}
