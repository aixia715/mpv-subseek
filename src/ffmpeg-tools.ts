import { execFile } from "node:child_process";
import { access, readFile, readdir } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { promisify } from "node:util";
import type { ProbedSubtitleStream, SubtitleTools } from "./subtitle-catalog.js";

const execFileAsync = promisify(execFile);
const SIDECAR_EXTENSIONS = new Set([".srt", ".ass", ".ssa", ".vtt"]);

export interface CommandRunner {
  run(executable: string, args: string[], signal?: AbortSignal): Promise<string>;
}

export class FfmpegSubtitleTools implements SubtitleTools {
  constructor(private readonly runner: CommandRunner = new NodeCommandRunner()) {}

  async probe(mediaPath: string, signal?: AbortSignal): Promise<ProbedSubtitleStream[]> {
    const output = await this.runner.run(await resolveHelper("ffprobe"), [
      "-v", "error", "-show_streams", "-of", "json", mediaPath,
    ], signal);
    const parsed = JSON.parse(output) as { streams?: ProbeStream[] };
    return (parsed.streams ?? []).flatMap((stream) => {
      if (stream.codec_type !== "subtitle" || typeof stream.index !== "number" || !stream.codec_name) {
        return [];
      }
      return [{
        streamIndex: stream.index,
        codec: stream.codec_name,
        language: stream.tags?.language,
        title: stream.tags?.title,
      }];
    });
  }

  async findSidecars(mediaPath: string, signal?: AbortSignal): Promise<string[]> {
    signal?.throwIfAborted();
    const directory = dirname(mediaPath);
    const mediaStem = basename(mediaPath, extname(mediaPath)).toLowerCase();
    const entries = await readdir(directory, { withFileTypes: true });
    signal?.throwIfAborted();
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => {
        const extension = extname(name).toLowerCase();
        const subtitleStem = basename(name, extension).toLowerCase();
        return SIDECAR_EXTENSIONS.has(extension)
          && (subtitleStem === mediaStem || subtitleStem.startsWith(`${mediaStem}.`));
      })
      .sort((left, right) => left.localeCompare(right))
      .map((name) => join(directory, name));
  }

  async readText(path: string, signal?: AbortSignal): Promise<string> {
    return (await readFile(path, { encoding: "utf8", signal })).replace(/^\uFEFF/, "");
  }

  async extractText(mediaPath: string, streamIndex: number, signal?: AbortSignal): Promise<string> {
    return this.runner.run(await resolveHelper("ffmpeg"), [
      "-v", "error", "-i", mediaPath, "-map", `0:${streamIndex}`, "-f", "webvtt", "pipe:1",
    ], signal);
  }
}

class NodeCommandRunner implements CommandRunner {
  async run(executable: string, args: string[], signal?: AbortSignal): Promise<string> {
    const { stdout } = await execFileAsync(executable, args, {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      timeout: 120_000,
      killSignal: "SIGKILL",
      signal,
      windowsHide: true,
    });
    return stdout;
  }
}

interface ProbeStream {
  index?: number;
  codec_type?: string;
  codec_name?: string;
  tags?: { language?: string; title?: string };
}

async function resolveHelper(name: "ffmpeg" | "ffprobe"): Promise<string> {
  const executable = process.platform === "win32" ? `${name}.exe` : name;
  const bundled = join(dirname(process.execPath), "ffmpeg", executable);
  try {
    await access(bundled);
    return bundled;
  } catch {
    return executable;
  }
}
