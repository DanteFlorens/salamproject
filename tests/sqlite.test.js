import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import {
  closeDatabase,
  getKv,
  health,
  listHouses,
  listKv,
  listMoneyEvents,
  openDatabase,
  putKv,
  putKvBatch,
} from "../db/postgres.mjs";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "salam-pg-"));
const dbFile = path.join(tmpDir, "test.pgmarker");

describe("postgres store", () => {
  it("opens database and reports health", async () => {
    await openDatabase(dbFile);
    const info = await health();
    assert.equal(info.ok, true);
    assert.equal(info.engine, "postgres");
    assert.equal(info.counts.kv, 0);
  });

  it("stores kv keys and projects houses", async () => {
    await putKv("salam-residences-houses", {
      active: "h-demo",
      houses: [
        {
          id: "h-demo",
          name: "Демо дом",
          address: "Тест, 1",
          studios: 8,
          floors: 2,
          perFloor: 4,
          parking: 2,
          mode: "floors",
          kind: "studios",
          serial: 1,
        },
      ],
    });
    const row = await getKv("salam-residences-houses");
    assert.equal(row.value.active, "h-demo");
    const houses = await listHouses();
    assert.ok(houses.some((house) => house.id === "h-salam"));
    const demo = houses.find((house) => house.id === "h-demo");
    assert.equal(demo.name, "Демо дом");
    assert.equal(demo.active, true);
    assert.equal(demo.parking, 2);
  });

  it("projects money events from books", async () => {
    await putKv("salam-residences-books", {
      payments: [{ id: "p1", kind: "payment", stayId: "s1", amount: 50000, at: "2026-10-10", label: "Аренда" }],
      expenses: [{ id: "x1", label: "Уборка", amount: 12000, at: "2026-10-11", houseId: "h-demo" }],
      utilities: [{ id: "util-1", at: "2026-10-12" }],
      reminders: [],
    });
    const events = await listMoneyEvents();
    assert.equal(events.length, 3);
    assert.ok(events.some((event) => event.kind === "payment" && event.amount === 50000));
    assert.ok(events.some((event) => event.kind === "expense" && event.houseId === "h-demo"));
    const info = await health();
    assert.equal(info.counts.kv, 2);
    assert.ok(info.counts.houses >= 2);
    assert.equal(info.counts.money, 3);
  });

  it("batch-writes remaining keys", async () => {
    await putKvBatch({
      "salam-residences-staff": { people: [], accounts: {}, invites: [], sessionId: "" },
      "salam-residences-tasks": { status: {}, created: [], whatsapp: [] },
      "salam-residences-cards": { removed: [], added: [], edits: {} },
    });
    const snapshot = await listKv();
    assert.equal(Object.keys(snapshot.keys).length, 5);
  });

  it("rejects unknown keys", async () => {
    await assert.rejects(() => putKv("nope", {}), /Unknown store key/);
  });
});

after(async () => {
  await closeDatabase();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
