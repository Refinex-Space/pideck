export type LayoutFocusIntent = "restore" | "keyboard";

const FOCUS_INTENT_ATTRIBUTE = "data-layout-focus-intent";

function clearFocusIntent(event: Event): void {
	(event.currentTarget as HTMLElement).removeAttribute(FOCUS_INTENT_ATTRIBUTE);
}

export function setLayoutFocusIntent(element: HTMLElement, intent: LayoutFocusIntent): void {
	element.setAttribute(FOCUS_INTENT_ATTRIBUTE, intent);
	element.addEventListener("blur", clearFocusIntent, { once: true });
}

export function readLayoutFocusIntent(element: Element | null): LayoutFocusIntent {
	const intent = element?.getAttribute(FOCUS_INTENT_ATTRIBUTE);
	return intent === "keyboard" || (!intent && element?.matches(":focus-visible"))
		? "keyboard"
		: "restore";
}

export function focusLayoutElement(
	element: HTMLElement | null | undefined,
	intent: LayoutFocusIntent = "restore",
): void {
	if (!element) return;
	setLayoutFocusIntent(element, intent);
	element.focus();
	if (element.ownerDocument.activeElement !== element)
		element.removeAttribute(FOCUS_INTENT_ATTRIBUTE);
}
