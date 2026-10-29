---
id: web-typography
type: submodule-design
status: active
title: PiDeck typography — one JSON source, generated CSS, semantic styles
parent: module-web
---

# Typography system

**`styles/typography.json` is the sole source of truth for typography.** Every font family, size,
weight, line-height, letter-spacing, transform and semantic text style lives there; the CSS the app
ships is *generated* from it. No component may declare a typography value, no hand-written utility may
add one, and no other file may hold an alias onto one — change the type of anything by editing the JSON.

```
styles/typography.json            the source (see typography.schema.json for the shape)
styles/typography.schema.json     the editor-facing contract: primitives + fully-resolved styles
scripts/typography.ts             load / validate / render — the only place CSS names are derived
scripts/generate-typography.ts    writes the CSS; `--check` fails when it is stale
scripts/validate-typography.ts    the enforced gate: shape + referential + policy validation
styles/generated/typography.css   GENERATED, committed, never edited by hand
```

| Command | What it does |
|---|---|
| `bun run typography:generate` | regenerate `styles/generated/typography.css` |
| `bun run typography:validate` | validate the JSON (shape, references, policies) |
| `bun run typography:check` | fail if the committed CSS is stale or adoption violates the token contract — pre-commit + `apps/web build` |

`bun test` also runs the guard rails: `styles/typography.test.ts` (source + generated output) and
`styles/typographyUsage.test.ts` (adoption across app source, `packages/ui`, and every extension web
half, using the shared source scanner). `e2e/typography.spec.ts` asserts *computed* styles on the
real surfaces (hero, dialog/card titles, entity rows, branch metadata, eyebrow, Monaco, xterm,
both markdown surfaces, the `<body>` base).

> **On the schema.** `typography.schema.json` is the contract an editor reads via `$schema` — it gives
> completion and inline errors while you edit. It is **not** the gate: there is no JSON Schema validator
> in the toolchain, and the shape checks plus every policy below are implemented in
> `scripts/typography.ts` → `validate()`. Change one and check the other.

## Primitives vs semantic styles

**Primitives** are the raw vocabulary — flat id → value maps. They are the only numbers in the system:

| Group | Ids |
|---|---|
| `fontFamilies` | `interface` uses platform system sans with explicit CJK fallbacks; `code` is self-hosted JetBrains Mono; `brand` is a direct alias of `interface` |
| `fontWeights` | `regular` 400 · `medium` 500 · `semibold` 600 |
| `fontSizes` | `s10` `s11` `s12` `s13` `s14` `s15` `s16` `s18` `s20` `s22` `s24` `s32` (px) |
| `lineHeights` | ratios describe the intended rhythm; semantic declarations and `codeRow` are pre-rounded to whole pixels by the generator |
| `letterSpacings` | `normal` · `widest` 0.1em for one-time-code input |

The PiDeck design system owns the direction: interface 14/20px, reading 16/24px, code 13/19px and metadata
12/17px. System sans keeps Latin and CJK text legible on Web, macOS and Windows without redistributing
proprietary fonts. The brand heading uses the same family at 32/40px rather than a separate display face.
The preserved upstream website has its own font contract and does not determine application typography.

The generator rounds `fontSize × lineHeight` once for each semantic style. This prevents production CSS
minification from truncating repeating ratios such as 20/14 into a fractional line box. The primitive ratio
variables remain available, but Monaco, Pierre and virtualizers use the generated whole-pixel
`--tr-code-row-height` for the 13/19px code row. Semantic aliases still share exactly one source definition.

**Semantic styles** are what components use. Each names seven primitive references and nothing else, so
it resolves deterministically — there is no inheritance, no per-usage branching, no fallback:

```json
"title": { "dialog": {
  "fontFamily": "interface", "fontSize": "s16", "fontWeight": "semibold",
  "lineHeight": "compact", "letterSpacing": "normal",
  "textTransform": "none", "fontStyle": "normal"
} }
```

A style may instead be an **alias** — `{ "$ref": "title.dialog" }` — meaning *identical to that style*.
The rules, all enforced by `typography:validate`:

- a **canonical definition** carries the complete set of seven values;
- an **alias** carries `$ref` and nothing else;
- a `$ref` must name a **canonical definition** — never another alias, so **chains are forbidden** and
  resolution is one direct lookup;
