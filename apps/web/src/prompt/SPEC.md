---
id: submodule-web-prompt
type: submodule-design
status: active
title: prompt — shared command-aware input behavior
parent: module-web
depends-on: [module-contracts]
tags: [ui, prompts]
---

## Responsibility

The reusable, lifecycle-neutral behavior behind command-aware prompt fields: completion triggers (`/` and `@`),
keyboard/menu interaction, command-catalog normalization, recognised-token derivation, the mirrored text field,
race-safe prompt-template selection, and Pi-compatible template-slot editing. Chat and pre-session workspace
creation supply their own catalogs, mention sources, template readers, geometry, and submit actions; this module
makes those inputs behave the same once supplied equivalent data.

## Boundary

- **Owns:** `triggers` (the completion token under the caret); `tokens` (recognised tokens, mirror segments, and
  skill hoisting); `PromptField` (the textarea plus its mirror layer); `CompletionMenu` and `useCompletion` (the
  props-driven popup and its keyboard state); the slash catalog merge and matching; frontmatter stripping and
  template assembly; placeholder parsing, editing, mirroring, and finalization; the template-pick controller that
  refuses to overwrite a draft changed after selection.
- **Public surface:** `index.ts` is the only import path and re-exports all of the above plus the caret/selection
  restoration (`usePendingSelection`) API.
- **Allowed deps:** `contracts` types, React, `@thinkrail/locales` (UI strings), `@thinkrail/ui/utils` (`cn`), and
  `@thinkrail/ui/button` (`TemplateSlotHint` is a shared `Button`).
- **Forbidden:** store or transport access; workspace/session/project lookup; deciding which commands exist in a
  lifecycle; sending a prompt; importing `chat` or `panels`. Icons, file lookups and descriptions reach the menu as
  props (`CompletionItem`), built by the caller.

## Behavior

**Triggers.** A sigil counts only at the start of a whitespace-delimited token, wherever that token is: `src/a`,
`https://x`, `a@b.com` and `1/2` never open a menu, and a space after `/` makes it plain text again. A `/` token
that opens the draft is *leading*: Pi dispatches a command, and loads a skill, only when the whole text starts with
`/` (`session.prompt` checks `startsWith("/")` and `startsWith("/skill:")`). So a leading token offers every source
(built-in, skill, extension, template) and a mid-text one offers skills alone. Picking replaces the whole token,
including any part after the caret, and adds one space.

**Tokens are derived, never stored.** The draft string stays the only data model; `scanPromptTokens` recognises a
leading command of any source, a mid-text skill, and an `@path` (confirmed by the caller's resolver when it has
one). A name outside the catalog (`/usr/bin`) stays plain text, so a coloured token also means "this resolves".
Edits are character-wise: a token is decoration, not an object, so backspacing into one simply stops it matching and
reopens the menu on what remains. The same scan, with `anySkill` and a path-shaped resolver, colours a prompt
already sent.

**Sending.** `hoistSkillReference` moves the first mid-text skill to the front so Pi still expands it
(`explain this /skill:x briefly` → `/skill:x explain this briefly`), keeps the request in order, leaves further skills
as text, and leaves a draft that already opens with a `/` token untouched. Both prompt fields apply it to the trimmed
text before submitting, so the echoed user message and the host see the same string.

**Mirror field.** `PromptField` is a plain `<textarea>` (input method, undo, spellcheck, selection stay native)
whose glyphs are drawn by a mirror layer behind it: the textarea text is transparent and only the caret and a
translucent selection show. The mirror colours tokens (`feedback-info`) and tints template slots, and shares box
metrics and wrapping with the textarea; scroll offset and classic-scrollbar width are copied imperatively. While an
input method composes, the textarea draws its own text and the mirror hides, because the engine's composition
highlight can be opaque. In forced-colors mode the mirror is hidden and the textarea shows. A token under the
pointer is found from the mirror spans' rects (`onTokenHover`), and Cmd/Ctrl+click reports it (`onTokenActivate`),
so ordinary clicks still place the caret.

**Menu.** Up/Down wrap the visible matches; Enter/Tab selects; Escape dismisses; IME-owned key events take precedence
in the consuming input. `useCompletion` re-arms a dismissed menu whenever its `signal` (query, candidates) changes.
The popup groups rows, shows the active row's full text in a footer, and wires `aria-activedescendant`. Catalog merge
is deterministic and lets the caller's more-specific later source replace a same-named earlier source. Slash matches
rank a name prefix, then the part after `:`, then a substring, grouped by source.

**Templates.** Template selection is latest-pick-wins and applies only while the draft is byte-identical to its value
at pick time and the caller's project/workspace context is unchanged. The picker exposes pending state so submit
controls stay disabled while it resolves; the draft remains editable, and an edit or context switch invalidates the
delayed application. A selected template replaces the complete draft. Tab and Shift+Tab cycle placeholders, Escape ends
the slot session, edited repeated groups mirror when leaving a slot, and submission removes untouched markers.
`usePendingSelection` applies a requested caret/selection in a layout effect, in the same commit as the value
change and never a deferred frame: a frame landing between a follow-up select-all and its insert (a paste,
Playwright's `fill`) would collapse the selection, so the insert appends and doubles the draft.

## Decisions

- **Keep the textarea, own the component.** A rich editor (Lexical, TipTap, CodeMirror) was weighed and deferred:
  the input method is the textarea's strength and the primary audience is CJK; the protocol, history, and slot
  sessions are all string-and-offset; ~130 e2e assertions read the field's value; and no editor dependency exists.
  `PromptField` keeps the engine behind a small contract (value, selection, change, token decoration, handle), so a
  swap touches one component. Revisit when the field needs chips with icons or padding inside the text flow, inline
  thumbnails, token drag, or structured blocks; CodeMirror 6 fits best, as it keeps text as the source of truth
  with atomic ranges and widgets.
- **Selection is a translucent info tint, not the theme selection.** The high-contrast themes use an opaque
  selection with an inverse foreground; over a transparent-text textarea that would hide the mirror's glyphs.
