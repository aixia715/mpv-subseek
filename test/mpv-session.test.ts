import { EventEmitter } from "node:events";
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { connectMpvPipe, launchMpv } from "../src/mpv-session.js";

class FakeProcess extends EventEmitter {
  readonly pid = 42;
  kill = vi.fn(() => true);
}

afterEach(() => vi.unstubAllGlobals());

function platform(value: NodeJS.Platform, mpvPath?: string) {
  vi.stubGlobal("process", { ...process, platform: value, env: { ...process.env, MPV_PATH: mpvPath } });
}

describe("mpv session", () => {
  it("isolates Unix sockets and removes them only after the child closes", async () => {
    platform("linux");
    const child = new FakeProcess();
    const otherChild = new FakeProcess();
    const session = launchMpv("lesson.mkv", { launcher: { spawn: () => child } });
    const other = launchMpv("other.mkv", { launcher: { spawn: () => otherChild } });
    const directory = dirname(session.pipeName);
    try {
      expect(dirname(other.pipeName)).not.toBe(directory);
      expect(statSync(directory).mode & 0o777).toBe(0o700);
      writeFileSync(session.pipeName, "socket placeholder");
      const stopped = session.stop();
      const again = session.stop();
      expect(child.kill).toHaveBeenCalledTimes(1);
      child.emit("exit", 0, null);
      await expect(session.exit).resolves.toEqual({ code: 0, signal: null });
      expect(existsSync(session.pipeName)).toBe(true);
      child.emit("close", 0, null);
      await Promise.all([stopped, again]);
      expect(existsSync(directory)).toBe(false);
      expect(existsSync(dirname(other.pipeName))).toBe(true);
    } finally {
      child.emit("close", 0, null);
      otherChild.emit("close", 0, null);
      await Promise.all([session.stop(), other.stop()]);
    }
  });

  it("cleans up when spawning fails asynchronously without an exit event", async () => {
    platform("linux");
    const session = launchMpv("lesson.mkv", { mpvPath: "/nonexistent/mpv-subseek-test" });
    const directory = dirname(session.pipeName);
    const error = await new Promise<NodeJS.ErrnoException>((resolve) => session.process.once("error", resolve));
    expect(error.code).toBe("ENOENT");
    await session.stop();
    expect(existsSync(directory)).toBe(false);
  });

  it("removes the private directory when a launcher throws synchronously", () => {
    platform("linux");
    let socket = "";
    const failure = new Error("spawn failed");
    expect(() => launchMpv("lesson.mkv", { launcher: { spawn(_executable, args) {
      socket = args[0]!.slice("--input-ipc-server=".length);
      throw failure;
    } } })).toThrow(failure);
    expect(existsSync(dirname(socket))).toBe(false);
  });

  it("does not delete caller-owned IPC paths", async () => {
    platform("linux");
    const child = new FakeProcess();
    const directory = mkdtempSync(join(tmpdir(), "subseek-test-"));
    const socket = join(directory, "custom.sock");
    writeFileSync(socket, "caller-owned");
    try {
      const session = launchMpv("lesson.mkv", { pipeName: socket, launcher: { spawn: () => child } });
      child.emit("close", 0, null);
      await session.stop();
      expect(existsSync(socket)).toBe(true);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("keeps Windows IPC as a named pipe rather than a filesystem socket", async () => {
    platform("win32");
    const child = new FakeProcess();
    const session = launchMpv("C:\\Videos\\lesson.mkv", { launcher: { spawn: () => child } });
    expect(session.pipeName).toMatch(/^\\\\\.\\pipe\\mpv-subseek-/);
    child.emit("close", 0, null);
    await session.stop();
    expect(child.kill).not.toHaveBeenCalled();
  });

  it("cancels IPC connection retries when startup is aborted", async () => {
    const abort = new AbortController();
    const reason = new Error("mpv exited");
    abort.abort(reason);
    await expect(connectMpvPipe("missing-pipe", 10_000, abort.signal)).rejects.toBe(reason);
  });
});
