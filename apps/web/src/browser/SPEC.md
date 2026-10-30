---
id: submodule-web-browser
type: submodule-design
status: active
title: Browser — embedded page workbench
parent: module-web
depends-on: [module-contracts]
references: [module-desktop, submodule-web-shell-layout, submodule-web-panels]
tags: [browser, ui]
---

## Responsibility and reference

The Browser tool is a layout-agnostic, workspace-scoped tabbed page panel. The shell owns placement,
resizing and visibility. This module owns address drafts, tab selection, viewport controls and explicit
selection-to-composer actions. The optional `NativeBrowserBridge` owns page surfaces; an ordinary web
client has no embedded-browser capability. It must never substitute an iframe with weaker navigation
and inspection guarantees.

Reference: ZCode `3c5b227649371507ddc4eb46ac5133afe6db1cab` (Apache-2.0), specifically
`packages/ui/src/browser-use/UnifiedBrowserView.tsx`, `EmbeddedBrowserPaneParts.tsx`,
`lib/webElementPickerScript.ts`, `hooks/useWebElementPicker.ts`, and the browser-use specifications.
The implementation adapts the behavior to Electrobun and existing PiDeck state/interaction owners;
Electron IPC, ZCode agent runtime, telemetry, provider settings and remote-control service are not copied.

## Contract

- Each workspace has its own tab catalog and active tab. Closing a tab disposes its native page.
  Hiding or moving a panel detaches only its visible slot; page state and native navigation history survive.
- URL input is a draft until Enter. Escape restores the committed address. Local development hosts
  and explicit non-TLS ports default to HTTP, public domains to HTTPS. Unsafe schemes and URL credentials
  are rejected. Back/forward availability comes from the browser, never a synthetic URL stack.
- Normal viewport follows the panel. Responsive mode separates CSS viewport size from preview scale;
  Fit derives scale from the available canvas. Switching tabs retains each tab's dimensions.
- Element selection shows bounds and computed style, suppresses the selected click, supports Escape,
  and captures bounded DOM context. Form values, scripts and event-handler attributes are excluded.
  Page data is untrusted. A selection adds context to the captured workspace/chat draft and never sends.
- The native surface must leave menus, dialogs and tooltips operable. Browser shortcuts apply only to
  the browser surface; existing editor and chat shortcuts keep their owners.
- Rendering uses `useT`, shared controls, Lucide and existing semantic tokens. Native geometry and
  injected page overlays are imperative adapters, not a second application theme or layout model.

## Dependencies and public surface

`index.ts` exposes `BrowserPanel` and capability detection. Dependencies: contracts (type-only),
locales, UI, React/Zustand, lib, store and the existing panels/openChat integration. No server/shared/Pi
runtime imports. Native page operations are optional client capabilities, not host WebSocket methods.

## Acceptance

Unit tests cover URL normalization, bounded selection data and tab lifecycle. Browser tests cover the
panel with a deterministic native-capability fixture and execute the real picker in a real page.
Packaged desktop smoke separately verifies the actual CEF guest, navigation, selection, viewport,
screenshots and overlay behavior. Browser fixture tests are not proof of native-platform behavior.

## Persistence and integration details

Up to 16 tabs are retained per workspace. The native-stable preference adapter stores only tab URLs,
active index, viewport preferences and the last completed recording artifact; live DOM/history survive hiding and switching, while a full
application restart reloads saved URLs. Workspace removal releases its pages and preferences.
openBrowserUrl reuses an exact URL and reveals the existing tool; failed guest recreation retains
the tab address. A selected element stores the chat target from selection time, and adding it uses
the existing cursor-preserving insertChatText action. Closed targets leave the preview available.

## Validation — 2026-10-30

- Relevant native, contract, layout and assistant-link unit tests: 278 passed; four Windows-only native tests skipped on macOS.
- All 24 workspace typechecks passed. Dependency, module-boundary, binary-seam, i18n, spec-surface and React Compiler checks passed. Lint passed with the existing oversized design-audit/buttons.html warning.
- Complete no-agent browser suite: 687 passed, one Skills trust-summary assertion failed. Focused rerun: seven passed and that same Skills assertion still failed. The failure expects “Trust loads its skills and prompts.” but receives “Trust loads its prompts.”; its implementation and assertion are unchanged by this feature.
- Native macOS desktop build, shared artifact smoke and CEF browser smoke passed. The CEF probe verifies isolated-world bindings, synthetic-shortcut rejection, selection click suppression, bootstrap-history exclusion, 393×852 CSS viewport/DPR 1, fixed-scale canvas scrolling, PNG dimensions and four distinct corner regions (allowing display-profile color conversion).
- Windows/Linux native operation, permission prompts, file upload/download and real model-driven browser operation were not exercised. That initial panel phase was human-operated; the subsequent Pi automation/recording phase is described below.

## Pi control, screenshot copying and recording

The client retains the sole tab catalog. The native workbench handler exposes list/new/get/activate/close,
owner/activity state, viewport and capture leases. It rejects removed workspaces and never selects a new
foreground workspace for a background chat. Popups report their opener for host claim inheritance.
Agent activity is visible; Stop agent uses the existing session.abort wire. Starting native operations
cancels picker interception so automation clicks cannot be consumed by an old selection mode.

The camera action writes PNG to the system clipboard and reports success after the native call. Save
screenshot remains a separate menu action. The video action starts/stops manual WebM capture; its status
row exposes elapsed time, discard and playback. Responsive controls are locked during capture and display
100% while the native capture lease is active; saved Fit/zoom preferences return afterwards. Completed
artifact metadata survives restart, while unfinished jobs are never restored as running. Older completion
events cannot overwrite a newer recording. The preview uses the existing workspace byte URL helper.
Browser tool receipts link artifacts into the shared WebM file renderer. The UI owns no recording engine.
