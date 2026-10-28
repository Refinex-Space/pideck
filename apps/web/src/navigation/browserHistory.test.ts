import { afterEach, beforeEach, expect, test } from "bun:test";
import {
	getNavigationHistory,
	goBack,
	goForward,
	subscribeNavigationHistory,
} from "./browserHistory";
import { browserNavigationDriver } from "./driver";

let entries: Array<{ state: unknown; hash: string }>;
let index: number;
let requested: number | null;
let storage: Map<string, string>;
let events: Map<string, Set<() => void>>;
let stop: () => void;
let original: PropertyDescriptor | undefined;

beforeEach(() => {
	original = Object.getOwnPropertyDescriptor(globalThis, "window");
	entries = [{ state: { otherRouterField: "preserved" }, hash: "#/v1" }];
	index = 0;
	requested = null;
	storage = new Map();
	events = new Map();
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		value: {
			location: {
				get hash() {
					return entries[index].hash;
				},
			},
			history: {
				get state() {
					return entries[index].state;
				},
				replaceState(state: unknown, _title: string, hash?: string) {
					entries[index] = { state, hash: hash ?? entries[index].hash };
				},
				pushState(state: unknown, _title: string, hash: string) {
					entries.splice(index + 1);
					entries.push({ state, hash });
					index++;
				},
				go(delta: number) {
					requested = delta;
				},
			},
			sessionStorage: {
				getItem: (key: string) => storage.get(key) ?? null,
				setItem: (key: string, value: string) => {
					storage.set(key, value);
				},
			},
			addEventListener(name: string, fn: () => void) {
				if (!events.has(name)) events.set(name, new Set());
				events.get(name)?.add(fn);
			},
			removeEventListener(name: string, fn: () => void) {
				events.get(name)?.delete(fn);
			},
		},
	});
	stop = () => {};
});
afterEach(() => {
	stop();
	if (original) Object.defineProperty(globalThis, "window", original);
	else Reflect.deleteProperty(globalThis, "window");
});
function finishTraversal() {
	if (requested === null) throw new Error("No history traversal was requested");
	index += requested;
	requested = null;
	for (const event of ["popstate", "hashchange"])
		for (const listener of events.get(event) ?? []) listener();
}

test("fresh navigation is bounded and history metadata preserves other object fields", () => {
	const driver = browserNavigationDriver();
	expect(driver.read()).toBe("#/v1");
	expect(getNavigationHistory()).toEqual({ canGoBack: false, canGoForward: false });
	expect(entries[0].state).toMatchObject({ otherRouterField: "preserved" });
	goBack();
	goForward();
	expect(requested).toBeNull();
	driver.replace("#/v1/projects/a");
	expect(entries).toHaveLength(1);
	expect(getNavigationHistory().canGoBack).toBe(false);
});

test("Back/Forward use real entries and disable repeated clicks until traversal completes", () => {
	const driver = browserNavigationDriver();
	const incoming: string[] = [];
	stop = driver.onIncoming((hash) => incoming.push(hash));
	driver.push("#/v1/projects/a");
	driver.push("#/v1/projects/b");
	goBack();
	expect(requested).toBe(-1);
	expect(getNavigationHistory()).toEqual({ canGoBack: false, canGoForward: false });
	goForward();
	expect(requested).toBe(-1);
	finishTraversal();
	expect(incoming).toEqual(["#/v1/projects/a"]);
	expect(getNavigationHistory()).toEqual({ canGoBack: true, canGoForward: true });
	goForward();
	finishTraversal();
	expect(incoming.at(-1)).toBe("#/v1/projects/b");
	expect(getNavigationHistory().canGoForward).toBe(false);
});

test("pushing after Back removes Forward and replacing does not add an entry", () => {
	const driver = browserNavigationDriver();
	stop = driver.onIncoming(() => {});
	driver.push("#/v1/projects/a");
	driver.push("#/v1/projects/b");
	goBack();
	finishTraversal();
	driver.push("#/v1/projects/c");
	expect(getNavigationHistory().canGoForward).toBe(false);
	driver.replace("#/v1/projects/c/workspaces/d");
	expect(entries).toHaveLength(3);
	expect(entries[2].hash).toBe("#/v1/projects/c/workspaces/d");
	expect(JSON.parse(storage.get("pideck:navigation-limit") ?? "null")).toMatchObject({
		upperBound: 2,
	});
});

test("unrecognized incoming entries create a safe boundary and subscriptions clean up", () => {
	const driver = browserNavigationDriver();
	stop = driver.onIncoming(() => {});
	let changes = 0;
	const unsubscribe = subscribeNavigationHistory(() => changes++);
	driver.push("#/v1/projects/a");
	expect(changes).toBe(1);
	entries[index] = { state: null, hash: "#/v1/projects/manual" };
	for (const listener of events.get("hashchange") ?? []) listener();
	expect(getNavigationHistory()).toEqual({ canGoBack: false, canGoForward: false });
	unsubscribe();
	driver.push("#/v1/projects/b");
	expect(changes).toBe(2);
	stop();
	expect(events.get("hashchange")?.size).toBe(0);
	expect(events.get("popstate")?.size).toBe(0);
});
