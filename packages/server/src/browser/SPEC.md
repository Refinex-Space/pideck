---
id: submodule-server-browser
type: submodule-design
status: active
title: Browser — scoped Pi tools and artifacts
parent: module-server
depends-on: [module-contracts]
references: [submodule-server-agent, submodule-server-host, submodule-desktop-browser]
tags: [browser, agent]
---

## Responsibility

The host owns session claims, cancellation and workspace artifact materialization. The existing Pi
extension loader registers the `browser` tool only when a native BrowserEngine is supplied. The engine
controls existing CEF targets; it neither launches another Chromium nor adds a second agent runtime.
The model never supplies its session/workspace identity. Host composition derives those from the live
top-level Pi session. Child agents do not inherit browser control, matching ZCode's ownership boundary.

## Contract

Tabs remain in the native client's catalog. A top-level chat may discover unclaimed human tabs in its
workspace, explicitly claim one, or create a page. A claim is exclusive to that chat until finalization
or session shutdown; another chat cannot operate it through this tool. Human controls retain authority. Session shutdown
cancels recordings and pending operations and releases claims without deleting user pages.

Automation covers DOM snapshots, strict locators (including frames/open shadow DOM), trusted pointer
and keyboard input, navigation/waits, page evaluation, dialogs, upload/download, browser-local clipboard,
viewport/visibility, screenshot and asynchronous recording. Native system clipboard writes remain an
explicit human screenshot action, separate from the agent's browser-local clipboard.

Recording start/status/stop/cancel is bounded to 90 seconds and uses a data-only action DSL. Completed
videos/downloads/screenshots are materialized atomically under the workspace; traversal, symlink escape
and overwriting an existing unrelated file are rejected. Temporary native paths never enter tool results.

## Public surface

index.ts exposes BrowserService; its engine/scope/result types live in contracts. It depends only on contracts, filesystem
primitives and Bun/Node. Host resolves live scopes; agent owns tool registration; desktop owns CEF/media.

## Composition and cleanup

Host injects a live top-level session resolver and the workspace root, keeping identity out of model input.
Catalog changes serialize until ownership is reserved; a popup inherits its opener's claim before closed
parents are reaped. Operations waiting for native readiness also receive cancellation. `agent_settled`
cancels unfinished browser work; `session_shutdown` additionally releases claims. `finalize(keep)` closes
only agent-created temporary pages and hands retained pages back to the user.

Artifact writes copy into a private temporary sibling and commit with an exclusive link. Cancellation is
checked before commit. Existing targets are never overwritten. Completed recordings are delivered via an
engine callback even while the panel is hidden; polling is not responsible for persistence. Native download
paths and temporary encoder paths are stripped from model-visible results. Browser claims are application
coordination, not an OS/process sandbox.

The agent's clipboard actions and Ctrl/Command+C/X/V use session-local text. User screenshot buttons use
native PNG clipboard writes. A page's own Clipboard API remains governed by CEF permissions.
