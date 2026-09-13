import { basename, extname } from "node:path";
import { win32 } from "node:path";
import { parseSubtitle } from "./subtitles.js";
import type { SubtitleCue, SubtitleFormat, SubtitleTrack } from "./types.js";

export interface ProbedSubtitleStream {
  streamIndex: number;
  codec: string;
  language?: string;
  title?: string;
}

export interface SubtitleTools {
  probe(mediaPath: string, signal?: AbortSignal): Promise<ProbedSubtitleStream[]>;
  findSidecars(mediaPath: string, signal?: AbortSignal): Promise<string[]>;
  readText(path: string, signal?: AbortSignal): Promise<string>;
  extractText(mediaPath: string, streamIndex: number, signal?: AbortSignal): Promise<string>;
}

const CODEC_FORMATS: Readonly<Record<string, SubtitleFormat>> = {
  ass: "ass",
  ssa: "ass",
  subrip: "srt",
  srt: "srt",
  webvtt: "webvtt",
  mov_text: "webvtt",
};

const EXTENSION_FORMATS: Readonly<Record<string, SubtitleFormat>> = {
  ".ass": "ass",
  ".ssa": "ass",
  ".srt": "srt",
  ".vtt": "webvtt",
};

export function subtitleFormatForPath(path: string): SubtitleFormat | undefined {
  return EXTENSION_FORMATS[extname(path).toLowerCase()];
}

export class SubtitleCatalog {
  constructor(private readonly tools: SubtitleTools) {}

  async discover(mediaPath: string, signal?: AbortSignal): Promise<SubtitleTrack[]> {
    const [streams, sidecars] = await Promise.all([
      this.tools.probe(mediaPath, signal),
      this.tools.findSidecars(mediaPath, signal),
    ]);

    const embedded: SubtitleTrack[] = streams.flatMap((stream) => {
      const format = CODEC_FORMATS[stream.codec.toLowerCase()];
      if (!format) return [];
      const descriptors = [stream.title, stream.language, format.toUpperCase()].filter(Boolean);
      return [{
        id: `embedded-${stream.streamIndex}`,
        label: descriptors.join(" · "),
        language: stream.language,
        format,
        source: { kind: "embedded", mediaPath, streamIndex: stream.streamIndex },
      }];
    });

    const external: SubtitleTrack[] = sidecars.flatMap((sidecar, index) => {
      const format = subtitleFormatForPath(sidecar);
      if (!format) return [];
      const label = process.platform === "win32" ? basename(sidecar) : win32.basename(sidecar);
      return [{
        id: `external-${index + 1}`,
        label,
        format,
        source: { kind: "external", path: sidecar },
      }];
    });

    return [...embedded, ...external];
  }

  async load(track: SubtitleTrack, signal?: AbortSignal): Promise<SubtitleCue[]> {
    const content = track.source.kind === "external"
      ? await this.tools.readText(track.source.path, signal)
      : await this.tools.extractText(track.source.mediaPath, track.source.streamIndex, signal);
    const extractedFormat = track.source.kind === "embedded" ? "webvtt" : track.format;
    return parseSubtitle(extractedFormat, content);
  }
}