- a missing target, or a `$ref` pointing at itself, is rejected;
- **two canonical definitions may not hold identical values** — that is a missing `$ref`;
- aliases still emit their own semantic CSS class, so `.tr-title-card` and `.tr-title-dialog` are
  separate classes backed by one definition.

`textStyles` groups: **brand** (`hero` — the Welcome text identity; the shell logo is supplied vector
artwork) · **heading** (`xl`, `lg`, `md`, `sm` — the shared document heading scale) · **title**
(`dialog`, `card`→dialog, `section`, `compact`, `entity`→ui.default)
· **ui** (`default`, `metadata`, `eyebrow`/`labelPill`/`action`/`emphasis`→title.compact,
`caption`, `button`→title.section) · **body** (`reading`) · **code** (`text`, `document`, `otp`,
`textSmall`). Section labels use their original casing, not forced uppercase. `proseSystems` holds one
entry per markdown surface, mostly aliases into these roles. References remain direct and canonical
values are never duplicated.

One prose rule is deliberately *not* a semantic style: `<strong>` / `<b>` gets **weight only**
(`--tr-font-weight-semibold`), emitted by the generator into each prose system. A complete style there
would override the size and line-height of whatever element the bold text sits inside.

The JSON holds **no** CSS selectors, class strings, component paths, usage lists, rationale or audit
data. Rationale lives in this file.

## The `<body>` base

`rootStyle` is the typography of text that carries no semantic class — and it is **a `$ref`, never
values** (today `{ "$ref": "ui.default" }`, so 14px/400 system interface with a 20px line height). The generator emits it as a
`body { … }` rule inside `@layer base`, which puts it *below* every semantic class in the cascade: it is
a floor, never something a component relies on.

Why it matters that it is a reference: while the base held its own numbers, unclassed text rendered at a
size no semantic style named, so a class name that silently stopped resolving looked plausible instead of
obviously wrong. `styles/global.css` therefore declares **colour and rendering only** — no family, size,
weight or line-height.

Tailwind's preflight defaults (`--font-sans` / `--font-mono` in `index.css` `@theme inline`) point at the
same generated tokens, so even an element the system has not reached — a bare `<pre>` — renders in a face
the system chose. The `font-sans` / `font-mono` utilities that mapping also enables are banned at call
sites.

## How components consume it

The generator derives one class per semantic style, mechanically:

| Source id | Generated class |
|---|---|
| `brand.hero` | `.tr-brand-hero` |
| `heading.xl` · `heading.lg` · `heading.md` · `heading.sm` | `.tr-heading-xl` · `.tr-heading-lg` · `.tr-heading-md` · `.tr-heading-sm` |
| `title.dialog` · `title.card` · `title.section` · `title.compact` · `title.entity` | `.tr-title-dialog` · `.tr-title-card` · `.tr-title-section` · `.tr-title-compact` · `.tr-title-entity` |
| `ui.default` · `ui.metadata` | `.tr-text-ui` · `.tr-text-metadata` |
| `ui.eyebrow` · `ui.labelPill` · `ui.caption` · `ui.action` · `ui.button` · `ui.emphasis` | `.tr-text-eyebrow` · `.tr-text-label-pill` · `.tr-text-caption` · `.tr-text-action` · `.tr-text-button` · `.tr-text-emphasis` |
| `body.reading` | `.tr-text-reading` |
| `code.text` · `code.document` · `code.otp` · `code.textSmall` | `.tr-code-text` · `.tr-code-document` · `.tr-code-otp` · `.tr-code-text-small` |
| `proseSystems.<id>.*` | `.tr-prose-<id>` + one element selector each |

Primitive tokens are also emitted as custom properties — `--tr-font-family-code`,
`--tr-font-size-s13`, `--tr-code-row-height`, … — for the surfaces that cannot use a class.

**Cascade layers.** Three levels, all deliberate: the token block is unlayered (custom properties have
nothing to compete with), the `<body>` base sits in `@layer base`, the semantic classes in
`@layer components`. Tailwind v4 orders its layers `theme, base, components, utilities`, so a semantic
class beats the base while a Tailwind utility at a call site still overrides the single property it names
— that is what keeps `italic` and `leading-tight` / `leading-snug` working next to a semantic class.
Emitting the classes unlayered would outrank every utility and silently win instead.

