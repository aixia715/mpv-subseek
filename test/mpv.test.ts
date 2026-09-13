import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { MpvController, type MpvTransport } from "../src/mpv.js";

class FakeTransport extends EventEmitter implements MpvTransport {
  writes: string[] = [];
  write(data: string): void {
    this.writes.push(data);
  }
  destroy(): void {}
}

describe("mpv control", () => {
  it("turns property events into playback state and frames exact seek commands", () => {
    const transport = new FakeTransport();
    const controller = new MpvController(transport);
    const states: unknown[] = [];
    controller.on("state", (state) => states.push(state));

    transport.emit("data", Buffer.from(
      '{"event":"property-change","name":"time-pos","data":12.5}\n' +
      '{"event":"property-change","name":"sub-delay","data":0.75}\n',
    ));
    controller.seek(8.25);

    expect(states.at(-1)).toEqual({
      timePosition: 12.5,
      subtitleDelay: 0.75,
      paused: false,
      eof: false,
    });
    expect(JSON.parse(transport.writes.at(-1) ?? "")).toEqual({
      command: ["seek", 8.25, "absolute+exact"],
    });
  });

  it("loads an external subtitle into mpv and selects it", () => {
    const transport = new FakeTransport();
    const controller = new MpvController(transport);

    controller.addSubtitle("C:\\Temp\\lesson.fr.srt");

    expect(JSON.parse(transport.writes.at(-1) ?? "")).toEqual({
      command: ["sub-add", "C:\\Temp\\lesson.fr.srt", "select"],
    });
  });
});
