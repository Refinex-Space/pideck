import { afterEach, expect, test } from "bun:test";
import type { StablePreferenceAdapter } from "../clientPreferences";
import { DEFAULT_FILE_ACTIVITY_PREFERENCES, useAppStore } from "../store";
import {
	FILE_ACTIVITY_PREFERENCE_KEY,
	fileActivityStorageKey,
	initFileActivityPreferencesPersistence,
} from "./fileActivityPreferences";

function memoryAdapter(initial: Record<string, string> = {}): StablePreferenceAdapter & {
	values: Map<string, string>;
} {
	const values = new Map(Object.entries(initial));
	return {
		values,
		getItem: (key) => values.get(key) ?? null,
		setItem: (key, value) => void values.set(key, value),
		removeItem: (key) => void values.delete(key),
	};
}

let stop: (() => void) | undefined;
afterEach(() => {
	stop?.();
	stop = undefined;
	useAppStore.getState().setFileActivityPreferences({ ...DEFAULT_FILE_ACTIVITY_PREFERENCES });
});

test("the storage key is per host", () => {
	expect(fileActivityStorageKey("http://a")).not.toBe(fileActivityStorageKey("http://b"));
});

test("loads what was stored, keeping the defaults for anything missing", () => {
	const adapter = memoryAdapter({
		[FILE_ACTIVITY_PREFERENCE_KEY]: JSON.stringify({ follow: false, shell: true }),
	});
	stop = initFileActivityPreferencesPersistence(adapter);
	expect(useAppStore.getState().fileActivityPreferences).toEqual({
		...DEFAULT_FILE_ACTIVITY_PREFERENCES,
		follow: false,
		shell: true,
	});
});

test("writes a changed choice and removes the entry once everything is default again", () => {
	const adapter = memoryAdapter();
	stop = initFileActivityPreferencesPersistence(adapter);
	expect(adapter.values.size).toBe(0);
	const changed = { ...DEFAULT_FILE_ACTIVITY_PREFERENCES, reads: false };
	useAppStore.getState().setFileActivityPreferences(changed);
	expect(JSON.parse(adapter.values.get(FILE_ACTIVITY_PREFERENCE_KEY) ?? "null")).toEqual(changed);
	useAppStore.getState().setFileActivityPreferences({ ...DEFAULT_FILE_ACTIVITY_PREFERENCES });
	expect(adapter.values.has(FILE_ACTIVITY_PREFERENCE_KEY)).toBe(false);
});

test("an unchanged write does not replace the store's value", () => {
	stop = initFileActivityPreferencesPersistence(memoryAdapter());
	const before = useAppStore.getState().fileActivityPreferences;
	useAppStore.getState().setFileActivityPreferences({ ...DEFAULT_FILE_ACTIVITY_PREFERENCES });
	expect(useAppStore.getState().fileActivityPreferences).toBe(before);
});

test("a storage that throws leaves the app on its defaults", () => {
	const broken: StablePreferenceAdapter = {
		getItem: () => {
			throw new Error("denied");
		},
		setItem: () => {
			throw new Error("denied");
		},
		removeItem: () => {
			throw new Error("denied");
		},
	};
	stop = initFileActivityPreferencesPersistence(broken);
	expect(useAppStore.getState().fileActivityPreferences).toEqual(DEFAULT_FILE_ACTIVITY_PREFERENCES);
	expect(() =>
		useAppStore.getState().setFileActivityPreferences({
			...DEFAULT_FILE_ACTIVITY_PREFERENCES,
			follow: false,
		}),
	).not.toThrow();
});
