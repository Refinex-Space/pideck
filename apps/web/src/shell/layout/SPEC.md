---
id: submodule-web-shell-layout
type: submodule-design
status: active
title: shell/layout — frontend-local workbench frame
parent: submodule-web-shell
depends-on: [module-contracts]
tags: [ui, layout, tabs, drag-and-drop]
---

## Responsibility

Optional navigation-header/footer slots and a `workspaceLocation` slot let the shell integrate chrome into
columns. The expanded left rail is horizontal inside its column; when collapsed it moves beside browser history controls at the start of the center tab row.

**One top bar.** The workbench draws no separate header row: the center tab strip *is* the 40px top bar
(`window-drag`, `h-topbar-row`, `window-no-drag` on tabs and action clusters). The top-left center group's
strip starts with the window inset spacer (and, when the left column is collapsed, the left rail plus history
buttons). The top-right group's strip ends with, in order: new chat / history, the shell's location pill and
details control, the **bottom rail** (the single global terminal entry; the former bottom bar is gone), the
**right rail** tools, the bottom-alignment menu while the bottom body is hidden, and the right inset spacer
(omitted while the right column is visible, which owns that corner). Both rails are horizontal 32px-frame
toolbars, so no vertical right column exists; their tooltips open downward. The center strip shows **one chat tab**: the selected chat, else the last one selected in that group.
Other chat tabs stay in the layout (and in the tab search) but are reached from the sidebar's session rows; the
visible chat chip is the title control — clicking it while selected renames in place, its chevron
(`chat-title-menu`) opens Rename / Close chat. Adjacent center chips sit on a 2px gap. Center tabs are 32px rounded (`sm`)
chips with a selected fill and hover fill — no divider, no underline, no chat icon — and the strip has no
bottom border. Side and bottom tab strips keep the bordered strip. There is no center "New terminal" button:
terminals are created from the bottom pane that the top-bar terminal entry reveals.
Toolbar keyboard orientation and reorder keys follow the actual orientation. No feature-store
dependency is introduced, and saved ratios, tool placement and bottom alignment remain authoritative.

The visible right column has no empty chrome row above its tools. Its first visible pane header (or
terminal strip) occupies the same 40px row as the center toolbar, with the native right caption inset
beside the header actions. Subsequent pane headers retain their compact height. Right-column containers
use the workspace canvas; left navigation keeps the sidebar canvas. Pane headers inherit their container
background. The right column supplies `--quiet-scroll-surface-bg` to keep non-terminal scroll curtains on
the same canvas without teaching feature panels about placement; terminal curtains retain their own role.

The shell-owned, headless workbench engine: the normalized frontend-local frame and per-workspace view grammar; legal atomic mutations and projection; recursive center plus left/right/bottom rendering; resize/alignment and drag geometry; keyboard arrangement commands; and focus recovery. It renders containers; feature views remain arrangement-agnostic.

## Boundary

- **Owns:** web-local `WorkbenchFrame`/`WorkspaceViewState` types; frame-plus-view projection; pure topology, placement, attention, and policy operations; semantic minimum and independent group-limit checks; one-result drag previews; center/side/bottom renderers; alignment-owned nested composition and side-width projection; tab-strip overflow; ARIA tab/separator behavior; and the terminal visibility gate.
- **Public surface (`index.ts`):** all current-layout types; workbench renderer/controller; the edge-chrome primitives (`AuxiliaryRail`, `AuxiliaryRailToolButton`, `AuxiliaryPaneHeader`, `AuxiliaryPaneHideButton`); pure mutations, projection, and validation helpers; built-in preset definitions plus instantiate/apply/capture operations and `frameMatchesPreset` (geometry equality ignoring generated ids, which Settings uses to mark the applied preset); attention fallback helpers; `readLayoutFocusIntent` for capturing a focus request's source intent before arrangement commits; and unavailable-reason results. Callers inject resource renderers and commit complete pure results rather than splicing arrays.
- **External deps:** `@thinkrail/contracts` for the resource-free custom-preset DTO and git diff-scope type only; shell-neutral `lib` attention/id primitives; React; `@thinkrail/ui/*` (including `@thinkrail/ui/resizable`); `@dnd-kit/core`.
- **Forbidden:** server/shared/pi imports; domain-resource lifetime; browser persistence or WS calls; feature-panel internals; a mutable third-party docking model; inline component styles; or non-semantic colour values.

