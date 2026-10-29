import { expect, test } from "bun:test";
import { fileDraftKey, persistFileDrafts, readFileDrafts } from "./fileDrafts";

test("file recovery uses the window session instead of the limited native preference adapter", () => {
	const names = ["sessionStorage", "__THINKRAIL_STABLE_PREFERENCES__"] as const;
	const descriptors = names.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
	const values = new Map<string, string>();
	let preferenceWrites = 0;
	let full = false;
	try {
		Object.defineProperty(globalThis, "sessionStorage", {
			configurable: true,
			value: {
				getItem: (key: string) => values.get(key) ?? null,
				setItem: (key: string, value: string) => {
					if (full) throw new Error("quota exceeded");
					values.set(key, value);
				},
				removeItem: (key: string) => values.delete(key),
			},
		});
		Object.defineProperty(globalThis, "__THINKRAIL_STABLE_PREFERENCES__", {
			configurable: true,
			value: {
				getItem: () => null,
				setItem: () => {
					preferenceWrites += 1;
				},
				removeItem: () => {},
			},
		});
		const key = fileDraftKey("workspace", "source.ts");
		const draft = {
			workspaceId: "workspace",
			path: "source.ts",
			baseHash: "hash",
			baseContent: "",
			text: "a".repeat(300_000),
		};
		persistFileDrafts({ [key]: draft });
		expect(readFileDrafts()[key]).toEqual(draft);
		expect(preferenceWrites).toBe(0);
		full = true;
		expect(() => persistFileDrafts({ [key]: { ...draft, text: "changed" } })).toThrow(
			"quota exceeded",
		);
		expect(readFileDrafts()[key]?.text).toBe(draft.text);
		persistFileDrafts({});
		expect(readFileDrafts()).toEqual({});
	} finally {
		for (const [index, name] of names.entries()) {
			const descriptor = descriptors[index];
			if (descriptor) Object.defineProperty(globalThis, name, descriptor);
			else Reflect.deleteProperty(globalThis, name);
		}
	}
});
