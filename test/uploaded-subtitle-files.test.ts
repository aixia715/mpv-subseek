import { access, readFile } from "node:fs/promises";
import { basename } from "node:path";
import { describe, expect, it } from "vitest";
import { TemporarySubtitleFiles } from "../src/uploaded-subtitle-files.js";

describe("uploaded subtitle files", () => {
  it("stores a safe temporary copy and removes it on close", async () => {
    const files = new TemporarySubtitleFiles();
    const path = await files.save("../untrusted/lesson.fr.srt", "Bonjour");

    expect(basename(path)).toMatch(/^[0-9a-f-]+-lesson[.]fr[.]srt$/);
    await expect(readFile(path, "utf8")).resolves.toBe("Bonjour");

    await files.close();
    await expect(access(path)).rejects.toThrow();
  });
});