## State contract

One `WorkbenchFrame` belongs to a frontend surface, not a workspace. It carries stable group/split ids, center topology, left/right/bottom groups and geometry, auxiliary visibility/folds, bottom alignment, singleton-tool placement/order, and restore targets. It carries no workspace resource identity, preview, selected tab, navigation clock, pointer draft, or viewport compression.

A `WorkspaceViewState` is keyed by workspace and references frame group ids. It carries
file/diff/changes/chat/document/terminal membership and order plus center preview identity (a `changes`
tab is the per-scope review surface defined in the store spec; its layout record is kind + id + name +
scope, nothing cached, and it is preview-eligible like file and diff tabs). The separate
`LayoutAttention` overlay carries selection per group, last focus for center/each auxiliary region, and
per-group navigation clocks. Attention is keyed per workspace, but a selected singleton tool is shared
across the window's views (a resource selection is not); the pure adoption rule lives here and its
fan-out in `layoutState`. The mounted workbench document is a pure projection of the singular frame,
active workspace view, and its attention; it is never stored as another authority.

Pure operations return either one complete local-state result or an unavailable reason. A resource-only
command patches the active workspace view. A frame command returns the frame plus every required
retained-workspace remap; the store installs that result atomically through
[[submodule-web-shell-layout-state]]. Components never splice groups or tabs. Stable ids are placement keys;
a tab's `name` remains non-identity metadata. Singleton tool names resolve from the current web-owned catalog
at presentation time, so copy updates never rewrite local layout state. Unavailable reasons are localized copy
resolved when the operation runs, never persisted. Helpers evaluated during render (`layoutTabName`,
`describeLayoutGroup`, `removeLayoutGroup`, `separatePanesReason`, `layoutPresetName`) take the caller's
translator as their first argument, so a language change recomputes them. `layoutTabName` words every
default name at render from the tab's kind (tool, untitled chat, default terminal, Changes / diff scope,
plan document) through `lib`'s default-name helpers, and shows a name set by the user or agent verbatim.
Its optional third argument, the Workbench's **`chatFirstPrompts`** prop (`ChatFirstPrompts`, first prompt by
session id, injected by the shell beside `onRenameChat`), labels an unnamed chat tab — and a plan
document whose stored chat name is empty, by `sourceId` — by the chat's first prompt through `lib`'s
`chatDisplayName` wherever the strip, its overflow search, the drag overlay and the move-target summaries
(`describeLayoutGroup`, `tabSearchKeywords`) show the name; the chat tab renders the same `chatLabel` for
`data-title-source` and the full-prompt tooltip, while the rename field still edits the real `name`. The label is presentation only: the document's `name` stays `""`, so every mutation the
Workbench commits from the document it was given leaves the chat unnamed.

A file, spec, or diff browse click opens its preview at once, with no settle wait. A double click then
promotes that same placement in place. A keep that arrives while the read is still in flight coalesces
into one final keep that carries the leading preview-slot claim. Only two open paths wait the shared
250 ms settle window: a single click (or keyboard activation) on the active preview tab, so a double click
is not read as two keeps, and the Changes review-tab preview, which waits even when code rather than a
click opens it. Outside the open paths, the legacy-selection Review reveal waits out what is left of a
browse row's window. `isToolShowing` and `showingAuxiliaryKey` read which auxiliary tools are selected in
an expanded pane, so the shell can tell whether Review shows and whether the user changed tools since.
Pointer/resize drafts and viewport compression remain runtime-only.

Frame groups may remain empty in any workspace. Closing a final resource therefore leaves topology untouched. Explicit remove/merge is the only way to delete a group, and its result rehomes every resource that references it across all locally retained workspace views. At least one center leaf always remains.

## Auxiliary presentation and recall

Edge entries are a derived projection of the current document and attention, never a second persisted
layout. **The rail mirrors the region's panes**: entries come in ordered clusters, one per group in
document order, separated by a hairline, so the rail answers "which icons share a pane" without a tab
strip — the group model stays the authority and merely becomes observable. A singleton entry sits in the
cluster of the group that holds it; each terminal-bearing group has one entry with its own named session
tabs; an empty group is a one-entry cluster. Tools placed nowhere (after *Remove tool from group*) form a
trailing, dimmed cluster behind a last separator; activating one restores it to its recorded target.
Exactly one entry per expanded pane is pressed and none in a folded or hidden one, so the pressed set
reads as "panes currently open". Clicking an unpressed entry selects it in *its* pane (revealing or
unfolding the pane); clicking the pressed one folds that pane.

