import { type BrowserSelection, normalizeBrowserUrl } from "@thinkrail/contracts";

export function browserMessage(value: unknown): Record<string, unknown> | null {
	for (let depth = 0; depth < 3 && typeof value === "string"; depth++) {
		if (value.length > 40000) return null;
		try {
			value = JSON.parse(value);
		} catch {
			return null;
		}
	}
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

export function readBrowserSelection(value: unknown): BrowserSelection | null {
	const record = browserMessage(value);
	if (!record) return null;
	const strings = [
		"pageUrl",
		"pageTitle",
		"tagName",
		"selector",
		"xpath",
		"text",
		"accessibleName",
		"role",
		"html",
	] as const;
	if (!strings.every((key) => typeof record[key] === "string" && record[key].length <= 8192))
		return null;
	if (!normalizeBrowserUrl(record.pageUrl as string)) return null;
	const rect = browserMessage(record.rect);
	if (
		!rect ||
		!["x", "y", "width", "height"].every(
			(key) => typeof rect[key] === "number" && Number.isFinite(rect[key]),
		)
	)
		return null;
	for (const key of ["attributes", "style"]) {
		const values = browserMessage(record[key]);
		if (
			!values ||
			Object.keys(values).length > 50 ||
			!Object.values(values).every((item) => typeof item === "string" && item.length <= 1000)
		)
			return null;
	}
	return record as unknown as BrowserSelection;
}
