---
id: submodule-server-lsp
type: submodule-design
status: active
title: LSP — host-owned language servers
parent: module-server
depends-on: [module-contracts, submodule-server-persistence]
references: [submodule-server-agent, submodule-server-host]
tags: [lsp, agent]
---

## Responsibility

The host runs language servers on behalf of the agent and the UI, and nowhere else. One `LspManager` owns every
server process; the agent reaches it through the `lsp` tool and the post-edit check (see [[submodule-server-agent]],
*Language servers*), the UI through `lsp.get` / `lsp.update` / `lsp.restart` and the `lsp.status` push (see
[[submodule-server-host]]). There is no second runtime: a server is a child process speaking JSON-RPC over
stdio, and it dies with the host.

The design follows OpenCode's engine (lazy start on first touch, nearest project root, push diagnostics with a
short debounce, errors-only feedback) and deliberately departs from it in three places: **off by default**,
**never installs anything**, and **never runs in a project Pi has not been told to trust**, because a project's
`node_modules/.bin` is code the repository chose.

## Contract

- **Config** (`LspConfig` in contracts, saved as `lsp.json` in the data dir, read once and held): `enabled`
  (master switch, default off), `diagnostics` (append errors to an edit's result), `tool` (declare the `lsp`
  tool), `idleMinutes` (1–240, default 15) and `servers`, a map from id to `LspServerOverride`. An override
  either tunes a catalog server (`disabled`, `env`, `initialization`, `command`, `extensions`) or defines a
  custom one (`command` and `extensions` required, else it is refused). `applyLspUpdate` validates the whole
  update and throws a readable error before anything is saved; a `null` entry removes an override. The host
  owns this file: a project can neither set nor override it.
- **Catalog** (`SERVER_CATALOG`): TypeScript/JavaScript, Java (Eclipse JDT LS), Python (pyright), Go, Rust,
  C/C++ (clangd), JSON, CSS, HTML, YAML, Bash, Lua, Zig, Swift, Ruby, PHP. Each entry names its binary, the file extensions it serves, the
  files that mark a project root (nearest marker upward, bounded by the workspace; some servers refuse to start
  without one, others fall back to the workspace), and an install hint shown when the binary is missing.
  `findBinary` looks in the project root's and workspace's `node_modules/.bin`, then `PATH`; nothing is
  downloaded.
- **Java** (`jdtls`, needs JDK 21+) is the one catalog entry with more than a command line. Its root is the
  **outermost** directory with a Maven or Gradle file (`outermost`), so a multi-module reactor or a multi-project
  Gradle build is one project and modules resolve each other; a `.java` file with no build file is left alone.
  It is started as `jdtls [--jvm-arg=-javaagent:<lombok.jar>] -data <dataDir>/lsp/jdtls/<hash of root>`: its
  index and metadata live under the host's data folder, never in the repository, one folder per project root.
  **The server's JVM is not the project's JDK.** `JAVA_HOME` usually names the JDK a project builds with, often
  older than what a recent jdtls needs (1.62 needs JDK 25 and dies at once on 21), so the launch sets
  `JAVA_HOME` for that process to the newest JDK found (`findJdks`: `JAVA_HOME`, macOS and Homebrew JVM
  folders, `/usr/lib/jvm`, SDKMAN, asdf, `~/.jdks`, each read from its `release` file). Such a JDK still
  analyses code written for an older language level. A server's own `env` setting wins over this.
  The Lombok agent is passed when a Maven (`~/.m2`) or Gradle (`~/.gradle`) cache already holds a Lombok jar
  (newest wins), because Spring Boot code leans on Lombok and the server otherwise reports an error for every
  generated getter; nothing is downloaded. `initialize` may take up to two minutes (`Launch.initializeTimeoutMs`),
  and the first diagnostics arrive only after the build is imported, so the post-edit check of a cold Java
  server usually returns nothing and later edits get the verdict. Spring Boot Tools (Spring-specific
  completion, `application.yml` metadata) is a different server and is not built in.
