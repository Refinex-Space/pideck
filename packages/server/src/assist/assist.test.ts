import { afterEach, expect, test } from "bun:test";
import {
	type OneShotRunner,
	setOneShotRunner,
	suggestNextPrompt,
	suggestPlanSummary,
	suggestPrDescription,
	toNextPrompt,
	toPrDescription,
} from "./assist";

function fakeRunner(fn: OneShotRunner): void {
	setOneShotRunner(fn);
}

afterEach(() => setOneShotRunner(null));

test("suggestPlanSummary feeds the finished steps to the runner and returns the PR-body it emits verbatim", async () => {
	let seen = "";
	let seenSystem = "";
	fakeRunner(async (req) => {
		seen = req.prompt;
		seenSystem = req.system ?? "";
		return {
			text:
				"## Summary\n\nShipped the ranker rework.\n\n" +
				"## Changes\n\n_no cross-cutting notes_\n\n" +
				"## Testing\n\n- pytest \u2192 3 pass",
			model: { provider: "p", id: "m" },
		};
	});
	const out = await suggestPlanSummary([
		{
			title: "Rework ranking",
			summary: "EV = P_accept \u00d7 value",
			verification: "pytest \u2192 3 pass",
		},
		{ title: "Add logging" },
	]);
	expect(out).toBe(
		"## Summary\n\nShipped the ranker rework.\n\n" +
			"## Changes\n\n_no cross-cutting notes_\n\n" +
			"## Testing\n\n- pytest \u2192 3 pass",
	);
	expect(seen).toContain("Rework ranking");
	expect(seen).toContain("note: EV = P_accept");
	expect(seen).toContain("verified: pytest");
	expect(seen).toContain("Add logging");
	expect(seenSystem).toContain("## Summary");
	expect(seenSystem).toContain("## Changes");
	expect(seenSystem).toContain("## Testing");
});

test("suggestPlanSummary preserves H2 headings when stripping a code fence / 'Summary:' label; degrades to null on empty", async () => {
	fakeRunner(async () => ({
		text: "```md\nSummary: ## Summary\n\nAll done.\n\n## Changes\n\n_no cross-cutting notes_\n\n## Testing\n\n_not verified_\n```",
		model: { provider: "p", id: "m" },
	}));
	expect(await suggestPlanSummary([{ title: "Do it" }])).toBe(
		"## Summary\n\nAll done.\n\n## Changes\n\n_no cross-cutting notes_\n\n## Testing\n\n_not verified_",
	);
	fakeRunner(async () => ({ text: "   ", model: { provider: "p", id: "m" } }));
	expect(await suggestPlanSummary([{ title: "Do it" }])).toBeNull();
	fakeRunner(async () => {
		throw new Error("no auth");
	});
	expect(await suggestPlanSummary([{ title: "Do it" }])).toBeNull();
});

test("suggestPlanSummary normalizes model output that misses one or more required H2 sections", async () => {
	fakeRunner(async () => ({ text: "Done.", model: { provider: "p", id: "m" } }));
	const wrapped = await suggestPlanSummary([{ title: "step" }]);
	expect(wrapped).toBe(
		"## Summary\n\nDone.\n\n## Changes\n\n_no cross-cutting notes_\n\n## Testing\n\n_not verified_",
	);

	fakeRunner(async () => ({
		text: "## Summary\n\nShipped the thing.\n\n## Testing\n\n- unit \u2192 pass",
		model: { provider: "p", id: "m" },
	}));
	const reordered = await suggestPlanSummary([{ title: "step" }]);
	expect(reordered).toBe(
		"## Summary\n\nShipped the thing.\n\n## Changes\n\n_no cross-cutting notes_\n\n## Testing\n\n- unit \u2192 pass",
	);

	fakeRunner(async () => ({
		text: "Lead line.\n\n## Changes\n\n- a\n\n## Testing\n\n- unit \u2192 pass",
		model: { provider: "p", id: "m" },
	}));
	expect(await suggestPlanSummary([{ title: "step" }])).toBe(
		"## Summary\n\nLead line.\n\n## Changes\n\n- a\n\n## Testing\n\n- unit \u2192 pass",
	);

	fakeRunner(async () => ({
		text: "## Changes\n\n- a\n\n## Testing\n\n- unit \u2192 pass",
		model: { provider: "p", id: "m" },
	}));
	expect(await suggestPlanSummary([{ title: "step" }])).toBe(
		"## Summary\n\n_no summary_\n\n## Changes\n\n- a\n\n## Testing\n\n- unit \u2192 pass",
	);
});

test("suggestPlanSummary returns null without calling the runner when there are no usable steps", async () => {
	let called = false;
	fakeRunner(async () => {
		called = true;
		return { text: "x", model: { provider: "p", id: "m" } };
	});
	expect(await suggestPlanSummary([{ title: "   " }])).toBeNull();
	expect(called).toBe(false);
});

