import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { SEED_HOUSE_ID, getParty, loginStaff, logoutStaff, personById, units } from "../src/domain.js";
import { unitsInScope } from "../src/app/access.js";
import { ask, createKernel, listTools } from "../src/ai/index.js";
import { rulesPlan } from "../src/ai/plan.js";

const FAIL = "Не получилось посчитать.";

afterEach(() => {
  logoutStaff();
});

function enter(phone) {
  const result = loginStaff({ phone, pin: "2026" });
  assert.ok(result.person, result.error);
  return result.person;
}

describe("ai kernel", () => {
  it("refuses a guest and a blank phrase before any tool runs", () => {
    logoutStaff();
    let ran = false;
    const kernel = createKernel({
      tools: [
        {
          id: "house.brief",
          title: "Сводка",
          roles: ["lead"],
          examples: ["сводка"],
          parse: () => ({}),
          run() {
            ran = true;
            return { status: "ok", text: "нет", data: { secret: 1 } };
          },
        },
      ],
      plan: rulesPlan,
      readContext: () => ({ session: null }),
    });
    assert.equal(kernel.ask("").code, "unknown");
    assert.equal(kernel.ask("   ").code, "unknown");
    assert.equal(kernel.ask(null).code, "unknown");
    assert.equal(kernel.ask("сводка").code, "auth");
    assert.equal(ran, false);
    assert.equal(ask("сводка").code, "auth");
  });

  it("answers the network only for the lead", () => {
    enter("+7 900 200-00-01");
    const result = ask("все дома!");
    assert.equal(result.ok, true);
    assert.equal(result.tool, "network.brief");
    assert.ok(result.data.houses >= 1);
    assert.equal(typeof result.data.due, "number");
    const named = ask("кто должен?");
    assert.equal(named.tool, "rent.due");
    assert.ok(named.data.count > 0);
    logoutStaff();
    enter("+7 900 200-00-02");
    const hidden = ask("все дома");
    assert.equal(hidden.code, "unknown");
    assert.equal(hidden.data, null);
    assert.equal(JSON.stringify(hidden).includes("due"), false);
    const posed = ask("сеть", { session: { id: "mgr-low", role: "lead" }, houseId: SEED_HOUSE_ID, units: [] });
    assert.equal(posed.code, "forbidden");
    assert.equal(posed.data, null);
  });

  it("hides a studio outside the manager floors", () => {
    const manager = personById("mgr-low");
    const scoped = unitsInScope(manager, SEED_HOUSE_ID, units);
    assert.equal(scoped.some((unit) => unit.code === "501"), false);
    assert.equal(scoped.some((unit) => unit.code === "203"), true);

    enter("+7 900 200-00-02");
    const resident = getParty("p-501").name;
    const blocked = ask("студия 501");
    assert.equal(blocked.code, "forbidden");
    assert.equal(blocked.data, null);
    assert.equal(JSON.stringify(blocked).includes(resident), false);

    const own = ask("студия 203");
    assert.equal(own.ok, true);
    assert.equal(own.data.code, "203");
    assert.equal(own.data.resident, getParty("p-203").name);

    const debts = ask("кто должен");
    assert.equal(debts.ok, true);
    assert.equal(debts.data.rows.some((row) => row.code === "502"), false);
    assert.ok(debts.data.rows.every((row) => ["2", "3", "4"].includes(row.code[0])));

    const outsideDebt = getParty("p-502").name;
    const oneDebt = ask("долг 502");
    assert.equal(oneDebt.code, "forbidden");
    assert.equal(oneDebt.data, null);
    assert.equal(JSON.stringify(oneDebt).includes(outsideDebt), false);

    const brief = ask("сводка.");
    assert.equal(brief.tool, "house.brief");
    assert.equal(brief.data.units, scoped.length);
    for (const move of brief.data.moves) {
      const code = String(move.href || "").split("/").pop();
      assert.equal(scoped.some((unit) => unit.code === code), true);
    }
    assert.equal(unitsInScope({ role: "manager" }, SEED_HOUSE_ID, units).length, 0);
  });

  it("keeps a floor manager's own studio and a paid studio's debt separate", () => {
    enter("+7 900 200-00-03");
    const own = ask("студия 501");
    assert.equal(own.ok, true);
    assert.equal(own.data.resident, getParty("p-501").name);
    logoutStaff();
    enter("+7 900 200-00-01");
    const clear = ask("долг 204");
    assert.equal(clear.ok, true);
    assert.equal(clear.data.count, 0);
    assert.deepEqual(clear.data.rows, []);
    const focused = ask("сводка 203");
    assert.equal(focused.tool, "unit.lookup");
    assert.equal(focused.data.code, "203");
    const tasks = ask("задачи 305");
    assert.equal(tasks.tool, "tasks.list");
    assert.deepEqual(tasks.data.rows.map((row) => row.unitCode), ["305"]);
    const year = ask("2026");
    assert.equal(year.code, "unknown");
    assert.equal(year.data, null);
  });

  it("does not offer rent tools to crew, even if a planner names one", () => {
    enter("+7 900 200-00-04");
    const result = ask("кто должён");
    assert.equal(result.code, "unknown");
    assert.equal(result.data, null);
    assert.match(result.text, /задачи/);
    assert.equal(listTools().some((tool) => tool.id === "rent.due"), false);

    const tasks = ask("поручения");
    assert.equal(tasks.ok, true);
    assert.equal(tasks.tool, "tasks.list");
    assert.ok(tasks.data.rows.some((row) => row.unitCode === "305"));
    assert.equal(JSON.stringify(tasks).includes("Нет света"), false);
    const one = ask("задачи 305");
    assert.deepEqual(one.data.rows.map((row) => row.unitCode), ["305"]);
    const none = ask("задачи 502");
    assert.equal(none.data.count, 0);
    assert.equal(JSON.stringify(none).includes("Нет света"), false);
    assert.equal(listTools().every((tool) => !("run" in tool) && !("parse" in tool)), true);
    const mismatched = ask("задачи", {
      session: { id: "lead", role: "crew" },
      houseId: SEED_HOUSE_ID,
      units: [],
    });
    assert.equal(mismatched.code, "forbidden");
    assert.equal(mismatched.data, null);
    assert.equal(JSON.stringify(mismatched).includes("Течь"), false);

    let ran = false;
    const kernel = createKernel({
      tools: [
        {
          id: "rent.due",
          title: "Долги",
          roles: ["lead"],
          examples: ["кто должен"],
          parse: () => ({}),
          run() {
            ran = true;
            return { status: "ok", text: "долг 1", data: { due: 1 } };
          },
        },
        {
          id: "tasks.list",
          title: "Задачи",
          roles: ["crew"],
          examples: ["задачи"],
          parse: () => null,
          run() {
            return { status: "ok", text: "задачи", data: { count: 0, rows: [] } };
          },
        },
      ],
      plan: () => ({ id: "rent.due", args: {} }),
      readContext: () => ({ session: null }),
    });
    const blocked = kernel.ask("кто должен", {
      session: { id: "plumb", role: "crew" },
      houseId: SEED_HOUSE_ID,
      units: [],
    });
    assert.equal(blocked.code, "forbidden");
    assert.equal(blocked.data, null);
    assert.equal(ran, false);
  });

  it("turns a broken tool into an error without the thrown text", () => {
    const kernel = createKernel({
      tools: [
        {
          id: "boom",
          title: "Сбой",
          roles: ["lead"],
          examples: ["сломайся"],
          parse: () => ({}),
          run() {
            throw new Error("secret Глеб 99999");
          },
        },
      ],
      plan: rulesPlan,
      readContext: () => {
        throw new Error("unread");
      },
    });
    const result = kernel.ask("сломайся", {
      session: { id: "lead", role: "lead" },
      houseId: SEED_HOUSE_ID,
      units: [],
    });
    assert.equal(result.code, "error");
    assert.equal(result.text, FAIL);
    assert.equal(result.data, null);
    assert.equal(JSON.stringify(result).includes("Глеб"), false);
    assert.equal(JSON.stringify(result).includes("secret"), false);

    let read = false;
    const guarded = createKernel({
      tools: [
        {
          id: "boom",
          title: "Сбой",
          roles: ["lead"],
          examples: ["сломайся"],
          parse: () => ({}),
          run() {
            return { status: "leak", text: "secret Глеб", data: { due: 1 } };
          },
        },
      ],
      plan(text, planned) {
        assert.equal(planned.some((tool) => "run" in tool), false);
        assert.equal(typeof planned[0].parse, "function");
        return rulesPlan(text, planned);
      },
      readContext() {
        read = true;
        return { session: null, houseId: "", units: [], findUnit: () => null };
      },
    });
    const leaked = guarded.ask("сломайся", {
      session: { id: "lead", role: "lead" },
      houseId: SEED_HOUSE_ID,
      units: [],
    });
    assert.equal(leaked.code, "error");
    assert.equal(leaked.text, FAIL);
    assert.equal(leaked.data, null);
    assert.equal(JSON.stringify(leaked).includes("Глеб"), false);
    const long = guarded.ask(`сводка ${"а".repeat(500)}`);
    assert.equal(long.code, "unknown");
    assert.equal(read, false);
    const broken = ask("сводка", { session: { id: "lead", role: "lead" } });
    assert.equal(broken.code, "error");
    assert.equal(broken.data, null);
  });
});
