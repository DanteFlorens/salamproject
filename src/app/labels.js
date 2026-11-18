import { SEED_HOUSE_ID, getUnit, listHouses } from "../domain.js";
import { formatMonth, ruCount } from "../format.js";

export function houseById(id) {
  return listHouses().find((house) => house.id === id) || null;
}

export function houseOfUnit(unit) {
  if (!unit) return null;
  return houseById(unit.houseId || SEED_HOUSE_ID);
}

export function kindMeta(kind) {
  const all = {
    house: { name: "Дом", one: "студия", few: "студии", many: "студий" },
    apartments: { name: "Квартиры", one: "квартира", few: "квартиры", many: "квартир" },
    studios: { name: "Студии", one: "студия", few: "студии", many: "студий" },
    hotel: { name: "Гостиница", one: "номер", few: "номера", many: "номеров" },
  };
  return all[kind] || all.house;
}

export function unitKindMeta(kind) {
  const all = {
    room: { name: "Комната", one: "комната", few: "комнаты", many: "комнат", vacant: "свободна · комната" },
    studio: { name: "Студия", one: "студия", few: "студии", many: "студий", vacant: "свободна · студия" },
    apartment: { name: "Квартира", one: "квартира", few: "квартиры", many: "квартир", vacant: "свободна · квартира" },
    living: { name: "Помещение", one: "помещение", few: "помещения", many: "помещений", vacant: "свободна · жилец" },
    parking: { name: "Парковка", one: "место", few: "места", many: "мест", vacant: "свободно · парковка" },
  };
  return all[kind] || all.living;
}

export function levelPhrase(level) {
  const parts = [];
  if (level.rooms) parts.push(ruCount(level.rooms, "комната", "комнаты", "комнат"));
  if (level.studios) parts.push(ruCount(level.studios, "студия", "студии", "студий"));
  if (level.apartments) parts.push(ruCount(level.apartments, "квартира", "квартиры", "квартир"));
  return parts.join(" · ") || "пусто";
}

export function defaultLevels(count) {
  const floors = Math.min(20, Math.max(1, Number(count) || 3));
  return Array.from({ length: floors }, (_, index) => ({
    floor: index + 1,
    rooms: 0,
    studios: index === 0 ? 1 : 0,
    apartments: index === 0 ? 2 : 3,
  }));
}

export function normalizeDraftLevels(raw, floorCount) {
  const floors = Math.min(20, Math.max(1, Number(floorCount) || 3));
  let list = [];
  if (typeof raw === "string" && raw.trim()) {
    try {
      list = JSON.parse(raw);
    } catch {
      list = [];
    }
  } else if (Array.isArray(raw)) list = raw;
  if (!list.length) return defaultLevels(floors);
  const next = [];
  for (let index = 0; index < floors; index += 1) {
    const prev = list[index];
    if (prev) {
      next.push({
        floor: index + 1,
        rooms: Math.max(0, Math.min(60, Number(prev.rooms) || 0)),
        studios: Math.max(0, Math.min(60, Number(prev.studios) || 0)),
        apartments: Math.max(0, Math.min(60, Number(prev.apartments) || 0)),
      });
    } else {
      next.push({ floor: index + 1, rooms: 0, studios: 0, apartments: 3 });
    }
  }
  return next;
}

export function placeLabel(unit) {
  if (!unit) return "";
  if (unit.label) return unit.label;
  const house = houseOfUnit(unit);
  if (!house?.serial || house.seed) return unit.code;
  const prefix = String(house.serial);
  if (!unit.code.startsWith(prefix)) return unit.code;
  const rest = unit.code.slice(prefix.length);
  if (house.mode === "numbers") return String(Number(rest));
  return rest;
}

export function layoutFact(house) {
  if (!house) return "";
  const park =
    house.parkingTotal || house.parking
      ? ` · ${ruCount(house.parkingTotal || house.parking, "парковочное место", "парковочных места", "парковочных мест")}`
      : "";
  if (house.seed) return `5 этажей · по 7 студий · этажи 2–6${park}`;
  if (house.mode === "custom" && Array.isArray(house.levels)) {
    const sample = house.levels
      .slice(0, 2)
      .map((level) => `${level.floor} эт.: ${levelPhrase(level)}`)
      .join("; ");
    const more = house.levels.length > 2 ? ` · ещё ${house.levels.length - 2} эт.` : "";
    return `${ruCount(house.floors, "этаж", "этажа", "этажей")} · ${sample}${more}${park}`;
  }
  if (house.mode === "numbers") {
    const meta = kindMeta(house.kind);
    return `${ruCount(house.studios, meta.one, meta.few, meta.many)} подряд, без этажей${park}`;
  }
  if (house.mode === "floors") return `${house.floors} эт. × ${house.perFloor} на этаже${park}`;
  const rows = house.rowsPerBand;
  return `4 квартиры в ряду · блок ${rows} ${rows === 3 ? "ряда" : "рядов"}${park}`;
}

export function titledNoun(kind) {
  const noun = kindMeta(kind).one;
  return noun.charAt(0).toUpperCase() + noun.slice(1);
}

export function unitTitle(unit) {
  return titledNoun(houseOfUnit(unit)?.kind);
}

export function monthLabel(month) {
  return formatMonth(`${month}-01`).replace(/\s*г\.$/, "");
}

export function rateLabel(value) {
  const n = Number(value);
  return n % 1000 === 0 ? `${n / 1000} тыс` : String(n);
}

export function housePreview(levels, parking) {
  const living = levels.reduce((sum, level) => sum + level.rooms + level.studios + level.apartments, 0);
  const rooms = levels.reduce((sum, level) => sum + level.rooms, 0);
  const studios = levels.reduce((sum, level) => sum + level.studios, 0);
  const apartments = levels.reduce((sum, level) => sum + level.apartments, 0);
  const parkText =
    parking > 0 ? ` Парковка: ${ruCount(parking, "место", "места", "мест")}.` : " Без парковки.";
  const livingLine = `${ruCount(levels.length, "этаж", "этажа", "этажей")}: ${ruCount(living, "помещение", "помещения", "помещений")} (${ruCount(rooms, "комната", "комнаты", "комнат")}, ${ruCount(studios, "студия", "студии", "студий")}, ${ruCount(apartments, "квартира", "квартиры", "квартир")}).`;
  return { livingLine, parkText, text: `${livingLine}${parkText}` };
}

export function viewHouseDraft(raw) {
  const floors = raw?.floors || raw?.levels?.length || 4;
  const levels = normalizeDraftLevels(raw?.levels, floors);
  return {
    name: raw?.name || "",
    address: raw?.address || "",
    kind: raw?.kind || "house",
    floors: String(levels.length),
    parking: raw?.parking ?? 4,
    levels,
  };
}

export const HOUSE_KINDS = [
  ["house", "Жилой дом", "На каждом этаже свой набор: комнаты, студии, квартиры"],
  ["apartments", "Квартирный дом", "Упор на квартиры, микс по этажам всё равно можно"],
  ["studios", "Студии", "Дом со студиями и при необходимости комнатами"],
  ["hotel", "Гостиница", "Номера как комнаты плюс любые квартиры"],
];

export const KIND_PLACEHOLDERS = {
  house: "Дроздова 1",
  apartments: "Квартиры на Ленина",
  studios: "Студии у парка",
  hotel: "Гостиница у парка",
};

export function labelOfCode(code) {
  const unit = getUnit(code);
  return unit ? placeLabel(unit) : code;
}
