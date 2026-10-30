import { expect, test } from "bun:test";
import { scaleBrowserInput } from "./inputTransport";

test("CEF preview scale transforms pointer position without changing key/text/scroll payloads", () => {
	const event = {
		id: 3,
		sessionId: "owned-page",
		method: "Input.dispatchMouseEvent",
		params: { type: "mouseWheel", x: 100, y: 240, deltaY: 400 },
	};
	expect(scaleBrowserInput(event, 0.5)).toEqual({
		...event,
		params: { ...event.params, x: 50, y: 120 },
	});
	expect(event.params.x).toBe(100);
	expect(scaleBrowserInput(event, 1)).toBe(event);
	const key = { method: "Input.dispatchKeyEvent", params: { key: "A" } };
	expect(scaleBrowserInput(key, 0.5)).toBe(key);
});
