const CJK = /[　-〿㐀-鿿豈-﫿＀-￯]/u;

const needsGap = (left: string | undefined, right: string | undefined): boolean =>
	left !== undefined &&
	right !== undefined &&
	!/\s/u.test(left) &&
	!/\s/u.test(right) &&
	!CJK.test(left) &&
	!CJK.test(right);

/**
 * Insert dictated text after the selection without replacing it, so an existing draft is never lost.
 * Latin words get a single space against their neighbours; CJK text joins directly.
 */
export function insertDictation(
	value: string,
	selectionEnd: number,
	text: string,
): { value: string; caret: number } {
	const at = Math.min(Math.max(selectionEnd, 0), value.length);
	const spoken = text.trim();
	if (!spoken) return { value, caret: at };
	const before = value.slice(0, at);
	const after = value.slice(at);
	const lead = needsGap(before.at(-1), spoken[0]) ? " " : "";
	const tail = needsGap(spoken.at(-1), after[0]) ? " " : "";
	const inserted = `${lead}${spoken}${tail}`;
	return {
		value: `${before}${inserted}${after}`,
		caret: before.length + lead.length + spoken.length + tail.length,
	};
}
