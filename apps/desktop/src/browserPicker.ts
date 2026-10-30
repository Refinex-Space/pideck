import type { BrowserPickerLabels, BrowserSelection } from "@thinkrail/contracts";

interface PickerTheme {
	accent: string;
	surface: string;
	text: string;
	border: string;
}

function installPicker(labels: BrowserPickerLabels, theme: PickerTheme, run: string) {
	const targetWindow = window as unknown as {
		__pideckPicker?: { cancel(): void };
		__pideckSendToHost?: (message: unknown) => void;
	};
	targetWindow.__pideckPicker?.cancel();
	const send = (value: unknown) =>
		targetWindow.__pideckSendToHost?.({ kind: "pideck-picker", run, value });
	const cut = (value: string | null | undefined, length = 4000) =>
		(value ?? "").replace(/\s+/g, " ").trim().slice(0, length);
	const safeText = (element: Element): string => {
		const clone = element.cloneNode(true) as Element;
		for (const node of clone.querySelectorAll(
			"input,textarea,script,style,noscript,[contenteditable]",
		))
			node.remove();
		if (element.matches("input,textarea,[contenteditable]"))
			return cut(element.getAttribute("aria-label") || element.getAttribute("placeholder"));
		return cut(clone.textContent);
	};
	const path = (element: Element, xpath: boolean): string => {
		const parts: string[] = [];
		let current: Element | null = element;
		while (current && parts.length < 16) {
			if (!xpath && current.id) {
				parts.unshift(`#${CSS.escape(current.id)}`);
				break;
			}
			const tag = current.tagName.toLowerCase();
			const parent: Element | null = current.parentElement;
			const siblings: Element[] = parent
				? [...parent.children].filter((item) => item.tagName === current?.tagName)
				: [current];
			const index = siblings.indexOf(current) + 1;
			parts.unshift(xpath ? `${tag}[${index}]` : `${tag}:nth-of-type(${index})`);
			current = parent;
		}
		return xpath ? `/${parts.join("/")}` : parts.join(" > ");
	};
	const attributes = (element: Element) =>
		Object.fromEntries(
			[...element.attributes]
				.filter((attribute) =>
					/^(id|class|role|alt|title|name|type|placeholder|aria-[\w-]+)$/.test(attribute.name),
				)
				.map((attribute) => [attribute.name, cut(attribute.value, 500)]),
		);
	const html = (element: Element): string => {
		const clone = element.cloneNode(true) as Element;
		for (const node of clone.querySelectorAll("script,style,noscript,template")) node.remove();
		for (const node of [clone, ...clone.querySelectorAll("*")]) {
			const keep = attributes(node);
			for (const attribute of [...node.attributes]) node.removeAttribute(attribute.name);
			for (const [name, value] of Object.entries(keep)) node.setAttribute(name, value);
			if (node.matches("input,textarea,[contenteditable]")) node.textContent = "";
		}
		return cut(clone.outerHTML, 6000);
	};
	const overlayHost = document.createElement("div");
	overlayHost.dataset.pideckPicker = "true";
	const root = overlayHost.attachShadow({ mode: "closed" });
	const outline = document.createElement("div");
	const label = document.createElement("div");
	Object.assign(overlayHost.style, {
		position: "fixed",
		inset: "0",
		pointerEvents: "none",
		zIndex: "2147483647",
	});
	Object.assign(outline.style, {
		position: "fixed",
		pointerEvents: "none",
		border: `2px solid ${theme.accent}`,
		boxSizing: "border-box",
		display: "none",
	});
	Object.assign(label.style, {
		position: "fixed",
		pointerEvents: "none",
		background: theme.surface,
		color: theme.text,
		border: `1px solid ${theme.border}`,
		borderRadius: "8px",
		padding: "8px 12px",
		font: "12px/1.5 system-ui",
		maxWidth: "min(320px,calc(100vw - 16px))",
		whiteSpace: "pre-wrap",
		overflowWrap: "anywhere",
	});
	label.textContent = labels.instruction;
	label.style.left = "8px";
	label.style.top = "8px";
	root.append(outline, label);
	document.documentElement.append(overlayHost);
	let hovered: Element | null = null;
	const cursor = document.documentElement.style.cursor;
	document.documentElement.style.cursor = "crosshair";
	function update() {
		if (!hovered?.isConnected) return;
		const rect = hovered.getBoundingClientRect();
		const style = getComputedStyle(hovered);
		Object.assign(outline.style, {
			display: "block",
			left: `${rect.x}px`,
			top: `${rect.y}px`,
			width: `${rect.width}px`,
			height: `${rect.height}px`,
		});
		label.textContent = `${hovered.tagName.toLowerCase()}  ${Math.round(rect.width)} × ${Math.round(rect.height)}\n${labels.background}: ${style.backgroundColor}\n${labels.color}: ${style.color}\n${labels.font}: ${style.fontSize} ${style.fontFamily}\n${labels.instruction}`;
		label.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - label.offsetWidth - 8))}px`;
		label.style.top = `${Math.max(8, Math.min(rect.bottom + 8, innerHeight - label.offsetHeight - 8))}px`;
	}
	function move(event: MouseEvent) {
		if (!event.isTrusted) return;
		const target = event.composedPath().find((node): node is Element => node instanceof Element);
		if (!target || target === overlayHost) return;
		hovered = target;
		update();
	}
	function cleanup() {
		document.removeEventListener("mousemove", move, true);
		document.removeEventListener("click", click, true);
		document.removeEventListener("keydown", key, true);
		window.removeEventListener("scroll", update, true);
		window.removeEventListener("resize", update);
		overlayHost.remove();
		document.documentElement.style.cursor = cursor;
		delete targetWindow.__pideckPicker;
	}
	function cancel() {
		cleanup();
		send({ cancelled: true });
	}
	function key(event: KeyboardEvent) {
		if (!event.isTrusted) return;
		if (event.key !== "Escape") return;
		event.preventDefault();
		event.stopImmediatePropagation();
		cancel();
	}
	function click(event: MouseEvent) {
		if (!event.isTrusted) return;
		event.preventDefault();
		event.stopImmediatePropagation();
		move(event);
		if (!hovered) {
			cancel();
			return;
		}
		const element = hovered;
		const rect = element.getBoundingClientRect();
		const computed = getComputedStyle(element);
		const selection: BrowserSelection = {
			pageUrl: location.href,
			pageTitle: cut(document.title, 500),
			tagName: element.tagName.toLowerCase(),
			selector: path(element, false),
			xpath: path(element, true),
			text: safeText(element),
			accessibleName: cut(
				element.getAttribute("aria-label") ||
					element.getAttribute("alt") ||
					element.getAttribute("title") ||
					safeText(element),
			),
			role: cut(element.getAttribute("role"), 100),
			html: html(element),
			attributes: attributes(element),
			style: {
				color: computed.color,
				background: computed.backgroundColor,
				font: computed.font,
				display: computed.display,
			},
			rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
		};
		cleanup();
		send({ selection });
	}
	targetWindow.__pideckPicker = { cancel };
	document.addEventListener("mousemove", move, true);
	document.addEventListener("click", click, true);
	document.addEventListener("keydown", key, true);
	window.addEventListener("scroll", update, true);
	window.addEventListener("resize", update);
}

export function pickerScript(labels: BrowserPickerLabels, theme: PickerTheme, run: string): string {
	return `(${installPicker.toString()})(${JSON.stringify(labels)},${JSON.stringify(theme)},${JSON.stringify(run)})`;
}

export const CANCEL_PICKER_SCRIPT = "window.__pideckPicker?.cancel()";
