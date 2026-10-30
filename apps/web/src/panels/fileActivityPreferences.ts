import {
	asStablePreferenceAdapter,
	getStablePreferenceAdapter,
	type StablePreferenceAdapter,
} from "../clientPreferences";
import { STORAGE_PREFIX } from "../constants/branding";
import {
	DEFAULT_FILE_ACTIVITY_PREFERENCES,
	type FileActivityPreferences,
	parseFileActivityPreferences,
	sameFileActivityPreferences,
	useAppStore,
} from "../store";
import { getTransport } from "../transport";

export const FILE_ACTIVITY_PREFERENCE_KEY = "file-activity";

export function fileActivityStorageKey(httpBase: string): string {
	return `${STORAGE_PREFIX}file-activity:${httpBase}`;
}

function read(
	storage: Pick<StablePreferenceAdapter, "getItem">,
	key: string,
): FileActivityPreferences {
	try {
		return parseFileActivityPreferences(storage.getItem(key));
	} catch {
		return { ...DEFAULT_FILE_ACTIVITY_PREFERENCES };
	}
}

function write(
	storage: StablePreferenceAdapter,
	key: string,
	value: FileActivityPreferences,
): void {
	try {
		if (sameFileActivityPreferences(value, DEFAULT_FILE_ACTIVITY_PREFERENCES)) {
			storage.removeItem(key);
		} else storage.setItem(key, JSON.stringify(value));
	} catch {}
}

/**
 * Keeps the file-activity preferences in this browser (one entry per host) or in the native shell's
 * stable store, and follows another tab's change. They stay client-local, like the chat's: what the
 * file tree animates is a viewing choice, not workspace or host state.
 */
export function initFileActivityPreferencesPersistence(
	stablePreferences: StablePreferenceAdapter | null = getStablePreferenceAdapter(),
): () => void {
	let storage: Storage | null = null;
	if (!stablePreferences) {
		try {
			storage = window.localStorage;
		} catch {}
	}
	const adapter: StablePreferenceAdapter | null =
		stablePreferences ?? asStablePreferenceAdapter(storage);
	const key = stablePreferences
		? FILE_ACTIVITY_PREFERENCE_KEY
		: fileActivityStorageKey(getTransport().httpBase());
	const initial = adapter ? read(adapter, key) : { ...DEFAULT_FILE_ACTIVITY_PREFERENCES };
	useAppStore.getState().setFileActivityPreferences(initial);
	let previous = useAppStore.getState().fileActivityPreferences;
	const unsubscribe = useAppStore.subscribe((state) => {
		if (state.fileActivityPreferences === previous) return;
		previous = state.fileActivityPreferences;
		if (adapter) write(adapter, key, previous);
	});
	const onStorage = (event: StorageEvent) => {
		if (stablePreferences || !storage) return;
		if ((event.key !== null && event.key !== key) || event.storageArea !== storage) return;
		const next =
			event.key === null
				? { ...DEFAULT_FILE_ACTIVITY_PREFERENCES }
				: parseFileActivityPreferences(event.newValue);
		previous = next;
		useAppStore.getState().setFileActivityPreferences(next);
	};
	if (!stablePreferences) window.addEventListener("storage", onStorage);
	return () => {
		unsubscribe();
		if (!stablePreferences) window.removeEventListener("storage", onStorage);
	};
}
