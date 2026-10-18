import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
import photos from "../src/data/photos.json";
await mkdir("public/photos", { recursive: true });
const report = [];
for (const [name, p] of Object.entries(photos)) {
  const target = "public" + p.local;
  try {
    // curl uses the environment's HTTPS proxy and configured certificate store.
    const bytes = execFileSync(
      "curl",
      [
        "--fail",
        "--silent",
        "--show-error",
        "--location",
        "--max-time",
        "30",
        p.url,
      ],
      { maxBuffer: 8000000 },
    );
    const optimized = await sharp(bytes)
      .rotate()
      .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer();
    await writeFile(target, optimized);
    report.push({
      name,
      status: "downloaded",
      bytes: optimized.length,
      source: p.link,
    });
    console.log(name + ": saved " + optimized.length + " bytes");
  } catch {
    report.push({ name, status: "unavailable", source: p.link });
    console.log(name + ": unavailable (original remote remains as fallback)");
  }
}
await writeFile(
  "docs/photo-verification.json",
  JSON.stringify(
    {
      checked_at: new Date().toISOString(),
      license: "https://unsplash.com/license",
      photos: report,
    },
    null,
    2,
  ) + "\n",
);
if (report.some((p) => p.status === "unavailable")) process.exitCode = 1;
