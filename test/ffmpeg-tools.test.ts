import { describe, expect, it, vi } from "vitest";
import { FfmpegSubtitleTools } from "../src/ffmpeg-tools.js";

describe("FFmpeg subtitle tools", () => {
  it("discovers subtitle stream metadata through FFprobe", async () => {
    const run = vi.fn().mockResolvedValue(JSON.stringify({
      streams: [
        { index: 2, codec_type: "subtitle", codec_name: "ass", tags: { language: "eng", title: "Signs" } },
        { index: 3, codec_type: "audio", codec_name: "aac" },
      ],
    }));
    const tools = new FfmpegSubtitleTools({ run });
    const abort = new AbortController();

    await expect(tools.probe("C:\\media\\movie.mkv", abort.signal)).resolves.toEqual([
      { streamIndex: 2, codec: "ass", language: "eng", title: "Signs" },
    ]);
    expect(run).toHaveBeenCalledWith("ffprobe", [
      "-v", "error", "-show_streams", "-of", "json", "C:\\media\\movie.mkv",
    ], abort.signal);
  });
});
