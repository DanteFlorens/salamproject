import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { handleApi } from "../db/http.mjs";
import {
  closeDatabase,
  getKv,
  listHouses,
  listMoneyEvents,
  openDatabase,
  putKvBatch,
} from "../db/postgres.mjs";
import {
  STORE_KEYS,
  flushPersist,
  hydratePersist,
  persistFlushError,
  persistPendingCount,
  persistWrite,
  resetPersistForTests,
} from "../src/persist.js";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "salam-persist-"));
const dbFile = path.join(tmpDir, "proof.sqlite");
let server;
let port;
const memory = new Map();

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

describe("persist reliability proof", () => {
  it("migrates local cache into empty postgres and reloads from server", async () => {
    resetPersistForTests();
    memory.clear();
    installMemoryStorage();
    const books = {
      payments: [{ id: "p-proof", kind: "payment", stayId: "s1", amount: 42000, at: "2026-10-15", label: "Аренда" }],
      expenses: [{ id: "x-proof", label: "Двор", amount: 9000, at: "2026-10-16", houseId: "h-salam" }],
      utilities: [],
      reminders: [],
    };
    memory.set("salam-residences-books", JSON.stringify(books));
    memory.set(
      "salam-residences-houses",
      JSON.stringify({ active: "h-salam", houses: [{ id: "h-north", name: "Север", address: "А", serial: 2 }] }),
    );

    const migrated = await hydratePersist();
    assert.equal(migrated.source, "migrated");
    assert.equal((await getKv("salam-residences-books")).value.payments[0].amount, 42000);
    assert.ok((await listHouses()).some((house) => house.id === "h-north"));
    assert.equal((await listMoneyEvents({ kind: "payment" }))[0].amount, 42000);

    memory.clear();
    resetPersistForTests();
    installMemoryStorage();
    const fromServer = await hydratePersist();
    assert.equal(fromServer.source, "server");
    assert.equal(JSON.parse(memory.get("salam-residences-books")).payments[0].id, "p-proof");
  });

  it("keeps newest value when writes arrive during flush", async () => {
    resetPersistForTests();
    memory.clear();
    installMemoryStorage();
    await hydratePersist();

    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    let seenBodies = 0;
    const origin = `http://127.0.0.1:${port}`;
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const href = typeof input === "string" ? input : String(input);
      if (String(href).includes("/api/kv") && init?.method === "PUT") {
        seenBodies += 1;
        if (seenBodies === 1) await gate;
      }
      return realFetch(input, init);
    };

    persistWrite("salam-residences-staff", { people: [], accounts: {}, invites: [], sessionId: "first" });
    const firstFlush = flushPersist();
    persistWrite("salam-residences-staff", { people: [], accounts: {}, invites: [], sessionId: "second" });
    release();
    assert.equal(await firstFlush, true);
    if (persistPendingCount() > 0) assert.equal(await flushPersist(), true);

    assert.equal((await getKv("salam-residences-staff")).value.sessionId, "second");
    assert.equal(persistPendingCount(), 0);
    globalThis.fetch = realFetch;
    void origin;
  });

  it("rolls back atomic batch when one key is invalid", async () => {
    const before = (await listHouses()).length;
    await assert.rejects(async () =>
      putKvBatch({
          "salam-residences-cards": { removed: ["x"], added: [], edits: {} },
          "not-a-real-key": { nope: true },
        }),
      /Unknown store key/,
    );
    assert.equal(await getKv("salam-residences-cards"), null);
    assert.equal((await listHouses()).length, before);
  });

  it("rejects bad json and unknown routes over http", async () => {
    const bad = await fetch(`http://127.0.0.1:${port}/api/kv`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });
    assert.equal(bad.status, 400);
    const missing = await fetch(`http://127.0.0.1:${port}/api/nope`);
    assert.equal(missing.status, 404);
    const health = await fetch(`http://127.0.0.1:${port}/api/health`).then((r) => r.json());
    assert.equal(health.ok, true);
    assert.equal(health.engine, "postgres");
  });

  it("surfaces flush error after server outage without losing local cache", async () => {
    resetPersistForTests();
    memory.clear();
    installMemoryStorage();
    const origin = `http://127.0.0.1:${port}`;
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error("network down");
    };
    persistWrite("salam-residences-tasks", { status: { "t-1": "closed" }, created: [], whatsapp: [] });
    assert.equal(await flushPersist(), false);
    assert.match(persistFlushError(), /network down/);
    assert.equal(JSON.parse(memory.get("salam-residences-tasks")).status["t-1"], "closed");
    assert.ok(persistPendingCount() >= 1);
    globalThis.fetch = realFetch;
    assert.equal(await flushPersist(), true);
    assert.equal((await getKv("salam-residences-tasks")).value.status["t-1"], "closed");
    assert.equal(persistPendingCount(), 0);
    void origin;
    void STORE_KEYS;
  });
});
