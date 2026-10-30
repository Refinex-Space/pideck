import type { Frame, Page } from "playwright-core";

export function clipboardShortcut(key: string, platform: string): "copy" | "cut" | "paste" | null {
	const parts = key.toLowerCase().split("+");
	if (parts.includes("alt")) return null;
	const modifier =
		parts.includes("controlormeta") ||
		(platform === "darwin" ? parts.includes("meta") : parts.includes("control"));
	if (!modifier) return null;
	const letter = parts.at(-1);
	if (letter === "v") return "paste";
	if (parts.includes("shift")) return null;
	return letter === "c" ? "copy" : letter === "x" ? "cut" : null;
}

async function focusedFrame(page: Page): Promise<Frame> {
	let frame = page.mainFrame();
	for (let depth = 0; depth < 16; depth++) {
		const handle = await frame.evaluateHandle(() => {
			let active = document.activeElement;
			while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
			return active;
		});
		const child = await handle.asElement()?.contentFrame();
		await handle.dispose();
		if (!child) return frame;
		frame = child;
	}
	throw new Error("Browser focus nesting is too deep");
}

export async function copyBrowserSelection(page: Page, cut: boolean): Promise<string | null> {
	return (await focusedFrame(page)).evaluate((cut) => {
		let active = document.activeElement;
		while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
		if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
			if (active instanceof HTMLInputElement && active.type === "password") return null;
			const start = active.selectionStart ?? 0;
			const end = active.selectionEnd ?? 0;
			if (start === end) return null;
			const text = active.value.slice(start, end);
			if (cut && !active.readOnly && !active.disabled) {
				active.setRangeText("", start, end, "end");
				active.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteByCut" }));
			}
			return text;
		}
		const text = getSelection()?.toString();
		if (!text) return null;
		if (cut) document.execCommand("delete");
		return text;
	}, cut);
}

export async function pasteBrowserText(page: Page, text: string): Promise<void> {
	await (await focusedFrame(page)).evaluate((text) => {
		let active = document.activeElement;
		while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
		if (!active) throw new Error("Focus an editable element before pasting");
		const data = new DataTransfer();
		data.setData("text/plain", text);
		if (
			!active.dispatchEvent(
				new ClipboardEvent("paste", {
					bubbles: true,
					composed: true,
					cancelable: true,
					clipboardData: data,
				}),
			)
		)
			return;
		if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
			if (active.readOnly || active.disabled) throw new Error("The paste target is read-only");
			const start = active.selectionStart;
			const end = active.selectionEnd;
			if (start !== null && end !== null) active.setRangeText(text, start, end, "end");
			else {
				const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(active), "value")?.set;
				if (setter) setter.call(active, active.value + text);
			}
			active.dispatchEvent(
				new InputEvent("input", { bubbles: true, inputType: "insertFromPaste", data: text }),
			);
		} else if (active instanceof HTMLElement && active.isContentEditable)
			document.execCommand("insertText", false, text);
	}, text);
}
