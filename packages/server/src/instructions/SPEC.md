---
id: submodule-server-instructions
type: submodule-design
status: active
title: instructions — Pi's global rule files, edited from Settings
parent: module-server
depends-on: [submodule-server-agent, module-contracts, module-shared]
references: [submodule-web-panels, pi-compatibility]
tags: [instructions, rules, system-prompt]
---

## Responsibility

Read and write the two **global** instruction files Pi already loads from its agent directory
(`getAgentDir()`, `~/.pi/agent` unless `PI_CODING_AGENT_DIR` / Settings → Environment moves it), and report
which files a workspace's chats will actually load. It adds no prompt-injection logic: Pi's resource loader
reads the files, and PiDeck's chats already use that loader.

## Research basis

Checked against the installed Pi (`@earendil-works/pi-coding-agent` 1.4.0: `resource-loader.js`,
`system-prompt.js`, `docs/configuration.md`), not against secondary write-ups:

- **Context files** (`AGENTS.override.md` → `AGENTS.md` → `AGENTS.MD` → `CLAUDE.md` → `CLAUDE.MD`, first
  present wins per folder) load from the agent directory, then every ancestor of the working directory down to
  it. They **stack**; nothing recursive below the working directory; no project trust needed. They land in the
  `project_context` prompt section.
- **`APPEND_SYSTEM.md`** (agent directory, or a trusted project's `.pi/`) lands in the `addendum` section, ahead
  of `project_context`. The project file **replaces** the global one; the two are never combined.
- **`SYSTEM.md`** replaces the base prompt. With it Pi emits only the `preamble`, dropping its tool list, rules and
  docs sections. It is therefore not offered for editing; the workspace view only warns when one is in force.
- Pi does not read `~/.claude/CLAUDE.md` or `~/.codex/AGENTS.md`. Sharing happens through the project files or a
  symlink the user makes.

## Decision

Edit Pi's native files rather than a PiDeck-owned store injected through loader overrides. One source of truth
shared with the Pi CLI, no second code path in session creation, and nothing to remove on a Pi upgrade. `AGENTS.md`
is primary (Pi's first candidate, and the cross-agent convention); `APPEND_SYSTEM.md` is secondary and collapsed
in the UI because most rules belong in `AGENTS.md`.

## Behaviour

- **Target file.** For `agents`, the first existing candidate in Pi's order, else `AGENTS.md`. Editing the file Pi
  reads (even `CLAUDE.md`) means a save always takes effect, and creating `AGENTS.md` never silently shadows an
  existing `CLAUDE.md`. Lower-priority files in the same folder are reported as `ignored`. Names that differ only
  by case on a case-insensitive volume are one file.
- **Save.** Atomic (temp file + rename, mode preserved), through a symlink so a rules file shared with another
  agent stays linked. The caller echoes the `path` and content `revision` it loaded; a mismatch (the file changed
  or a higher-priority candidate appeared) is `INSTRUCTIONS_CONFLICT`, because the Pi CLI and editors share the
  file. Content over `INSTRUCTIONS_MAX_BYTES` is `INSTRUCTIONS_TOO_LARGE`. A non-empty text gets a trailing
  newline. An **empty** text deletes the file (Pi would inject an empty `<project_instructions>` block); on a
  symlink only the link is removed.
- **Workspace view.** `loadProjectContextFiles` (exported by Pi) gives the exact files and order, tagged
  `global | ancestor | project`. A project `.pi/APPEND_SYSTEM.md` is flagged `active` only when the workspace's Pi
  resources are trusted (`workspacePiResourcesTrusted`). The `SYSTEM.md` Pi would use (trusted project first,
  else global) is reported so the UI can warn.
- **Apply.** `instructions.apply` calls `requestSessionReload` for every live chat (`reloadOpenSessions`): an idle
  chat reloads now, a busy one when it settles. Pi's `session.reload()` re-reads the files and the next request
  patches only the changed prompt sections. A reload also restarts the chat's extensions and MCP servers, so it is
  an explicit button, never automatic on save. New chats need nothing.

- **Reveal.** `instructions.reveal` opens the file in the OS file manager with it selected (`open -R` / `explorer /select,`; the folder on Linux) via `editors.revealInFileManager`, composed in `host`. When the file does not exist it creates and opens the agent directory instead. The host spawns the launcher, so it opens on the machine running the host.

## Invariants

- Never writes outside the agent directory; the request carries a kind, never a path.
- No logging of file content; they may hold private instructions.
- Chats created with `noContextFiles` (title generation, one-shot calls) never see the files.

## Tests

`files.test.ts` (candidate order, symlinks, conflict, size cap, empty-deletes, workspace scopes and trust) and
`injection.test.ts` (PiDeck's chat loader injects the saved files and re-reads them on reload). Wire and UI:
`e2e/instructions-settings.spec.ts`.
