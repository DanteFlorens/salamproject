import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  AS_OF,
  loginStaff,
  logoutStaff,
  markUnremindedUtilityReminders,
  openFolios,
  ownerDailyDigest,
  utilityDebtors,
} from "../src/domain.js";
import { ask } from "../src/ai/index.js";

afterEach(() => {
  logoutStaff();
});

function enterLead() {
  const result = loginStaff({ phone: "+7 900 200-00-01", pin: "2026" });
  assert.ok(result.person, result.error);
  return result.person;
}

describe("owner daily digest", () => {
  it("builds a read-only lead briefing from existing signals", () => {
    const beforeRent = openFolios().map((row) => `${row.stay.id}:${row.due}`).join("|");
    const beforeUtil = utilityDebtors().map((row) => `${row.stay.id}:${row.due}:${row.remindedAt}`).join("|");
    const digest = ownerDailyDigest();
    assert.equal(digest.asOf, AS_OF);
    assert.equal(typeof digest.headline, "string");
    assert.ok(digest.headline.length > 8);
    assert.equal(typeof digest.network.due, "number");
    assert.equal(typeof digest.network.fill, "number");
    assert.ok(Array.isArray(digest.priorities));
    assert.ok(digest.priorities.length <= 5);
    for (const row of digest.priorities) {
      assert.ok(row.houseId);
      assert.ok(row.houseName);
      assert.ok(row.move?.title);
      assert.ok(String(row.move.href || "").startsWith("/"));
    }
    assert.equal(typeof digest.utilities.due, "number");
    assert.equal(typeof digest.utilities.unremindedCount, "number");
    assert.ok(digest.utilities.unremindedCount <= digest.utilities.count);
    assert.equal(typeof digest.renewals.count, "number");
    assert.equal(
      openFolios().map((row) => `${row.stay.id}:${row.due}`).join("|"),
      beforeRent,
    );
    assert.equal(
      utilityDebtors().map((row) => `${row.stay.id}:${row.due}:${row.remindedAt}`).join("|"),
      beforeUtil,
    );
  });

  it("marks only unreminded utility flags and never changes due amounts", () => {
    const beforeDue = utilityDebtors().reduce((sum, row) => sum + row.due, 0);
    const unreminded = utilityDebtors().filter((row) => row.remindedAt !== AS_OF);
    assert.ok(unreminded.length > 0);
    const first = markUnremindedUtilityReminders();
    assert.equal(first.count, unreminded.length);
    assert.equal(
      utilityDebtors().filter((row) => row.remindedAt !== AS_OF).length,
      0,
    );
    assert.equal(
      utilityDebtors().reduce((sum, row) => sum + row.due, 0),
      beforeDue,
    );
    const second = markUnremindedUtilityReminders();
    assert.equal(second.count, 0);
    assert.deepEqual(second.stayIds, []);
  });

  it("answers the digest only for the lead", () => {
    enterLead();
    const result = ask("брифинг");
    assert.equal(result.ok, true);
    assert.equal(result.tool, "owner.digest");
    assert.equal(typeof result.data.headline, "string");
    assert.equal(result.data.asOf, AS_OF);
    assert.equal(typeof result.data.utilities.unremindedCount, "number");
    const today = ask("что сегодня?");
    assert.equal(today.tool, "owner.digest");
    logoutStaff();
    enter("+7 900 200-00-02");
    const hidden = ask("брифинг");
    assert.equal(hidden.code, "unknown");
    assert.equal(hidden.data, null);
    assert.equal(JSON.stringify(hidden).includes("headline"), false);
  });
});

function enter(phone) {
  const result = loginStaff({ phone, pin: "2026" });
  assert.ok(result.person, result.error);
  return result.person;
}
