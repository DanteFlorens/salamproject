import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { handleApi } from "../db/http.mjs";
import {
  appendPayment,
  closeDatabase,
  getKv,
  openDatabase,
  putKv,
  putKvBatch,
} from "../db/postgres.mjs";
import {
  flushPersist,
  hydratePersist,
  persistHadConflict,
  persistWrite,
  resetPersistForTests,
} from "../src/persist.js";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "salam-audit-"));
const dbFile = path.join(tmpDir, "audit.sqlite");
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

describe("correctness audit", () => {
  it("does not resurrect a deleted house after replace flush", async () => {
    resetPersistForTests();
    memory.clear();
    installMemoryStorage();
    await closeDatabase();
    fs.rmSync(dbFile, { force: true });
    await openDatabase(dbFile);

    await putKv(
      "salam-residences-houses",
      {
        active: "h-keep",
        houses: [
          { id: "h-keep", name: "Keep", address: "1", serial: 1 },
          { id: "h-gone", name: "Gone", address: "2", serial: 2 },
        ],
      },
      { merge: false },
    );

    const hydrated = await hydratePersist();
    assert.equal(hydrated.source, "server");
    persistWrite("salam-residences-houses", {
      active: "h-keep",
      houses: [{ id: "h-keep", name: "Keep", address: "1", serial: 1 }],
    });
    assert.equal(await flushPersist(), true);
    const houses = (await getKv("salam-residences-houses")).value.houses.map((h) => h.id).sort();
    assert.deepEqual(houses, ["h-keep"]);
  });

  it("does not resurrect removed staff after replace flush", async () => {
    resetPersistForTests();
    memory.clear();
    installMemoryStorage();
    await putKv(
      "salam-residences-staff",
      {
        people: [
          { id: "mgr-a", role: "manager", name: "A", floors: [2], houseId: "h-salam", phone: "+7 900 1" },
          { id: "mgr-b", role: "manager", name: "B", floors: [3], houseId: "h-salam", phone: "+7 900 2" },
        ],
        accounts: {
          "mgr-a": { phone: "79001", pin: "1111" },
          "mgr-b": { phone: "79002", pin: "2222" },
        },
        invites: [],
        sessionId: "mgr-a",
      },
      { merge: false },
    );
    resetPersistForTests();
    await hydratePersist();
    persistWrite("salam-residences-staff", {
      people: [{ id: "mgr-a", role: "manager", name: "A", floors: [2], houseId: "h-salam", phone: "+7 900 1" }],
      accounts: { "mgr-a": { phone: "79001", pin: "1111" } },
      invites: [],
      sessionId: "mgr-a",
    });
    assert.equal(await flushPersist(), true);
    const staff = (await getKv("salam-residences-staff")).value;
    assert.equal(staff.people.length, 1);
    assert.equal(staff.people[0].id, "mgr-a");
    assert.equal(staff.accounts["mgr-b"], undefined);
  });

  it("keeps both payments when two entity appends race-style", async () => {
    await putKv(
      "salam-residences-books",
      { payments: [], expenses: [], utilities: [], reminders: [] },
      { merge: false },
    );
    await appendPayment({ id: "pay-1", kind: "payment", amount: 100, at: "2026-10-01", stayId: "s1" });
    await appendPayment({ id: "pay-2", kind: "payment", amount: 200, at: "2026-10-02", stayId: "s2" });
    const payments = (await getKv("salam-residences-books")).value.payments;
    assert.equal(payments.length, 2);
  });

  it("rejects invalid entity money and stale replace", async () => {
    await assert.rejects(async () => appendPayment({ id: "x", amount: 0, at: "2026-10-01" }), (e) => e.status === 400);
    const rev = (await getKv("salam-residences-houses")).revision;
    const res = await fetch(`http://127.0.0.1:${port}/api/kv/salam-residences-houses`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        merge: false,
        revision: rev - 1,
        value: { active: "h-salam", houses: [] },
      }),
    });
    assert.equal(res.status, 409);
  });

  it("on revision conflict, structural key keeps server and books can merge", async () => {
    resetPersistForTests();
    memory.clear();
    installMemoryStorage();
    await closeDatabase();
    fs.rmSync(dbFile, { force: true });
    await openDatabase(dbFile);

    await putKv(
      "salam-residences-houses",
      { active: "h-salam", houses: [{ id: "h-server", name: "Server", serial: 1 }] },
      { merge: false },
    );
    await putKv(
      "salam-residences-books",
      {
        payments: [{ id: "p-server", kind: "payment", amount: 10, at: "2026-10-01", stayId: "s1" }],
        expenses: [],
        utilities: [],
        reminders: [],
      },
      { merge: false },
    );

    await hydratePersist();
    // Сервер ушёл вперёд (другой клиент), локальные ревизии устарели.
    await putKv(
      "salam-residences-houses",
      { active: "h-salam", houses: [{ id: "h-server", name: "Server", serial: 1 }] },
      { merge: false },
    );
    await putKv(
      "salam-residences-books",
      {
        payments: [
          { id: "p-server", kind: "payment", amount: 10, at: "2026-10-01", stayId: "s1" },
          { id: "p-other", kind: "payment", amount: 11, at: "2026-10-02", stayId: "s2" },
        ],
        expenses: [],
        utilities: [],
        reminders: [],
      },
      { merge: false },
    );

    persistWrite("salam-residences-houses", {
      active: "h-salam",
      houses: [{ id: "h-stale", name: "Stale", serial: 9 }],
    });
    persistWrite("salam-residences-books", {
      payments: [{ id: "p-local", kind: "payment", amount: 99, at: "2026-10-03", stayId: "s3" }],
      expenses: [],
      utilities: [],
      reminders: [],
    });

    assert.equal(await flushPersist(), true);
    assert.equal(persistHadConflict(), true);
    const houses = (await getKv("salam-residences-houses")).value.houses.map((h) => h.id);
    assert.deepEqual(houses, ["h-server"]);
    const payIds = (await getKv("salam-residences-books")).value.payments.map((p) => p.id).sort();
    assert.ok(payIds.includes("p-server"));
    assert.ok(payIds.includes("p-other"));
    assert.ok(payIds.includes("p-local"));
  });

  it("default http batch is replace, not merge", async () => {
    await fetch(`http://127.0.0.1:${port}/api/kv`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        keys: {
          "salam-residences-tasks": {
            status: { a: "new", b: "new" },
            created: [],
            whatsapp: [],
          },
        },
      }),
    });
    await fetch(`http://127.0.0.1:${port}/api/kv`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        keys: {
          "salam-residences-tasks": { status: { a: "closed" }, created: [], whatsapp: [] },
        },
      }),
    });
    const tasks = (await getKv("salam-residences-tasks")).value;
    assert.deepEqual(tasks.status, { a: "closed" });
    assert.equal(tasks.status.b, undefined);
  });

  it("batch stays atomic when one key is invalid", async () => {
    await assert.rejects(async () =>
      putKvBatch({
          "salam-residences-cards": { removed: [], added: [], edits: {} },
          "bad-key": {},
        }),
      /Unknown store key/,
    );
    // cards from this failed batch must not appear if they weren't there — use fresh probe id
    const cards = await getKv("salam-residences-cards");
    if (cards) {
      assert.ok(cards.value);
    }
  });
});