**Tools and terminals never share a pane.** A group holding tools is a tool pane; terminals live only in
tool-free groups (`canJoinAuxiliaryGroup`). Joining a tool into a pane that shows terminals, or a terminal
into a tool pane, is unavailable ("Tools and terminals use separate panes."); creating a new pane is
always fine, and removing a pane merges its tabs into the nearest sibling (previous, then next) that
can take them all, else it stays unavailable. Normalization applies the same rule to retained workspace views: a terminal whose group became
a tool pane rehomes to the same region's nearest tool-free pane, then a tool-free bottom pane, then center.
Passive terminal placement and preset remaps choose destinations with that predicate. The rule exists
because a mixed pane had no coherent rendering: a terminal-selected pane is a session tab strip in which
the sibling tools appear nowhere. With it, the former mixed-order anchors (`beforeToolByTabId`) and the
terminal strip's document-index plumbing are gone; a persisted view still carrying the field is accepted
and the field dropped.

A terminal entry restores the pane's selected session, else its first terminal; because a terminal pane
holds nothing but terminals, `selectedByGroup` is the whole recall and the former
`lastTerminalByGroup` field is gone (a saved copy is ignored). Resource selection never participates in
singleton-tool fan-out. Activating the already displayed entry folds only its group; restoring an entry
reveals/unfolds/selects in one transition. An empty bottom entry reveals a process-free creation surface, not a terminal reservation.

`AuxiliaryRail` is a props-driven toolbar, owning only roving DOM focus. The workbench adapts
placed tools through the existing `WorkbenchTab` menu/drag controller; terminal-group entries navigate
rather than dragging or closing a representative session. The selected tool gets a plain pane header
whose title is a drag handle for that tool — the same drag data as its rail entry, so a user who looks at
the pane rather than the edge still finds something to grab; selected terminals retain named session
tabs. Project Home composes the header without drag data. The rail, its tool-entry geometry and selection classes,
the plain pane header, and its Hide control are the one owner of edge-chrome styling: `WorkbenchTab`
(rail mode) and the droppable `AuxiliaryRailButton` reuse the rail-entry frame/button class helpers,
`AuxiliaryGroupHeader` reuses the header component, and the shell's Project Home branch
([[submodule-web-shell]]) composes the exported `AuxiliaryRail` / `AuxiliaryRailToolButton` /
`AuxiliaryPaneHeader` around its own geometry so a tool looks identical with or without a frame. Every
rail entry is a `data-active` 32px frame around a control that wears the shared
`ghost` M icon-button skin (`buttonVariants`, [[module-ui]] "Button system": 24px square, 16px icon,
shared hover — pressed looks the same — and the ghost icon-only focus ring drawn inside the square, so no
rail margin or strip edge clips it). The control keeps its own element for the roving toolbar, drag and drop and
adornments; the open entry sets `data-selected` (the shared `control-bg-selected` fill), while drop cues sit on the
control — the passive drop hint adds an inset `primary-soft` ring, so it still shows on a selected entry whose
fill wins the background. Adornments (review badge, terminal ordinal) are offset to the 32px frame's
corners and the join droppable is the frame itself, so neither shrinks with the 24px control. Tab
and tool icons resolve in one place (`tabIcon`), Line at rest and Fill when active; rail tooltips open away
from their edge. Rail geometry is excluded from available pane space, but
saved dimensions remain workbench-wide ratios; viewport projection never rewrites them. Measurement
observers follow the actual DOM node through ref attachment/cleanup, including keyed panel-group
replacement; a mounted workbench does not imply its measured descendants survived. Rail selection is
the selected fill plus a Fill icon (and `aria-pressed`) — no accent edge: the rail is a column of icon
buttons, not a tab strip, so it carries no underline analogue. It is identical in every theme — a palette
decides how loud it reads, never a per-theme selector in the component.

## Layout grammar

