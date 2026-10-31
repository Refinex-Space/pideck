---
id: submodule-web-speech
type: submodule-design
status: active
title: speech — microphone capture, dictation state and voice-model status
parent: module-web
depends-on: [submodule-web-store, submodule-web-transport, module-contracts, module-ui, module-locales]
references: [submodule-server-speech, submodule-web-chat]
tags: [speech, voice, composer]
---

## Responsibility

The client half of dictation. It captures the microphone, streams real PCM to the host, shows the live
loudness, and returns the final text to the composer; it also mirrors the host's voice-model status for the
Settings panel and the composer. It never recognizes speech itself and holds no model.

## Pipeline

`capture.ts` (`getUserMedia` with echo cancellation + noise suppression → `AudioWorklet` loaded from a Blob
URL, no extra asset or CSP exception) posts ~50 ms float chunks at the device rate. `DictationController`
(framework-free state machine; `idle → starting → listening → transcribing → idle`) resamples to 16 kHz
(`pcm.ts`), computes one loudness reading per chunk from the actual samples (RMS, −60…−10 dBFS mapped to
0…1), keeps the last 26, batches ~100 ms PCM16 frames, and sends them in order with `speech.dictationAudio`.
Permission is requested first, then the host session; audio spoken before the host answers is queued, so
nothing is lost. `stop` releases the microphone, flushes the tail, awaits the in-flight frames, and calls
`speech.dictationStop`. `cancel` (Escape, send, unmount, switching chats) drops the utterance and cancels the
host session.

Problems are a closed union (`denied | unavailable | insecure | modelMissing | engineUnavailable | busy |
failed`) mapped to localized toasts by `useDictation`. `insecure` is a page without a secure context (plain
http over a LAN name): browsers expose no microphone there. `modelMissing` also opens Settings → Voice input.

## Composer contract

`insertDictation` inserts after the selection end and never replaces the draft: one space against Latin
neighbours, none against CJK. `Composer` feeds the result through the same path as typing (`onChange`, template
slot edit, `focusSelection`), so IME, Enter / Shift+Enter, draft persistence, selection and slot sessions keep
their behavior. The microphone is the rightmost control, after the send pill; while listening a `Waveform`
sits left of the send pill. Visual rules are in [design-system.md](../../../../design-system.md).

## Waveform

A `<canvas>` (no inline style) draws one slot per reading, oldest left: silence is a dot, speech grows into a
rounded bar, new readings enter from the right, colour from the inherited text colour. With
`prefers-reduced-motion: reduce` it stays a still row of dots; the active microphone button, its accessible
name ("Stop dictation") and a polite status line keep the state readable. `data-peak` exposes the strongest
current reading for tests.

## Status

`useSpeechStatus` shares one `speech.status` subscription across consumers, re-reads `speech.get` on every
reconnect, and returns `null` for hosts older than `SPEECH_PROTOCOL_VERSION`, which hides every voice
affordance. `speechActions` wraps the model methods; the host is the only owner of model state.

## Boundary

- Public barrel: `useDictation`, `useSpeechStatus`, `useSpeechSupported`, `speechActions`, `Waveform`,
  `insertDictation`, `formatBytes`.
- Allowed deps: `store` (`toast`, `openSettings`, protocol version, connection generation), `transport`,
  `contracts`, `locales`, `ui`. Consumers: `chat/Composer`, `panels/SpeechSettings`.
- Forbidden: `server`/`shared`; importing a recognizer; persisting audio or transcripts; global translators.

## Open acceptance items

- **Desktop microphone.** The desktop webview is CEF. The current macOS bundle declares no microphone usage
  description or audio-input entitlement and PiDeck configures no CEF media-permission handling, so
  `getUserMedia` there is **unverified** and may be denied. This needs a signed macOS build and a real
  microphone to settle (usage description in the bundle, `com.apple.security.device.audio-input`, CEF
  permission behavior), plus Windows WebView/CEF permission behavior. Browser mode is covered by e2e with a
  fake device only; no real-microphone run was done.
- Compiled CLI binary / desktop bundle must carry the sherpa-onnx WASM resource (see server speech spec).
