---
id: submodule-web-themes
type: submodule-design
status: active
title: themes — bundled manifest catalog and application
parent: module-web
depends-on: [module-contracts]
tags: [ui, themes]
---

## Responsibility

The browser-side theme engine: validates the bundled declarative theme manifests at bootstrap and the
user's theme files when the host reports them, owns the resulting catalog, and resolves/applies the
active palette atomically. The host owns only the opaque
fixed id plus fixed/system mode and optional light/dark pair; this module owns what those values mean on
this client, including operating-system color-scheme observation and same-appearance fallback. **Adding a
theme = adding one `*.theme.json` file** — to `bundled/` (a PR + rebuild) or, for a user, to
`~/.pideck/themes` (live, [[submodule-server-themes]]) — no code, contract, CSS, or test changes.

Six manifests ship under their existing ids: **Dark**, **Light**, **Minimal Dark**, **Minimal Light**,
**High Contrast Dark** and **High Contrast Light**. Their palette follows [[pideck-design-system]]:
neutral surfaces, inverted primary controls and neutral user-message bubbles. Standard Light and Dark
follow the actual Claude Code runtime captures: white canvas/header/content with a `#fafafa` sidebar in
Light; in Dark (re-sampled 2026-10-31 from raw screenshot pixels) `#181818` canvas/header/content, `#242424`
sidebar, `#303030` input and popover/menu surfaces, a `#1f1f1f` modal dialog and `#444444` hover/selected fill,
with neutral grey text (`#ececec` / `#b8b8b8` / `#929292`). Dark's divider tiers (`border` `#404040`, `borderStrong`
`#525252`) are deliberately a little brighter than the measured Claude hairlines, which sit near 1.2:1 against the
canvas and read as invisible here; the pair keeps roughly the contrast the previous Dark had (≈1.7 / 2.4 on canvas). These
observed remote-page surfaces take precedence over the different near-black surfaces found in the
packaged CDS stylesheet. Packaged tokens are evidence of shipped resources, not proof of a remote
page's rendered colors. Minimal retains its flatter CDS-inspired surfaces as a distinct option; High
Contrast strengthens text, borders and selections under the existing stricter accessibility contract.
Theme ids, schema, order, default selection and user-theme loading are unchanged.

Minimal is a palette a user picks in Appearance and nothing more: every theme renders the same roles,
so a component never branches on the active theme or its contrast metadata to drop a fill or a border.
What a palette cannot express through the manifest keys is a product decision for all themes, not a theme.
The branded green is removed only from accent, primary-control and bubble roles. Success, error, Git diff,
syntax and ANSI colors retain their separate meanings. The normal light family shares a deeper syntax
comment gray for legibility on Minimal's warm surfaces; other syntax colors and all ANSI entries remain.
Standard Dark's destructive fill stays slightly lighter so its inherited 12% darker hover and the legacy
background-derived label still meet AA. Its syntax comment grey is lifted a step (`#949ca5`) to clear 4.5 on the
`#303030` raised surface. Terminals keep the existing
xterm minimum-contrast floor (4.5, or 7 in High Contrast), including for extended ANSI output.

The measured CDS muted color is not copied blindly: Light's hint is slightly darker so it remains
legible on the hover surface. Standard Dark's hint is slightly lighter for the same reason. Hover fills
meet PiDeck's existing 1.15 distinction gate, including against the lighter input surface, while the exact
component geometry and state ownership remain outside the palette. These adjustments are PiDeck
implementation decisions rather than claims about Claude's accessibility policy. Bundled-primary and
bubble regression checks allow a small warm-neutral channel spread (16 out of 255) but exclude a
return to chromatic branding; user palettes are not subject to that styling constraint. Syntax colors
must retain at least 4.5 contrast on workspace, content and elevated surfaces.

## Boundary

- **Owns:** the versioned `ThemeManifest` contract + JSON schema; the bundled manifest set; catalog
  construction (bundled + user) and fixed/system resolution; user-theme validation, its per-file issue
  list and its client-side cache; deterministic pair derivation and same-appearance fallback;
  operating-system color-scheme reads/subscription; atomic CSS-custom-property application; the versioned
  first-paint preference hint; the semantic syntax-variable contract; Shiki's generic CSS-variable TextMate
  scope map; and the hex resolver + Monaco colour-key map that adapt that same definition for the strict
  desktop editor API.
