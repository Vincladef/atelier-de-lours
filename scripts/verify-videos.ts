import { writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { lessons, bonusVideos } from "../src/lib/curriculum";
const exec = promisify(execFile);
const reports = [];
for (const v of [
  ...lessons.map((l) => ({ ...l.video, lesson: l.index })),
  ...bonusVideos,
]) {
  const url =
    "https://www.youtube-nocookie.com/oembed?url=" +
    encodeURIComponent(v.url) +
    "&format=json";
  let result: any = { id: v.id, source: v.url, provided_title: v.title };
  try {
    const r = await exec(
      "curl",
      ["--fail", "--silent", "--show-error", "--max-time", "20", url],
      { maxBuffer: 1000000 },
    );
    const data = JSON.parse(r.stdout);
    result = {
      ...result,
      available: true,
      embeddable: Boolean(data.html?.includes("/embed/")),
      verified_title: data.title,
      author: data.author_name,
    };
  } catch {
    result = {
      ...result,
      available: null,
      embeddable: null,
      verification:
        "Unable to verify from this environment; availability is not inferred.",
    };
  }
  reports.push(result);
  console.log(
    v.id +
      ": " +
      (result.available
        ? "available / " + result.verified_title
        : "verification incomplete; exercise and direct YouTube link remain accessible"),
  );
}
await writeFile(
  "src/data/video-status.json",
  JSON.stringify(
    { checked_at: new Date().toISOString(), videos: reports },
    null,
    2,
  ) + "\n",
);
if (reports.some((v) => !v.available)) process.exitCode = 1;
