import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { connectMpvPipe, launchMpv, type ProcessLauncher } from "../src/mpv-session.js";

class FakeProcess extends EventEmitter {
  readonly pid = 42;
}

describe("mpv session", () => {
  it("launches mpv with a dedicated Windows IPC pipe and the requested media", () => {
    const child = new FakeProcess();
    const launcher: ProcessLauncher = { spawn: vi.fn().mockReturnValue(child) };

    const session = launchMpv("C:\\Videos\\lesson one.mkv", {
      mpvPath: "C:\\Apps\\mpv.exe",
      pipeName: "\\\\.\\pipe\\mpv-subseek-test",
      launcher,
    });

    expect(launcher.spawn).toHaveBeenCalledWith("C:\\Apps\\mpv.exe", [
      "--input-ipc-server=\\\\.\\pipe\\mpv-subseek-test",
      "--force-window=yes",
      "C:\\Videos\\lesson one.mkv",
    ]);
    expect(session.pipeName).toBe("\\\\.\\pipe\\mpv-subseek-test");
    expect(session.process).toBe(child);
  });

  it("cancels named-pipe connection retries when startup is aborted", async () => {
    const abort = new AbortController();
    const reason = new Error("mpv exited");
    abort.abort(reason);

    await expect(connectMpvPipe("missing-pipe", 10_000, abort.signal)).rejects.toBe(reason);
  });

  it("captures an mpv exit immediately after spawning", async () => {
    const child = new FakeProcess();
    const launcher: ProcessLauncher = { spawn: vi.fn().mockReturnValue(child) };
    const session = launchMpv("C:\\Videos\\lesson.mkv", { launcher });

    child.emit("exit", 0, null);

    await expect(session.exit).resolves.toEqual({ code: 0, signal: null });
  });
});
