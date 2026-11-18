import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = fs.readFileSync(path.join(root, "Salam-Residences.html"), "utf8");
const srcFiles = fs.readdirSync(path.join(root, "src"), { withFileTypes: true });

const report = {
  packedBytes: html.length,
  packedKB: Math.round(html.length / 1024),
  hasReactProduction: html.includes("react.production"),
  hasCreateRoot: html.includes("createRoot"),
  hasInlineStyle: html.includes("<style>"),
  hasInlineModule: /<script type="module">/.test(html),
  externalAssetLinks: (html.match(/href="\/assets\//g) || []).length,
  externalScriptSrc: (html.match(/src="\/assets\//g) || []).length,
  oldMainJsPresent: fs.existsSync(path.join(root, "src", "main.js")),
  entryIsJsx: fs.existsSync(path.join(root, "src", "main.jsx")),
  srcTopLevel: srcFiles.map((f) => f.name),
};

console.log(JSON.stringify(report, null, 2));