- **Center:** a recursive horizontal/vertical binary tree, maximum four leaves. A split replaces one leaf with equal halves. User creation/resize requires each child to remain at least 320 px wide and 180 px high. Empty leaves are valid frame slots and render the shell-provided empty surface. Remove/Merge promotes a sibling and rehomes every affected workspace's tabs deterministically.
- **Auxiliary eligibility:** Projects, Specs, Files, and Review are singleton auxiliary-only tools owned by the frame; terminals are workspace resources and may occupy center or any auxiliary region. Hiding a singleton preserves its restore target. View/deep-link reveal restores or unfolds it in frame-local position and focuses the requested item in current workspace attention.
- **Left/right:** ordered vertical frame stacks; the left rail is a horizontal toolbar in its column's chrome and the right rail is a horizontal toolbar in the top bar. Dragging an outer separator through its minimum hides that side and retains the last expanded width. Broad upper/lower body targets create adjacent groups; the rail's cluster-boundary zones offer the same commands for folded or hidden panes. Expanded bodies have a 120 px normal minimum; folded groups occupy no interior body space and retain their expanded weights, with restoration on the edge rail. An empty frame group remains available across workspaces until explicit removal and renders a named
  Add/Reveal surface rather than disappearing; a region with groups may stay hidden.
- **Bottom:** ordered left-to-right frame groups resize on vertical separators. Folded groups retain only
  their edge-rail controls, not an interior vertical strip. The bottom tool rail lives in the top bar
  (the global terminal entry) rather than under the body, and is present even when the body is hidden or there are no groups. A bottom-eligible drag
  exposes a broad Primary restore/drop target in unused rail space, leaving explicit group controls
  reachable; dropping reveals its destination. With no drag active, `Mod+Shift+J` and the rail provide
  the same restore path. Height starts at 30%, has a 120 px body minimum, and caps at 70%.
  Alignment is center, center+left, center+right, or full workbench. A side excluded from that span owns its
  lower corner and continues to the workbench bottom; an included side ends above it; the drag-time drop zone
  follows the same ownership. Alignment follows actual browser-local side projection during resize and narrow
  compression while persisted workbench-wide frame ratios remain the target and are converted through nested
  panel groups. A separator gesture commits only the ratio of the side that owns it; compression of an
  untouched neighbor remains runtime-local. Hidden sides contribute no phantom width. A visible empty bottom
  frame slot remains available across workspaces until explicit removal and renders terminal creation/reveal
  affordances.
- **Limits:** left/right share a local setting defaulting to six groups per side; bottom has an independent local setting defaulting to three. Both accept 1–32, with closed hard safety bounds enforced even for untrusted local state or shared presets. Existing overages survive; creation is unavailable until below the configured limit, while reorder/join/reducing moves remain legal. Stable-id uniqueness, one canonical resource placement per workspace view, normalized geometry, and the final-center-leaf invariant are enforced by every mutation.
- **Small viewports:** restoring onto less space may compress below operation minimums locally. Content scrolls/clips; bottom alignment projects from actual compressed side spans, while frame topology, alignment choice, and ratios are never rewritten merely because this viewport is narrow.

Ordinary opens target the active workspace's last-focused surviving center group. Reopening a canonical resource selects its existing local placement rather than duplicating it and refreshes non-identity metadata in place. Each center group has one workspace-local preview slot: preview replaces in place, keep promotes one-way, and navigation clocks are group-local. A passive restore may select its first result without incrementing the user-navigation clock. A user open advances its clock at request time and carries that stamp through acceptance rather than counting twice; reselecting the active center tab also advances once so it defeats older deferred work. Incidental DOM focus changes update last-focus routing but not navigation.

Async completion reroutes from a removed group to current last focus and advances the surviving destination once, unless newer local placement already contains the resource. File/chat/document closes update local attention immediately. Terminal close waits for host-domain acceptance, then removes that terminal from every local workspace view for the workspace; a rejection leaves placement and attention untouched. Any newer tab gesture or navigation suppresses delayed close-focus recovery.

## Shape changes without remounts

