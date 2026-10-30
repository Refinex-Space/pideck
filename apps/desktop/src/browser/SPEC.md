---
id: submodule-desktop-browser
type: submodule-design
status: active
title: Browser — CEF surface adapter
parent: module-desktop
depends-on: [module-contracts]
references: [submodule-web-browser]
tags: [desktop, browser]
---

## Decision

The user explicitly approved bundling CEF on 2026-10-30 to match ZCode browser capabilities.
Electrobun 2.0.5's native BrowserView has no screenshot/device-emulation API; this is the acceptance
failure that justifies adding Chromium for untrusted browser guests. The trusted application remains
on its existing system renderer and Pi remains in-process in the existing server.

## Boundary

The preload exposes a frozen optional `NativeBrowserBridge` from contracts. Guests use sandbox mode,
a separate browser partition and native navigation rules. They never receive the application RPC,
filesystem or agent bridge. Guest messages are bounded and validated; no guest message sends a prompt,
opens an external URL or selects a destination chat without the corresponding user action.

Native guest nodes outlive React slots so panel folding/workspace switching does not destroy pages.
Only explicit tab closure, workspace disposal or application exit destroys them. Geometry follows the
current visible slot; modal layers hide native surfaces and ordinary popovers mask them.

CEF/CDP operations stay behind the main process and are restricted to registered sandboxed child views
of the main window. The main application and unrelated browser targets cannot be controlled through
the panel bridge. Command errors surface in the panel; startup/probe failures use the existing desktop reporter.

## Source and validation

Behavior reference: ZCode `3c5b227649371507ddc4eb46ac5133afe6db1cab`, Apache-2.0. The picker is
adapted around PiDeck contracts, labels and theme values; source attribution is recorded in NOTICE.
No Electron dependencies or second agent runtime are introduced.

Native build/smoke is mandatory. macOS verification does not imply Windows/Linux acceptance.

## Verified compatibility details

CEF uses persist:default, a Chromium profile separate from the trusted WKWebView/WebView2 UI. In the
2.0.5 macOS artifact, a named persist:pideck-browser context made CreateBrowserSync return null.
Binding uses a random about:blank fragment matched against the native-owned view and CDP frame URL
(including urlFragment). Native view allocation and CDP target availability are separate readiness steps.
The launcher initializes both JavaScript and C runtime environments before CEF starts; assigning Bun
process.env alone does not update native getenv.

Guest metadata, selection and shortcut scripts run in a named CDP isolated world. Only that main-frame
execution context can emit bounded guest messages, and guest kinds cannot impersonate navigation/error
events. Native DOM/geometry handles remain owned by the adapter; no raw guest RPC reaches the host.
The initial bootstrap entry is excluded from Back/Forward availability using native history.
The adapter masks all pixels outside its current slot and uses a scroll spacer for fixed-scale previews.
Native close-item shortcuts close the focused page; other contexts keep the existing shell command.

## Public entry

index.ts exports the main-process controller, bootstrap-port reader and native lifecycle installer. The launcher-owned
browserView/browserPicker/browserMessages and browserBootstrap files live beside the root preload
and packaging helpers, so the view bundle never imports the native main SDK through a shared barrel.

## macOS child-view close (Electrobun 2.0.5)

The native windowed CEF client does not override DoClose. Its default CloseHostWindow sends
performClose to the NSWindow that owns CefBrowserHostView, so removing one child closes the entire
PiDeck window. The regression reproduces this with two live guests before any application quit call.

The version-gated Cocoa adapter wraps only CEFWebViewImpl.remove: on the main thread, retain the
owner/view, remove the ContainerView tracking entry, detach the child NSView, then invoke the original
SDK removal. CEF sees no parent window, and releasing its host view completes browser destruction.
No view pool, hidden retained pages, altered renderer mode or suppression of application quit is used.
The helper is built locally into the desktop runtime and does not modify the SDK/cache binaries.
Its FFI library remains loaded for the process lifetime because the Objective-C method points into it.
Clang targets macOS 14.0, matching the pinned native wrapper instead of inheriting the build machine's OS.
Remove it when Electrobun handles embedded CEF close independently from the parent window.

