export interface SubtitleCue {
  id: string;
  start: number;
  end: number;
  text: string;
}

export type SubtitleFormat = "srt" | "ass" | "webvtt";

export interface SubtitleTrack {
  id: string;
  label: string;
  language?: string;
  format: SubtitleFormat;
  source:
    | { kind: "external"; path: string }
    | { kind: "embedded"; mediaPath: string; streamIndex: number };
}

export interface PlaybackState {
  timePosition: number;
  subtitleDelay: number;
  paused: boolean;
  eof: boolean;
}
