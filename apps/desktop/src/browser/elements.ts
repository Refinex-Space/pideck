import type { Page } from "playwright-core";

export function browserMediaSource(element: Element): { url: string } {
	if (
		!(
			element instanceof HTMLImageElement ||
			element instanceof HTMLMediaElement ||
			element instanceof HTMLSourceElement
		)
	)
		throw new Error("Select an image, audio or video element");
	return { url: "currentSrc" in element ? element.currentSrc || element.src : element.src };
}

export function describeBrowserElement(element: Element) {
	const selector = (node: Element, depth = 0): string => {
		if (depth > 12) throw new Error("Element nesting is too deep");
		const root = node.getRootNode();
		const parts: string[] = [];
		let current: Element | null = node;
		while (current && parts.length < 24) {
			if (current.id) {
				parts.unshift(`#${CSS.escape(current.id)}`);
				break;
			}
			const tag = current.tagName.toLowerCase();
			const parent: Element | null = current.parentElement;
			const peers: Element[] = parent
				? [...parent.children].filter((peer) => peer.tagName === current?.tagName)
				: [current];
			parts.unshift(`${tag}:nth-of-type(${peers.indexOf(current) + 1})`);
			current = parent;
		}
		const local = parts.join(" > ");
		return root instanceof ShadowRoot ? `${selector(root.host, depth + 1)} >> ${local}` : local;
	};
	const clone = element.cloneNode(true) as Element;
	for (const child of clone.querySelectorAll(
		"input,textarea,script,style,noscript,[contenteditable]",
	))
		child.remove();
	if (clone.matches("input,textarea,[contenteditable]")) clone.textContent = "";
	for (const node of [clone, ...clone.querySelectorAll("*")])
		for (const attribute of [...node.attributes])
			if (!/^(id|class|role|type|name|placeholder|aria-[\w-]+|data-testid)$/.test(attribute.name))
				node.removeAttribute(attribute.name);
	const visibleText = (clone.textContent ?? "").trim().slice(0, 4000);
	const primary = selector(element);
	const style = getComputedStyle(element);
	return {
		tagName: element.tagName.toLowerCase(),
		role: element.getAttribute("role"),
		visibleText,
		ariaName: element.getAttribute("aria-label") || element.getAttribute("alt") || visibleText,
		testId: element.getAttribute("data-testid"),
		boundingBox: element.getBoundingClientRect().toJSON(),
		preview: clone.outerHTML.slice(0, 6000),
		selector: { primary, candidates: [primary] },
		style: Object.fromEntries(
			[
				"display",
				"position",
				"color",
				"background-color",
				"font-family",
				"font-size",
				"font-weight",
			].map((name) => [name, style.getPropertyValue(name)]),
		),
	};
}

export async function browserElementAtPoint(page: Page, x: number, y: number) {
	if (!Number.isFinite(x) || !Number.isFinite(y))
		throw new Error("Element inspection requires finite x and y");
	let frame = page.mainFrame();
	let position = { x, y };
	const frames: string[] = [];
	for (let depth = 0; depth < 12; depth++) {
		const handle = await frame.evaluateHandle((point) => {
			let node = document.elementFromPoint(point.x, point.y);
			while (node?.shadowRoot) {
				const inner = node.shadowRoot.elementFromPoint(point.x, point.y);
				if (!inner || inner === node) break;
				node = inner;
			}
			return node;
		}, position);
		const element = handle.asElement();
		if (!element) {
			await handle.dispose();
			throw new Error("No element at these browser coordinates");
		}
		const child = await element.contentFrame();
		if (!child) return { element, frames };
		const box = await element.boundingBox();
		const border = await element.evaluate((node) => ({
			left: node.clientLeft,
			top: node.clientTop,
		}));
		const info = await element.evaluate(describeBrowserElement);
		await element.dispose();
		if (!box) throw new Error("Frame is not visible");
		frames.push(info.selector.primary);
		position = { x: x - box.x - border.left, y: y - box.y - border.top };
		frame = child;
	}
	throw new Error("Frame nesting is too deep");
}
