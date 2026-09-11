import { EventEmitter } from "node:events";
import WebSocket from "ws";
import { describe, expect, it, vi } from "vitest";
import { CompanionServer, type MvpCatalog, type MvpMpv } from "../src/server.js";
import type { PlaybackState, SubtitleTrack } from "../src/types.js";

class FakeMpv extends EventEmitter implements MvpMpv {
  playbackState: PlaybackState = { timePosition: 2.5, subtitleDelay: 0.5, paused: false, eof: false };
  seek = vi.fn();
}

const track: SubtitleTrack = {
  id: "external-1",
  label: "movie.en.srt",
  format: "srt",
  source: { kind: "external", path: "C:\\media\\movie.en.srt" },
};

const catalog: MvpCatalog = {
  async load() {
    return [{ id: "cue-1", start: 2, end: 4, text: "Hello" }];
  },
};

describe("companion server", () => {
  it("sends an initial synchronized timeline and handles cue seeking", async () => {
    const mpv = new FakeMpv();
    const server = new CompanionServer({ tracks: [track], catalog, mpv });
    const address = await server.listen(0);
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/?token=${address.token}`, {
      origin: `http://127.0.0.1:${address.port}`,
    });
    const snapshot = await nextMessage(socket);

    expect(snapshot).toMatchObject({
      type: "snapshot",
      selectedTrackId: "external-1",
      cues: [{ id: "cue-1", start: 2, end: 4, text: "Hello" }],
      activeCueIds: ["cue-1"],
    });
    expect(snapshot.tracks).toEqual([
      { id: "external-1", label: "movie.en.srt", format: "srt" },
    ]);

    socket.send(JSON.stringify({ type: "seek", cueId: "cue-1" }));
    await vi.waitFor(() => expect(mpv.seek).toHaveBeenCalledWith(2.5));
    socket.close();
    await server.close();
  });

  it("cancels initial track loading and does not bind when closed", async () => {
    const mpv = new FakeMpv();
    let receivedSignal: AbortSignal | undefined;
    const slowCatalog: MvpCatalog = {
      load(_track, signal) {
        receivedSignal = signal;
        return new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
        });
      },
    };
    const server = new CompanionServer({ tracks: [track], catalog: slowCatalog, mpv });

    const listening = server.listen(0);
    await server.close();

    expect(receivedSignal?.aborted).toBe(true);
    await expect(listening).rejects.toThrow("closed");
  });

  it("rejects cross-origin WebSocket clients without the session token", async () => {
    const mpv = new FakeMpv();
    const server = new CompanionServer({ tracks: [track], catalog, mpv });
    const address = await server.listen(0);
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}`, {
      origin: "https://hostile.example",
    });

    await expect(rejectedUpgrade(socket)).resolves.toBe(401);
    await server.close();
  });
});

function nextMessage(socket: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    socket.once("message", (data) => resolve(JSON.parse(data.toString())));
    socket.once("error", reject);
  });
}

function rejectedUpgrade(socket: WebSocket): Promise<number> {
  return new Promise((resolve, reject) => {
    socket.once("unexpected-response", (_request, response) => resolve(response.statusCode ?? 0));
    socket.once("open", () => reject(new Error("Unauthorized WebSocket was accepted")));
    socket.once("error", () => undefined);
  });
}
