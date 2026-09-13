import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, win32 } from "node:path";

export interface ExternalSubtitleFiles {
  save(filename: string, content: string): Promise<string>;
  close(): Promise<void>;
}

export class TemporarySubtitleFiles implements ExternalSubtitleFiles {
  private directory: Promise<string> | undefined;
  private closed = false;

  async save(filename: string, content: string): Promise<string> {
    if (this.closed) throw new Error("External subtitle storage is closed");
    const safeName = basename(win32.basename(filename));
    if (!safeName || safeName.includes("\0")) throw new Error("Invalid subtitle filename");

    const directory = await this.getDirectory();
    if (this.closed) throw new Error("External subtitle storage is closed");
    const path = join(directory, `${randomUUID()}-${safeName}`);
    await writeFile(path, content, { encoding: "utf8", flag: "wx" });
    return path;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.directory) await rm(await this.directory, { recursive: true, force: true });
  }

  private getDirectory(): Promise<string> {
    this.directory ??= mkdtemp(join(tmpdir(), "mpv-subseek-"));
    return this.directory;
  }
}
