# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Attune: a browser-only guitar tuner PWA. Plain ES modules, no bundler, no runtime or dev dependencies. Node ≥ 18 is only used for the dev server, the build stamp, and tests.

Note: the parent directory's `/home/ali/Workspace/CLAUDE.md` describes an unrelated Rust project (Fallout save editor) — ignore it here.

## Commands

```bash
npm start                                  # builds version.js, serves http://localhost:3000 (PORT env overrides)
npm test                                   # builds version.js, then `node --test` (all *.test.js)
npm run build                              # regenerate version.js only
node --test pitch.test.js                  # single test file (needs version.js to exist for pwa.test.js)
node --test --test-name-pattern="tolerance" # tests matching a name
```

There is no linter or formatter configured.

## Architecture

- `index.html` loads two module entry points: `pwa.js` (install prompt, service worker registration, footer version label) and `app.js` (all tuner UI and audio).
- `app.js` is the only file touching the DOM/Web Audio. It runs a `requestAnimationFrame` loop (`listen`) that samples an `AnalyserNode` roughly every 65 ms, calls `detectPitch`, median-smooths the last 5 readings, picks the target note (auto string / manual string / chromatic), and updates the cents meter. Settings persist to `localStorage` key `attune-settings`.
- Pure, DOM-free logic lives in separate modules so it can be unit-tested under Node:
  - `pitch.js` — `TUNINGS` (MIDI note numbers), note/frequency math with configurable A4, and YIN pitch detection with an RMS quiet-input gate.
  - `confirmation.js` — `TuningConfirmation` state machine for the in-tune chime (600 ms dwell inside tolerance, fires once per note, re-arms only after 700 ms detuned beyond tolerance + 7 cents).
  - `keep-awake.js` — `KeepAwake` wraps the Screen Wake Lock API with injected `wakeLock`/`document`, reacquiring on visibility change and reporting states via `onChange`.
- Microphone analysis is intentionally paused while a reference tone plays and for ~650 ms after the chime (`listenAfter`) to avoid feedback.

## Build stamp, service worker, and deployment

- `scripts/build-version.mjs` writes `version.js` (git-ignored, generated — do not edit) defining `globalThis.ATTUNE_BUILD` with commit (`-dirty` if uncommitted), GMT build time, footer label, and a unique `cacheVersion`.
- `sw.js` `importScripts('./version.js')` so every build produces a new cache `attune:<deployment path>:<cacheVersion>`; activation deletes only older caches with the same path prefix. It serves only its own asset list, cache-first.
- All paths are relative so the app can be deployed under a subpath (e.g. `/at/`) as static files.
- **The list of public assets is duplicated** in `server.js` (`publicFiles`), `sw.js` (`FILES`), and the README's deployment section. When adding or renaming a shipped file, update all three. `pwa.test.js` runs `sw.js` in a `vm` sandbox and checks every cached asset exists on disk.