- **Lifecycle** (`LspManager`): keyed by workspace directory, then `serverId + root`. A server starts the
  first time a file it serves is touched (`touch`, `run`) and only when `enabled`, the project is trusted and
  the file is inside the workspace; concurrent touches share one start. States are `starting`, `ready`,
  `error` (exited, failed to initialize, or crashed; the stderr tail is the message) and `missing` (no binary).
  A failed or missing server is not retried for 60 s unless restarted. `restart` stops one or all of a
  workspace's servers and forgets them; `reconfigure` does so for every workspace and is called when the master
  switch or the server table changes (the other switches are read live). `reapIdle` stops servers unused for
  `idleMinutes`. `dispose` / `disposeAll` run on workspace removal and host shutdown.
- **Documents**: `open` sends `didOpen` (version 1) or a full-text `didChange`, from disk, capped at 2 MB.
  `waitForDiagnostics` resolves on the next push for that version after a 150 ms debounce, or on a pull
  (`textDocument/diagnostic`) when the server offers one, or after 5 s. Edits made by the agent go to disk first;
  the server is told afterwards, so the host never holds a document the disk does not.
- **Status** (`status(directory, trusted)`): per server `{ id, name, root, state, message?, files, errors,
  warnings, custom }`, or an empty list when disabled or untrusted. Changes are coalesced for 80 ms and
  announced through `onChange(directory)`; `host/lspHost` maps a directory back to its workspaces and publishes.
- **Failures** read as one line: a `Launch` may carry `explain(stderr)`, and without it the line is the exit
  and the last line the server wrote (`The language server exited (code 13): …`); the whole stderr tail follows
  on the lines below, and the status block shows the first line only. jdtls explains itself: when the Eclipse
  launcher says "see the log file" the log is read and, if it names a Java requirement, the message says which JDK
  it needs and which is the newest found.
- **Wire**: `jsonrpc.ts` is a small `Content-Length` framed JSON-RPC 2.0 connection (requests with timeouts,
  notifications, server-initiated requests answered or refused with `-32601`). It is hand-written so the host
  adds no dependency for a few hundred lines; the fake server in `fixtures/` speaks the same framing from the
  other side, which is what the tests run against.

## Public surface

`index.ts` exposes `LspManager`, the singleton `lspManager`, `lspOverview`, `updateLspConfig`, `restartLsp`,
`lspWorkspaceStatus`, `onLspConfigChange`, `getLspConfig` / `resetLspConfig` and the formatters the tool uses
(`diagnosticsReport`, `formatLocations`, `formatHover`, `formatSymbols`, `formatCalls`). Trust is an argument,
never read here: callers pass whether the workspace's project is trusted, so this module needs neither the
projects nor the agent module.

## Get right

- Trust gates **starting**; a server already running is also refused work while untrusted, and `status` hides
  everything for an untrusted project.
- Positions on the wire are 0-based; everything shown to the agent or the user is 1-based. The conversion lives
  in `format.ts` and the tool, nowhere else.
- Only errors reach the agent after an edit, at most 20 per file, so a noisy file cannot bury the one real
  problem. Warnings and counts are for the status block.
- A server that emits nothing is not an error: the wait ends at its 5 s bound and the edit's result goes back
  unchanged.
- Servers are child processes of the host; every path out of a client (exit, error, `shutdown`) rejects the
  requests still waiting, so a crashed server cannot hang an edit.
- `workspace/configuration`, `client/registerCapability`, `window/workDoneProgress/create` and friends are
  answered with empty successes: servers stall on them otherwise.

## Not done

Auto-install, per-project config files, formatting/code actions/rename, `workspace/didChangeWatchedFiles`, and
multi-root workspaces. A catalog server's `command` override replaces the whole launch line, including the
arguments the catalog would add.
