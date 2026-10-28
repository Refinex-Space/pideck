import { randomId } from "../lib";

const ENTRY_KEY = "pideckNavigation";
const LIMIT_KEY = "pideck:navigation-limit";
type Entry = { chain: string; index: number };
type Availability = { canGoBack: boolean; canGoForward: boolean };
let chain = "";
let upperBound = 0;
let snapshot: Availability = { canGoBack: false, canGoForward: false };
const listeners = new Set<() => void>();

function record(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function readEntry(): Entry | null {
	const state: unknown = window.history.state;
	const entry = record(state) ? state[ENTRY_KEY] : null;
	return record(entry) &&
		typeof entry.chain === "string" &&
		typeof entry.index === "number" &&
		Number.isSafeInteger(entry.index) &&
		entry.index >= 0
		? { chain: entry.chain, index: entry.index }
		: null;
}
function entryState(entry: Entry) {
	const state: unknown = window.history.state;
	return { ...(record(state) ? state : {}), [ENTRY_KEY]: entry };
}
function persistLimit(): void {
	try {
		window.sessionStorage.setItem(LIMIT_KEY, JSON.stringify({ chain, upperBound }));
	} catch {}
}
function currentEntry(): Entry {
	const existing = readEntry();
	const entry = existing ?? { chain: randomId("history"), index: 0 };
	if (entry.chain !== chain) {
		chain = entry.chain;
		upperBound = entry.index;
		try {
			const saved: unknown = JSON.parse(window.sessionStorage.getItem(LIMIT_KEY) ?? "null");
			if (
				record(saved) &&
				saved.chain === chain &&
				typeof saved.upperBound === "number" &&
				Number.isSafeInteger(saved.upperBound) &&
				saved.upperBound >= entry.index
			)
				upperBound = saved.upperBound;
		} catch {}
	}
	if (!existing) {
		window.history.replaceState(entryState(entry), "");
		persistLimit();
	}
	return entry;
}
function publish(canGoBack: boolean, canGoForward: boolean): void {
	if (snapshot.canGoBack === canGoBack && snapshot.canGoForward === canGoForward) return;
	snapshot = { canGoBack, canGoForward };
	for (const listener of listeners) listener();
}
export function refreshNavigationHistory(): void {
	const entry = currentEntry();
	publish(entry.index > 0, entry.index < upperBound);
}
export function writeNavigationHistory(fragment: string, push: boolean): void {
	const current = currentEntry();
	if (push) {
		const entry = { chain, index: current.index + 1 };
		window.history.pushState(entryState(entry), "", fragment);
		upperBound = entry.index;
		persistLimit();
	} else window.history.replaceState(entryState(current), "", fragment);
	refreshNavigationHistory();
}
export const getNavigationHistory = (): Availability => snapshot;
export function subscribeNavigationHistory(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}
function traverse(delta: -1 | 1): void {
	if (!(delta === -1 ? snapshot.canGoBack : snapshot.canGoForward)) return;
	publish(false, false);
	window.history.go(delta);
}
export const goBack = (): void => traverse(-1);
export const goForward = (): void => traverse(1);
