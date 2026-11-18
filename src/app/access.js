import { SEED_HOUSE_ID, currentHouseId, currentSession, units } from "../domain.js";
import { placeLabel } from "./labels.js";

export function currentAccess() {
  return currentSession() || null;
}

export function workingHouseId() {
  const me = currentAccess();
  if (!me) return SEED_HOUSE_ID;
  if (me.role === "lead") return currentHouseId();
  return me.houseId || SEED_HOUSE_ID;
}

export function canEditUnits() {
  const me = currentAccess();
  return Boolean(me && (me.role === "lead" || me.role === "manager"));
}

export function unitsInScope(session, houseId, unitList = units) {
  const list = unitList.filter((unit) => (unit.houseId || SEED_HOUSE_ID) === houseId);
  if (session?.role !== "manager") return list;
  const floors = Array.isArray(session.floors) ? session.floors : [];
  return list.filter((unit) => {
    if (unit.unitKind === "parking") return true;
    if (unit.floor === 0) return true;
    return floors.includes(unit.floor);
  });
}

export function scopeUnits() {
  return unitsInScope(currentAccess(), workingHouseId());
}

export function inScope(unit) {
  if (!unit) return false;
  return scopeUnits().some((item) => item.id === unit.id);
}

export function floorPhrase(floors) {
  if (!floors?.length || floors.length <= 1) return String(floors?.[0] || "");
  return `${floors.slice(0, -1).join(", ")} и ${floors[floors.length - 1]}`;
}

export function scopedLines(lines) {
  const mine = scopeUnits();
  const houseId = workingHouseId();
  const me = currentAccess();
  const codes = new Set(mine.map((unit) => unit.code));
  const labels = new Set(mine.map((unit) => placeLabel(unit)));
  return lines.filter((line) => {
    if (line.houseId) {
      if (line.houseId !== houseId) return false;
      if (!line.unitCode) return me?.role === "lead";
      return codes.has(line.unitCode);
    }
    if (line.who === "Дом") return houseId === SEED_HOUSE_ID && me?.role === "lead";
    const code = String(line.who).split(" · ")[0];
    return codes.has(code) || labels.has(code);
  });
}
