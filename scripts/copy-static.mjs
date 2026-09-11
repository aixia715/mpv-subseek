import { copyFile, mkdir } from "node:fs/promises";

await mkdir("dist/public", { recursive: true });
await Promise.all([
  copyFile("src/public/index.html", "dist/public/index.html"),
  copyFile("src/public/styles.css", "dist/public/styles.css"),
]);
