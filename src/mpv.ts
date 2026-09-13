import { EventEmitter } from "node:events";
import type { PlaybackState } from "./types.js";

export interface MpvTransport extends EventEmitter {
  write(data: string): void;
  destroy(): void;
}

const OBSERVED_PROPERTIES = ["time-pos", "sub-delay", "pause", "eof-reached"] as const;

export class MpvController extends EventEmitter {
  private buffer = "";
  private state: PlaybackState = {
    timePosition: 0,
    subtitleDelay: 0,
    paused: false,
    eof: false,
  };

  constructor(private readonly transport: MpvTransport) {
    super();
    transport.on("data", (chunk: Buffer | string) => this.receive(chunk.toString()));
    transport.on("close", () => this.emit("close"));
    transport.on("error", (error: Error) => this.emit("transport-error", error));
    OBSERVED_PROPERTIES.forEach((property, index) => {
      this.send(["observe_property", index + 1, property]);
    });
  }

  get playbackState(): Readonly<PlaybackState> {
    return this.state;
  }

  seek(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds < 0) {
      throw new Error(`Invalid seek target: ${seconds}`);
    }
    this.send(["seek", seconds, "absolute+exact"]);
  }

  addSubtitle(path: string): void {
    if (!path) throw new Error("An external subtitle path is required");
    this.send(["sub-add", path, "select"]);
  }

  close(): void {
    this.transport.destroy();
  }

  private send(command: unknown[]): void {
    this.transport.write(`${JSON.stringify({ command })}\n`);
  }

  private receive(chunk: string): void {
    this.buffer += chunk;
    let newline = this.buffer.indexOf("\n");
    while (newline >= 0) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (line) this.receiveLine(line);
      newline = this.buffer.indexOf("\n");
    }
  }

  private receiveLine(line: string): void {
    let message: MpvMessage;
    try {
      message = JSON.parse(line) as MpvMessage;
    } catch {
      this.emit("warning", new Error(`Invalid JSON from mpv: ${line}`));
      return;
    }
    if (message.event !== "property-change" || !message.name) return;

    switch (message.name) {
      case "time-pos":
        if (typeof message.data === "number") this.state = { ...this.state, timePosition: message.data };
        break;
      case "sub-delay":
        if (typeof message.data === "number") this.state = { ...this.state, subtitleDelay: message.data };
        break;
      case "pause":
        if (typeof message.data === "boolean") this.state = { ...this.state, paused: message.data };
        break;
      case "eof-reached":
        if (typeof message.data === "boolean") this.state = { ...this.state, eof: message.data };
        break;
      default:
        return;
    }
    this.emit("state", this.state);
  }
}

interface MpvMessage {
  event?: string;
  name?: string;
  data?: unknown;
}
