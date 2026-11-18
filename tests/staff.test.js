import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("staff invite flow", () => {
  it("registers real owner then invites a manager", async () => {
    globalThis.localStorage = undefined;
    const domain = await import(`../src/domain.js?staff=${Date.now()}`);
    const owner = domain.registerOwner({
      name: "Карамагомед Заказчик",
      phone: "+7 900 777-00-01",
      pin: "4242",
    });
    assert.equal(owner.person?.role, "lead");
    assert.equal(domain.currentSessionId(), owner.person.id);
    const invite = domain.createInvite({
      role: "manager",
      title: "Управляющий",
      floors: "2 3",
      phone: "",
      nameHint: "Тест",
      fromId: owner.person.id,
    });
    assert.ok(invite.invite?.code);
    domain.logoutStaff();
    const registered = domain.registerWithInvite({
      code: invite.invite.code,
      name: "Тест Управляющий",
      phone: "+7 900 555-00-11",
      pin: "1357",
    });
    assert.equal(registered.person?.role, "manager");
    assert.deepEqual(registered.person.floors, [2, 3]);
    domain.logoutStaff();
    const login = domain.loginStaff({ phone: "+7 900 777-00-01", pin: "4242" });
    assert.equal(login.person?.id, owner.person.id);
  });

  it("creates house with mixed floors and parking", async () => {
    globalThis.localStorage = undefined;
    const domain = await import(`../src/domain.js?house=${Date.now()}`);
    const made = domain.createHouse({
      name: "Дроздова 1",
      address: "ул. Дроздова, 1",
      kind: "house",
      mode: "custom",
      parking: "4",
      levels: [
        { floor: 1, rooms: 1, studios: 1, apartments: 2 },
        { floor: 2, rooms: 0, studios: 0, apartments: 5 },
        { floor: 3, rooms: 2, studios: 3, apartments: 0 },
        { floor: 4, rooms: 0, studios: 4, apartments: 1 },
      ],
    });
    assert.ok(made.house);
    assert.equal(made.house.mode, "custom");
    assert.equal(made.house.studios, 19);
    assert.equal(made.house.parking, 4);
    const listed = domain.listHouses().find((house) => house.id === made.house.id);
    assert.equal(listed.total, 19);
    assert.equal(listed.parkingTotal, 4);
    const living = domain.units.filter(
      (unit) => unit.houseId === made.house.id && unit.unitKind !== "parking",
    );
    assert.equal(living.length, 19);
    assert.equal(living.filter((unit) => unit.floor === 1 && unit.unitKind === "room").length, 1);
    assert.equal(living.filter((unit) => unit.floor === 1 && unit.unitKind === "studio").length, 1);
    assert.equal(living.filter((unit) => unit.floor === 1 && unit.unitKind === "apartment").length, 2);
    assert.equal(living.filter((unit) => unit.floor === 2).length, 5);
    const parks = domain.units.filter(
      (unit) => unit.houseId === made.house.id && unit.unitKind === "parking",
    );
    assert.equal(parks.length, 4);
    assert.equal(parks[0].label, "P1");
    const brief = domain.networkBrief();
    assert.ok(brief.houses >= 1);
    assert.ok(brief.parkingTotal >= 4);
  });
});
