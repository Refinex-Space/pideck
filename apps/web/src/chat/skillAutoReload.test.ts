import { describe, expect, test } from "bun:test";
import type { SessionState } from "@thinkrail/contracts";
import { type SkillAutoReloadGate, skillAutoReloadReady } from "./skillAutoReload";

const idle: SessionState = {
	execution: "idle",
	runId: null,
	needsInput: null,
	completion: null,
	completionUnread: false,
	queuedCount: 0,
	backgroundWork: false,
};

const READY: SkillAutoReloadGate = {
	isCurrentChat: true,
	stale: true,
	connected: true,
	sessionExists: true,
	isStreaming: false,
	hostState: idle,
};

describe("skillAutoReloadReady", () => {
	test("an idle chat in front with stale skills reloads, with or without a host state", () => {
		expect(skillAutoReloadReady(READY)).toBe(true);
		expect(skillAutoReloadReady({ ...READY, hostState: null })).toBe(true);
	});

	test("a turn in flight, on either side, waits", () => {
		expect(skillAutoReloadReady({ ...READY, isStreaming: true })).toBe(false);
		expect(skillAutoReloadReady({ ...READY, hostState: { ...idle, execution: "running" } })).toBe(
			false,
		);
	});

	test("fresh skills, a background chat, a missing session or a dropped connection do nothing", () => {
		for (const patch of [
			{ stale: false },
			{ isCurrentChat: false },
			{ sessionExists: false },
			{ connected: false },
		]) {
			expect(skillAutoReloadReady({ ...READY, ...patch })).toBe(false);
		}
	});
});
