import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("data exchange hardening", () => {
  it("dedupes a rapid double rent payment and never throws on a bad stay", async () => {
    globalThis.localStorage = undefined;
    const domain = await import(`../src/domain.js?pay=${Date.now()}`);
    domain.takePersistWarning();
    const stay = domain.stays.find((item) => domain.rentDue(item.id) > 0);
    assert.ok(stay);
    const amount = 1000;
    const at = "2026-10-20";
    const first = domain.recordPayment({ stayId: stay.id, amount, at });
    assert.ok(first.entry);
    assert.equal(first.duplicate, undefined);
    const second = domain.recordPayment({ stayId: stay.id, amount, at });
    assert.equal(second.duplicate, true);
    assert.equal(second.entry.id, first.entry.id);
    const other = domain.recordPayment({ stayId: stay.id, amount: 1500, at });
    assert.ok(other.entry);
    assert.equal(other.duplicate, undefined);
    const missing = domain.recordPayment({ stayId: "s-missing", amount, at });
    assert.equal(missing.error, "Проживание не найдено.");
  });

  it("allows the same amount again after the dedupe window", async () => {
    globalThis.localStorage = undefined;
    const domain = await import(`../src/domain.js?pay2=${Date.now()}`);
    domain.takePersistWarning();
    const stay = domain.stays.find((item) => domain.rentDue(item.id) > 0);
    const amount = 2200;
    const at = "2026-10-19";
    const first = domain.recordPayment({ stayId: stay.id, amount, at });
    assert.ok(first.entry);
    const oldId = first.entry.id;
    const stamp = Number(String(oldId).split("-")[2]);
    first.entry.id = `e-user-${stamp - 20_000}-${0}`;
    const again = domain.recordPayment({ stayId: stay.id, amount, at });
    assert.equal(again.duplicate, undefined);
    assert.notEqual(again.entry.id, first.entry.id);
  });

  it("tags a new card with the houseId from the draft", async () => {
    globalThis.localStorage = undefined;
    const domain = await import(`../src/domain.js?card=${Date.now()}`);
    domain.takePersistWarning();
    const house = domain.createHouse({
      name: "Тест Хаус",
      address: "ул. Тест, 1",
      kind: "house",
      mode: "custom",
      parking: "0",
      levels: [{ floor: 1, rooms: 0, studios: 1, apartments: 0 }],
    });
    assert.ok(house.house);
    const slot = domain.units.find((unit) => unit.houseId === house.house.id && unit.status === "vacant");
    assert.ok(slot);
    const occupied = domain.saveCard(
      {
        code: slot.code,
        floor: "1",
        areaM2: "20",
        monthlyRate: "25000",
        name: "Слот Жилец",
        phone: "+7 900 111-22-33",
        start: "2026-10-01",
        end: "2027-10-01",
        inventory: "Кровать",
        contract: `SR-${slot.code}`,
        unitKind: "studio",
      },
      "",
    );
    assert.equal(occupied.unit.houseId, house.house.id);

    const code = "990011";
    assert.equal(domain.getUnit(code), undefined);
    const saved = domain.saveCard(
      {
        code,
        floor: "1",
        areaM2: "20",
        monthlyRate: "25000",
        name: "Тест Жилец",
        phone: "+7 900 111-22-34",
        start: "2026-10-01",
        end: "2027-10-01",
        inventory: "Кровать",
        contract: "SR-990011",
        unitKind: "studio",
        houseId: house.house.id,
      },
      "",
    );
    assert.ok(saved.unit);
    assert.equal(saved.unit.houseId, house.house.id);
    assert.notEqual(saved.unit.houseId, domain.SEED_HOUSE_ID);
  });

  it("does not keep a stale storage failure after a later successful write", async () => {
    const domain = await import(`../src/domain.js?store=${Date.now()}`);
    domain.takePersistWarning();
    globalThis.localStorage = {
      getItem() {
        return null;
      },
      setItem() {
        throw new Error("quota");
      },
    };
    const stay = domain.stays[0];
    const paid = domain.recordPayment({ stayId: stay.id, amount: 777, at: "2026-10-21" });
    assert.ok(paid.entry);
    assert.match(domain.withPersistNotice("Оплата внесена."), /Не удалось сохранить/);

    globalThis.localStorage = {
      getItem() {
        return null;
      },
      setItem() {},
    };
    const next = domain.recordPayment({ stayId: stay.id, amount: 778, at: "2026-10-22" });
    assert.ok(next.entry);
    assert.equal(domain.withPersistNotice("Оплата внесена."), "Оплата внесена.");
  });
});