Every `ResizablePanelGroup` the engine renders (outer columns, aligned row, bottom column, side and
bottom stacks, center splits) has a structural key only; the projection epoch, side visibility, bottom
visibility, folds, and alignment never key a group. A region that appears or disappears adds or removes its
`ResizablePanel` in place with a stable `id` and `order`, and the bottom column is one always-mounted
vertical group whose bottom panel is conditional, so the top row never changes parent. Resource bodies,
tool panes, terminals, and the chat transcript therefore keep their DOM and component state while a
neighbouring pane folds, hides, or shows; the only remount is a side stack that moves between the outer
column and the aligned row because bottom alignment or corner ownership changed.

Sizes are not left to the library's redistribution. `defaultSize` props always carry the committed
projection for the current panel set, so a membership change recalculates onto the committed geometry,
and a layout effect per group re-applies the committed sizes with `setLayout` whenever they differ by
more than the tolerance and the group's panel count matches. Minimums that depend on the panel set
(`minSize` derived from how many groups or sides are present) are relaxed to `0` for the one commit in
which a group's membership changes and applied in the synchronous follow-up commit (`useTopologySettled`):
react-resizable-panels re-evaluates a panel's constraints in that panel's layout effect against the
group's not-yet-recalculated layout, and letting a constraint and a sibling panel change in the same
commit makes it index a stale layout and throw. The enforcement effect keys on that settled flag so the
committed sizes are re-applied once the real constraints are live. A gesture's rollback (`restore`)
likewise refuses to write a layout whose length no longer matches the group.

## Arrangement and accessibility

A tab drag paints exactly one result: strip insertion, whole-group join, legal center half-split, side
upper/lower boundary, or bottom left/right boundary. Expanded terminal strips remain join/reorder targets
while bodies create adjacent groups. On a rail, the two target kinds follow the cluster grammar: the
before/after halves of an entry insert into *that pane* (reorder, or join from anywhere), and every
cluster boundary — rail start, between clusters, rail end — carries one **New pane here** zone that
creates a group at that index, replacing the former compact folded/hidden-side creation slivers. Both
kinds are painted only when legal: a boundary zone needs room under the local limit and must not be an
exact-position no-op, and a join target obeys the tool/terminal pane rule. Hidden side rails keep a broad
unused-space creation target within local limits. When bottom is not rendered, its drag-time zone reuses the active workspace's last-focused surviving
bottom frame group, falls back to the trailing group, or creates one at the trailing boundary only when no
group exists and the local bottom limit permits; either drop reveals the region. Successful explicit auxiliary group/insertion drops also unfold their
destination in that same interactive mutation; generic placement and passive terminal reconciliation
retain their non-unfolding policy. Illegal domains, limits,
exact-position no-ops, and minimum violations paint no target and commit nothing. Escape, pointer
cancellation, outside drop, or a superseding local frame/view transition restores the source. A drag moves one
workspace resource or one frame-owned tool; it never copies or crosses workspaces.

Drop-target styling has no resting treatment. As soon as a movable tab is picked up, every currently valid
destination shows a subtle Primary hint, and the destination under the pointer strengthens. Both states derive
from the existing drag state and each site's already-computed validity—there is no second drag-state
machine—and use only semantic Primary roles, never `feedback-*`: `drop-hint` is a subtle Primary outline or
translucent surface and `drop-active` is stronger. Tab-header targets outline the whole group header;
individual before/after insertion markers remain the precise hover cue. Center-split targets show compact
directional edge hints at drag start and fill the true resulting half on hover. The bottom drag-time zone is
24 px high and takes collision priority within that band over overlapping lower-body targets. Active emphasis
clears on pointer leave; all hints clear on drop or cancel; decorative layers never alter hit-testing or the
committed result.

Creating or deleting a group is visibly a frame command and therefore affects every workspace in this window. Moving a resource among existing groups affects only its workspace view. Moving a singleton tool changes frame placement globally within this window. Uncommitted drag/resize drafts stay runtime-local and commit once on drop/pointer-up; no host revision can cancel them. A local projection epoch and required workspace identity fence gestures and delayed focus/preview-settle work without remounting the workbench. A workspace switch cancels an active gesture even when a singleton placement or deterministic terminal id also exists in the new view; stale focus requests are not replayed on return. A focus request marked `onlyIfFocusLost` runs only when DOM focus is absent, on `body`, disconnected, or no longer rendered; the check happens when the request executes, after the arrangement commits. `hideSide`/`hideBottom` mark their center focus target `focusOnlyIfLost`, and every path that applies them honors it: the global chords, header and menu hide, and collapsing a region by dragging its separator to zero. Tab removal also cancels its drag. Invalidating a resize restores the live panel group's committed
projection before paint and rejects the remainder of that gesture until release, not merely its pending
persistence. The same recovery applies to outer/aligned sides, bottom height, auxiliary stacks, and
recursive center splits without keying the workbench by workspace. The canceled-drag announcement is reserved for a pointer/keyboard gesture in progress when its base or workspace is replaced, or a tab drag whose tab left the document: `@thinkrail/ui/resizable` reports layout on every group mount and ordinary resize, so a group that merely lived through earlier local transitions announces nothing.

