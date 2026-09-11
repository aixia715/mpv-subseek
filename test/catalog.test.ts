import { describe, expect, it } from "vitest";
import { SubtitleCatalog, type SubtitleTools } from "../src/subtitle-catalog.js";

const tools: SubtitleTools = {
  async probe() {
    return [
      { streamIndex: 2, codec: "ass", language: "eng", title: "English" },
      { streamIndex: 3, codec: "hdmv_pgs_subtitle", language: "jpn", title: "Japanese PGS" },
    ];
  },
  async findSidecars() {
    return ["C:\\media\\movie.zh.srt"];
  },
  async readText() {
    throw new Error("not used");
  },
  async extractText() {
    throw new Error("not used");
  },
};

describe("subtitle catalog", () => {
  it("discovers embedded and sidecar text tracks while excluding image subtitles", async () => {
    const catalog = new SubtitleCatalog(tools);

    await expect(catalog.discover("C:\\media\\movie.mkv")).resolves.toEqual([
      {
        id: "embedded-2",
        label: "English · eng · ASS",
        language: "eng",
        format: "ass",
        source: { kind: "embedded", mediaPath: "C:\\media\\movie.mkv", streamIndex: 2 },
      },
      {
        id: "external-1",
        label: "movie.zh.srt",
        format: "srt",
        source: { kind: "external", path: "C:\\media\\movie.zh.srt" },
      },
    ]);
  });
});
