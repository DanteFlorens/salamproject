import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { mergeStoreValue } from "./merge.mjs";

const { Pool } = pg;

const root = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(root, "..");

export const STORE_KEYS = Object.freeze([
  "salam-residences-books",
  "salam-residences-staff",
  "salam-residences-tasks",
  "salam-residences-cards",
  "salam-residences-houses",
]);

const SEED_HOUSE_ID = "h-salam";
const DEFAULT_URL = process.env.DATABASE_URL || "postgresql://salam:salam@127.0.0.1:5432/salam";

let pool = null;
let active = {
  url: DEFAULT_URL,
  schema: "public",
  target: DEFAULT_URL,
  ephemeral: false,
};

function nowIso() {
  return new Date().toISOString();
}

function quoteIdent(name) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) {
    throw new Error(`Invalid SQL identifier: ${name}`);
  }
  return `"${name}"`;
}

function resolveTarget(target = DEFAULT_URL) {
  const raw = target == null || target === "" ? DEFAULT_URL : String(target);
  if (raw === ":memory:" || raw.startsWith("postgres://") || raw.startsWith("postgresql://")) {
    return {
      url: raw === ":memory:" ? DEFAULT_URL : raw,
      schema: raw === ":memory:" ? `mem_${crypto.randomBytes(6).toString("hex")}` : "public",
      target: raw,
      ephemeral: raw === ":memory:",
      fresh: raw === ":memory:",
    };
  }
  // Legacy sqlite file path → isolated schema; deleting the marker file resets data.
  const abs = path.resolve(raw);
  const schema = `t_${crypto.createHash("sha1").update(abs).digest("hex").slice(0, 12)}`;
  const fresh = !fs.existsSync(abs);
  return { url: DEFAULT_URL, schema, target: abs, ephemeral: true, fresh };
}

function parseJson(raw, fallback) {
  if (raw == null) return fallback;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function migrate(client, schema) {
  await client.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(schema)}`);
  await client.query(`SET search_path TO ${quoteIdent(schema)}, public`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY NOT NULL,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
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
      seed BOOLEAN NOT NULL DEFAULT FALSE,
      active BOOLEAN NOT NULL DEFAULT FALSE,
      json JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS money_events (
      id TEXT PRIMARY KEY NOT NULL,
      kind TEXT NOT NULL,
      at TEXT NOT NULL,
      amount INTEGER NOT NULL,
      label TEXT NOT NULL DEFAULT '',
      stay_id TEXT,
      house_id TEXT,
      json JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_money_at ON money_events(at);
    CREATE INDEX IF NOT EXISTS idx_money_house ON money_events(house_id);
    CREATE INDEX IF NOT EXISTS idx_money_kind ON money_events(kind);
  `);
}

async function withClient(fn) {
  if (!pool) await openDatabase(active.target);
  const client = await pool.connect();
  try {
    await client.query(`SET search_path TO ${quoteIdent(active.schema)}, public`);
    return await fn(client);
  } finally {
    client.release();
  }
}

async function withTransaction(fn) {
  return withClient(async (client) => {
    await client.query("BEGIN");
    try {
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
      throw error;
    }
  });
}

async function syncHouses(client, payload) {
  const activeId = typeof payload?.active === "string" ? payload.active : SEED_HOUSE_ID;
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
    seed: true,
  };

  const upsert = `
    INSERT INTO houses (
      id, name, address, studios, floors, per_floor, parking, mode, kind, serial, seed, active, json, updated_at
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      address = EXCLUDED.address,
      studios = EXCLUDED.studios,
      floors = EXCLUDED.floors,
      per_floor = EXCLUDED.per_floor,
      parking = EXCLUDED.parking,
      mode = EXCLUDED.mode,
      kind = EXCLUDED.kind,
      serial = EXCLUDED.serial,
      seed = EXCLUDED.seed,
      active = EXCLUDED.active,
      json = EXCLUDED.json,
      updated_at = EXCLUDED.updated_at
  `;

  const keep = new Set([SEED_HOUSE_ID]);
  await client.query("UPDATE houses SET active = FALSE");
  await client.query(upsert, [
    seed.id,
    seed.name,
    seed.address,
    seed.studios,
    seed.floors,
    seed.per_floor,
    seed.parking,
    seed.mode,
    seed.kind,
    seed.serial,
    true,
    activeId === SEED_HOUSE_ID,
    JSON.stringify(seed),
    stamp,
  ]);

  for (const house of houses) {
    if (!house?.id || house.id === SEED_HOUSE_ID) continue;
    keep.add(house.id);
    await client.query(upsert, [
      String(house.id),
      String(house.name || house.id),
      String(house.address || ""),
      Number(house.studios) || 0,
      Number(house.floors) || 0,
      Number(house.perFloor || house.per_floor) || 0,
      Number(house.parking) || 0,
      String(house.mode || "floors"),
      String(house.kind || "studios"),
      Number(house.serial) || 0,
      Boolean(house.seed),
      activeId === house.id,
      JSON.stringify(house),
      stamp,
    ]);
  }

  const { rows } = await client.query("SELECT id FROM houses");
  for (const row of rows) {
    if (!keep.has(row.id)) {
      await client.query("DELETE FROM houses WHERE id = $1", [row.id]);
    }
  }
}

