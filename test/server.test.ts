import { EventEmitter } from "node:events";
import WebSocket from "ws";
import { describe, expect, it, vi } from "vitest";
import { CompanionServer, type MvpCatalog, type MvpMpv } from "../src/server.js";
import type { PlaybackState, SubtitleTrack } from "../src/types.js";

class FakeMpv extends EventEmitter implements MvpMpv {
  playbackState: PlaybackState = { timePosition: 2.5, subtitleDelay: 0.5, paused: false, eof: false };
  seek = vi.fn();
  addSubtitle = vi.fn();
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

  it("loads an uploaded subtitle in the timeline and mpv", async () => {
    const mpv = new FakeMpv();
    const uploadedTrack: SubtitleTrack = {
      id: "uploaded-1",
      label: "lesson.fr.srt",
      format: "srt",
      source: { kind: "external", path: "C:\\Temp\\lesson.fr.srt" },
    };
    const uploadCatalog: MvpCatalog = {
      async load(selectedTrack) {
        return selectedTrack.id === uploadedTrack.id
          ? [{ id: "cue-1", start: 5, end: 7, text: "Bonjour" }]
          : catalog.load(selectedTrack);
      },
    };
    const subtitleFiles = {
      save: vi.fn().mockResolvedValue(uploadedTrack.source.path),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const server = new CompanionServer({ tracks: [track], catalog: uploadCatalog, mpv, subtitleFiles });
    const address = await server.listen(0);
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/?token=${address.token}`, {
      origin: `http://127.0.0.1:${address.port}`,
    });
    await nextMessage(socket);

    socket.send(JSON.stringify({
      type: "load-external-subtitle",
      name: "lesson.fr.srt",
      content: "1\n00:00:05,000 --> 00:00:07,000\nBonjour\n",
    }));
    const snapshot = await nextMessage(socket);

    expect(subtitleFiles.save).toHaveBeenCalledWith(
      "lesson.fr.srt",
      "1\n00:00:05,000 --> 00:00:07,000\nBonjour\n",
    );
    expect(mpv.addSubtitle).toHaveBeenCalledWith("C:\\Temp\\lesson.fr.srt");
    expect(snapshot).toMatchObject({
      type: "snapshot",
      selectedTrackId: "uploaded-1",
      cues: [{ text: "Bonjour" }],
      tracks: [
        { id: "external-1", label: "movie.en.srt" },
        { id: "uploaded-1", label: "lesson.fr.srt" },
      ],
    });

    socket.close();
    await server.close();
    expect(subtitleFiles.close).toHaveBeenCalledOnce();
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
