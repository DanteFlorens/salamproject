import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { handleApi } from "../db/http.mjs";
import {
  STORE_KEYS as SQLITE_KEYS,
  closeDatabase,
  getKv,
  listHouses,
  listKv,
  listMoneyEvents,
  openDatabase,
  putKv,
} from "../db/postgres.mjs";
import {
  STORE_KEYS as PERSIST_KEYS,
  flushPersist,
  hydratePersist,
  persistWrite,
  resetPersistForTests,
} from "../src/persist.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "salam-coverage-"));
const dbFile = path.join(tmpDir, "coverage.sqlite");
const memory = new Map();
let server;
let port;

function installMemoryStorage() {
  globalThis.localStorage = {
    getItem(key) {
      return memory.has(key) ? memory.get(key) : null;
    },
    setItem(key, value) {
      memory.set(key, String(value));
    },
    removeItem(key) {
      memory.delete(key);
    },
    clear() {
      memory.clear();
    },
  };
}

function domainKeysFromSource() {
  const src = fs.readFileSync(path.join(root, "src", "domain.js"), "utf8");
  const keys = [...src.matchAll(/["'](salam-residences-[a-z]+)["']/g)].map((m) => m[1]);
  return [...new Set(keys)].sort();
}

function fullFixture() {
  return {
    "salam-residences-books": {
      payments: [
        {
          id: "e-user-1",
          kind: "payment",
          stayId: "s-201",
          amount: 55000,
          at: "2026-10-10",
          label: "Оплата",
          houseId: "h-salam",
        },
      ],
      expenses: [{ id: "x-user-1", label: "Клининг", amount: 12000, at: "2026-10-11", houseId: "h-north" }],
      utilities: [{ id: "util-s-201-water", at: "2026-10-12" }],
      reminders: [{ stayId: "s-201", at: "2026-10-13" }],
    },
    "salam-residences-staff": {
      people: [
        {
          id: "mgr-x",
          role: "manager",
          name: "Тест",
          title: "Управляющий",
          floors: [2, 3],
          houseId: "h-north",
          phone: "+7 900 000-00-00",
        },
      ],
      accounts: { "mgr-x": { phone: "79000000000", pin: "1111", registeredAt: "2026-10-01", seed: false } },
      invites: [{ code: "SR-TEST", role: "crew", title: "Мастер", floors: [], fromId: "lead", houseId: "h-north" }],
      sessionId: "mgr-x",
    },
    "salam-residences-tasks": {
      status: { "t-leak": "closed", "t-user-1": "read" },
      created: [
        {
          id: "t-user-1",
          title: "Проверить щиток",
          text: "Искрит автомат",
          fromId: "mgr-x",
          toId: "spark",
          unitCode: "305",
          floor: 3,
        },
      ],
      whatsapp: ["t-user-1"],
    },
    "salam-residences-cards": {
      removed: ["u-gone"],
      added: [
        {
          code: "801",
          floor: 8,
          areaM2: 22,
          monthlyRate: 40000,
          name: "Новый",
          phone: "+7 900 111-11-11",
          start: "2026-10-01",
          end: "2027-10-01",
          inventory: "Стол",
          contract: "SR-801",
          unitKind: "studio",
          houseId: "h-north",
        },
      ],
      edits: {
        "u-201": {
          code: "201",
          floor: 2,
          areaM2: 24,
          monthlyRate: 45000,
          name: "Правка",
          phone: "+7 900 222-22-22",
          start: "2026-01-01",
          end: "2027-01-01",
          inventory: "Диван",
          contract: "SR-201",
          unitKind: "studio",
          houseId: "h-salam",
        },
      },
    },
    "salam-residences-houses": {
      active: "h-north",
      houses: [
        {
          id: "h-north",
          name: "Север",
          address: "ул. Северная, 1",
          studios: 8,
          floors: 2,
          perFloor: 4,
          parking: 3,
          mode: "floors",
          kind: "studios",
          serial: 2,
        },
      ],
    },
  };
}

before(async () => {
  await openDatabase(dbFile);
  server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port || 0}`);
    if (!(await handleApi(req, res, url))) {
      res.writeHead(404);
      res.end("no");
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = server.address().port;
  const origin = `http://127.0.0.1:${port}`;
  const realFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (input, init) => {
    const href = typeof input === "string" ? input : String(input?.url || input);
    if (href.startsWith("/")) return realFetch(origin + href, init);
    return realFetch(input, init);
  };
});

after(async () => {
  resetPersistForTests();
  await closeDatabase();
  server.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("data coverage: old store → postgres", () => {
  it("domain, persist and postgres share the exact same 5 keys", async () => {
    const domainKeys = domainKeysFromSource();
    assert.deepEqual(domainKeys, [...PERSIST_KEYS].sort());
    assert.deepEqual([...PERSIST_KEYS], [...SQLITE_KEYS]);
    assert.deepEqual(domainKeys, [
      "salam-residences-books",
      "salam-residences-cards",
      "salam-residences-houses",
      "salam-residences-staff",
      "salam-residences-tasks",
    ]);
  });

  it("round-trips every persisted field of all 5 keys without loss", async () => {
    resetPersistForTests();
    memory.clear();
    installMemoryStorage();
    const fixture = fullFixture();
    for (const [key, value] of Object.entries(fixture)) {
      memory.set(key, JSON.stringify(value));
    }

    const migrated = await hydratePersist();
    assert.equal(migrated.source, "migrated");

    const snapshot = await listKv();
    assert.deepEqual(Object.keys(snapshot.keys).sort(), Object.keys(fixture).sort());
    for (const key of PERSIST_KEYS) {
      assert.deepEqual(snapshot.keys[key], fixture[key], `loss in ${key}`);
    }

    // Проекции: дома и деньги вытащены; reminders остаются внутри kv JSON.
    const houses = await listHouses();
    assert.ok(houses.some((h) => h.id === "h-salam"));
    assert.ok(houses.some((h) => h.id === "h-north" && h.active && h.parking === 3));
    const money = await listMoneyEvents();
    assert.equal(money.length, 3);
    assert.ok(money.some((e) => e.kind === "payment" && e.amount === 55000));
    assert.ok(money.some((e) => e.kind === "expense" && e.houseId === "h-north"));
    assert.ok(money.some((e) => e.kind === "utility"));
    assert.deepEqual((await getKv("salam-residences-books")).value.reminders, fixture["salam-residences-books"].reminders);
    assert.equal((await getKv("salam-residences-staff")).value.sessionId, "mgr-x");
    assert.equal((await getKv("salam-residences-tasks")).value.created[0].id, "t-user-1");
    assert.equal((await getKv("salam-residences-cards")).value.added[0].code, "801");
  });

  it("uploads local orphan keys when server already has a partial snapshot", async () => {
    resetPersistForTests();
    memory.clear();
    installMemoryStorage();
    await closeDatabase();
    fs.rmSync(dbFile, { force: true });
    await openDatabase(dbFile);
    await putKv("salam-residences-books", {
      payments: [],
      expenses: [],
      utilities: [],
      reminders: [],
    });
    memory.set(
      "salam-residences-staff",
      JSON.stringify({ people: [], accounts: { lead: { phone: "79001112233", pin: "2026" } }, invites: [], sessionId: "lead" }),
    );
    memory.set("salam-residences-tasks", JSON.stringify({ status: { "t-1": "read" }, created: [], whatsapp: [] }));

    const result = await hydratePersist();
    assert.equal(result.source, "server+orphans");
    assert.equal((await getKv("salam-residences-staff")).value.sessionId, "lead");
    assert.equal((await getKv("salam-residences-tasks")).value.status["t-1"], "read");
    assert.ok(await getKv("salam-residences-books"));
  });

  it("keeps live writes for every key in postgres after flush", async () => {
    resetPersistForTests();
    memory.clear();
    installMemoryStorage();
    await closeDatabase();
    fs.rmSync(dbFile, { force: true });
    await openDatabase(dbFile);
    await hydratePersist();
    for (const key of PERSIST_KEYS) {
      persistWrite(key, { probe: key, at: "2026-10-26" });
    }
    assert.equal(await flushPersist(), true);
    for (const key of PERSIST_KEYS) {
      assert.equal((await getKv(key)).value.probe, key);
    }
  });

  it("documents seed fund that never lived in old localStorage and is still code-seed", async () => {
    const domain = fs.readFileSync(path.join(root, "src", "domain.js"), "utf8");
    // Учебный фонд и seed-* сущности собираются в JS, в localStorage их не было.
    assert.match(domain, /seedExpenses/);
    assert.match(domain, /seedTasks/);
    assert.match(domain, /seedPeople/);
    assert.match(domain, /const stays/);
    assert.match(domain, /const units/);
    // В SQLite нет таблиц units/stays/parties/tasks/staff — только kv + houses + money_events.
    const schema = fs.readFileSync(path.join(root, "db", "postgres.mjs"), "utf8");
    assert.match(schema, /CREATE TABLE IF NOT EXISTS kv/);
    assert.match(schema, /CREATE TABLE IF NOT EXISTS houses/);
    assert.match(schema, /CREATE TABLE IF NOT EXISTS money_events/);
    assert.doesNotMatch(schema, /CREATE TABLE IF NOT EXISTS units/);
    assert.doesNotMatch(schema, /CREATE TABLE IF NOT EXISTS stays/);
    assert.doesNotMatch(schema, /CREATE TABLE IF NOT EXISTS tasks/);
    assert.doesNotMatch(schema, /CREATE TABLE IF NOT EXISTS staff/);
  });
});