Pointer is never the sole arrangement path. Keyboard controls and shadcn menus cover group/tab focus, select/close/keep/reorder/move, directional center splits, absolute and adjacent auxiliary-group creation, explicit group remove/merge, fold/show/hide/tool restore, bottom alignment, and keyboard separator resize, always with an unavailable reason. A tab can reproduce every interior pointer placement through move plus New group. The optional chat-rename menu item replaces the tab label with an inline editor and commits through a shell-injected callback: layout identifies the chat tab and owns the transient edit interaction but never imports transport/store or performs the domain mutation. Resource strips implement WAI-ARIA tabs and visible roving focus. Rails are named toolbars of pressed buttons: arrows move focus, Enter/Space activates, and `aria-controls` links each existing group. Tool bodies are named regions and terminal bodies are tabpanels. A folded auxiliary group retains a linked native-hidden region while unmounting the body; its selected edge-rail control is the focus endpoint when no tab renders. A local fold moves focus to that control and expansion returns it to the selected tab. Separators expose orientation and current/min/max values. `Ctrl+F6` visits upper-row groups in visual order, then visible bottom groups left-to-right.

DOM focus handoff distinguishes passive `restore` from explicit `keyboard` intent without adding layout
state or a global input-modality owner. Automatic workspace/tab restoration still calls `focus()` but
temporarily marks its target so native `:focus-visible` heuristics cannot paint a misleading focus frame.
The marker clears on blur; pointer input clears a previous keyboard indicator even when the same tab
retains focus, and actual workbench keyboard input changes it to keyboard intent. Arrow,
Home/End, Ctrl+F6, rename completion and keyboard close recovery preserve visible navigation feedback.
Native Tab entry remains browser-owned. Tab and empty-pane focus rings use the semantic `focus-ring`
colour at 1px, independent of the neutral primary selection indicator.
`WorkspaceWorkbench` captures source intent synchronously in its existing request-focus callback,
before a layout-intent commit can remove the focused tool or pane. Keyboard file opens therefore retain
their indicator; restoration from body or a pointer-selected control keeps restore intent. The existing
global-keyboard-only `toggle-side` / `toggle-bottom` intents explicitly request keyboard focus, since
modifier shortcuts can bypass native `:focus-visible` heuristics. Explicit keyboard intent paints the
same thin ring while focused; native Tab entry uses `:focus-visible`. The captured value is transient
request metadata, never saved layout state.

Center resource strips and auxiliary terminal-session strips have bounded readable tab widths and no fixed previous/next controls: wheel, trackpad, touch,
roving-keyboard navigation, active reveal, and the searchable keyboard overflow list scroll the same list.
Native scrollbars stay hidden; pointer-transparent edge fades appear only where clipped and update without
changing the fixed 28 px strip. Strip actions are shared `IconButton ghost m` controls (24 px squares,
vertically centred in the strip) rather than full-height cells. A control renders only when it can
act: overflow search only while clipped; every expanded auxiliary pane has a Hide action because its rail
remains available for restoration. Singleton tool icons have no inline close glyph; explicit Remove tool
from group stays in their menu and on Delete, separate from pane visibility. Terminals and center
resources retain direct close controls.

An external close request arrives through an injected `subscribeCloseRequest` prop; only requests after subscribe count, so a stale request never closes a tab. A focused edge-rail selector is navigation chrome, not an individual resource close target, and yields a no-op before fallback. Internal pure `closeRequestTarget` picks the selected (else first) tab of the DOM-focused group, else of the last-focused center group; a tool tab, folded group, or hidden region yields no target, with no further fallback. The workbench routes it through its normal close path.