- **Public surface:** `index.ts` only — `initializeThemes` (the synchronous bootstrap: bundled
  catalog plus cached user themes), `installUserThemes` / `clearUserThemes` / `getUserThemeIssues` /
  `onThemesChange` (the live user-theme catalog and its `UserThemeIssue` list),
  `applyTheme` / `resolveTheme`, preference-aware `applyThemePreference` /
  `resolveThemePreference`, `deriveSystemThemePair`, `readSystemAppearance`,
  `onSystemAppearanceChange`, `getThemes`, `readThemeHint` /
  `writeThemeHint`, and the manifest/descriptor/preference-result types plus the Shiki registration and its
  `resolveThinkrailShikiTheme` strict-consumer adapter.
- **Allowed external deps:** `@thinkrail/contracts` for the opaque ids, theme preference shapes and
  configured default; browser DOM/media/storage APIs and Vite's build-time glob; Shiki types only, to type
  the generic registration.
- **Forbidden:** server/shared/pi; store, transport, panels, shell, or component state; reading files or
  discovering themes itself (user files arrive only through `installUserThemes`); executable theme code;
  selectors/layout or arbitrary CSS supplied by a manifest.

## Manifest contract

A theme is exactly one `*.theme.json` file. Schema version 2 is strict and self-contained: id,
label/order, light-or-dark appearance, normal-or-high contrast metadata, a complete semantic UI palette
(only the derived keys below may be omitted), all 16 terminal ANSI colors, and a complete semantic syntax
palette. Color values are canonical
six/eight-digit hex; the two selected-text foreground overrides may explicitly be `null` to retain the
consumer's native foreground. There is no inheritance or partial overlay. The engine owns appearance-level
effects, TextMate/Monaco scope mapping, and CSS-token mapping, so those mechanics never leak into
manifests. Typography, spacing, radii, fonts, and motion remain product tokens, not theme values.

**The manifest is a user-kept file format, so its schema evolves compatibly.** The parser accepts every
schema version released for user files (v2 is the first) and migrates older ones in code to the current
shape before validation, so a theme a user saved never breaks on upgrade. Consequently a key added in a
later version must be derivable from keys every earlier version already has — the way v2's `header`
equals the v1 `content` — or it cannot be added; a value a palette genuinely needs to vary starts as a
derived default. Compatibility is backward only: a file declaring a newer `schemaVersion` than the
running app knows, or carrying a key it does not know, is reported as `invalid-theme` rather than
guessed at.

**A manifest supplies the palette, not the roles.** It answers *which colour*; what each colour is
*for* is the semantic layer declared in `styles/colors.json` — `container-elevated-bg`,
`feedback-warning`, `text-subtle` — which is the only layer components name, and which owns the alpha
scale. The split is what lets a theme be a palette swap with no component change, and it is why this
module's variables (`--elevated`, `--border-strong`, `--muted`) are internal: reaching one from a component
bypasses the role it belongs to. See [`styles/COLOR.md`](../styles/COLOR.md).

**`dialog` is the modal surface, and is optional.** Popovers, menus and toasts sit on `elevated`, while
`DialogContent` / `DialogPanel` take `container-dialog-bg` from `dialog`; Dark needs the two apart (`#303030` vs
`#1f1f1f`). Like `dangerHover`, it joined v2 after user files shipped, so a file that omits it gets `elevated` — its
old modal colour — and bundled manifests set it explicitly.

**One key per role that themes may vary independently.** Schema version 2 splits `header` out of
`content`, which previously wrote both `--bg-dark` and `--surface-content` and so pinned the app header
to the code canvas in every theme. The original split shipped `header` equal to `content` and changed no pixels. PiDeck now uses the
workspace tone for the standard header while retaining a separate recessed content surface. The same move is what any future divergence needs: a role
can only vary between themes if the manifest has a key for it.

The primary control has an explicit opaque-fill contract: `accentSolid` is its resting fill,
`accentHover` its hover fill, and `onAccent` the label on both. The separate `accent` remains the
foreground/ring/border and tint source. This lets a palette vary opaque controls without silently
changing every accent tint. Bundled PiDeck themes use neutral inverted fills; user themes may still
vary the foreground accent independently from their solid controls. The destructive control has the same contract
on the danger hue: `danger` is its resting fill (and the feedback colour), `dangerHover` its hover fill, and
`onDanger` the label on both — `schema.test.ts` holds `onDanger` to AA on both fills and keeps the hover
step distinguishable (≥ 1.15) from the resting fill. `dangerHover` and `onDanger` joined v2 after user
files shipped, so by the compatibility rule above both are optional and derived from keys every v2 file
has: `dangerHover` defaults to `danger` darkened 12% toward black (the step every bundled theme uses)
and `onDanger` to the palette's own `text` or `background`, whichever reads better on both fills.
Bundled manifests still set both explicitly.

