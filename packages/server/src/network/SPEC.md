---
id: submodule-server-network
type: submodule-design
status: active
title: Host outbound proxy policy and diagnostics
parent: module-server
depends-on: [submodule-server-persistence, submodule-server-subprocess, module-contracts]
references: [submodule-server-environment, submodule-server-agent, module-desktop, module-cli]
tags: [network, proxy]
---

## Responsibility

Apply one process-wide HTTP/HTTPS proxy policy before Pi authentication or model initialization.
Pi retains ownership of credentials, OAuth refresh locks, token rotation and model transports.
Settings expose the applied policy, separately detected system settings, and pending restart state.
Detection replies retain the real proxy address, port and bypass list even when policy validation blocks
its use. The UI renders explicit ports (including 80/443 defaults); blocked applied routes display a
status instead of the internal port-zero sentinel. Detection time and action controls have separate rows.

## Boundary

- Public barrel: `initializeNetworkProxy`, `networkProxyStatus`, `updateNetworkProxy`, `diagnoseNetwork`.
- Owns configuration validation, OS static-proxy discovery, environment normalization, proxy-password
  storage, applied state and credential-free endpoint diagnostics.
- Uses `persistence` for atomic non-secret records, `subprocess` for bounded hidden platform commands,
  contracts for the private request/reply shapes, and Bun's OS credential store.
- Does not import agent/auth/host or change Pi provider implementations. Host composes startup and wire
  handlers. No remote proxy service, local forwarding listener or second agent runtime is created.

## Configuration and lifecycle

`network-proxy.json` stores `{config, secretId?}` under the host data directory. Passwords are stored by
`Bun.secrets` under service `space.refinex.pideck.proxy` and a random credential id. Reads expose only
`hasPassword`, never a password or credential id. The config is not part of AppConfig, server.welcome,
or broadcasts. Reads/writes use the existing authenticated host transport, like environment settings.

Saving serializes writers, creates a replacement secret before publishing the config, removes that new
secret on persistence failure, and then retires the replaced reference. Removing the username clears the
saved credential. A changed host, port, protocol or username requires a new password. Secret-store failure
never falls back to plaintext storage. OS-store deletion failures can leave an unreachable old entry;
they do not resurrect it as the current credential. A stored password is retained across inactive modes.

At boot, existing process proxy values after `applyHostEnvironment` take precedence over this page.
This preserves launch-environment > stored environment > shell-import precedence. HTTP and HTTPS use
their scheme-specific variable, otherwise ALL_PROXY. A missing scheme is direct; it is not silently
filled from the system proxy. Lowercase names win when both cases exist on case-sensitive systems.
This page reports the environment override even while allowing preparation of a future configuration.

Without proxy environment variables, auto mode reads the OS configuration, manual mode uses one explicit
HTTP/HTTPS proxy for both schemes, and direct mode clears application proxy variables. VPN/TUN routing
is outside application control. Settings are host-wide; a browser attached remotely edits the remote
host's network, not its own browser network. The external OAuth browser keeps its own settings.

Apply happens once before runtime creation from both `bootHost` and the standalone `createServer` path.
Updates persist only; re-detection reports drift but does not move active sockets. Restart applies the
new route. The host normalizes upper/lowercase proxy variables and removes stale ALL_PROXY fallback.
Loopback localhost, 127.0.0.1 and ::1 are always in NO_PROXY. Child processes inherit the environment;
third-party programs may ignore it. Provider-specific transport overrides remain owned by Pi/extensions.

Existing environment bypass rules outside the shared syntax subset are preserved, with a compatibility
warning rather than a new runtime blocker. Their pre-existing Bun/Pi semantic differences remain visible.
When no proxy is enabled, inactive OS exception rules do not block ordinary direct access. Unsupported
PAC, SOCKS fallback and detector failures still remain explicit blockers.

Invalid configuration, unreadable secrets, unsupported PAC/SOCKS or unrepresentable system bypass rules block
external traffic through a reserved loopback port-zero proxy, while local settings remain reachable.
There is no silent fallback to direct connectivity. Regression tests verify that Bun rejects that route.
The UI reports the reason and permits repair. Existing model errors remain Pi's errors.

## Platform detection

- Windows: a direct Bun FFI call to WinHTTP reads `WinHttpGetIEProxyConfigForCurrentUser` and frees
  its allocated strings. No registry or machine-wide proxy changes. WPAD or PAC returns an explicit
  unsupported status; static maps preserve separate HTTP/HTTPS entries.
- macOS: `/usr/sbin/scutil --proxy` reads active system settings, including exceptions, PAC and SOCKS flags.
  The HTTPS destination proxy from System Configuration still uses an HTTP CONNECT listener.
- Linux: inherited environment works in every desktop/headless session. XDG_CURRENT_DESKTOP selects
  GNOME-family `gsettings` or KDE `kreadconfig6`/`kreadconfig5`. A missing selected backend is a detection
  error; an unknown/headless desktop reports no detected OS proxy. No desktop password is queried.
- Bounded commands use `runBounded` and never print captured settings. GNOME proxy authentication requires
  manual entry. KDE reversed exceptions, PAC/WPAD, SOCKS-only configuration, CIDR and `<local>` bypass
  syntax are explicit unsupported cases. Supported bypass entries are domain suffixes, IPs and host:port;
  the shared subset avoids Bun/Pi interpreting one configured rule differently.
- GNOME HTTPS falls back to its HTTP proxy when no HTTPS proxy is enabled; port zero disables a scheme.
  Inactive HTTP authentication does not block an independent HTTPS proxy. This follows the
  [GNOME resolver](https://github.com/GNOME/glib-networking/blob/master/proxy/gnome/gproxyresolvergnome.c).
  A configured SOCKS fallback for either missing HTTP/HTTPS scheme is rejected rather than silently direct.

## Pi and diagnostics

Pinned Pi 1.4.0 OpenAI OAuth invokes global fetch for both exchange and refresh. Its OpenAI model API uses
fetch-backed SDK calls; Codex WebSocket and Bedrock read proxy variables separately. Environment policy
covers these existing seams without copying token logic or monkey-patching fetch. The test-only Pi
private OAuth import is a parity probe, not a production dependency. Recheck on Pi/Bun upgrades.

`network.diagnose` accepts only OpenAI or Anthropic, uses the applied route and fixed official endpoints,
sends no account/provider credentials, performs no model inference and follows no redirects. Concurrent
diagnostics are refused. Each endpoint has an 8-second abort bound; response-body inspection is bounded.
Results distinguish reachability, missing authentication, region refusal, generic 403, proxy 407/tunnel,
TLS, timeout, redirect and other network/HTTP failures. Proxy authorization may be sent to the configured
proxy. URLs in returned routes have userinfo removed. Raw errors and response bodies never go to the UI.

An endpoint response is not proof of account validity, subscription, model availability or eligibility
under a provider's supported-country policy. Actual OAuth success and real model calls require separate
authorized live acceptance. Diagnosis does not force-refresh rotating tokens or automatically log out.

## Verification

Parser fixtures cover Windows, macOS, GNOME and KDE. Policy/storage tests cover precedence, corruption,
restart, credential loss, no plaintext fallback and rollback. Local-network tests exercise the installed
Pi OAuth CONNECT path, OpenAI Responses SSE, native WebSocket proxying and loopback bypass without real
accounts. Browser coverage saves/reopens the form and captures its real layout. Run the complete no-agent
e2e suite and native artifact smoke for delivery. macOS/Linux native acceptance must be reported separately
from parser coverage on Windows.