Each auxiliary pane header or terminal-session strip trails an add-to-this-pane menu owned by the layout:
*New terminal* on a terminal or empty pane adds to that pane, while a tool pane offers *New terminal pane
below*, which creates a tool-free group directly after it and places the terminal there (`onNewTerminal`
with `newPaneBelow`; the shell no longer injects side-menu actions). The menu also lists unplaced tools
valid for that region; two rails never offer the same singleton. Center tab menus offer no singleton
tools. A terminal created from an auxiliary group lands in that workspace's matching group; a vanished
target reroutes through the current local focus rule. Menus name a pane by its contents — `Move to right
pane (Changes, Review)`, at most three names then `+N`, `(empty)` when it has none — never by an id, and
a tab's menu lists only commands that can ever apply to it: tools carry no center-only items (keep
preview, the four splits) and auxiliary terminals carry no splits.

## Presets and local persistence

Studio, Balanced, Focus, and Review are web-owned resource-free frame definitions with a below-center bottom slot.
Studio is the new-surface default: Projects remains visible on the left, while the right tools and bottom
terminal slot stay available behind their existing rails. The pure preset retains an 18% fallback.
`layoutPresetForViewport` adapts only Studio at the UI integration boundary: the initial pane targets
288px including its integrated horizontal toolbar, reserves the right rail and the 320px center minimum
when space permits, then respects the existing 8–70% side-ratio bounds. It returns a preset copy, never
changes a frame or a persisted value. Initial creation, explicit Studio apply and its current-viewport
comparison share this derivation; saved frames always win, and window resize never reapplies a preset.
The original preset definitions remain unchanged:
Balanced and Review show it; Focus hides it. Balanced and Focus start with one center group; Review provides
its deliberate vertical pair. Custom presets use the same grammar and capture geometry,
topology, tools, folds, and empty structural slots, never workspace resources or terminal count. Preset node
ids are template-local labels: instantiation mints frontend-local frame ids and returns the old→new group map
used to rehome every workspace view. Only custom definitions cross the wire through settings. Built-in preset
names are display copy: `layoutPresetName` renders them through the locale catalog by preset id while the
definition keeps its stable `name`; custom preset names are user data and render verbatim.

Applying a preset creates one replacement frame, raises this surface's local side/bottom limits if required, and remaps all retained workspace views atomically. Center resources preserve visual order and distribute across destination leaves; terminals map into compatible slots; singleton tool placement ids survive where possible. Omitted tools receive deterministic restore targets, so a sparse preset cannot strand Projects or another tool. The local default preset is the target of the explicit Reset frame command; ordinary workspace switches retain the current frame. Default selection and limits persist locally, not in host settings.

`layoutState` validates and persists the normalized frame/views/attention document under browser endpoint + frontend-surface identity or the native stable adapter's profile/window scope. Reload and supported session restoration reuse it; simultaneous windows never consume each other's storage events. Persistence contains references only. Failure leaves live state intact; unknown schema falls back to the Studio safe frame.

The complete current-layout grammar, including the derived `WorkspaceLayoutDocument` projection consumed by existing shell renderers, is web-local. A pristine surface instantiates Studio; no host snapshot or prior layout schema is imported.

The terminal visibility gate mounts a body only for a terminal locally selected in an unfolded visible group. Distinct terminal identities may mount concurrently; one identity has one body per browser surface. Inactive/folded/hidden tabs never attach. Global New Terminal targets last local bottom focus, creating a frame slot only through an explicit frame command; center Group Header creation captures that group. Host catalog reconciliation may place an unrepresented terminal locally without selecting it, but cannot change frame geometry.

## Render isolation

The workbench is a mounted-body host, so the renderer protects injected feature bodies from arrangement churn. The root `Workbench` owns all transient view state — drag, resize projection, measured sizes, focus-after-close — and owns every attention transition. Groups never mutate attention: the root hands down stable, ref-reading callbacks (`onSelectTab`, `onFocusGroup`, `onApply`, `onFocusAdjacentGroup`, `onHideSide`, `onRevealTool`, `readAttention`) whose identities survive document and attention changes, so a re-render of the root never invalidates a child's props by identity alone.

