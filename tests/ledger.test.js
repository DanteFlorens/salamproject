import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SEED_HOUSE_ID,
  booksForUnits,
  contractDaysLeft,
  openFolios,
  rentDue,
  stays,
  unitOf,
  units,
  utilityDue,
  vacancyOf,
} from "../src/domain.js";

describe("ledger books", () => {
  it("scopes october books to selected units", () => {
    const low = units.filter((unit) => unit.floor <= 4 && (unit.houseId || SEED_HOUSE_ID) === SEED_HOUSE_ID);
    const high = units.filter((unit) => unit.floor >= 5 && (unit.houseId || SEED_HOUSE_ID) === SEED_HOUSE_ID);
    const all = booksForUnits(units.filter((unit) => (unit.houseId || SEED_HOUSE_ID) === SEED_HOUSE_ID));
    const lowBooks = booksForUnits(low);
    const highBooks = booksForUnits(high);
    assert.equal(lowBooks.charged + highBooks.charged, all.charged);
    assert.equal(lowBooks.paid + highBooks.paid, all.paid);
    assert.equal(lowBooks.deposit + highBooks.deposit, all.deposit);
    assert.ok(lowBooks.charged > 0);
    assert.ok(highBooks.charged > 0);
  });

  it("keeps open rent due equal to sum of folio debts", () => {
    const open = openFolios();
    const sum = open.reduce((total, row) => total + row.due, 0);
    const manual = stays.reduce((total, stay) => total + rentDue(stay.id), 0);
    assert.equal(sum, manual);
    assert.ok(open.length > 0);
  });

  it("treats vacancy loss as non-debt", () => {
    const unit207 = units.find((unit) => unit.code === "207");
    const stay207 = stays.find((stay) => stay.unitId === unit207.id);
    const gap = vacancyOf(unit207.id);
    assert.equal(gap.days, 10);
    assert.ok(gap.amount > 0);
    assert.equal(rentDue(stay207.id), 0);
  });

  it("separates utility from rent", () => {
    const stay = stays.find((item) => utilityDue(item.id) > 0);
    assert.ok(stay);
    assert.ok(utilityDue(stay.id) > 0);
    assert.ok(Number.isFinite(rentDue(stay.id)));
  });

  it("counts contract days from operational day", () => {
    const ending = stays.find((stay) => {
      const days = contractDaysLeft(stay);
      return days <= 31 && days >= 0;
    });
    assert.ok(ending);
    assert.ok(contractDaysLeft(ending) >= 0);
    assert.ok(unitOf(ending.unitId));
  });
});
