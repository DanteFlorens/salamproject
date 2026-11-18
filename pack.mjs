import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, "dist");
const indexPath = path.join(dist, "index.html");

if (!fs.existsSync(indexPath)) {
  console.error("Сначала соберите Vite: dist/index.html не найден.");
  process.exit(1);
}

let html = fs.readFileSync(indexPath, "utf8");

function publicDataUri(fileName, mime) {
  const file = path.join(root, "public", fileName);
  if (!fs.existsSync(file)) return null;
  const base64 = fs.readFileSync(file).toString("base64");
  return `data:${mime};base64,${base64}`;
}

const faviconSvg = publicDataUri("favicon.svg", "image/svg+xml");
const faviconPng = publicDataUri("favicon-32.png", "image/png");
const appleTouch = publicDataUri("apple-touch-icon.png", "image/png");

if (faviconSvg) {
  html = html.replace(/href="\/favicon\.svg"/g, `href="${faviconSvg}"`);
}
if (faviconPng) {
  html = html.replace(/href="\/favicon-32\.png"/g, `href="${faviconPng}"`);
}
if (appleTouch) {
  html = html.replace(/href="\/apple-touch-icon\.png"/g, `href="${appleTouch}"`);
}

html = html.replace(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, (_, href) => {
  const file = path.join(dist, href.replace(/^\//, ""));
  const css = fs.readFileSync(file, "utf8");
  return `<style>\n${css}\n</style>`;
});

html = html.replace(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g, (_, src) => {
  const file = path.join(dist, src.replace(/^\//, ""));
  const code = fs.readFileSync(file, "utf8").replace(/<\/script/gi, "<\\/script");
  return `<script type="module">\n${code}\n</script>`;
});

const out = path.join(root, "Salam-Residences.html");
fs.writeFileSync(out, html);
console.log(out);