The singular `attention` object is not threaded into leaves. Only the region wrappers that enumerate groups (center node/split, the side and bottom stacks) receive it and project each group's `selectedId` as a primitive; leaf group views receive that primitive, never the whole overlay. Leaf group views, the tab strip, the tab, and the stacks are memoized. Two isolation guarantees follow and are the renderer's contract:

- A resize or drag gesture mutates only root-local projection state; because document, attention, and the shared callbacks are all unchanged, the memoized group subtree does not re-render and no feature body re-renders during the gesture. The pointer-up commit that actually changes the document is the only re-render.
- A selection or focus change in one group re-renders that group's chrome only; sibling groups keep their `selectedId` and skip. Every mounted tab body sits behind the memoized `GroupTabBody` boundary keyed by selected-tab identity and depending only on the stable body renderers, so a body re-renders only when its own selected tab changes — never because a sibling, a resize, or a drag re-rendered. The shell host keeps that true for editor-tab cache writes too: a file/diff/changes body resolves its own cache tab inside the body (`EditorResourceBody`), never through the renderer's closure, so a review tab's keystroke-rate writes re-render that body alone (`e2e/perf/editorTabIsolation.perf.ts`).

The memoization assumes the injected render callbacks are referentially stable: the shell host passes `renderTabBody`/`renderToolBody`/`renderTabAdornment`/`renderEmptyCenter` as memoized identities, so a parent re-render (such as an attention change) does not break a sibling group's chrome memo by prop identity alone. `chatFirstPrompts` is a shallow-stable record (the shell selects it with `useShallow`), so it changes identity only when an unnamed chat's label changes.

`e2e/perf/layoutIsolation.perf.ts` pins both guarantees against the render profiler.

## Internal module structure

The renderer is one submodule behind `index.ts`; its files are internal and import each other directly. `workbenchShared` holds the public prop contracts (`WorkbenchProps`, `SharedGroupProps`, `LayoutTabFocusRequest`), the drag-and-drop primitives, the resize/size/overflow/settle hooks, the DOM-id helpers (group, tab, rail group, rail control), and the shared leaf primitives (`DropZone`, `CenterSplitTarget`, `PanelWithHandle`, `GroupTabBody`). `workbenchTabs` owns the tab strip and tab (including a tab's rail mode); `workbenchCenter`, `workbenchSide` (also the `AuxiliaryGroupHeader` both edge families share), and `workbenchBottom` own their region view families; `workbenchRails` owns the region rail and its droppable entry button; `tabIcon` is the one Line/Fill icon resolver, shared with the shell's Project Home; `Workbench` is the root that composes them and owns state. The rail is the one leaf that renders from `attention` (its entries' selected state), so the root passes it the overlay explicitly like a stack, while its activation runs through `onApply` and the shared `onUserNavigation`. `index.ts` re-exports the component, its public types, and the rail/pane-header primitives Project Home composes.

## Collapsed sidebar and hover peek

A collapsed left region leaves **nothing behind** — no icon strip and no footer. Its toggle (the `projects`
tool entry in the top bar) never wears a selected fill; the icon and `aria-pressed` carry the state, and
its tooltip reads *Show / Hide sidebar* with the shortcut (`Mod+B`). All rail and history tooltips open
downward. While the pointer **hovers** the toggle (a click is unchanged), `LeftPeek` slides the sidebar
back in as a full-height floating panel through a projected, unfolded copy of the document — nothing is
committed. It stays while the pointer is on the toolbar cluster or the panel (plus an invisible strip
along its right edge), while any menu, dialog, listbox or text field opened from it is live, and for a
400 ms grace period after the pointer leaves; `Esc` retracts it. Collapsing with the pointer still on the
toggle suppresses the peek until the pointer leaves it, so a click never bounces the panel back. The
footer (app menu, updates, connection) is reachable only in the expanded sidebar or the peek. `Mod+[` and
`Mod+]` step the toolbar history back and forward (never inside a terminal, where `Ctrl+[` is Escape).

## File workbench integration

Center groups expose the existing tab-search palette whenever they contain a file, even without
strip overflow. File tabs use the shared fileIcons presentation and their full path as the tooltip.
`moveLayoutFilePaths` is a pure explicit-rename projection: it preserves placements/ids/geometry,
updates file paths and names, and removes stale destination duplicates. Dirty source/destination paths
are preserved for recovery rather than silently rebound. No external-file rename is inferred.
