import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { handleApi } from "../db/http.mjs";
import {
  appendExpense,
  appendPayment,
  closeDatabase,
  getKv,
  openDatabase,
  putKv,
  putKvBatch,
  setActiveHouse,
  upsertHouseSpec,
} from "../db/postgres.mjs";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "salam-scale-"));
const dbFile = path.join(tmpDir, "scale.sqlite");
let server;
let port;

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
});

after(async () => {
  await closeDatabase();
  server.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("slight scale: merge + revisions + entity ops", () => {
  it("merges two concurrent book writes without losing payments", async () => {
    await putKv(
      "salam-residences-books",
      {
        payments: [{ id: "p-a", kind: "payment", amount: 1000, at: "2026-10-01", stayId: "s1" }],
        expenses: [],
        utilities: [],
        reminders: [],
      },
      { merge: false },
    );
    await putKvBatch(
      {
        "salam-residences-books": {
          payments: [{ id: "p-b", kind: "payment", amount: 2000, at: "2026-10-02", stayId: "s2" }],
          expenses: [{ id: "x-1", label: "A", amount: 500, at: "2026-10-03", houseId: "h-salam" }],
          utilities: [],
          reminders: [],
        },
      },
      { merge: true },
    );
    const books = (await getKv("salam-residences-books")).value;
    assert.equal(books.payments.length, 2);
    assert.ok(books.payments.some((p) => p.id === "p-a"));
    assert.ok(books.payments.some((p) => p.id === "p-b"));
    assert.equal(books.expenses[0].id, "x-1");
    assert.ok((await getKv("salam-residences-books")).revision >= 2);
  });

  it("rejects stale replace with 409 but allows merge", async () => {
    const rev = (await getKv("salam-residences-books")).revision;
    await assert.rejects(
      async () =>
        putKv(
          "salam-residences-books",
          { payments: [], expenses: [], utilities: [], reminders: [] },
          { merge: false, expectedRevision: rev - 1 },
        ),
      (error) => error.status === 409,
    );
    const saved = await putKv(
      "salam-residences-books",
      {
        payments: [{ id: "p-c", kind: "payment", amount: 3000, at: "2026-10-04", stayId: "s3" }],
        expenses: [],
        utilities: [],
        reminders: [],
      },
      { merge: true, expectedRevision: 1 },
    );
    assert.ok(saved.value.payments.some((p) => p.id === "p-a"));
    assert.ok(saved.value.payments.some((p) => p.id === "p-c"));
  });

  it("entity ops append money and upsert houses", async () => {
    await appendPayment({ id: "p-ops", kind: "payment", amount: 7777, at: "2026-10-05", stayId: "s9" });
    await appendExpense({ id: "x-ops", label: "Ops", amount: 111, at: "2026-10-05", houseId: "h-salam" });
    await upsertHouseSpec({ id: "h-scale", name: "Scale House", address: "1", serial: 8, parking: 1 });
    await setActiveHouse("h-scale");
    const books = (await getKv("salam-residences-books")).value;
    assert.ok(books.payments.some((p) => p.id === "p-ops"));
    assert.ok(books.expenses.some((e) => e.id === "x-ops"));
    const houses = (await getKv("salam-residences-houses")).value;
    assert.equal(houses.active, "h-scale");
    assert.ok(houses.houses.some((h) => h.id === "h-scale"));
  });

  it("exposes scale flags and ops over http", async () => {
    const health = await fetch(`http://127.0.0.1:${port}/api/health`).then((r) => r.json());
    assert.equal(health.scale.revisions, true);
    assert.equal(health.scale.merge, true);
    assert.equal(health.scale.entityOps, true);

    const pay = await fetch(`http://127.0.0.1:${port}/api/ops/payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "p-http", kind: "payment", amount: 42, at: "2026-10-06", stayId: "s1" }),
    }).then((r) => r.json());
    assert.equal(pay.ok, true);
    assert.ok(pay.value.payments.some((p) => p.id === "p-http"));

    const batch = await fetch(`http://127.0.0.1:${port}/api/kv`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        merge: true,
        keys: {
          "salam-residences-tasks": { status: { "t-1": "closed" }, created: [], whatsapp: ["t-1"] },
        },
      }),
    }).then((r) => r.json());
    assert.equal(batch.ok, true);
    assert.ok(batch.revisions["salam-residences-tasks"] >= 1);
  });
});
