// Test-only harness. Not included in Netlify functions or the frontend bundle.
// Mail and AI integrations are deliberately replaced here, never in production.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { fixtures } from "../tests/helpers";
import { handle } from "../server/api";
const f = await fixtures();
const types: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".jpg": "image/jpeg",
  ".json": "application/json",
};
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", "http://127.0.0.1:8890");
    if (url.pathname === "/__test/reset" && req.method === "POST") {
      await f.reset();
      res.end("{}");
      return;
    }
    if (url.pathname === "/__test/inbox") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(f.mails));
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const part of req) {
        size += part.length;
        if (size > 3000000) {
          res.statusCode = 413;
          res.end();
          return;
        }
        chunks.push(part);
      }
      const request = new Request(url, {
        method: req.method,
        headers: req.headers as HeadersInit,
        body: chunks.length ? Buffer.concat(chunks) : undefined,
      });
      const response = await handle(request, f.s);
      res.statusCode = response.status;
      response.headers.forEach((v, k) => res.setHeader(k, v));
      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    const path = resolve("dist", "." + decodeURIComponent(url.pathname));
    if (path !== resolve("dist") && !path.startsWith(resolve("dist") + "/")) {
      res.statusCode = 403;
      res.end();
      return;
    }
    let bytes: Buffer;
    let extension = extname(path);
    try {
      bytes = await readFile(path);
    } catch {
      if (extension) {
        res.statusCode = 404;
        res.end();
        return;
      }
      bytes = await readFile("dist/index.html");
      extension = ".html";
    }
    res.setHeader(
      "Content-Type",
      types[extension] || "application/octet-stream",
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.end(bytes);
  } catch (e) {
    console.error("Test harness error:", (e as Error).message);
    res.statusCode = 500;
    res.end("test harness error");
  }
});
server.listen(8890, "127.0.0.1", () =>
  console.log("Test harness ready (isolated PostgreSQL, test mail and AI)."),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    server.close();
    void f.pg.close().then(() => process.exit());
  });