async function syncMoney(client, payload) {
  const stamp = nowIso();
  const upsert = `
    INSERT INTO money_events (
      id, kind, at, amount, label, stay_id, house_id, json, updated_at
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9
    )
    ON CONFLICT (id) DO UPDATE SET
      kind = EXCLUDED.kind,
      at = EXCLUDED.at,
      amount = EXCLUDED.amount,
      label = EXCLUDED.label,
      stay_id = EXCLUDED.stay_id,
      house_id = EXCLUDED.house_id,
      json = EXCLUDED.json,
      updated_at = EXCLUDED.updated_at
  `;

  const keep = new Set();
  const payments = Array.isArray(payload?.payments) ? payload.payments : [];
  const expenses = Array.isArray(payload?.expenses) ? payload.expenses : [];
  const utilities = Array.isArray(payload?.utilities) ? payload.utilities : [];

  for (const payment of payments) {
    if (!payment?.id) continue;
    keep.add(payment.id);
    await client.query(upsert, [
      String(payment.id),
      "payment",
      String(payment.at || ""),
      Math.round(Number(payment.amount) || 0),
      String(payment.label || "Оплата"),
      payment.stayId ? String(payment.stayId) : null,
      payment.houseId ? String(payment.houseId) : null,
      JSON.stringify(payment),
      stamp,
    ]);
  }
  for (const expense of expenses) {
    if (!expense?.id) continue;
    keep.add(expense.id);
    await client.query(upsert, [
      String(expense.id),
      "expense",
      String(expense.at || ""),
      Math.round(Number(expense.amount) || 0),
      String(expense.label || "Расход"),
      null,
      expense.houseId ? String(expense.houseId) : SEED_HOUSE_ID,
      JSON.stringify(expense),
      stamp,
    ]);
  }
  for (const item of utilities) {
    if (!item?.id) continue;
    const id = `util-pay-${item.id}`;
    keep.add(id);
    await client.query(upsert, [
      id,
      "utility",
      String(item.at || ""),
      0,
      "Коммуналка",
      null,
      null,
      JSON.stringify(item),
      stamp,
    ]);
  }

  const { rows } = await client.query("SELECT id FROM money_events");
  for (const row of rows) {
    if (!keep.has(row.id)) {
      await client.query("DELETE FROM money_events WHERE id = $1", [row.id]);
    }
  }
}

async function syncDerived(client, key, value) {
  if (key === "salam-residences-houses") await syncHouses(client, value);
  if (key === "salam-residences-books") await syncMoney(client, value);
}

export async function openDatabase(target = DEFAULT_URL) {
  const resolved = resolveTarget(target);
  const same =
    pool &&
    active.url === resolved.url &&
    active.schema === resolved.schema &&
    active.target === resolved.target;

  if (same && !resolved.fresh) return pool;

  if (pool) {
    await closeDatabase();
  }

  active = {
    url: resolved.url,
    schema: resolved.schema,
    target: resolved.target,
    ephemeral: resolved.ephemeral,
  };

  pool = new Pool({ connectionString: resolved.url, max: 8 });
  const client = await pool.connect();
  try {
    if (resolved.fresh && resolved.schema !== "public") {
      await client.query(`DROP SCHEMA IF EXISTS ${quoteIdent(resolved.schema)} CASCADE`);
    }
    await migrate(client, resolved.schema);
    if (resolved.ephemeral && resolved.fresh && resolved.target !== ":memory:") {
      fs.mkdirSync(path.dirname(resolved.target), { recursive: true });
      fs.writeFileSync(resolved.target, `postgres-schema:${resolved.schema}\n`, "utf8");
    }
  } finally {
    client.release();
  }
  return pool;
}

export async function closeDatabase() {
  if (!pool) return;
  try {
    await pool.end();
  } catch {
    /* ignore */
  }
  pool = null;
}

export function getDatabasePath() {
  return active.ephemeral ? active.target : active.url;
}

export function getDatabaseSchema() {
  return active.schema;
}

export async function listKv() {
  return withClient(async (client) => {
    const { rows } = await client.query(
      "SELECT key, value, updated_at, revision FROM kv ORDER BY key",
    );
    const keys = {};
    const revisions = {};
    const updated = {};
    for (const row of rows) {
      keys[row.key] = parseJson(row.value, null);
      revisions[row.key] = Number(row.revision) || 1;
      updated[row.key] = row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at);
    }
    return { keys, revisions, updated };
  });
}

