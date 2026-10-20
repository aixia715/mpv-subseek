# mpv-subseek

A companion for mpv on Linux and Windows that displays a complete subtitle track in the browser. It highlights the currently active cue, follows playback automatically, and seeks mpv when a cue is clicked.

## MVP features

- External and embedded SRT, ASS/SSA, WebVTT, and compatible text tracks
- Load an additional SRT, ASS/SSA, or WebVTT file from the browser into both the timeline and mpv
- One clickable card per cue, preserving internal line breaks
- All overlapping active cues highlighted
- Automatic follow mode; scrolling suspends it until **Return to current subtitle** is clicked
- Browser-only track selection, independent of the subtitle rendered by mpv
- Delay-aware highlighting and seeking using mpv's current `sub-delay`
- Local-only HTTP/WebSocket server on `127.0.0.1`, protected by a per-session token and same-origin WebSocket checks

Image subtitles such as PGS and VobSub are not supported because they require OCR. ASS positioning, fonts, animation, and styling are removed in the browser timeline.

## Use on Linux

Install Node.js 22 or later, mpv, FFmpeg (including FFprobe), and `xdg-open` (usually provided by `xdg-utils`). Use a graphical desktop session with a default browser configured.

From the project directory:

```bash
npm ci
npm run build
npm start -- /path/to/video.mkv
```

The companion finds `mpv`, `ffmpeg`, and `ffprobe` on `PATH`, launches mpv, and opens the browser through `xdg-open`. To override mpv, use `--mpv /path/to/mpv` or set `MPV_PATH`; the command-line flag takes precedence. If the browser does not open, visit the local URL printed in the terminal.

Linux IPC uses a Unix-domain socket in a private temporary directory. Closing mpv, sending SIGINT/SIGTERM to the companion, or a failed startup removes session resources. SIGKILL or a system crash cannot run cleanup.

Linux currently runs from source; standalone Linux packages and desktop **Open with** integration are not provided. Windows portable packaging remains available below.

## Use on Windows

The portable release expects an existing mpv installation. Either put `mpv.exe` on `PATH` or set its path:

```powershell
$env:MPV_PATH = "C:\Apps\mpv\mpv.exe"
```

Then use one of these workflows:

- Drag a video onto `mpv-subseek.exe`.
- Choose `mpv-subseek.exe` through Windows **Open with**.
- Run `mpv-subseek.exe "C:\Videos\lesson.mkv"`.

The companion launches mpv, opens the default browser, and exits when mpv closes. External sidecar subtitles are discovered when their names are the media stem followed by an optional suffix, for example `lesson.srt`, `lesson.en.srt`, or `lesson.zh.ass`. To use any other subtitle file, click **Load subtitle** in the browser; files up to 5 MB are added to the browser timeline and selected in mpv.

Optional flags:

```text
--mpv <executable>          Override mpv location (before MPV_PATH or PATH)
--port 8765                 Use a fixed browser-server port (default: automatic)
```

## Develop

Requirements: Node.js 22 or later, mpv, FFmpeg, and FFprobe on `PATH`.

```bash
npm install
npm test
npm run typecheck
npm run build
npm run dev -- /path/to/video.mkv
```

`npm run dev` performs a build first so the browser assets are available from `dist/public`.

## Build the portable Windows folder

On Windows:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/prepare-ffmpeg.ps1
npm run package:win
```

The result is written to `release/`:

```text
release/
├── mpv-subseek.exe
├── README.txt
└── ffmpeg/
    ├── ffmpeg.exe
    └── ffprobe.exe
```

The preparation script downloads FFmpeg Essentials from gyan.dev. FFmpeg is separately licensed; review [FFmpeg's legal information](https://ffmpeg.org/legal.html) before distributing the resulting folder.

## Architecture

```text
mpv ── JSON IPC / named pipe (Windows) or Unix socket (Linux) ── companion
                                            ├── FFprobe/FFmpeg subtitle adapter
                                            ├── local HTTP server
                                            └── WebSocket ── browser timeline
```

See [`CONTEXT.md`](CONTEXT.md) for domain language and [`docs/adr/0001-companion-architecture.md`](docs/adr/0001-companion-architecture.md) for the architecture decision.
