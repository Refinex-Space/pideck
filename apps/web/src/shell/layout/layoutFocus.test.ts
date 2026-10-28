import { expect, test } from "bun:test";
import { focusLayoutElement, readLayoutFocusIntent, setLayoutFocusIntent } from "./layoutFocus";

function focusTarget({ acceptsFocus = true, focusVisible = false } = {}) {
	const attributes = new Map<string, string>();
	const ownerDocument: { activeElement: HTMLElement | null } = { activeElement: null };
	const element = new (class extends EventTarget {
		ownerDocument = ownerDocument;
		setAttribute(name: string, value: string) {
			attributes.set(name, value);
		}
		getAttribute(name: string) {
			return attributes.get(name) ?? null;
		}
		removeAttribute(name: string) {
			attributes.delete(name);
		}
		matches(selector: string) {
			return selector === ":focus-visible" && focusVisible;
		}
		focus() {
			if (acceptsFocus) ownerDocument.activeElement = element;
		}
	})() as unknown as HTMLElement;
	return {
		element,
		blur: () => {
			ownerDocument.activeElement = null;
			element.dispatchEvent(new Event("blur"));
		},
	};
}

test("automatic restoration still focuses the target without inheriting browser keyboard intent", () => {
	const { element } = focusTarget({ focusVisible: true });
	focusLayoutElement(element);
	expect(element.ownerDocument.activeElement).toBe(element);
	expect(readLayoutFocusIntent(element)).toBe("restore");
});

test("keyboard navigation replaces restoration intent without changing the focus target", () => {
	const { element } = focusTarget();
	focusLayoutElement(element);
	setLayoutFocusIntent(element, "keyboard");
	expect(readLayoutFocusIntent(element)).toBe("keyboard");
	expect(element.ownerDocument.activeElement).toBe(element);
	focusLayoutElement(element, "keyboard");
	expect(readLayoutFocusIntent(element)).toBe("keyboard");
});

test("leaving a restored target clears intent so a later native Tab focus remains visible", () => {
	const { element, blur } = focusTarget({ focusVisible: true });
	focusLayoutElement(element);
	blur();
	expect(element.getAttribute("data-layout-focus-intent")).toBeNull();
	expect(readLayoutFocusIntent(element)).toBe("keyboard");
});

test("an unavailable target never retains a restoration marker", () => {
	const { element } = focusTarget({ acceptsFocus: false });
	focusLayoutElement(element);
	expect(element.getAttribute("data-layout-focus-intent")).toBeNull();
	focusLayoutElement(null);
	focusLayoutElement(undefined);
	expect(readLayoutFocusIntent(null)).toBe("restore");
});
