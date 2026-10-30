---
id: submodule-web-chat-resources
type: submodule-design
status: active
title: Chat Resources — task roster, strip, detail and MCP rows for command and subagent work
parent: submodule-web-chat
depends-on: [module-contracts]
tags: [chat, resources, public-surface-checked]
---

## Responsibility

The current chat's **Resources** surfaces: a props-driven **roster** of running and finished background
work, the ambient **strip** above the composer, a **detail dialog** for one command's output or one
subagent's transcript, and the chat's **MCP connector rows**. Together they make agent-created work —
background commands and subagents — glanceable, inspectable without scrolling to old tool calls, and
stoppable, without confusing it with user-owned workspace terminals; and they show the chat's MCP servers
with their per-chat actions.

None of them is a permanent pane or a workbench tab. The roster and the connector rows are the bodies of
the status dock's *Background tasks* and *Connectors* blocks ([[submodule-web-panels]], *Status dock*);
the strip is the same roster's compact form beside the composer. All of them render one host-reported
snapshot through one row grammar. The same grammar also owns the transcript's **result row** (below), so a
finished command or background subagent reads the same in the chat as in Finished.

There is no header button and no in-place inspector any more: the former *Resources* trigger, its MCP
attention marker and the transcript-covering inspector were folded into the dock (the status toggle's
corner dot carries the attention and working signals), because the inspector hid the conversation and
repeated what the dock shows.

## Boundary

- **Owns:** props-driven `ResourcesRoster`, `ResourcesDock` (the strip), `ResourceDetailDialog`,
  `McpConnectorList`, `CommandLogView` and `ResultRow`, exported through `index.ts`, plus the private
  row/state vocabulary they share (`resourceRow.tsx`) and the MCP row (`mcpRow.tsx`). The detail dialog
  renders the header; its *body* is a slot the parent fills, and so is the result row's expanded body.
- **Public surface:** `ResourcesRoster`, `ResourcesDock`, `ResourceDetailDialog`, `McpConnectorList`,
  `CommandLogView`, `ResultRow`, `ResultReceipt`, `ResultSource`, `Resource`, `ResourceTarget`,
  `resourceTarget`.
- **Allowed external deps:** contracts, React, Lucide and retained Remix icons, shared UI primitives and
  theme utilities, `@thinkrail/locales` (UI strings), and `lib` (the shared MCP state vocabulary). Time
  arrives as a `now` prop so formatting stays pure.
- **Forbidden:** store/transport, server/portable extension packages, Pi value imports, process
  execution, log persistence, subagent transcript fetching, and workbench placement. Parent-chat
  integration — the shared sync, what fills the detail slot, where the surfaces mount — belongs to
  [[submodule-web-chat]]'s `ChatResourcesScope`.

## Row grammar

Every surface renders a resource as one row: kind glyph with a status dot · name (command display
name or subagent role) · activity (the command text or the task) · state · elapsed, with Inspect/Stop
appearing on hover and focus in place of the state text so rows never change height. A row's visual
state collapses the wire statuses into one in-flight presentation and three settled ones:

- *running* commands and *running* subagents → **Working** (primary, breathing dot); *queued* →
  **Queued**; *stopping* → **Stopping…** — all live, all sorted before settled rows, **oldest start
  first regardless of live state**, so a row never jumps when it starts or begins stopping;
- *completed* with exit 0 / *completed* subagents → **Done** (success); nonzero exit, *error* → **Failed**
  (error, auto-visible); *stopped* / *aborted* → **Stopped** (neutral: a user stop is not a failure).

State is always glyph + colour + word; colour and motion are never the only signal. Elapsed time is
coarse (minutes) because the shared clock ticks every 30 s; it is a live row's duration, or a settled
row's run time — a command's finish minus start, a subagent's host-reported `durationMs` (absent from
an older host, so that row shows no duration rather than a guess). Exit codes render as a monospaced
badge.

## Presentation

**Roster.** Two sections: **Active** (with its count and, while subagents run, a Stop-all control) and
**Finished** (a count that unfolds the rows, folded by default so a long history never pushes the dock's
other blocks away). Each row is a `listitem` with exactly two controls: its name and activity together
are one Inspect control that opens the detail, and Stop requests cancellation for that row. The Active
section carries `data-active-count`, the number of live rows, for tests and for tooling that must not
count DOM rows. **Stop all subagents** asks first, naming the current active count; it never stops the
main chat or disables future delegation. A reconnecting, loading, stale or failed snapshot shows its
notice (failures with Retry) and disables controls without authority.

**Strip.** The strip lists live rows directly above the composer, then the finished results the parent
marks **new** (`freshCommands`/`freshSubagents`, newest first, highlighted, with a dismiss control in
place of Stop), and renders nothing when there is neither. The parent owns what counts as new; the strip
only reports a dismissal through `onDismiss(target)`. Past four rows it collapses to one summary line
(live count, per-kind live counts, "N new") that the user can expand; the collapsed/expanded choice is
local. Inspect opens the detail through `onInspect(target)`. **The strip steps aside while the status dock
is open** — the dock's roster already shows the same rows — and returns when it closes. It reserves its
rows rather than animating height on every change, so the composer does not jitter.

