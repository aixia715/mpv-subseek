# ADR 0001: Local companion architecture

- Status: Accepted
- Date: 2026-04-12

## Context

The browser must show an entire subtitle track and seek mpv when a cue is clicked. Browsers cannot connect directly to mpv's Windows named-pipe JSON IPC endpoint. mpv's current-subtitle properties expose the currently rendered text, not a complete future cue timeline.

## Decision

Use a local Node.js companion with three deep modules:

1. A subtitle catalog module discovers text tracks and normalizes extracted or external subtitle data into timelines.
2. An mpv control module launches mpv and hides named-pipe JSON framing behind playback-state and command interfaces.
3. An application module serves static browser assets and synchronizes state and intents over WebSocket.

The companion binds HTTP only to `127.0.0.1`. Browser URLs carry an unguessable per-session token, and WebSocket upgrades require both that token and the local page's exact origin. It uses FFprobe for embedded-track discovery and FFmpeg for embedded-text extraction. Packaged builds look for helpers beside the executable first and then on `PATH` during development.

## Consequences

- mpv itself does not need patches or scripts.
- The browser UI remains replaceable without changing subtitle extraction or IPC behavior.
- Portable releases need to include appropriately licensed FFmpeg/FFprobe binaries.
- Image subtitle tracks are discoverable as unsupported but cannot produce cue text without OCR.
- A browser-selected track can differ from mpv's selected on-video subtitle track.
