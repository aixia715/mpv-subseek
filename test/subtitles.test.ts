import { describe, expect, it } from "vitest";
import { createTimeline, parseSubtitle } from "../src/subtitles.js";

describe("subtitle timeline", () => {
  it("normalizes multiline SRT cues into ordered cue cards", () => {
    const cues = parseSubtitle(
      "srt",
      "2\r\n00:00:03,000 --> 00:00:04,500\r\nSecond\r\n\r\n1\r\n00:00:01,250 --> 00:00:02,000\r\nFirst line\r\nSecond line\r\n",
    );

    expect(cues).toEqual([
      { id: "cue-1", start: 1.25, end: 2, text: "First line\nSecond line" },
      { id: "cue-2", start: 3, end: 4.5, text: "Second" },
    ]);
  });

  it("parses WebVTT cue identifiers and ignores positioning settings", () => {
    const cues = parseSubtitle(
      "webvtt",
      "WEBVTT\n\nintro\n00:01.000 --> 00:03.250 align:start position:10%\nHello <b>world</b>\n",
    );

    expect(cues).toEqual([
      { id: "cue-1", start: 1, end: 3.25, text: "Hello world" },
    ]);
  });

  it("parses ASS dialogue while removing override tags and preserving line breaks", () => {
    const cues = parseSubtitle(
      "ass",
      "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:02.10,0:00:04.20,Default,,0,0,0,,{\\an8}Hello, friend\\N{\\i1}Second line{\\i0}\n",
    );

    expect(cues).toEqual([
      { id: "cue-1", start: 2.1, end: 4.2, text: "Hello, friend\nSecond line" },
    ]);
  });

  it("highlights every overlapping cue and applies mpv subtitle delay", () => {
    const timeline = createTimeline([
      { id: "cue-1", start: 1, end: 4, text: "First" },
      { id: "cue-2", start: 2, end: 5, text: "Second" },
    ]);

    expect(timeline.activeCueIds(3.5, 1)).toEqual(["cue-1", "cue-2"]);
    expect(timeline.seekTarget("cue-2", 1)).toBe(3);
  });
});
