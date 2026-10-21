// Sirve out/ bajo /aos/ como lo haría GitHub Pages (para probar el export estático)
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const ROOT = new URL("../out", import.meta.url).pathname;
const PORT = Number(process.env.PORT || 4000);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

const server = http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent((req.url || "/").split("?")[0]);
    // el sitio vive bajo /aos/
    if (p === "/aos") p = "/aos/";
    if (!p.startsWith("/aos/")) {
      res.writeHead(404).end("no encontrado (el sitio está en /aos/)");
      return;
    }
    let rel = p.slice("/aos".length) || "/";
    if (rel.endsWith("/")) rel += "index.html";
    let file = normalize(join(ROOT, rel));
    if (!file.startsWith(ROOT)) throw new Error("path traversal");
    try {
      const buf = await readFile(file);
      res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
      res.end(buf);
      return;
    } catch {
      // GH Pages-style: /aos/foo → /aos/foo/ → foo/index.html
      try {
        const buf = await readFile(join(file, "index.html"));
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(buf);
        return;
      } catch {
        res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
        res.end("404");
      }
    }
  } catch (e) {
    res.writeHead(500).end(String(e));
  }
});

server.listen(PORT, () => console.log(`export de axcsOS servido en http://localhost:${PORT}/aos/`));
