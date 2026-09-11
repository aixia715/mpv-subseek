import { randomBytes, timingSafeEqual } from "node:crypto";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, type VerifyClientCallbackSync, type WebSocket } from "ws";
import { createTimeline, type SubtitleTimeline } from "./subtitles.js";
import type { PlaybackState, SubtitleCue, SubtitleTrack } from "./types.js";

export interface MvpCatalog {
  load(track: SubtitleTrack, signal?: AbortSignal): Promise<SubtitleCue[]>;
}

export interface MvpMpv extends EventEmitter {
  readonly playbackState: Readonly<PlaybackState>;
  seek(seconds: number): void;
}

export interface CompanionServerOptions {
  tracks: SubtitleTrack[];
  catalog: MvpCatalog;
  mpv: MvpMpv;
  publicDir?: string;
}

export class CompanionServer {
  private readonly http: Server;
  private readonly sockets: WebSocketServer;
  private readonly publicDir: string;
  private readonly sessionToken = randomBytes(32).toString("base64url");
  private selectedTrackId: string | null = null;
  private timeline: SubtitleTimeline = createTimeline([]);
  private loadGeneration = 0;
  private loadAbort: AbortController | undefined;
  private closed = false;

  constructor(private readonly options: CompanionServerOptions) {
    this.publicDir = options.publicDir ?? join(dirname(fileURLToPath(import.meta.url)), "public");
    this.http = createServer((request, response) => void this.handleHttp(request.url ?? "/", response));
    const verifyClient: VerifyClientCallbackSync = ({ origin, req }) =>
      this.authorizeWebSocket(origin, req.headers.host, req.url);
    this.sockets = new WebSocketServer({ server: this.http, verifyClient });
    this.sockets.on("connection", (socket) => {
      socket.on("message", (data) => void this.handleMessage(socket, data.toString()));
      socket.send(JSON.stringify(this.snapshot()));
    });
    options.mpv.on("state", this.handlePlaybackState);
  }

  async listen(port = 0): Promise<{ port: number; token: string }> {
    if (this.closed) throw new Error("Companion server is closed");
    const firstTrack = this.options.tracks[0];
    try {
      if (firstTrack) await this.selectTrack(firstTrack.id);
    } catch (error) {
      if (this.closed) throw new Error("Companion server was closed during startup", { cause: error });
      throw error;
    }
    if (this.closed) throw new Error("Companion server was closed during startup");
    await new Promise<void>((resolve, reject) => {
      this.http.once("error", reject);
      this.http.listen(port, "127.0.0.1", () => {
        this.http.off("error", reject);
        resolve();
      });
    });
    const address = this.http.address();
    if (!address || typeof address === "string") throw new Error("Companion server did not bind a TCP port");
    return { port: address.port, token: this.sessionToken };
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.loadAbort?.abort(new Error("Companion server is closed"));
    this.options.mpv.off("state", this.handlePlaybackState);
    for (const socket of this.sockets.clients) socket.close();
    if (!this.http.listening) return;
    await new Promise<void>((resolve) => this.sockets.close(() => resolve()));
    await new Promise<void>((resolve, reject) => this.http.close((error) => error ? reject(error) : resolve()));
  }

  private readonly handlePlaybackState = (): void => {
    this.broadcast({
      type: "playback",
      playback: this.options.mpv.playbackState,
      activeCueIds: this.activeCueIds(),
    });
  };

  private snapshot(): object {
    return {
      type: "snapshot",
      tracks: this.options.tracks.map(({ id, label, language, format }) => ({ id, label, language, format })),
      selectedTrackId: this.selectedTrackId,
      cues: this.timeline.cues,
      playback: this.options.mpv.playbackState,
      activeCueIds: this.activeCueIds(),
    };
  }

  private activeCueIds(): string[] {
    const state = this.options.mpv.playbackState;
    return this.timeline.activeCueIds(state.timePosition, state.subtitleDelay);
  }

  private async handleMessage(socket: WebSocket, raw: string): Promise<void> {
    let message: ClientMessage;
    try {
      message = JSON.parse(raw) as ClientMessage;
    } catch {
      socket.send(JSON.stringify({ type: "error", message: "Invalid client message" }));
      return;
    }

    try {
      if (message.type === "seek" && typeof message.cueId === "string") {
        const target = this.timeline.seekTarget(message.cueId, this.options.mpv.playbackState.subtitleDelay);
        this.options.mpv.seek(target);
      } else if (message.type === "select-track" && typeof message.trackId === "string") {
        await this.selectTrack(message.trackId);
      }
    } catch (error) {
      socket.send(JSON.stringify({ type: "error", message: error instanceof Error ? error.message : String(error) }));
    }
  }

  private async selectTrack(trackId: string): Promise<void> {
    const track = this.options.tracks.find((candidate) => candidate.id === trackId);
    if (!track) throw new Error(`Unknown subtitle track: ${trackId}`);
    const generation = ++this.loadGeneration;
    this.loadAbort?.abort(new Error("Subtitle track selection was superseded"));
    const abort = new AbortController();
    this.loadAbort = abort;
    let cues: SubtitleCue[];
    try {
      cues = await this.options.catalog.load(track, abort.signal);
    } catch (error) {
      if (this.closed || generation !== this.loadGeneration) return;
      throw error;
    } finally {
      if (this.loadAbort === abort) this.loadAbort = undefined;
    }
    if (generation !== this.loadGeneration || this.closed) return;
    this.selectedTrackId = trackId;
    this.timeline = createTimeline(cues);
    this.broadcast(this.snapshot());
  }

  private broadcast(message: object): void {
    const encoded = JSON.stringify(message);
    for (const socket of this.sockets.clients) {
      if (socket.readyState === socket.OPEN) socket.send(encoded);
    }
  }

  private authorizeWebSocket(origin: string | undefined, host: string | undefined, requestUrl: string | undefined): boolean {
    if (!origin || !host || origin !== `http://${host}` || !requestUrl) return false;
    const supplied = new URL(requestUrl, origin).searchParams.get("token");
    if (!supplied) return false;
    const actualBytes = Buffer.from(supplied);
    const expectedBytes = Buffer.from(this.sessionToken);
    return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
  }

  private async handleHttp(url: string, response: import("node:http").ServerResponse): Promise<void> {
    const pathname = new URL(url, "http://127.0.0.1").pathname;
    const assets: Readonly<Record<string, [string, string]>> = {
      "/": ["index.html", "text/html; charset=utf-8"],
      "/index.html": ["index.html", "text/html; charset=utf-8"],
      "/app.js": ["app.js", "text/javascript; charset=utf-8"],
      "/follow-state.js": ["follow-state.js", "text/javascript; charset=utf-8"],
      "/styles.css": ["styles.css", "text/css; charset=utf-8"],
    };
    const asset = assets[pathname];
    if (!asset) {
      response.writeHead(404).end("Not found");
      return;
    }
    try {
      const content = await readFile(join(this.publicDir, asset[0]));
      response.writeHead(200, { "content-type": asset[1], "cache-control": "no-store" }).end(content);
    } catch {
      response.writeHead(500).end("Browser assets are unavailable");
    }
  }
}

interface ClientMessage {
  type?: string;
  cueId?: string;
  trackId?: string;
}