Rules at a call site:

- **Typography = exactly one semantic class.** Never compose `font-*`, `text-<size>`, `tracking-*` or
  `uppercase`. The exceptions are `italic` and `leading-*`: a call site may add one to override that
  single property (see *Cascade layers*), which is why a few rows and empty states carry them.
- **Colour stays at the call site**, as a semantic colour token (`text-text-muted`,
  `text-text-subtle`, conditional actives) — see [COLOR.md](./COLOR.md). Active/selected state is a
  **colour** change — never a weight change.
- **`<pre>` and `<code>` always name a style**, even inside a container that already has one. Preflight
  targets those elements directly, and a directly-matching rule beats an inherited family, so a bare
  `<pre>` renders in a *different* mono face from its `tr-code-text` parent. Pinned by
  `typographyUsage.test.ts`.
- Spacing, truncation, layout, hover and state classes are unaffected.

```tsx
<span className="tr-text-eyebrow text-text-muted">Projects</span>
<h2 className="tr-title-dialog text-text-default">{title}</h2>
<code className="tr-code-text text-text-subtle">{command}</code>
```

**When the element is not yours.** A third-party component that renders its own inner DOM (cmdk's group
heading) cannot be given a class through an arbitrary variant — `[&_[x]]:tr-text-eyebrow` produces
nothing, because Tailwind silently drops class names it does not know. Pass a node instead
(`heading={<span className="tr-text-eyebrow">Remote</span>}`), or leave the element to the `<body>` base.
`typographyUsage.test.ts` fails on any `tr-` class the generator does not emit, which is how that whole
failure mode is caught now.

## The prose systems

Markdown renders through `proseSystems`: one entry per surface, each owning the **same fixed element
set** (validation rejects a system that is missing one, or that adds an element with no selector), each
naming its own type. Two exist:

| | `chat` (`.tr-prose-chat`) | `doc` (`.tr-prose-doc`) |
|---|---|---|
| mounted by | `chat/Markdown.tsx` | `resource-renderers/support/MarkdownPreview.tsx` |
| body, blockquote, lists | 16 / 400 / 24px | 16 / 400 / 24px |
| h1 | 20 / 600 | **24 / 600** |
| h2 | 16 / 600 | **22 / 600** |
| h3 | 14 / 600 | **20 / 600** |
| h4 | 12 / 500 | **18 / 600** |
| h5 | 12 / 500 | 16 / 600 |
| h6 | 12 / 500 | 12 / 600 |
| inline code | 13 mono | 13 mono |
| fenced code | 13 mono / 19px | 13 mono / 19px |
| table body / header | 16 / 400 · 16 / 600 | 16 / 400 · 16 / 600 |
| table cell inline code | 13 mono (`code.text`) | 13 mono (`code.text`) |
| `strong` / `b` | weight 600 only | weight 600 only |

Chat headings separate a stream of messages; document headings expose nested structure. Both share
comfortable reading text, while document h1–h4 stay larger than the body and the h1→h6 ladder never
inverts. The validator keeps these requirements. Neither surface forces uppercase decoration.
`chat.h1` and `doc.h3` reference `heading.md`; body copy references `body.reading`. Only two of the
28 prose entries define independent styles; every other prose role names a canonical definition.

`strong` / `b` gets **weight 600 only** in both systems — family, size, line-height, tracking, transform
and colour inherit from the enclosing element, so bold in a heading keeps the heading's size and bold in
a cell keeps the table's.

A "prose skin" at a call site carries only spacing, measure and chrome (`chat/Markdown.tsx` = bubble
rhythm, `resource-renderers/support/MarkdownPreview.tsx` = document rhythm, heading rules, table chrome). Never add a
typography class or value to a skin; change `proseSystems` instead. Adding a third surface means adding a
JSON entry — the generator, the naming and the guards all follow.

## Fonts

The interface and brand use the platform's system sans stack, including explicit CJK fallbacks.
JetBrains Mono remains self-hosted for code, with its real variable weights and italic face. The
`selfHosted` entries produce `styles/generated/fonts.css`, and Vite includes those files in offline
artifacts. No font CDN is contacted; `e2e/fonts.spec.ts` verifies both system UI and bundled code fonts.