test("suggestPrDescription sends the branch facts and template to the cheap runner", async () => {
	let seen = "";
	let tier = "";
	fakeRunner(async (req) => {
		seen = req.prompt;
		tier = req.tier ?? "";
		return {
			text: "```markdown\n## Why\n\nShips the topbar segment.\n```",
			model: { provider: "p", id: "m" },
		};
	});
	const out = await suggestPrDescription({
		branch: "feature/ship",
		base: "main",
		commits: ["Add the ship segment", "  "],
		diffStat: " a.ts | 3 +++\n 1 file changed",
		plan: "## Plan\n- [x] Ship it",
		template: "## Why\n\n## Checklist\n- [ ] tests",
	});
	expect(out).toBe("## Why\n\nShips the topbar segment.");
	expect(tier).toBe("cheap");
	expect(seen).toContain("Branch: feature/ship \u2192 main");
	expect(seen).toContain("- Add the ship segment");
	expect(seen).toContain("a.ts | 3");
	expect(seen).toContain("Work plan:\n## Plan");
	expect(seen).toContain("TEMPLATE:\n## Why");
});

test("suggestPrDescription is best-effort: nothing to describe, a throw, or empty output is null", async () => {
	let calls = 0;
	fakeRunner(async () => {
		calls += 1;
		throw new Error("no auth");
	});
	expect(
		await suggestPrDescription({ branch: "b", base: "main", commits: [], diffStat: "" }),
	).toBeNull();
	expect(calls).toBe(0);
	expect(
		await suggestPrDescription({ branch: "b", base: "main", commits: ["x"], diffStat: "" }),
	).toBeNull();
	expect(calls).toBe(1);
	expect(toPrDescription("```\n\n```")).toBeNull();
	expect(toPrDescription("  ## Summary\n\nDone. ")).toBe("## Summary\n\nDone.");
});

const nextPromptInput = {
	prompts: ["Add a retry to the upload client", "Now cover it with a test"],
	reply: "Added the retry and a test. Want me to run the whole suite?",
	tools: ["edit", "bash", "edit"],
	model: { provider: "anthropic", id: "claude-opus-faux" },
};

test("suggestNextPrompt stays on the chat's provider and feeds the runner the recent exchange", async () => {
	let request: Parameters<OneShotRunner>[0] | undefined;
	fakeRunner(async (req) => {
		request = req;
		return { text: "yes, run the whole suite", model: { provider: "anthropic", id: "m" } };
	});
	expect(await suggestNextPrompt(nextPromptInput)).toBe("yes, run the whole suite");
	expect(request?.within).toEqual({ provider: "anthropic", modelId: "claude-opus-faux" });
	expect(request?.tier).toBe("cheap");
	expect(request?.prompt).toContain("1. Add a retry to the upload client");
	expect(request?.prompt).toContain("2. Now cover it with a test");
	expect(request?.prompt).toContain("Want me to run the whole suite?");
	expect(request?.prompt).toContain("Tools the run used: edit, bash");
});

test("suggestNextPrompt degrades to null on a runner failure, an empty exchange or an unusable answer", async () => {
	fakeRunner(async () => {
		throw new Error("no-model");
	});
	expect(await suggestNextPrompt(nextPromptInput)).toBeNull();
	let called = false;
	fakeRunner(async () => {
		called = true;
		return { text: "go on", model: { provider: "p", id: "m" } };
	});
	expect(await suggestNextPrompt({ ...nextPromptInput, reply: "  " })).toBeNull();
	expect(await suggestNextPrompt({ ...nextPromptInput, prompts: [] })).toBeNull();
	expect(called).toBe(false);
	fakeRunner(async () => ({ text: "NONE", model: { provider: "p", id: "m" } }));
	expect(await suggestNextPrompt(nextPromptInput)).toBeNull();
});

test("suggestNextPrompt keeps the end of a long reply, where the question usually is", async () => {
	let seen = "";
	fakeRunner(async (req) => {
		seen = req.prompt;
		return { text: "go ahead", model: { provider: "p", id: "m" } };
	});
	await suggestNextPrompt({ ...nextPromptInput, reply: `${"x".repeat(5000)} Shall I continue?` });
	expect(seen).toContain("Shall I continue?");
	expect(seen).toContain("\u2026xxx");
	expect(seen.length).toBeLessThan(3000);
});

test("toNextPrompt accepts one plain line and strips list markers, labels and wrapping quotes", () => {
	expect(toNextPrompt("run the tests")).toBe("run the tests");
	expect(toNextPrompt('  "run the tests"  ')).toBe("run the tests");
	expect(toNextPrompt("`commit this`")).toBe("commit this");
	expect(toNextPrompt("\u300c\u8dd1\u4e00\u4e0b\u6d4b\u8bd5\u300d")).toBe(
		"\u8dd1\u4e00\u4e0b\u6d4b\u8bd5",
	);
	expect(toNextPrompt("- fix the lint errors")).toBe("fix the lint errors");
	expect(toNextPrompt("User: fix the lint errors")).toBe("fix the lint errors");
});

test("toNextPrompt rejects NONE, empty, multi-line, over-long and assistant-voiced output", () => {
	for (const raw of [
		"NONE",
		"none.",
		"",
		"   ",
		"...",
		"run the tests\nthen commit",
		"I'll run the tests for you",
		"Sure, here you go",
		"\u597d\u7684\uff0c\u6211\u6765\u8dd1\u6d4b\u8bd5",
		"x".repeat(121),
	]) {
		expect(toNextPrompt(raw)).toBeNull();
	}
});

test("toNextPrompt drops a guess that only repeats the previous message", () => {
	expect(toNextPrompt("Now cover it with a test", " now cover it with a test ")).toBeNull();
	expect(toNextPrompt("Now cover it with a test", "something else")).toBe(
		"Now cover it with a test",
	);
});