**The manifest→variable name is derived, not mapped.** A key writes to its kebab-cased name —
`borderStrong` → `--border-strong`, `editorSelection` → `--editor-selection`. `runtime.ts` applies that
rule when it writes the palette to the document root, and `scripts/colors.ts` applies the same rule when
it resolves a role's `from`; neither consults a table, because the table *was* the drift path (and its
names — `--blue` for `info`, `--border2` for `borderStrong` — had stopped describing what they held).
There is no `palette` section in `colors.json` and no generated TypeScript: `generate-colors.ts` emits
exactly one artifact, `styles/generated/colors.css` (the roles, the per-appearance `effects`, and the
Tailwind `@theme inline` map). What keeps the two lists honest is coverage, not a mapping — the
generator refuses to run unless **every** `THEME_COLOR_KEYS` entry is claimed by at least one role, so a
key added to the manifest schema and forgotten in `colors.json` cannot reach a build, and a role naming
a key that does not exist fails the same gate.

**A manifest must also be legible, not merely complete.** `schema.test.ts` enforces WCAG AA on every
resting surface (`background`, `content`, `sidebar`, `header`, `elevated`, `dialog`, `input`) and a lower 3.0
floor on the transient `hover` surface — the latter being our line rather than the standard's, so that
a theme borrowed from elsewhere keeps its signature colours. `accent` and `success` are exempt from
`input` alone: neither is ever rendered as text on a control. Separately, `onAccent` must clear AA on
**both** primary fills (`accentSolid` and `accentHover`), so a theme cannot darken its hover step far enough
to swallow the primary button's own label. Legibility alone proved insufficient: High Contrast Light
once shipped its `hover` fill — the palette source of the selected/hovered control roles — at 1.05:1
against its own sidebar, an invisible selection with every check green, so the suite also pins
hover-vs-surface **distinguishability** (≥ 1.15 against every resting surface — `content` included,
because PlanPane and the workbench backdrop host hovered controls there, which Light's original
`hover == content` palette made invisible). A new manifest that reads poorly fails to merge; see
[`styles/COLOR.md`](../styles/COLOR.md) for the reasoning.

**A `contrast: "high"` manifest is held to AAA (7.0) resting and full AA (4.5) even on hover**, `hint`
excepted. High contrast is the entire reason those two themes exist, so the ordinary AA floor is the
wrong gate for them: it lets one decay into a merely-adequate theme while every check stays green. That
is not hypothetical — when the palette went green, High Contrast Light's `accent` fell from 8.98 to 5.17
and its `success` from 7.39 to 5.08, and nothing failed. The stricter floor is what makes "high contrast"
a property the suite enforces rather than a label in the manifest.

Bundled files are discovered by a build-time glob rather than named in a code catalog, and validated
all-or-nothing at bootstrap. The files are our own, so any invalid or duplicate manifest, missing
configured default, or catalog without at least one light and one dark manifest **fails loudly** (unit
tests catch it before merge). Runtime and JSON-schema validation agree.

**User theme files are held to the same schema but fail soft.** Each file is validated on its own; an
unusable one becomes a `UserThemeIssue` (the host's read codes, `invalid-theme`, `id-too-long`, or `duplicate-id`
between two user files) and the rest still load. The legibility and AAA gates above are merge gates for
our files and are deliberately not applied to user files — their contrast is the user's choice. The
user's file name carries no meaning; the id inside it does.

**User ids live in their own namespace.** The catalog id of a user theme is `user.<manifest id>` (so the
manifest id is at most 59 characters), and a bundled manifest may never use the `user.` prefix. Ids
persist in `AppConfig.theme` and the system pair, so the namespace is what keeps both sides free to
grow: a file copied from `dark.theme.json` without renaming its id is simply `user.dark`, never
shadowed by or shadowing the bundled Dark, and a theme we bundle later under any name can never
silently capture a user's saved choice. Rejected: reserving bundled ids per name (a new bundled theme
would turn an existing user theme into an error and re-point its saved config to ours) and requiring
authors to write the prefix themselves (the common copy-and-edit path would fail).

## Runtime contract

