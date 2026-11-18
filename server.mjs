import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDatabase } from "./db/sqlite.mjs";
import { handleApi } from "./db/http.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
};

function fileFor(urlPath) {
  const rel = decodeURIComponent(urlPath).replace(/^\/+/, "");
  const target = rel === "favicon.svg" ? path.join(root, "public", "favicon.svg") : path.join(root, rel);
  const resolved = path.resolve(target);
  const base = path.resolve(root);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) return null;
  return resolved;
}

openDatabase();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (await handleApi(req, res, url)) return;

  let file = fileFor(url.pathname);
  const isAsset =
    url.pathname.startsWith("/src/") ||
    url.pathname.startsWith("/public/") ||
    url.pathname.startsWith("/assets/") ||
    path.extname(url.pathname);
  if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    if (isAsset) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    const packed = path.join(root, "Salam-Residences.html");
    const distIndex = path.join(root, "dist", "index.html");
    file = fs.existsSync(packed) ? packed : fs.existsSync(distIndex) ? distIndex : path.join(root, "index.html");
  }
  res.writeHead(200, {
    "Content-Type": types[path.extname(file)] ?? "application/octet-stream",
    "Cache-Control": "no-cache",
  });
  fs.createReadStream(file).pipe(res);
});

const port = Number(process.env.PORT) || 5173;
const host = process.env.HOST || "127.0.0.1";
server.listen(port, host, () => {
  console.log(`Salam Residences: http://${host}:${port}`);
  console.log("SQLite API: /api/health /api/kv /api/houses /api/money");
});
