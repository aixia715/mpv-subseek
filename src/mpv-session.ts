import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { connect } from "node:net";
import type { MpvTransport } from "./mpv.js";

export interface LaunchedProcess extends EventEmitter {
  readonly pid?: number;
  kill?(signal?: NodeJS.Signals | number): boolean;
}

export interface ProcessLauncher {
  spawn(executable: string, args: string[]): LaunchedProcess;
}

export interface LaunchMpvOptions {
  mpvPath?: string;
  pipeName?: string;
  launcher?: ProcessLauncher;
}

export interface MpvExit {
  code: number | null;
  signal: NodeJS.Signals | null;
}

export interface MpvSession {
  pipeName: string;
  process: LaunchedProcess;
  exit: Promise<MpvExit>;
}

const nodeLauncher: ProcessLauncher = {
  spawn(executable, args) {
    return spawn(executable, args, { stdio: "ignore", windowsHide: false });
  },
};

export function launchMpv(mediaPath: string, options: LaunchMpvOptions = {}): MpvSession {
  if (!mediaPath) throw new Error("A media path is required");
  const pipeName = options.pipeName ?? `\\\\.\\pipe\\mpv-subseek-${randomUUID()}`;
  const mpvPath = options.mpvPath ?? process.env.MPV_PATH ?? "mpv.exe";
  const processHandle = (options.launcher ?? nodeLauncher).spawn(mpvPath, [
    `--input-ipc-server=${pipeName}`,
    "--force-window=yes",
    mediaPath,
  ]);
  const exit = new Promise<MpvExit>((resolve) => {
    processHandle.once("exit", (code: number | null, signal: NodeJS.Signals | null) => resolve({ code, signal }));
  });
  return { pipeName, process: processHandle, exit };
}

export async function connectMpvPipe(
  pipeName: string,
  timeoutMs = 10_000,
  signal?: AbortSignal,
): Promise<MpvTransport> {
  const deadline = Date.now() + timeoutMs;
  let lastError: Error | undefined;

  while (Date.now() < deadline) {
    signal?.throwIfAborted();
    try {
      return await connectOnce(pipeName, signal);
    } catch (error) {
      signal?.throwIfAborted();
      lastError = error instanceof Error ? error : new Error(String(error));
      await delay(100, signal);
    }
  }

  throw new Error(`Could not connect to mpv IPC pipe ${pipeName}: ${lastError?.message ?? "timed out"}`);
}

export function openBrowser(url: string, launcher: ProcessLauncher = nodeLauncher): void {
  if (process.platform === "win32") {
    launcher.spawn("cmd.exe", ["/c", "start", "", url]);
    return;
  }
  launcher.spawn(process.platform === "darwin" ? "open" : "xdg-open", [url]);
}

function connectOnce(pipeName: string, signal?: AbortSignal): Promise<MpvTransport> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const socket = connect(pipeName);
    const cleanup = () => signal?.removeEventListener("abort", onAbort);
    const onAbort = () => {
      socket.destroy();
      reject(signal?.reason);
    };
    const onError = (error: Error) => {
      cleanup();
      socket.destroy();
      reject(error);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    socket.once("error", onError);
    socket.once("connect", () => {
      cleanup();
      socket.off("error", onError);
      resolve(socket);
    });
  });
}

function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    const onAbort = () => {
      clearTimeout(timeout);
      reject(signal?.reason);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