export async function getKv(key) {
  return withClient(async (client) => {
    const { rows } = await client.query(
      "SELECT key, value, updated_at, revision FROM kv WHERE key = $1",
      [key],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      key: row.key,
      value: parseJson(row.value, null),
      updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
      revision: Number(row.revision) || 1,
    };
  });
}

async function getKvOn(client, key) {
  const { rows } = await client.query(
    "SELECT key, value, updated_at, revision FROM kv WHERE key = $1",
    [key],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    key: row.key,
    value: parseJson(row.value, null),
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    revision: Number(row.revision) || 1,
  };
}

async function writeKvUnlocked(client, key, value, options = {}) {
  if (!STORE_KEYS.includes(key)) {
    const error = new Error(`Unknown store key: ${key}`);
    error.status = 400;
    throw error;
  }
  const merge = options.merge === true;
  const expected = options.expectedRevision;
  const existing = await getKvOn(client, key);
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
  await client.query(
    `
    INSERT INTO kv (key, value, updated_at, revision) VALUES ($1, $2::jsonb, $3, $4)
    ON CONFLICT (key) DO UPDATE SET
      value = EXCLUDED.value,
      updated_at = EXCLUDED.updated_at,
      revision = EXCLUDED.revision
  `,
    [key, JSON.stringify(nextValue ?? null), stamp, nextRev],
  );
  await syncDerived(client, key, nextValue);
  return { key, updated_at: stamp, revision: nextRev, value: nextValue, merged: merge };
}

export async function putKv(key, value, options = {}) {
  return withTransaction((client) => writeKvUnlocked(client, key, value, options));
}

export async function putKvBatch(entries, options = {}) {
  const revisions = options.revisions && typeof options.revisions === "object" ? options.revisions : {};
  return withTransaction(async (client) => {
    const result = [];
    for (const [key, value] of Object.entries(entries || {})) {
      result.push(
        await writeKvUnlocked(client, key, value, {
          merge: options.merge === true,
          expectedRevision: revisions[key],
        }),
      );
    }
    return result;
  });
}

export async function appendPayment(payment) {
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

export async function appendExpense(expense) {
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

export async function upsertHouseSpec(house, activeId) {
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

export async function setActiveHouse(id) {
  if (!id) {
    const error = new Error("house id required");
    error.status = 400;
    throw error;
  }
  return putKv("salam-residences-houses", { active: String(id), houses: [] }, { merge: true });
}

export async function listHouses() {
  return withClient(async (client) => {
    const { rows } = await client.query(
      `SELECT id, name, address, studios, floors, per_floor AS "perFloor", parking, mode, kind, serial, seed, active, json, updated_at
       FROM houses ORDER BY seed DESC, serial ASC, name ASC`,
    );
    return rows.map((row) => ({
      ...row,
      seed: Boolean(row.seed),
      active: Boolean(row.active),
      updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
      spec: parseJson(row.json, {}),
    }));
  });
}

export async function listMoneyEvents({ houseId, kind, limit = 200 } = {}) {
  return withClient(async (client) => {
    const clauses = [];
    const params = [];
    if (houseId) {
      params.push(houseId);
      clauses.push(`house_id = $${params.length}`);
    }
    if (kind) {
      params.push(kind);
      clauses.push(`kind = $${params.length}`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    params.push(Math.max(1, Math.min(1000, Number(limit) || 200)));
    const { rows } = await client.query(
      `
      SELECT id, kind, at, amount, label, stay_id AS "stayId", house_id AS "houseId", json, updated_at
      FROM money_events
      ${where}
      ORDER BY at DESC, id DESC
      LIMIT $${params.length}
    `,
      params,
    );
    return rows.map((row) => ({
      ...row,
      updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
      payload: parseJson(row.json, {}),
    }));
  });
}

export async function health() {
  return withClient(async (client) => {
    const kvCount = Number((await client.query("SELECT COUNT(*)::int AS n FROM kv")).rows[0].n);
    const houseCount = Number((await client.query("SELECT COUNT(*)::int AS n FROM houses")).rows[0].n);
    const moneyCount = Number((await client.query("SELECT COUNT(*)::int AS n FROM money_events")).rows[0].n);
    return {
      ok: true,
      engine: "postgres",
      path:
        active.ephemeral && active.target !== ":memory:"
          ? path.relative(projectRoot, active.target).replaceAll("\\", "/")
          : active.url.replace(/:[^:@/]+@/, ":****@"),
      schema: active.schema,
      counts: { kv: kvCount, houses: houseCount, money: moneyCount },
      scale: { revisions: true, merge: true, entityOps: true },
    };
  });
}
