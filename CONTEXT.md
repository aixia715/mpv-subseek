# mpv-subseek context

## Purpose

mpv-subseek is a Windows-first companion for mpv. It presents a complete text-subtitle track as a synchronized, clickable timeline in the user's default browser.

## Domain language

- **Cue**: one timed subtitle item. A cue can contain multiple text lines and is rendered as one clickable card.
- **Track**: one external or embedded text-subtitle stream available for browser display.
- **Timeline**: the ordered normalized cues for the browser-selected track.
- **Active cue**: any cue whose delay-adjusted interval contains mpv's current playback time. Multiple cues may be active.
- **Follow mode**: automatic scrolling that keeps the first active cue visible. Manual scrolling suspends it until the user explicitly resumes.
- **Browser-selected track**: the track displayed by mpv-subseek. It is intentionally independent of mpv's on-video subtitle selection.
- **Companion**: the local Node.js process that launches mpv, communicates over JSON IPC, extracts/parses subtitles, and serves the browser UI.

## MVP decisions

- Target Windows and one mpv session.
- The portable companion uses an existing mpv installation rather than bundling mpv.
- Open media through an executable argument (drag-and-drop, Open With, or terminal).
- Support external and embedded SRT, ASS/SSA, and WebVTT text subtitles.
- Do not OCR PGS, VobSub, or other image subtitle formats.
- Preserve cue line breaks but render plain text without ASS layout/effects.
- Browser track selection does not change mpv's `sid`; loading a new external subtitle from the browser adds and initially selects that file in mpv.
- Apply mpv's `sub-delay` to highlighting and click-to-seek timing.
- Highlight all overlapping active cues and follow the first.
- Browser only controls seeking; playback controls stay in mpv.
- Manual scrolling suspends follow mode; an explicit action resumes it.
- Companion exits when the launched mpv process exits.

## Confirmed test seams

1. **Subtitle timeline interface**: media/track input becomes normalized cues; playback time and subtitle delay produce active cue IDs and seek targets.
2. **mpv control interface**: JSON IPC events become playback state, and application intents become correctly framed mpv commands.
3. **Companion interface**: HTTP/WebSocket clients receive state and can select tracks or request seeks through fake process/extraction adapters.

Browser rendering receives focused lightweight tests through exported browser-state logic; full browser E2E automation is outside the MVP.
