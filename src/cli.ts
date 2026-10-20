#!/usr/bin/env node
import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { SubtitleCatalog } from "./subtitle-catalog.js";
import { FfmpegSubtitleTools } from "./ffmpeg-tools.js";
import { MpvController, type MpvTransport } from "./mpv.js";
import { connectMpvPipe, launchMpv, openBrowser } from "./mpv-session.js";
import { CompanionServer } from "./server.js";

async function main(): Promise<void> {
  const arguments_ = parseArguments(process.argv.slice(2));
  if (!arguments_.mediaPath) {
    printUsage();
    process.exitCode = 2;
    return;
  }

  const mediaPath = resolve(arguments_.mediaPath);
  await access(mediaPath);
  const session = launchMpv(mediaPath, { mpvPath: arguments_.mpvPath });
  const startupAbort = new AbortController();
  const launchFailure = new Promise<never>((_, reject) => {
    session.process.once("error", (error) => {
      startupAbort.abort(error);
      reject(error);
    });
  });
  const earlyExit = session.exit.then(({ code, signal }) => {
    const error = new Error(`mpv exited during startup (${signal ?? `code ${code ?? "unknown"}`})`);
    startupAbort.abort(error);
    throw error;
  });
  let transport: MpvTransport | undefined;
  let server: CompanionServer | undefined;
  let stopping: Promise<void> | undefined;
  const stop = (): Promise<void> => {
    stopping ??= (async () => {
      startupAbort.abort(new Error("Companion is stopping"));
      transport?.destroy();
      try {
        await Promise.all([server?.close(), session.stop()]);
      } finally {
        process.off("SIGINT", onSignal);
        process.off("SIGTERM", onSignal);
      }
    })();
    return stopping;
  };
  const onSignal = () => {
    void stop().catch(reportError);
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  void session.exit.then(() => stop()).catch(reportError);

  try {
    const tools = new FfmpegSubtitleTools();
    const catalog = new SubtitleCatalog(tools);
    const [, tracks] = await Promise.race([
      Promise.all([
        connectMpvPipe(session.pipeName, 10_000, startupAbort.signal).then((connected) => {
          transport = connected;
          return connected;
        }),
        catalog.discover(mediaPath, startupAbort.signal),
      ]),
      launchFailure,
      earlyExit,
    ]);
    const mpv = new MpvController(transport!);
    server = new CompanionServer({ tracks, catalog, mpv });

    const address = await Promise.race([server.listen(arguments_.port), earlyExit]);
    const url = `http://127.0.0.1:${address.port}/?token=${encodeURIComponent(address.token)}`;
    console.log(`mpv-subseek: ${url}`);
    openBrowser(url);
  } catch (error) {
    await stop();
    throw error;
  }
}

interface CliArguments {
  mediaPath?: string;
  mpvPath?: string;
  port: number;
}

function parseArguments(args: string[]): CliArguments {
  const parsed: CliArguments = { port: 0 };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--mpv") parsed.mpvPath = args[++index];
    else if (argument.startsWith("--mpv=")) parsed.mpvPath = argument.slice("--mpv=".length);
    else if (argument === "--port") parsed.port = parsePort(args[++index]);
    else if (argument.startsWith("--port=")) parsed.port = parsePort(argument.slice("--port=".length));
    else if (!argument.startsWith("-") && !parsed.mediaPath) parsed.mediaPath = argument;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return parsed;
}

function parsePort(value: string | undefined): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`Invalid port: ${value}`);
  return port;
}

function printUsage(): void {
  console.error("Usage: mpv-subseek [--mpv <executable>] [--port 8765] <media-file>");
}

function reportError(error: unknown): void {
  console.error(`mpv-subseek: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}

main().catch(reportError);