**Detail dialog.** A modal dialog for the selected row: the header repeats the row's name and state and
offers Stop for live rows, plus — for a subagent whose snapshot carries `model` — a **Model** item
rendered by the parent's `renderSubagentModel(summary)` (nothing when the host sent no model). The body
is the parent's slot — bounded plain-text command output for a command (this module's `CommandLogView`),
the read-only subagent transcript pane for a subagent. A footer states the retention limit. Roster and
strip rows deliberately omit the model: it would crowd out the task, which is what tells two runs apart.
Being modal, an open dialog also keeps a result unacknowledged until it closes, as any modal does.

**MCP connector rows.** `McpConnectorList` takes the snapshot's `mcpServers` (a host at
`MCP_PROTOCOL_VERSION`; `null` hides the block's list). A server is not work, so it never appears in the
strip. Each server is **one line**: plug glyph with a state dot · name · the shared state label — the tool
count when connected (the state word stays for screen readers), a coloured state otherwise — · at most one
**inline action** · a **⋯ menu** that is always shown (a same-width placeholder keeps the right edge
level on rows without one). The inline action is the first action that is not Disable: **Sign in**
(needs-sign-in), **Review** (pending approval), **Edit** (invalid config) — all open Settings — **Reconnect**
(failed or disconnected) or **Enable in this chat** (when it is on the row, the state text is read-only
for assistive tech, since the button already says so). **Disable in this chat** lives in the menu, whose
footer line says it applies at the chat's next idle reload and restarts its other servers; it is never
offered on a `registered` server, one an extension registered, which the host refuses to disable per chat.
Transport ("HTTP", "stdio · runs on host") is the row's tooltip, "applies when the chat is idle" a second
line only for `pending-reload`, and an action error a line under its row. There is no PID and no immediate
stop: pi offers neither. Controls are disabled without authority and one request per server is in flight.

**Receipts.** The transcript's turn divider may carry a "N still running" chip supplied by the parent;
it reveals the status dock and is the only chat-body roster hint — there is no inline list.

**Result row.** `ResultRow` renders one historical completion notice (the details of a
`background-command-completion` or `subagent-completion` message, or of a finished result the agent
pulled) for the transcript: chevron · kind glyph with status dot · an optional `receipt` lead ("Agent
received" / "Agent replies after your next message") · `Background` / `Subagent` · name · state · run time (the same coarse
`formatElapsed` the Finished row shows) · exit badge (commands) · optional parent-supplied `metaLead`
node (the subagent's model label) and `meta` text ·
a one-line teaser · an optional open action ("Open log" / "Transcript"), which opens the detail dialog. The command teaser is the
excerpt's last non-empty line with ANSI CSI sequences removed; a subagent teaser comes from the parent,
which owns the report text. The teaser hides while expanded, gives way first at narrow widths, and keeps
the code face for command output. The row is **controlled**: `expanded`, `onToggle` and `toggleRef` come
from the parent's transcript fold state, and without `onToggle` there is nothing to expand. It never
claims current authority — whether the open action exists is the parent's call from its own snapshot.
Its status-dot ring is drawn against the transcript canvas.

Command output is plain monospaced text, not an interactive terminal or interpreted markup. Show when
only a bounded tail remains, and distinguish empty output, loading, transient read failure and
permanently unavailable/evicted output. The history limit is runtime history, not a promise of retained
logs after host restart.

Successful Stop means cancellation was requested, not that a terminal state may be fabricated. While a
control request is pending, avoid duplicate submission; subsequent state comes from the host. A
finished resource racing a click is harmless. A stale/disconnected view cannot offer active controls
until it has current authority, and an old-host connection hides the roster, strip and detail rather
than displaying an empty list as proof nothing is running (the dock says the host does not report
background tasks).

Closing the dock, the strip, the detail or the chat placement never stops work. A
supported-to-known-unsupported welcome retires the detail dialog. A transient reconnect with unknown
protocol support keeps the roster as stale instead of misclassifying the host. Use existing Radix
primitives, token-only styling and visible text alongside status icons.

The subagent list includes this chat's direct foreground and background children. A summary says
`detached` for a background run (the child's `info`, never guessed from queued/running), and only those
— plus finished commands — can be new results: a foreground child's report already reached the agent
in its own card. This version has no
recursive tree, workspace/global scope, restart/steer actions, artifacts, needs-you state (children run
headless), or arbitrary shell-process discovery. Ordinary workspace terminal tabs do not appear.

## Verification obligations

Cover empty/active/finished/stale/unavailable states, exact live counts, the strip's collapse and
step-aside rule, the roster's folded Finished section and Stop-all confirmation, the connector rows'
per-state inline action and menu, the always-present menu column, absence for older hosts, safe
plain-text logs, row-specific stop failures, the detail header's model item (absent without a model),
and the result row's state mapping, teaser derivation, controlled expansion and optional open action.
Browser coverage must prove current-chat isolation, reload/reconnect rehydration, late completion while
the dock is closed, the detail opening from the roster and from a result row, and no cancellation from
view closure; `e2e/chat-resources.spec.ts` also pins the connector rows' shared right edge and the
Manage row's alignment.
