import type { SubtitleCue, SubtitleFormat } from "./types.js";

export interface SubtitleTimeline {
  readonly cues: readonly SubtitleCue[];
  activeCueIds(playbackTime: number, subtitleDelay: number): string[];
  seekTarget(cueId: string, subtitleDelay: number): number;
}

export function createTimeline(cues: readonly SubtitleCue[]): SubtitleTimeline {
  const ordered = [...cues].sort((left, right) => left.start - right.start || left.end - right.end);
  const byId = new Map(ordered.map((cue) => [cue.id, cue]));

  return {
    cues: ordered,
    activeCueIds(playbackTime, subtitleDelay) {
      return ordered
        .filter((cue) => playbackTime >= cue.start + subtitleDelay && playbackTime < cue.end + subtitleDelay)
        .map((cue) => cue.id);
    },
    seekTarget(cueId, subtitleDelay) {
      const cue = byId.get(cueId);
      if (!cue) throw new Error(`Unknown subtitle cue: ${cueId}`);
      return Math.max(0, cue.start + subtitleDelay);
    },
  };
}

export function parseSubtitle(format: SubtitleFormat, input: string): SubtitleCue[] {
  const normalized = input.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return [];

  const parsed = format === "ass"
    ? parseAss(normalized)
    : normalized
        .split(/\n{2,}/)
        .map((block) => parseTimedTextBlock(block))
        .filter((cue): cue is Omit<SubtitleCue, "id"> => cue !== undefined);

  return parsed
    .sort((left, right) => left.start - right.start || left.end - right.end)
    .map((cue, index) => ({ id: `cue-${index + 1}`, ...cue }));
}

function parseAss(input: string): Array<Omit<SubtitleCue, "id">> {
  let fields = ["layer", "start", "end", "style", "name", "marginl", "marginr", "marginv", "effect", "text"];
  const cues: Array<Omit<SubtitleCue, "id">> = [];
  let inEvents = false;

  for (const line of input.split("\n")) {
    if (line.startsWith("[")) inEvents = line.trim().toLowerCase() === "[events]";
    if (!inEvents) continue;
    if (/^format\s*:/i.test(line)) {
      fields = line.slice(line.indexOf(":") + 1).split(",").map((field) => field.trim().toLowerCase());
      continue;
    }
    if (!/^dialogue\s*:/i.test(line)) continue;

    const values = splitAssFields(line.slice(line.indexOf(":") + 1).trim(), fields.length);
    const start = parseAssTimestamp(values[fields.indexOf("start")] ?? "");
    const end = parseAssTimestamp(values[fields.indexOf("end")] ?? "");
    const rawText = values[fields.indexOf("text")] ?? "";
    const text = rawText
      .replace(/\{[^}]*\}/g, "")
      .replace(/\\[Nn]/g, "\n")
      .replace(/\\h/g, " ")
      .trim();
    if (start !== undefined && end !== undefined && end >= start && text) {
      cues.push({ start, end, text });
    }
  }

  return cues;
}

function splitAssFields(value: string, count: number): string[] {
  const fields: string[] = [];
  let rest = value;
  for (let index = 1; index < count; index += 1) {
    const comma = rest.indexOf(",");
    if (comma < 0) break;
    fields.push(rest.slice(0, comma));
    rest = rest.slice(comma + 1);
  }
  fields.push(rest);
  return fields;
}

function parseAssTimestamp(value: string): number | undefined {
  const match = value.trim().match(/^(\d+):(\d{2}):(\d{2})[.](\d{1,3})$/);
  if (!match) return undefined;
  const fraction = Number(`0.${match[4]}`);
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + fraction;
}

function parseTimedTextBlock(block: string): Omit<SubtitleCue, "id"> | undefined {
  const lines = block.split("\n");
  const timingIndex = lines.findIndex((line) => line.includes("-->"));
  if (timingIndex < 0) return undefined;

  const match = lines[timingIndex].match(/^\s*(\S+)\s*-->\s*(\S+)/);
  if (!match) return undefined;

  const start = parseTimestamp(match[1]);
  const end = parseTimestamp(match[2]);
  const text = stripInlineMarkup(lines.slice(timingIndex + 1).join("\n")).trim();
  if (start === undefined || end === undefined || end < start || !text) return undefined;

  return { start, end, text };
}

function stripInlineMarkup(value: string): string {
  return value
    .replace(/<[^>]*>/g, "")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replaceAll("&nbsp;", " ");
}

function parseTimestamp(value: string): number | undefined {
  const match = value.match(/^(?:(\d+):)?(\d{2}):(\d{2})[,.](\d{3})$/);
  if (!match) return undefined;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const milliseconds = Number(match[4]);
  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
}
