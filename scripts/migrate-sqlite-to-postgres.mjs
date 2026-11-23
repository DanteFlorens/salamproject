/**
 * One-shot: copy kv (+ derived projections) from legacy data/salam.sqlite into Postgres.
 * Usage: node scripts/migrate-sqlite-to-postgres.mjs [path/to/salam.sqlite]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { closeDatabase, openDatabase, putKv, STORE_KEYS, health } from "../db/postgres.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.resolve(process.argv[2] || path.join(root, "data", "salam.sqlite"));

if (!fs.existsSync(source)) {
  console.error(`SQLite file not found: ${source}`);
  process.exit(1);
}

const sqlite = new DatabaseSync(source, { readOnly: true });
const rows = sqlite.prepare("SELECT key, value FROM kv").all();
sqlite.close();

await openDatabase();
let copied = 0;
for (const row of rows) {
  if (!STORE_KEYS.includes(row.key)) {
    console.warn(`skip unknown key: ${row.key}`);
    continue;
  }
  let value = null;
  try {
    value = JSON.parse(row.value);
  } catch {
    console.warn(`skip bad json: ${row.key}`);
    continue;
  }
  await putKv(row.key, value, { merge: false });
  copied += 1;
  console.log(`copied ${row.key}`);
}

console.log(JSON.stringify(await health(), null, 2));
console.log(`done: ${copied} keys from ${source}`);
await closeDatabase();
