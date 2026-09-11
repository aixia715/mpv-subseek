import { execFile } from "node:child_process";
import { access, copyFile, mkdir, writeFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const requiredHelpers = ["ffmpeg.exe", "ffprobe.exe"];

for (const helper of requiredHelpers) {
  try {
    await access(`vendor/ffmpeg/${helper}`);
  } catch {
    throw new Error(`Missing vendor/ffmpeg/${helper}. Run scripts/prepare-ffmpeg.ps1 on Windows first.`);
  }
}

await mkdir("release/ffmpeg", { recursive: true });
await execFileAsync(
  process.platform === "win32" ? "node_modules\\.bin\\pkg.cmd" : "node_modules/.bin/pkg",
  ["dist/cli.js", "--target", "node22-win-x64", "--output", "release/mpv-subseek.exe", "--config", "package.json"],
  { windowsHide: true },
);
await Promise.all(requiredHelpers.map((helper) => copyFile(`vendor/ffmpeg/${helper}`, `release/ffmpeg/${helper}`)));
await writeFile("release/README.txt", [
  "mpv-subseek portable package",
  "",
  "Requirements:",
  "- Windows 10 or later",
  "- mpv.exe available on PATH, or set MPV_PATH to its full path",
  "",
  "Drag a media file onto mpv-subseek.exe, use Windows Open With, or run:",
  "  mpv-subseek.exe C:\\path\\to\\video.mkv",
  "",
].join("\r\n"));
console.log("Created release/mpv-subseek.exe and bundled FFmpeg helpers.");