`smoke:browser --close` must prove two live guests → one closes → survivor remains usable → last
guest closes → a new guest opens/closes → host health remains available and CDP has no retained pages.
References: Electrobun v2.0.5 `CEFWebViewImpl.remove` and CEF 156.0.7 (`47dbc1d`)
`CefBrowserPlatformDelegateNativeMac::CloseHostWindow` / `CefBrowserHostView::dealloc`.

Source references:
- [Electrobun v2.0.5 native wrapper](https://github.com/blackboardsh/electrobun/blob/v2.0.5/package/src/native/macos/nativeWrapper.mm)
- [Pinned CEF macOS close implementation](https://github.com/chromiumembedded/cef/blob/47dbc1d/libcef/browser/native/browser_platform_delegate_native_mac.mm)

### Close regression validation — 2026-10-30

Before the fix, closing the first of two real CEF pages also removed the second page and stopped
the application. After the fix, the native close probe releases five pages (inactive, active,
last, reopened and blank), including an idempotent repeated disposal, keeps the host healthy and
observes zero remaining CDP page targets. The ordinary page/selection/screenshot probe and desktop
host/window smoke also pass. The final dylib's LC_BUILD_VERSION reports macOS 14.0.

Desktop unit tests: 165 passed, four Windows-only tests skipped. All 24 workspace typechecks and
dependency/boundary/seam/lint/spec checks passed (lint retains the existing oversized audit-HTML warning).
The full no-agent Web suite recorded 680 passes and eight failures; the serial failed-test rerun passed
six, leaving `changes.spec.ts:768` (a change-row element has no bounding box) and
`skills-switches.spec.ts:73` (trust-summary wording). Those Web implementations/assertions were not
changed by this native lifecycle fix. Windows/Linux native execution was not tested for this fix.

## Pi automation and recording adapter

Reference surface: ZCode browser-use API v11 at the pinned revision above. Its model facade and Node REPL
transport become a single typed Pi `browser` extension; the current app's Pi session remains authoritative.

| ZCode desktop/IAB capability | PiDeck integration |
| --- | --- |
| Backend/tab discovery, selected tab and owner session | Native workbench catalog, active/visible metadata, host claims derived from Pi; popups inherit their opener |
| DOM snapshot, Playwright locators, frames, open shadow roots | Playwright core attached to the exact verified native target; locator descriptors include scoped/semantic queries, filters, and/or, nth/last, observations and actions |
| CUA pointer/keyboard/drag, DOM targeting | Trusted input, CSS coordinates, paths, point-to-element inspection/screenshots/media extraction and strict locators |
| Navigation, waits, evaluation, dialogs | HTTP(S)/about:blank agent navigation, history guard, waits armed before their action, guest-only function evaluation, native dialog state |
| Upload/download/media | Workspace-contained input files, download listener armed before triggering, native download events and CDP cancellation, workspace artifact delivery |
| Screenshot / viewport / visibility | CSS-resolution full/clip/element screenshots, capture leases, fixed viewport or reset, reveal/hide without stealing another workspace |
| Asynchronous recording and scenario DSL | Start/status/stop/cancel, 5–30 fps, up to 90 seconds; wait/click/double click/type/hover/move/scroll/scrollTo/wheel/path drag/waitFor with timing |
| Handoff / finalized tabs | Pi `finalize(keep)` retains deliverables and human pages; existing Pi naming owns conversation names |

The driver connects over CDP with noDefaults and never launches an external browser. A loopback transport
maps input positions through the current CEF preview scale; this avoids the reproduced Fit-mode misclick
without changing the user's preview zoom. Connections are disconnected after their operation and on abort.
A timed-out/aborted evaluate also terminates guest execution through the independent native CDP connection.
Window.close is forwarded to the owning tab's existing dispose path. Main-world pages receive only that
self-close compatibility method, not the private guest binding or application RPC.

Screenshots acquire a distinct unscaled lease so simultaneous recording/screenshot cleanup cannot release
one another's surface. Agent images use CSS-pixel scale; the camera action writes PNG with native clipboard
APIs, with Save kept separately. Agent clipboard commands and copy/cut/paste shortcuts use chat-local text.

Recording consumes lossless PNG screencast frames from the existing target and encodes VP8 WebM in an owned,
sandboxed CEF encoder view with no remote navigation. Latest-frame drawing maintains time on static pages;
frames/chunks are bounded, output streams to a private temporary file, and capture state restores after all
outcomes. A detached tab cancels the job through finalization, including while the workspace commit is
pending. No desktop/screen capture, microphone, ffmpeg or second Chromium instance is involved.

Chromium's live WebM omits duration. `webm.ts` writes a same-width Float32 Duration in place of the explicit
1 ms TimestampScale (its specified default), retaining all cluster/seek offsets and codec bytes. This follows
[Matroska's default-element and Duration rules](https://www.matroska.org/technical/elements.html). Header
layout changes/checksums fail explicitly rather than silently corrupting video. Native tests decode, play
and seek the artifact in CEF and check playback in the system renderer as separate evidence.

The native download adapter correlates trusted SDK start/completion events for one view, validates the
Downloads path, then copies the newly downloaded agent artifact into private staging and removes that exact
new native file only while its inode still matches. Ordinary human downloads keep the SDK's behavior.
Default tests use unique generated names and isolated host/agent/home/application identity; they never read
user credential files. The separately authorized live mode is described in the e2e specification. The native Pi probe registers a synthetic provider in its temporary agent directory and
runs the production host's actual Pi tool loop against the real CEF, in addition to controller tests.

Acceptance commands: `smoke:browser`, `smoke:browser --close`, `smoke:browser --automation`, `smoke:desktop`;
unit/typing/UI gates remain separate. The automation mode includes PNG clipboard paste, real DOM actions,
upload/download, actual video pixels/playback/seeking, cancellation, window.close and a native-host Pi turn.


## Final automation acceptance (2026-10-30)

On macOS ARM64, the desktop build and normal, close-regression, automation and desktop artifact smokes passed.
Native acceptance includes trusted input, cross-origin frames, shadow DOM, CSS-resolution PNG system paste,
upload/download/media, terminating a stuck guest evaluation, background WebM capture, cancellation, actual
CEF and system-renderer playback/seeking, and the packaged host's Pi/Faux tool loop.

The explicitly authorized GLM-5.3 (`zai-coding-cn`) run used the existing key only in the isolated child
environment. It completed 13 browser calls with zero tool errors: native fill/click, recording, workspace
artifact delivery, final value verification and tab handoff. Its 640×480 WebM is approximately 5.04 seconds;
original credential-file hashes matched. Evidence is in ignored `apps/desktop/artifacts/browser-native/`
(`live-report.json`, `live-recording.webm`, `live-video-validation.json`). A previous live attempt exposed
ref-only locator schemas producing strings; the advertised object shape was corrected without weakening
validation or substituting DOM mutation for native input.

Focused tests: 52 passed / 205 assertions; browser-panel UI: five passed. All 24 package typechecks passed,
with the server rechecked after the locator fix. Dependency, boundary, seam, spec-surface, i18n, compiler and
lint gates passed; lint retains the pre-existing oversized design-audit HTML warning. The complete no-agent
Web run recorded 685 passes and four failures. Serial rerun passed three after correcting the browser toast
locator; the remaining `skills-switches.spec.ts:73` expects a skills-and-prompts trust summary while the
existing UI says prompts. That unrelated assertion/implementation was left unchanged. A full unit run
concurrent with full Web tests was interrupted after resource-contention Git timeouts; it is not a full-unit
pass. The focused tests were rerun successfully. Windows/Linux native execution remains unverified.

The native clipboard smoke must run separately from other tests that write the system clipboard. A paste
assertion failed once during parallel full-Web execution; serial native runs passed. It intentionally checks
only its known fixture image and never reads or restores the user's prior clipboard data.
