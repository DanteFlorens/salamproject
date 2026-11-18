import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { mergeStoreValue } from "./merge.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(root, "..");
const dataDir = path.join(projectRoot, "data");
const defaultDbPath = path.join(dataDir, "salam.sqlite");

export const STORE_KEYS = Object.freeze([
  "salam-residences-books",
  "salam-residences-staff",
  "salam-residences-tasks",
  "salam-residences-cards",
  "salam-residences-houses",
]);

const SEED_HOUSE_ID = "h-salam";

let db = null;
let dbPath = defaultDbPath;

function nowIso() {
  return new Date().toISOString();
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function migrate(database) {
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS houses (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      address TEXT NOT NULL DEFAULT '',
      studios INTEGER NOT NULL DEFAULT 0,
      floors INTEGER NOT NULL DEFAULT 0,
      per_floor INTEGER NOT NULL DEFAULT 0,
      parking INTEGER NOT NULL DEFAULT 0,
      mode TEXT NOT NULL DEFAULT 'floors',
      kind TEXT NOT NULL DEFAULT 'studios',
      serial INTEGER NOT NULL DEFAULT 0,
      seed INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 0,
      json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS money_events (
      id TEXT PRIMARY KEY NOT NULL,
      kind TEXT NOT NULL,
      at TEXT NOT NULL,
      amount INTEGER NOT NULL,
      label TEXT NOT NULL DEFAULT '',
      stay_id TEXT,
      house_id TEXT,
      json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_money_at ON money_events(at);
    CREATE INDEX IF NOT EXISTS idx_money_house ON money_events(house_id);
    CREATE INDEX IF NOT EXISTS idx_money_kind ON money_events(kind);
  `);

  const columns = database.prepare("PRAGMA table_info(kv)").all().map((row) => row.name);
  if (!columns.includes("revision")) {
    database.exec("ALTER TABLE kv ADD COLUMN revision INTEGER NOT NULL DEFAULT 1");
  }
}

function parseJson(raw, fallback) {
  try {
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function syncHouses(payload) {
  const active = typeof payload?.active === "string" ? payload.active : SEED_HOUSE_ID;
  const houses = Array.isArray(payload?.houses) ? payload.houses : [];
  const stamp = nowIso();
  const seed = {
    id: SEED_HOUSE_ID,
    name: "Salam Residences",
    address: "Учебный дом, студии 18–35 м²",
    studios: 35,
    floors: 5,
    per_floor: 7,
    parking: 0,
    mode: "floors",
    kind: "studios",
    serial: 0,
    seed: 1,
  };

  const upsert = db.prepare(`
    INSERT INTO houses (
      id, name, address, studios, floors, per_floor, parking, mode, kind, serial, seed, active, json, updated_at
    ) VALUES (
      @id, @name, @address, @studios, @floors, @per_floor, @parking, @mode, @kind, @serial, @seed, @active, @json, @updated_at
    )
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      address = excluded.address,
      studios = excluded.studios,
      floors = excluded.floors,
      per_floor = excluded.per_floor,
      parking = excluded.parking,
      mode = excluded.mode,
      kind = excluded.kind,
      serial = excluded.serial,
      seed = excluded.seed,
      active = excluded.active,
      json = excluded.json,
      updated_at = excluded.updated_at
  `);

  const keep = new Set([SEED_HOUSE_ID]);
  db.prepare("UPDATE houses SET active = 0").run();
  upsert.run({
    id: seed.id,
    name: seed.name,
    address: seed.address,
    studios: seed.studios,
    floors: seed.floors,
    per_floor: seed.per_floor,
    parking: seed.parking,
    mode: seed.mode,
    kind: seed.kind,
    serial: seed.serial,
    seed: 1,
    active: active === SEED_HOUSE_ID ? 1 : 0,
    json: JSON.stringify(seed),
    updated_at: stamp,
  });

  for (const house of houses) {
    if (!house?.id || house.id === SEED_HOUSE_ID) continue;
    keep.add(house.id);
    upsert.run({
      id: String(house.id),
      name: String(house.name || house.id),
      address: String(house.address || ""),
      studios: Number(house.studios) || 0,
      floors: Number(house.floors) || 0,
      per_floor: Number(house.perFloor || house.per_floor) || 0,
      parking: Number(house.parking) || 0,
      mode: String(house.mode || "floors"),
      kind: String(house.kind || "studios"),
      serial: Number(house.serial) || 0,
      seed: house.seed ? 1 : 0,
      active: active === house.id ? 1 : 0,
      json: JSON.stringify(house),
      updated_at: stamp,
    });
  }

  const rows = db.prepare("SELECT id FROM houses").all();
  const remove = db.prepare("DELETE FROM houses WHERE id = ?");
  for (const row of rows) {
    if (!keep.has(row.id)) remove.run(row.id);
  }
}

function syncMoney(payload) {
  const stamp = nowIso();
  const upsert = db.prepare(`
    INSERT INTO money_events (
      id, kind, at, amount, label, stay_id, house_id, json, updated_at
    ) VALUES (
      @id, @kind, @at, @amount, @label, @stay_id, @house_id, @json, @updated_at
    )
    ON CONFLICT(id) DO UPDATE SET
      kind = excluded.kind,
      at = excluded.at,
      amount = excluded.amount,
      label = excluded.label,
      stay_id = excluded.stay_id,
      house_id = excluded.house_id,
      json = excluded.json,
      updated_at = excluded.updated_at
  `);

  const keep = new Set();
  const payments = Array.isArray(payload?.payments) ? payload.payments : [];
  const expenses = Array.isArray(payload?.expenses) ? payload.expenses : [];
  const utilities = Array.isArray(payload?.utilities) ? payload.utilities : [];

  for (const payment of payments) {
    if (!payment?.id) continue;
    keep.add(payment.id);
    upsert.run({
      id: String(payment.id),
      kind: "payment",
      at: String(payment.at || ""),
      amount: Math.round(Number(payment.amount) || 0),
      label: String(payment.label || "Оплата"),
      stay_id: payment.stayId ? String(payment.stayId) : null,
      house_id: payment.houseId ? String(payment.houseId) : null,
      json: JSON.stringify(payment),
      updated_at: stamp,
    });
  }
  for (const expense of expenses) {
    if (!expense?.id) continue;
    keep.add(expense.id);
    upsert.run({
      id: String(expense.id),
      kind: "expense",
      at: String(expense.at || ""),
      amount: Math.round(Number(expense.amount) || 0),
      label: String(expense.label || "Расход"),
      stay_id: null,
      house_id: expense.houseId ? String(expense.houseId) : SEED_HOUSE_ID,
      json: JSON.stringify(expense),
      updated_at: stamp,
    });
  }
  for (const item of utilities) {
    if (!item?.id) continue;
    const id = `util-pay-${item.id}`;
    keep.add(id);
    upsert.run({
      id,
      kind: "utility",
      at: String(item.at || ""),
      amount: 0,
      label: "Коммуналка",
      stay_id: null,
      house_id: null,
      json: JSON.stringify(item),
      updated_at: stamp,
    });
  }

  const rows = db.prepare("SELECT id FROM money_events").all();
  const remove = db.prepare("DELETE FROM money_events WHERE id = ?");
  for (const row of rows) {
    if (!keep.has(row.id)) remove.run(row.id);
  }
}

function syncDerived(key, value) {
  if (key === "salam-residences-houses") syncHouses(value);
  if (key === "salam-residences-books") syncMoney(value);
}

export function openDatabase(filePath = defaultDbPath) {
  if (db && dbPath === filePath) return db;
  if (db) {
    try {
      db.close();
    } catch {
      /* ignore */
    }
  }
  dbPath = filePath;
  if (filePath !== ":memory:") ensureDir(filePath);
  db = new DatabaseSync(filePath);
  migrate(db);
  return db;
}

export function closeDatabase() {
  if (!db) return;
  try {
    db.close();
  } catch {
    /* ignore */
  }
  db = null;
}

export function getDatabasePath() {
  return dbPath;
}

export function listKv() {
  openDatabase(dbPath);
  const rows = db.prepare("SELECT key, value, updated_at, revision FROM kv ORDER BY key").all();
  const keys = {};
  const revisions = {};
  const updated = {};
  for (const row of rows) {
    keys[row.key] = parseJson(row.value, null);
    revisions[row.key] = Number(row.revision) || 1;
    updated[row.key] = row.updated_at;
  }
  return { keys, revisions, updated };
}

export function getKv(key) {
  openDatabase(dbPath);
  const row = db.prepare("SELECT key, value, updated_at, revision FROM kv WHERE key = ?").get(key);
  if (!row) return null;
  return {
    key: row.key,
    value: parseJson(row.value, null),
    updated_at: row.updated_at,
    revision: Number(row.revision) || 1,
  };
}

function writeKvUnlocked(key, value, options = {}) {
  if (!STORE_KEYS.includes(key)) {
    const error = new Error(`Unknown store key: ${key}`);
    error.status = 400;
    throw error;
  }
  const merge = options.merge === true;
  const expected = options.expectedRevision;
  const existing = getKv(key);
  const serverValue = existing?.value ?? null;
  const serverRev = existing?.revision || 0;

  if (expected != null && serverRev !== 0 && Number(expected) !== serverRev) {
    if (!merge) {
      const error = new Error(`Revision conflict for ${key}`);
      error.status = 409;
      error.body = { key, revision: serverRev, value: serverValue };
      throw error;
    }
  }

  const nextValue = merge ? mergeStoreValue(key, serverValue, value) : value;
  const stamp = nowIso();
  const nextRev = serverRev + 1;
  const raw = JSON.stringify(nextValue ?? null);
  db.prepare(`
    INSERT INTO kv (key, value, updated_at, revision) VALUES (?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at,
      revision = excluded.revision
  `).run(key, raw, stamp, nextRev);
  syncDerived(key, nextValue);
  return { key, updated_at: stamp, revision: nextRev, value: nextValue, merged: merge };
}

export function putKv(key, value, options = {}) {
  openDatabase(dbPath);
  db.exec("BEGIN");
  try {
    const saved = writeKvUnlocked(key, value, options);
    db.exec("COMMIT");
    return saved;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function putKvBatch(entries, options = {}) {
  openDatabase(dbPath);
  const result = [];
  const revisions = options.revisions && typeof options.revisions === "object" ? options.revisions : {};
  db.exec("BEGIN");
  try {
    for (const [key, value] of Object.entries(entries || {})) {
      result.push(
        writeKvUnlocked(key, value, {
          merge: options.merge === true,
          expectedRevision: revisions[key],
        }),
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return result;
}

/** Точечная операция: добавить платёж в books без полной перезаписи клиентом. */
export function appendPayment(payment) {
  if (!payment?.id) {
    const error = new Error("payment.id required");
    error.status = 400;
    throw error;
  }
  const amount = Math.round(Number(payment.amount));
  if (!(amount > 0)) {
    const error = new Error("payment.amount must be > 0");
    error.status = 400;
    throw error;
  }
  return putKv(
    "salam-residences-books",
    {
      payments: [{ ...payment, amount }],
      expenses: [],
      utilities: [],
      reminders: [],
    },
    { merge: true },
  );
}

export function appendExpense(expense) {
  if (!expense?.id) {
    const error = new Error("expense.id required");
    error.status = 400;
    throw error;
  }
  const amount = Math.round(Number(expense.amount));
  if (!(amount > 0)) {
    const error = new Error("expense.amount must be > 0");
    error.status = 400;
    throw error;
  }
  const label = String(expense.label || "").trim();
  if (!label) {
    const error = new Error("expense.label required");
    error.status = 400;
    throw error;
  }
  return putKv(
    "salam-residences-books",
    {
      payments: [],
      expenses: [{ ...expense, amount, label }],
      utilities: [],
      reminders: [],
    },
    { merge: true },
  );
}

export function upsertHouseSpec(house, activeId) {
  if (!house?.id) {
    const error = new Error("house.id required");
    error.status = 400;
    throw error;
  }
  return putKv(
    "salam-residences-houses",
    {
      ...(activeId ? { active: String(activeId) } : {}),
      houses: [house],
    },
    { merge: true },
  );
}

export function setActiveHouse(id) {
  if (!id) {
    const error = new Error("house id required");
    error.status = 400;
    throw error;
  }
  // houses: [] + merge сохраняет список сервера, меняет только active.
  return putKv("salam-residences-houses", { active: String(id), houses: [] }, { merge: true });
}

export function listHouses() {
  openDatabase(dbPath);
  return db
    .prepare(
      `SELECT id, name, address, studios, floors, per_floor AS perFloor, parking, mode, kind, serial, seed, active, json, updated_at
       FROM houses ORDER BY seed DESC, serial ASC, name ASC`,
    )
    .all()
    .map((row) => ({
      ...row,
      seed: Boolean(row.seed),
      active: Boolean(row.active),
      spec: parseJson(row.json, {}),
    }));
}

export function listMoneyEvents({ houseId, kind, limit = 200 } = {}) {
  openDatabase(dbPath);
  const clauses = [];
  const params = [];
  if (houseId) {
    clauses.push("house_id = ?");
    params.push(houseId);
  }
  if (kind) {
    clauses.push("kind = ?");
    params.push(kind);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const sql = `
    SELECT id, kind, at, amount, label, stay_id AS stayId, house_id AS houseId, json, updated_at
    FROM money_events
    ${where}
    ORDER BY at DESC, id DESC
    LIMIT ?
  `;
  params.push(Math.max(1, Math.min(1000, Number(limit) || 200)));
  return db
    .prepare(sql)
    .all(...params)
    .map((row) => ({
      ...row,
      payload: parseJson(row.json, {}),
    }));
}

export function health() {
  openDatabase(dbPath);
  const kvCount = db.prepare("SELECT COUNT(*) AS n FROM kv").get().n;
  const houseCount = db.prepare("SELECT COUNT(*) AS n FROM houses").get().n;
  const moneyCount = db.prepare("SELECT COUNT(*) AS n FROM money_events").get().n;
  return {
    ok: true,
    engine: "node:sqlite",
    path: dbPath === ":memory:" ? ":memory:" : path.relative(projectRoot, dbPath).replaceAll("\\", "/"),
    counts: { kv: kvCount, houses: houseCount, money: moneyCount },
    scale: { revisions: true, merge: true, entityOps: true },
  };
}