A font change updates the JSON stack and its `selfHosted` entries together with actual app dependencies.
Validation rejects an undeclared font package and a font dependency no family uses. Tests read family
names from generated CSS. The retained upstream website keeps its own font stack and imports; it must
not pull PiDeck back to the legacy Geist/Orbitron application styling.

`tokens.css` holds **no typography at all** — not a value and not an alias. It used to carry `--font`,
`--font-mono`, `--font-accent`, `--font-mono-size` and `--line-height` as aliases onto the generated
tokens; every one of them is gone, because a second name for a value is the thing that drifts. The
consumers that cannot use a class read the `--tr-*` tokens directly. Cabinet Grotesk is retired
repo-wide and must not return.

## Mono policy

`code` is for **code and technical content only**: editor and terminal text, code blocks, inline code,
diffs and technical file paths, shell commands, slash-command syntax, JSON/code editing surfaces,
keycaps, raw tool output, and the OTP exception. It is **never** used for project or workspace names,
branch or base refs, model names or ids, skill names, labels, tags, ordinary metadata or statuses —
those are proportional. Validation enforces this: a monospace family on a non-code style fails
`typography:validate`, as does a code style on a proportional family, as does a monospace `rootStyle`.

## Weight policy

- **400** — ordinary UI, reading, entity, metadata, status, code and brand-heading text.
- **500** — action and button labels, section/compact titles, restrained labels and chat h4–h6.
- **600** — dialog/card titles, heading roles, chat h1–h3, document headings, table headers and prose strong.

Disabled control colors come from `control-disabled-bg` / `control-disabled-text`; disabled non-control
text uses `text-disabled`. Typography does not encode disabled state, and controls do not use opacity to
simulate it.

## Permitted exceptions

The allowlist is deliberately tiny, and each entry is enforced by name in
`styles/typographyUsage.test.ts`:

| Surface | Why it cannot use a semantic class |
|---|---|
| `resource-renderers/support/monacoSetup.ts` | Monaco takes `fontFamily` / `fontSize` / `lineHeight` as JS options — it reads `--tr-font-family-code`, `--tr-font-size-s13`, `--tr-code-row-height`, so it cannot drift from a code block |
| `resource-renderers/renderers/code/pierreVirtualizer.ts` | Pierre's virtualizer takes its row height as a JS metric — it reads the generated `--tr-code-row-height`, the same value `.pierre-code-surface` gives `--diffs-line-height` |
| `panels/TerminalInstance.tsx` | xterm, same reason — it reads `--tr-font-family-code` + `--tr-font-size-s13` (the primitives behind `code.text`), and owns row height through its own `lineHeight` option rather than a CSS line-height |
| `thinkrail-extensions/visualize/web/mermaid.ts` | mermaid's theme config takes a family string (`--tr-font-family-code`) |
| `index.css`, `styles/tokens.css`, `styles/global.css` | the mapping layers themselves; `.pierre-code-surface` passes the code family, `s13`, and the generated whole-pixel code row height into Pierre's Shadow DOM |

The OTP code is **not** an exception any more: it is the named `code.otp` style (`.tr-code-otp`).

## Adding or changing a style

1. Edit `styles/typography.json` — a new primitive, or a new entry under `textStyles` / `proseSystems`.
   Reuse primitives; add one only when no existing value fits. **If the style you need already exists,
   write `{ "$ref": "<that.style>" }`** rather than repeating its values — validation rejects a second
   canonical definition with identical values, and rejects an alias that points at another alias. Split
   an alias into its own definition only when the two actually diverge.
2. `bun run typography:validate`, then `bun run typography:generate`, and **commit the generated CSS**.
3. Use the generated class at the call site (colour stays separate).
4. `bun test` (source + adoption guards) and `bun run e2e -- e2e/typography.spec.ts` for computed styles.

Do **not**: add a typography utility or `--text-*` mapping to `index.css`, add a font alias to
`tokens.css`, declare a font property in a component, or edit `styles/generated/typography.css`. The
pre-commit hook and `apps/web build` run `typography:check`, so stale generated CSS cannot land.

This primitives + semantic-tokens + schema + generator shape is the pattern a **colours** JSON should
mirror; nothing here is Tailwind-specific, and Tailwind merely consumes the generated CSS.