`initializeThemes` runs pre-React in `main.tsx`; after it, only `installUserThemes` changes the catalog
(the bundled set is fixed until a rebuild). The shell installs each host snapshot before re-applying the
preference; re-applying republishes `data-theme` even for an unchanged id, so an edited active theme
rebuilds Monaco/xterm like a swap. Writing the first-paint hint also caches the user manifests that
preference names (the fixed id and both pair slots — at most three, never the whole folder), and
`initializeThemes` installs them, so a user theme paints on first frame instead of flashing the default
before the host answers; the next snapshot replaces them, and a welcomed host below the user-theme
protocol clears them (`clearUserThemes`). A cache value over 64 K characters is dropped rather than
written, trading a first-paint flash for staying well inside the desktop per-value cap. The bound matters on desktop, where this cache
shares the native preference store's per-value and whole-document caps with every other preference. Deleting the active theme's file resolves
like any unavailable id below. Fixed mode resolves `AppConfig.theme`. System mode reads
`matchMedia("(prefers-color-scheme: dark)")` and resolves that appearance's configured slot; a missing,
failing, or non-matching media API means light. The query is the one cross-platform path for ordinary
browsers and native system webviews on Windows, Linux, and macOS—there is no native appearance branch and
`prefers-contrast` is deliberately ignored.

A configured system slot is usable only when its manifest exists and declares the required appearance.
Otherwise resolution keeps the opaque host value intact and chooses the lowest-order normal manifest of
that appearance, then the lowest-order manifest of that appearance, with label/id tie-breaking. On first
enable, the resolved fixed theme fills its own slot; the opposite slot chooses the lowest-order theme with
matching contrast, then the same normal/any fallback. A persisted pair is reused on later enables.
Every fallback and derived opposite slot is chosen from the **bundled** manifests only — the ones that
passed the contrast gates — so a user theme that happens to sort first (a copy of Dark at order 10
labelled "Arctic") never becomes the theme a user did not pick.

Application is atomic from consumers' perspective: write the complete variable set, `color-scheme`, and
semantic contrast metadata, then publish the effective manifest id through `data-theme` last, so generic
consumers (Monaco/xterm/mermaid) can rebuild after that signal without observing half a palette.
The catalog-independent `onThemeSwap` subscription lives in `@thinkrail/ui/theme`; app and extension
consumers use it rather than hand-rolling MutationObservers. Theme selection and application stay here.
Selected-text foregrounds are removed when their manifest values are `null`. In system mode one media-query
listener reapplies locally on `change`; it never writes config or affects another client, and its owner must
clean it up when preference or component lifetime changes.

The first-paint hint is a versioned snapshot of fixed id, mode, and optional pair—not the last effective
id. A legacy string parses as fixed mode; malformed data becomes the fixed Dark default. Startup resolves
the snapshot synchronously against the current media query, so a schedule change while the app was closed
is reflected on first paint. The host-synced config always reconciles it after the first welcome; until
then the shell retains and observes the hint instead of overwriting it with store defaults. Storage uses
the native shell's already-injected stable preference adapter when present and localStorage otherwise,
which survives Electrobun's changing loopback origins without giving the launcher theme semantics.

Shiki uses one web-only TextMate registration whose colors are semantic CSS variables (an explicitly
supported Shiki mode). Chat consumes that registration directly and needs no re-highlight. Monaco passes the
same registration through `resolveThinkrailShikiTheme`, which canonicalizes every available CSS variable to
hex, omits an unavailable value so Monaco's inherited base remains usable, and attaches the token-owned editor
UI map; the panel supplies `cssColorToHex` so themes retain no dependency back into `lib`. Monaco picks its
base from appearance/contrast metadata, never a known theme id, and replaces the resolved registration under
one fixed name after an atomic theme swap. Thus adding a theme never adds a Shiki import, CSS selector, or
editor-specific catalog entry. Unit coverage pins exact and wrong-appearance resolution, both fallback tiers,
pair derivation, absent-signal light behavior, legacy/versioned hints, media-listener cleanup, and complete
hex resolution of the shared syntax map.

## Deferred

Open, not excluded: partial overlays or inheritance from a bundled theme, import of external formats
(shadcn/tweakcn CSS, VS Code themes), extension-packaged themes (the seam is a source tag on the same
`themes.list` files, filtered by the existing extension switch), an in-app editor, and contrast warnings
for user themes. Until then a user theme is one complete manifest.

## Non-goals (deliberate)

A user theme never replaces or shadows a bundled one — the `user.` namespace above is the decision.
Operating-system contrast following and schedule/time-zone UI are out of scope.
