---
id: submodule-server-speech
type: submodule-design
status: active
title: speech — host-local voice models and dictation
parent: module-server
depends-on: [submodule-server-persistence, submodule-server-log, module-contracts, module-shared]
references: [submodule-web-speech, module-desktop]
tags: [speech, voice, models]
---

## Responsibility

Own the host's speech-to-text for the message box: a closed catalog of downloadable recognizer models,
their download / verification / storage / deletion, and one live dictation at a time that turns streamed
PCM into text. Recognition runs **inside the host process**; the browser or desktop webview only captures
the microphone ([[submodule-web-speech]]). Audio is held in memory for the length of one utterance and is
never written to disk or sent to a third party.

## Research basis

The DeepSeek Harness reference repository (`deepseek-harness`, MIT, commit `cd5ef81481`, checked
2026-10-31) was examined first. It contains no voice or dictation code and no desktop application: `apps/`
holds only `cli` and `web`, and a full-tree search finds no `getUserMedia`, `MediaRecorder`, `AudioContext`,
`SpeechRecognition`, whisper, sherpa or model-download code. There is therefore nothing to adopt from it and
nothing was copied. The design below is PiDeck's own, chosen against these facts about its architecture:

- The host already owns durable machine state and long-running work (`~/.pideck`), and every launcher (CLI
  browser, Electrobun desktop, a phone over Tailscale) reaches it over the same wire. Models and
  recognition therefore live in the host; a per-browser model cache would make "download once" false.
- Electrobun bundles CEF on all three desktop platforms, so `getUserMedia` + `AudioWorklet` is available to
  the web client everywhere. Capture stays in the web client; only mono PCM crosses the wire.
- The host is a Bun process shipped as a compiled binary and inside the desktop bundle. A native recognizer
  addon would add per-platform artifacts to `buildSupport`, signing and `check:seams`.

## Engine decision

**sherpa-onnx WebAssembly build** (`sherpa-onnx@2.0.1`, Apache-2.0, pinned in the root catalog), loaded
lazily by `sherpaEngine.ts`. It is pure WASM + JS: no native addon, no subprocess, no second agent runtime,
identical on macOS / Windows / Linux. Streaming zipformer transducers give true incremental decoding, so
stopping a dictation only flushes the tail. Measured on the dev machine under Bun 1.4.4: 0.4 s model load and
0.4 s to decode 6.6 s of speech with the 20M English model (≈17× real time), correct transcript. Alternatives
rejected: browser Web Speech API (cloud, absent in CEF, not model-based), `whisper.cpp` subprocess (extra
binary to ship, sign and download, batch-only), `sherpa-onnx-node` / `onnxruntime-node` (native addon).

The runtime is behind the `SpeechEngine` port (`engine.ts`), so a faster engine (a worker thread, a native
build) can replace it without touching the service, the wire or the UI.

## Catalog and storage

`catalog.ts` is a closed list; the wire carries only ids. Each entry pins its Hugging Face revision (commit
hash in the URL, so the bytes are immutable) and every file's size and SHA-256 (the LFS object id; `tokens.txt`
hashed directly). Entries: `zipformer-en-20m` (English, ~44 MB) and `zipformer-zh-en` (Chinese + English,
~199 MB), both int8 streaming transducers published under Apache-2.0 by their authors. PiDeck redistributes
nothing; the user's host downloads them on request, and the UI shows the source host.

Layout under `<dataDir>/models/speech/`: `<id>/` (files + `ready.json`), transient `<id>.partial/`, and
`selection.json` (`{selected}`). A model is *installed* only when `ready.json` exists and every file's size
matches, so a half-deleted or truncated directory reads as absent. The selection is host-wide and survives
restarts; the active model is the stored choice when still installed, else the first installed model.

## Download pipeline

`download.ts` fetches each file with the process `fetch` (so the proxy policy from `network` applies),
streams to `<id>.partial/`, hashes while writing, rejects on size or checksum mismatch, writes `ready.json`,
then replaces `<id>/` by rename. Any failure or abort removes the partial directory. Failures are the closed
union `network | integrity | disk`; a user cancel returns to `absent`, anything else to `failed` with the
reason, retryable. One download per model; progress is pushed on `speech.status` at most every 250 ms.
There is no resume: files are tens to low hundreds of MB and resume would add range/validator state for little.

## Dictation

`speech.dictationStart` → `speech.dictationAudio`* → `speech.dictationStop` (text) or `speech.dictationCancel`.
One dictation per host (`SPEECH_BUSY`), 300 s maximum, 30 s idle expiry, 128 KiB maximum per audio message.
Audio is base64 PCM16LE mono at 16 kHz (the rate is returned by start). The recognizer is loaded on first
use, kept 60 s after the last dictation, and disposed when its model is deleted. `normalizeTranscript`
lower-cases all-caps Latin output, restores "I" and the leading capital, and removes gaps between CJK
characters; these models emit no punctuation (accepted limitation, a punctuation model is a later, separate
catalog concern).

Decoding runs on the host's event loop in ~100 ms frames (a few ms each for the 20M model). A slower model
or a busy host would be better served by a worker; that change stays inside `sherpaEngine.ts`.

## Boundary

- Public barrel (`index.ts`): `speechService()`, `setSpeechService()` (test seam), `SpeechService`,
  `SpeechServiceDeps`. `fake.ts` (in-process catalog, fetch and recognizer) is imported only by `dev.ts`
  when `THINKRAIL_E2E_FAKE_SPEECH=1`, never by product code.
- Allowed deps: `persistence` (`dataDir`), `log`, `contracts`, `shared` (`CodedError`), `sherpa-onnx`.
- Forbidden: `host`, `settings`, `agent`; storing audio; any cloud speech endpoint.
- `host` composes it: handlers for `speech.*`, publisher for the `speech.status` channel, `dispose()` on
  shutdown.

## Get right

- **Verify before publish.** Nothing becomes installable until size and SHA-256 match; the staged directory
  is renamed, never populated in place.
- **Errors are values.** Missing model, busy host and unavailable runtime are `CodedError`s
  (`SPEECH_MODEL_MISSING`, `SPEECH_BUSY`, `SPEECH_ENGINE_UNAVAILABLE`, `SPEECH_DICTATION_UNKNOWN`); the web
  client maps them to guidance, not a crash.
- **No privacy leakage.** Transcripts and audio never enter logs or analytics.
- **Packaging.** `sherpa-onnx` reads its `.wasm` next to its JS. Bun resolves it from `node_modules` in the
  source host (verified, including the e2e host). The compiled CLI binary and the desktop bundle must ship
  `sherpa-onnx-wasm-nodejs.wasm` as a runtime resource through the build-support manifest; this is **not yet
  done or verified**. Until then `engine` reports `unavailable` there and Settings explains it.

## Verification

`speech.test.ts` drives the service with the fake catalog/fetch/engine (download, checksum failure, HTTP
failure + retry, cancel cleanup, selection persistence, deletion, busy/unknown/missing errors, unavailable
runtime) and loads the real WASM runtime. A throwaway script ran the real adapter end to end with the 20M
English model and a 6.6 s sample (correct text). `e2e/speech-dictation.spec.ts` covers the browser path with
Chromium's fake microphone device and the fake recognizer.
