---
id: submodule-server-assist
type: submodule-design
status: active
title: assist — ad-hoc one-shot tasks
parent: module-server
depends-on: [submodule-server-agent]
tags: [pi, oneshot, public-surface-checked]
---

## Responsibility

Small, **best-effort** agentic helpers that run a single cheap-model completion — the "ad-hoc one-shot
task service." Each task owns its prompt, output parsing/guards, and graceful-degrade fallback; it never
blocks or crashes its caller. The current task drafts a completed plan's summary when the agent wrote
none. Naming chats and workspaces is **not** an assist task: the main agent names them through
`set_title` (see [[submodule-server-agent]]), because every helper-model naming scheme produced names
users wanted to fix. PR descriptions are the second task, and the next-prompt guess for the composer's grey suggestion is the
third. The tasks are a **library surface** — no wire method; consumers are host-side flows.

## Boundary

- **Owns:**
  - The task catalog + their prompts, output guards, and fallbacks. Always time-boxed
    (`AbortSignal.timeout`) and bounded (`maxTokens`).
  - `setOneShotRunner(fn)` — a test seam swapping the one-shot runner (default = `agent.completeOnce`) so
    tasks unit-test against a fake with no pi/auth/network.
  - `suggestPlanSummary(steps)` \u2192 a short **Markdown** handoff note for a COMPLETED plan, drafted from its
    finished steps (`{ title, summary?, verification? }[]`, built by the caller \u2014 assist reads no store),
    through the same tool-free cheap-model path, or `null` (best-effort: `null`, never throws, on no auth /
    timeout / no usable steps / empty output). `toPlanSummary(raw)` is the pure output guard (strip a code
    fence and a leading `Summary:` label, clamp length, then reshape into `## Summary` / `## Changes` /
    `## Testing` — a missing section gets a placeholder, and a missing Summary takes the text before the
    first heading; `null` when empty). The host persists the result
    only when non-null; it never overwrites an agent-authored `plan.summary`.
  - `suggestPrDescription(input)` → a Markdown PR/MR description drafted from the caller-built input
    (`{ branch, base, commits, diffStat, plan?, template? }`, already bounded by `pr`), or `null` on the same
    best-effort terms. With a `template` the draft keeps the template's headings and checklist and fills
    their bodies; `toPrDescription(raw)` is the output guard (strip a code fence, clamp length, `null` when
    empty).
  - `suggestNextPrompt(input)` → one plain line the user could type next after a finished run, from the caller-built
    `NextPromptInput` (`{ prompts, reply, tools, model }`: the last few user messages, the closing reply, the tools
    the run called and the chat's own model — assist reads no session). It asks for the same language and tone as
    the user's latest message and for `NONE` when nothing is obvious, runs tool-free with a 15 s timeout and 200
    tokens, and is **confined to the chat's provider** (`OneShotRequest.within`: that provider's known small model,
    else the chat's own model) because it runs unprompted on the chat's content and must never reach a provider the
    user did not pick for that chat. `toNextPrompt(raw, lastPrompt?)` is the output guard: exactly one non-empty
    line, list markers / `User:` labels / wrapping quotes stripped, `NONE`, empty, over 120 characters,
    assistant-voiced openers (`I'll…`, `Sure…`, `好的…`) and a repeat of the previous message all become `null`. It
    never truncates: half a suggestion is worse than none.
- **Public surface (barrel):** `setOneShotRunner`, `suggestPlanSummary`, `toPlanSummary`,
  `suggestPrDescription`, `toPrDescription`, `suggestNextPrompt`, `toNextPrompt`, `OneShotRunner`,
  `PlanSummaryStep`, `PrDescriptionInput`, `NextPromptInput`.
- **Allowed deps:** `agent` (the `completeOnce`/`OneShotRequest`/`OneShotResult` primitive, via its
  barrel); Node.
- **Forbidden:** `host`; **`@earendil-works/pi-ai` / `pi-coding-agent` directly** (model access + dispatch
  belong to `agent`); reaching into another feature's internals.

## Get right

- Every task **degrades to `null`** — a failure must never block its caller or surface as an error. Wrap
  the runner call; the caller decides what (if anything) to write instead.
- Never trust model formatting: cap `maxTokens`, then normalize/clamp the text yourself.
- These are stateless, side-effect-free `fetch`es on the shared loop (no disk, no tools) — safe to run in
  parallel; no manager/registry needed.
