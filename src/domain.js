/** Учебный фонд первой резиденции. Имена и суммы демонстрационные. */

import { daysBetween, formatMonth } from "./format.js";
import { persistWrite } from "./persist.js";

export const AS_OF = "2026-10-26";

export const residence = {
  brand: "Salam",
  line: "Residences",
  format: "Доходный дом",
  term: "Помесячно",
};

const NAMES = [
  "Анна Сорокина",
  "Михаил Левин",
  "Елена Кравец",
  "Игорь Сафин",
  "Мария Донцова",
  "Павел Юдин",
  "Ольга Берг",
  "Артём Киселёв",
  "Дарья Волкова",
  "Никита Орлов",
  "Софья Мамедова",
  "Кирилл Березин",
  "Алина Чехова",
  "Роман Гасанов",
  "Вера Шишкина",
  "Денис Кольцов",
  "Полина Ремизова",
  "Тимур Алиев",
  "Ксения Баранова",
  "Андрей Фролов",
  "Инга Мельник",
  "Глеб Самойлов",
  "Яна Петросян",
  "Степан Ильин",
  "Лидия Коваль",
  "Марк Элиава",
  "Тамара Беридзе",
  "Егор Сысоев",
  "Милана Дроздова",
  "Руслан Назаров",
  "Ася Корн",
  "Лев Абрамов",
  "Нина Хакимова",
  "Фёдор Громов",
  "Карина Эшба",
];

const AREAS = [
  18, 22, 27, 35, 20, 24, 31, 19, 23, 28, 33, 21, 26, 30, 18, 25, 29, 35, 22, 27, 32, 20, 24, 34,
  19, 28, 31, 23, 26, 30, 21, 33, 25, 29, 18,
];

const STARTS = [
  "2025-02-03",
  "2025-04-11",
  "2025-06-01",
  "2025-09-15",
  "2025-11-20",
  "2026-01-08",
  "2026-03-01",
  "2024-12-01",
  "2025-05-19",
  "2025-08-07",
];

const MONTHS = ["2026-08-01", "2026-09-01", "2026-10-01"];

function assertFund(condition, message) {
  if (!condition) throw new Error(message);
}

function addMonths(iso, months) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + months, day, 12));
  return date.toISOString().slice(0, 10);
}

function tariff(area, floor) {
  const raw = area * 2400 + (floor - 2) * 1200;
  return Math.round(raw / 500) * 500;
}

function inventory(area) {
  if (area < 22) return "Кровать 140, шкаф, стол, санузел с душем";
  if (area < 28) return "Кровать 160, шкаф, рабочий стол, кресло, санузел";
  return "Кровать 160, шкаф-купе, стол, кресло, обеденная стойка, санузел";
}

function contractEnd(start, index) {
  if (index === 2) return "2026-11-06";
  if (index === 9) return "2026-11-18";
  if (index === 16) return "2026-12-01";
  let end = addMonths(start, 11);
  while (end < "2026-12-15") end = addMonths(end, 12);
  return end;
}

function phone(index) {
  return `+7 900 100-00-${String(index + 1).padStart(2, "0")}`;
}

function buildFund() {
  const units = [];
  const parties = [];
  const stays = [];
  const entries = [];
  let index = 0;

  for (const floor of [2, 3, 4, 5, 6]) {
    for (let door = 1; door <= 7; door += 1) {
      const code = `${floor}0${door}`;
      const area = AREAS[index];
      const rate = tariff(area, floor);
      const start = STARTS[index % STARTS.length];
      const end = contractEnd(start, index);
      const owesFull = index % 11 === 0;
      const owesHalf = !owesFull && index % 13 === 0;
      const unitId = `u-${code}`;
      const partyId = `p-${code}`;
      const stayId = `s-${code}`;

      units.push({
        id: unitId,
        code,
        floor,
        areaM2: area,
        monthlyRate: rate,
        inventory: inventory(area),
        status: "occupied",
      });
      parties.push({ id: partyId, name: NAMES[index], phone: phone(index) });
      stays.push({ id: stayId, unitId, partyId, contract: `SR-${code}`, start, end });
      entries.push({
        id: `e-${code}-deposit`,
        stayId,
        at: start,
        kind: "deposit",
        label: "Получен залог",
        amount: rate,
      });

      for (const month of MONTHS) {
        const labelMonth = formatMonth(month);
        entries.push({
          id: `e-${code}-rent-${month.slice(0, 7)}`,
          stayId,
          at: month,
          kind: "rent",
          label: `Проживание, ${labelMonth}`,
          amount: rate,
        });
        const isOctober = month.startsWith("2026-10");
        if (isOctober && owesFull) continue;
        const paid = isOctober && owesHalf ? Math.round(rate / 2 / 100) * 100 : rate;
        entries.push({
          id: `e-${code}-pay-${month.slice(0, 7)}`,
          stayId,
          at: `${month.slice(0, 8)}04`,
          kind: "payment",
          label: `Оплата проживания, ${labelMonth}`,
          amount: paid,
        });
      }
      index += 1;
    }
  }

  return { units, parties, stays, entries };
}

const fund = buildFund();

export const SEED_HOUSE_ID = "h-salam";

for (const unit of fund.units) unit.houseId = SEED_HOUSE_ID;

export const units = fund.units;
export const parties = fund.parties;
export const stays = fund.stays;
export const entries = fund.entries;
export const floors = [2, 3, 4, 5, 6];

const unitById = new Map(units.map((unit) => [unit.id, unit]));
const unitByCode = new Map(units.map((unit) => [unit.code, unit]));
const partyById = new Map(parties.map((party) => [party.id, party]));
const stayByUnit = new Map(stays.map((stay) => [stay.unitId, stay]));
const stayByParty = new Map(stays.map((stay) => [stay.partyId, stay]));

export function getUnit(code) {
  return unitByCode.get(code);
}

export function getParty(id) {
  return partyById.get(id);
}

export function partyOf(id) {
  const party = partyById.get(id);
  if (!party) throw new Error(id);
  return party;
}

export function unitOf(id) {
  const unit = unitById.get(id);
  if (!unit) throw new Error(id);
  return unit;
}

export function stayOfUnit(unitId) {
  const stay = stayByUnit.get(unitId);
  if (!stay) throw new Error(unitId);
  return stay;
}

export function stayOfParty(partyId) {
  return stayByParty.get(partyId);
}

export function unitsOnFloor(floor) {
  return units.filter((unit) => unit.floor === floor);
}

export function rentJournal(stayId) {
  const rows = entries
    .filter((entry) => entry.stayId === stayId && entry.kind !== "deposit")
    .slice()
    .sort((a, b) => a.at.localeCompare(b.at));
  let balance = 0;
  return rows.map((entry) => {
    balance += entry.kind === "rent" ? entry.amount : -entry.amount;
    return { entry, balance };
  });
}

export function rentDue(stayId) {
  const journal = rentJournal(stayId);
  return journal.length === 0 ? 0 : journal[journal.length - 1].balance;
}

export function depositOf(stayId) {
  const deposit = entries.find((entry) => entry.stayId === stayId && entry.kind === "deposit");
  if (!deposit) throw new Error(stayId);
  return { amount: deposit.amount, at: deposit.at };
}

export function monthMovement(prefix) {
  let charged = 0;
  let paid = 0;
  for (const entry of entries) {
    if (!entry.at.startsWith(prefix)) continue;
    if (entry.kind === "rent") charged += entry.amount;
    if (entry.kind === "payment") paid += entry.amount;
  }
  return { charged, paid };
}

/** Октябрь и залог только по переданным студиям (дом / этажи управляющего). */
export function booksForUnits(unitList) {
  const stayIds = new Set();
  for (const unit of unitList) {
    const stay = stayByUnit.get(unit.id);
    if (stay) stayIds.add(stay.id);
  }
  let charged = 0;
  let paid = 0;
  let deposit = 0;
  for (const entry of entries) {
    if (!stayIds.has(entry.stayId)) continue;
    if (entry.kind === "deposit") deposit += entry.amount;
    if (entry.kind === "rent" && entry.at.startsWith("2026-10")) charged += entry.amount;
    if (entry.kind === "payment" && entry.at.startsWith("2026-10")) paid += entry.amount;
  }
  return { charged, paid, deposit };
}

export function openFolios() {
  return stays
    .map((stay) => ({ stay, due: rentDue(stay.id) }))
    .filter((row) => row.due > 0)
    .sort(
      (a, b) => b.due - a.due || unitOf(a.stay.unitId).code.localeCompare(unitOf(b.stay.unitId).code),
    );
}

export function endingWithin(days) {
  return stays
    .map((stay) => ({ stay, daysLeft: daysBetween(AS_OF, stay.end) }))
    .filter((row) => row.daysLeft >= 0 && row.daysLeft <= days)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

export const totalArea = units.reduce((sum, unit) => sum + unit.areaM2, 0);
export const totalDeposit = entries
  .filter((entry) => entry.kind === "deposit")
  .reduce((sum, entry) => sum + entry.amount, 0);

/** До конца договора месяц или меньше — сигнал на доске. */
export const CONTRACT_SOON_DAYS = 31;

const seedExpenses = [
  { id: "x-clean", at: "2026-10-06", label: "Уборка общих зон", amount: 48000, houseId: SEED_HOUSE_ID },
  { id: "x-repair", at: "2026-10-18", label: "Расходники и мелкий ремонт", amount: 36500, houseId: SEED_HOUSE_ID },
];
const userExpenses = [];
const userPayments = [];
const userUtilityPays = [];
const userReminders = [];
const BOOK_KEY = "salam-residences-books";

export const UTILITY_MONTH = "2026-10";

const UTILITY_SERVICES = [
  { id: "gas", title: "Газ" },
  { id: "power", title: "Свет" },
  { id: "water", title: "Вода" },
];

function round10(value) {
  return Math.round(value / 10) * 10;
}

function utilityAmount(service, area) {
  if (service === "gas") return round10(180 + area * 8);
  if (service === "power") return round10(400 + area * 22);
  return round10(240 + area * 12);
}

/** Октябрьская коммуналка по каждой студии. Часть строк учебная и уже закрыта. */
const utilityBills = stays.flatMap((stay, index) => {
  const area = unitOf(stay.unitId).areaM2;
  const mode = index % 7;
  return UTILITY_SERVICES.map((service) => {
    const unpaid = mode === 0 || (mode === 1 && service.id === "water");
    return {
      id: `util-${stay.id}-${service.id}`,
      stayId: stay.id,
      service: service.id,
      month: UTILITY_MONTH,
      amount: utilityAmount(service.id, area),
      paidAt: unpaid ? null : "2026-10-08",
    };
  });
});

function serviceTitle(id) {
  return UTILITY_SERVICES.find((service) => service.id === id)?.title || id;
}

function shiftDate(iso, days) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12));
  return date.toISOString().slice(0, 10);
}

function spanRange(id) {
  if (id === "day") return { from: AS_OF, to: AS_OF };
  if (id === "week") {
    const [year, month, day] = AS_OF.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day, 12));
    const weekday = date.getUTCDay();
    const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
    const from = shiftDate(AS_OF, mondayOffset);
    return { from, to: shiftDate(from, 6) };
  }
  const month = AS_OF.slice(0, 7);
  const [year, monthNumber] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, monthNumber, 0, 12)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

function inRange(iso, from, to) {
  return iso >= from && iso <= to;
}

const PERSIST_FAIL =
  "Не удалось сохранить данные. Сейчас цифры видны локально, но после обновления страницы могут пропасть.";
const PAYMENT_DEDUP_MS = 8000;

let persistFailed = false;

/** Сбрасывает флаг перед серией записей одного действия. */
function beginPersist() {
  persistFailed = false;
}

function notePersistFail() {
  persistFailed = true;
}

/** Забирает предупреждение о сбое записи после действия. */
export function takePersistWarning() {
  if (!persistFailed) return "";
  persistFailed = false;
  return PERSIST_FAIL;
}

export function withPersistNotice(success) {
  return takePersistWarning() || success;
}

function writeLocal(key, value) {
  try {
    if (!persistWrite(key, value)) {
      notePersistFail();
      return false;
    }
    return true;
  } catch {
    notePersistFail();
    return false;
  }
}

function readStore() {
  try {
    const store = globalThis.localStorage;
    if (!store) return null;
    const raw = store.getItem(BOOK_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStore() {
  writeLocal(BOOK_KEY, {
    payments: userPayments,
    expenses: userExpenses,
    utilities: userUtilityPays,
    reminders: userReminders,
  });
}

export function contractDaysLeft(stay) {
  return daysBetween(AS_OF, stay.end);
}

export function contractEnding(stay) {
  const days = contractDaysLeft(stay);
  return days >= 0 && days <= CONTRACT_SOON_DAYS;
}

export function allExpenses() {
  return seedExpenses.concat(userExpenses);
}

function recentPaymentTwin(stayId, paid, day) {
  const now = Date.now();
  return userPayments.find((entry) => {
    if (entry.stayId !== stayId || entry.amount !== paid || entry.at !== day) return false;
    const stamp = Number(String(entry.id).split("-")[2]);
    return Number.isFinite(stamp) && now - stamp < PAYMENT_DEDUP_MS;
  });
}

export function recordPayment({ stayId, amount, at }) {
  const stay = stays.find((item) => item.id === stayId);
  if (!stay) return { error: "Проживание не найдено." };
  const paid = Math.round(Number(amount));
  const day = String(at || "");
  if (!(paid > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return { error: "Укажите сумму больше нуля и дату." };
  }
  const twin = recentPaymentTwin(stayId, paid, day);
  if (twin) return { entry: twin, duplicate: true };
  beginPersist();
  const entry = {
    id: `e-user-${Date.now()}-${userPayments.length}`,
    stayId,
    at: day,
    kind: "payment",
    label: `Оплата проживания, ${formatMonth(day)}`,
    amount: paid,
  };
  userPayments.push(entry);
  entries.push(entry);
  writeStore();
  return { entry };
}

export function recordExpense({ label, amount, at, houseId = SEED_HOUSE_ID }) {
  beginPersist();
  const expense = {
    id: `x-user-${Date.now()}-${userExpenses.length}`,
    at,
    label: String(label).trim(),
    amount: Math.round(Number(amount)),
    houseId: houseId || SEED_HOUSE_ID,
  };
  userExpenses.push(expense);
  writeStore();
  return expense;
}

export function moneySpan(id) {
  const titles = { day: "Сутки", week: "Неделя", month: "Месяц" };
  const range = spanRange(id);
  const lines = [];
  let inflow = 0;
  let outflow = 0;
  for (const entry of entries) {
    if (entry.kind !== "payment" || !inRange(entry.at, range.from, range.to)) continue;
    const stay = stays.find((item) => item.id === entry.stayId);
    const unit = stay ? unitOf(stay.unitId) : null;
    const party = stay ? partyOf(stay.partyId) : null;
    inflow += entry.amount;
    lines.push({
      id: entry.id,
      at: entry.at,
      direction: "in",
      amount: entry.amount,
      label: entry.label,
      who: unit && party ? `${faceCode(unit)} · ${party.name}` : "Жилец",
      unitCode: unit?.code || "",
      houseId: unit?.houseId || SEED_HOUSE_ID,
    });
  }
  for (const bill of utilityBills) {
    if (!bill.paidAt || !inRange(bill.paidAt, range.from, range.to)) continue;
    const stay = stays.find((item) => item.id === bill.stayId);
    const unit = stay ? unitOf(stay.unitId) : null;
    const party = stay ? partyOf(stay.partyId) : null;
    inflow += bill.amount;
    lines.push({
      id: bill.id,
      at: bill.paidAt,
      direction: "in",
      amount: bill.amount,
      label: `Коммуналка, ${serviceTitle(bill.service).toLowerCase()}`,
      who: unit && party ? `${faceCode(unit)} · ${party.name}` : "Жилец",
      unitCode: unit?.code || "",
      houseId: unit?.houseId || SEED_HOUSE_ID,
    });
  }
  for (const expense of allExpenses()) {
    if (!inRange(expense.at, range.from, range.to)) continue;
    outflow += expense.amount;
    lines.push({
      id: expense.id,
      at: expense.at,
      direction: "out",
      amount: expense.amount,
      label: expense.label,
      who: "Дом",
      unitCode: "",
      houseId: expense.houseId || SEED_HOUSE_ID,
    });
  }
  lines.sort((a, b) => b.at.localeCompare(a.at) || a.direction.localeCompare(b.direction));
  return {
    id,
    title: titles[id] || "Период",
    from: range.from,
    to: range.to,
    inflow,
    outflow,
    net: inflow - outflow,
    lines,
  };
}

function restoreBooks() {
  const saved = readStore();
  if (!saved) return;
  for (const entry of saved.payments || []) {
    if (!entry || entry.kind !== "payment" || !(Number(entry.amount) > 0) || !entry.stayId || !entry.at) continue;
    const payment = { ...entry, amount: Math.round(Number(entry.amount)) };
    userPayments.push(payment);
    entries.push(payment);
  }
  for (const expense of saved.expenses || []) {
    if (!expense || !(Number(expense.amount) > 0) || !expense.at || !expense.label) continue;
    userExpenses.push({ ...expense, amount: Math.round(Number(expense.amount)) });
  }
  for (const item of saved.utilities || []) {
    if (!item || !item.id || !item.at) continue;
    const bill = utilityBills.find((bill) => bill.id === item.id);
    if (!bill || bill.paidAt) continue;
    bill.paidAt = item.at;
    userUtilityPays.push({ id: bill.id, at: item.at });
  }
  for (const item of saved.reminders || []) {
    if (!item || !item.stayId || !item.at) continue;
    userReminders.push({ stayId: item.stayId, at: item.at });
  }
}

export function utilityLines(stayId) {
  return utilityBills
    .filter((bill) => bill.stayId === stayId && bill.month === UTILITY_MONTH)
    .map((bill) => ({
      id: bill.id,
      service: bill.service,
      title: serviceTitle(bill.service),
      amount: bill.amount,
      paidAt: bill.paidAt,
    }));
}

export function utilityDue(stayId) {
  return utilityLines(stayId).reduce((sum, line) => sum + (line.paidAt ? 0 : line.amount), 0);
}

export function utilityDebtors() {
  return stays
    .map((stay) => {
      const open = utilityLines(stay.id).filter((line) => !line.paidAt);
      const due = open.reduce((sum, line) => sum + line.amount, 0);
      const reminder = userReminders
        .filter((item) => item.stayId === stay.id)
        .sort((a, b) => b.at.localeCompare(a.at))[0];
      return { stay, due, open, remindedAt: reminder ? reminder.at : null };
    })
    .filter((row) => row.due > 0)
    .sort((a, b) => b.due - a.due || unitOf(a.stay.unitId).code.localeCompare(unitOf(b.stay.unitId).code));
}

export function payUtility(billId, at) {
  const bill = utilityBills.find((item) => item.id === billId);
  if (!bill || bill.paidAt || !/^\d{4}-\d{2}-\d{2}$/.test(at)) return null;
  beginPersist();
  bill.paidAt = at;
  userUtilityPays.push({ id: bill.id, at });
  writeStore();
  return { title: serviceTitle(bill.service), amount: bill.amount, at };
}

export function payOpenUtilities(stayId, at) {
  const open = utilityBills.filter((bill) => bill.stayId === stayId && bill.month === UTILITY_MONTH && !bill.paidAt);
  if (!open.length || !/^\d{4}-\d{2}-\d{2}$/.test(at)) return null;
  beginPersist();
  let amount = 0;
  for (const bill of open) {
    bill.paidAt = at;
    amount += bill.amount;
    userUtilityPays.push({ id: bill.id, at });
  }
  writeStore();
  return { count: open.length, amount, at };
}

export function markReminder(stayId) {
  if (!stays.some((stay) => stay.id === stayId)) return;
  beginPersist();
  if (!userReminders.some((item) => item.stayId === stayId && item.at === AS_OF)) {
    userReminders.push({ stayId, at: AS_OF });
  }
  writeStore();
}

assertFund(NAMES.length === 35 && AREAS.length === 35, "ожидалось 35 студий");
assertFund(units.length === 35 && parties.length === 35 && stays.length === 35, "фонд собран не полностью");
assertFund(Math.min(...AREAS) === 18 && Math.max(...AREAS) === 35, "площади должны быть от 18 до 35");
assertFund(units.every((unit) => unit.status === "occupied"), "все студии должны быть заняты");
assertFund(
  stays.every((stay) => stay.start <= AS_OF && stay.end >= AS_OF),
  "каждый жилец должен проживать на операционный день",
);
assertFund(new Set(units.map((unit) => unit.code)).size === 35, "номера студий должны быть уникальны");
assertFund(utilityBills.length === stays.length * 3, "у каждой студии должны быть газ, свет и вода");
restoreBooks();

/**
 * Простой между выездом и следующим заселением.
 * «to» совпадает с началом текущего договора, «from» — день выезда.
 * Длина промежутка — разница дат, как в примере «с 5-го по 15-е — десять дней».
 */
const VACANCY_SPECS = [
  { code: "207", days: 10 },
  { code: "506", days: 10 },
  { code: "206", days: 10 },
  { code: "505", days: 10 },
  { code: "404", days: 16 },
  { code: "405", days: 24 },
];

const vacancies = VACANCY_SPECS.map((spec) => {
  const unit = getUnit(spec.code);
  const stay = stayOfUnit(unit.id);
  return { unitId: unit.id, from: shiftDate(stay.start, -spec.days), to: stay.start };
});

function daysInMonth(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber, 0, 12)).getUTCDate();
}

function vacancySlices(from, to, monthlyRate) {
  const counts = new Map();
  for (let cursor = from; cursor < to; cursor = shiftDate(cursor, 1)) {
    const month = cursor.slice(0, 7);
    counts.set(month, (counts.get(month) || 0) + 1);
  }
  return [...counts.entries()].map(([month, days]) => ({
    month,
    days,
    amount: Math.round((monthlyRate * days) / daysInMonth(month)),
  }));
}

export function vacancyOf(unitId) {
  const unit = unitOf(unitId);
  const gaps = vacancies
    .filter((gap) => gap.unitId === unitId)
    .map((gap) => {
      const months = vacancySlices(gap.from, gap.to, unit.monthlyRate);
      return {
        from: gap.from,
        to: gap.to,
        days: months.reduce((sum, slice) => sum + slice.days, 0),
        amount: months.reduce((sum, slice) => sum + slice.amount, 0),
        months,
      };
    });
  const byMonth = new Map();
  for (const gap of gaps) {
    for (const slice of gap.months) {
      const prev = byMonth.get(slice.month) || { month: slice.month, days: 0, amount: 0 };
      prev.days += slice.days;
      prev.amount += slice.amount;
      byMonth.set(slice.month, prev);
    }
  }
  const months = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
  return {
    gaps,
    months,
    days: months.reduce((sum, slice) => sum + slice.days, 0),
    amount: months.reduce((sum, slice) => sum + slice.amount, 0),
  };
}

export function vacancyReport(unitList) {
  const rows = unitList
    .map((unit) => ({ unit, loss: vacancyOf(unit.id) }))
    .filter((row) => row.loss.amount > 0)
    .sort((a, b) => b.loss.amount - a.loss.amount || a.unit.code.localeCompare(b.unit.code));
  const byMonth = new Map();
  for (const row of rows) {
    for (const slice of row.loss.months) {
      const prev = byMonth.get(slice.month) || { month: slice.month, days: 0, amount: 0, units: 0 };
      prev.days += slice.days;
      prev.amount += slice.amount;
      prev.units += 1;
      byMonth.set(slice.month, prev);
    }
  }
  const months = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
  return {
    rows,
    months,
    days: rows.reduce((sum, row) => sum + row.loss.days, 0),
    amount: rows.reduce((sum, row) => sum + row.loss.amount, 0),
  };
}

/** Сводка для управления: что в карточках студий и жильцов стоит сделать первым. */
export function housePicture(unitList) {
  const ids = new Set(unitList.map((unit) => unit.id));
  const rent = openFolios().filter((row) => ids.has(row.stay.unitId));
  const utilities = utilityDebtors().filter((row) => ids.has(row.stay.unitId));
  const ending = endingWithin(CONTRACT_SOON_DAYS).filter((row) => ids.has(row.stay.unitId));
  const loss = vacancyReport(unitList);
  const rentDue = rent.reduce((sum, row) => sum + row.due, 0);
  const utilityDue = utilities.reduce((sum, row) => sum + row.due, 0);
  const codeOf = (stay) => unitOf(stay.unitId).code;
  const labelOf = (stay) => faceCode(unitOf(stay.unitId));
  const moves = [];
  if (rentDue > 0) {
    const code = codeOf(rent[0].stay);
    const label = labelOf(rent[0].stay);
    moves.push({
      id: "rent",
      title: "Собрать аренду",
      detail: rent.length === 1 ? `студия ${label}` : `студия ${label} и ещё ${rent.length - 1}`,
      amount: rentDue,
      href: `/apartments/${code}`,
    });
  }
  if (utilityDue > 0) {
    const code = codeOf(utilities[0].stay);
    const label = labelOf(utilities[0].stay);
    moves.push({
      id: "utility",
      title: "Закрыть коммуналку",
      detail: utilities.length === 1 ? `студия ${label}` : `${utilities.length} студий, сначала ${label}`,
      amount: utilityDue,
      href: `/apartments/${code}`,
    });
  }
  if (loss.amount > 0) {
    const unit = loss.rows[0].unit;
    const code = unit.code;
    moves.push({
      id: "loss",
      title: "Не держать студию пустой",
      detail: `простой уже стоил денег, крупнее всего ${faceCode(unit)}`,
      amount: loss.amount,
      href: `/apartments/${code}`,
    });
  }
  moves.sort((a, b) => b.amount - a.amount);
  if (ending.length > 0) {
    const next = ending[0];
    const code = codeOf(next.stay);
    moves.push({
      id: "renew",
      title: "Сдать в день выезда",
      detail: `${labelOf(next.stay)} через ${next.daysLeft} дн.`,
      amount: 0,
      href: `/apartments/${code}`,
    });
  }
  return {
    units: unitList.length,
    rentDue,
    rentCount: rent.length,
    utilityDue,
    utilityCount: utilities.length,
    lossAmount: loss.amount,
    lossDays: loss.days,
    endingCount: ending.length,
    moves,
  };
}

assertFund(vacancies.length === 6, "ожидалось шесть учебных простоев");
assertFund(
  vacancies.every((gap) => gap.from < gap.to && gap.to <= AS_OF),
  "простой должен закончиться заселением не позже операционного дня",
);
assertFund(vacancyOf(getUnit("207").id).days === 10, "у студии 207 должно быть десять дней простоя");
assertFund(vacancyOf(getUnit("201").id).amount === 0, "у студии 201 простоя не было");

/** Учебные сотрудники дома. Дальше к ним добавляются приглашённые. */
const seedPeople = [
  { id: "lead", role: "lead", name: "Лейла Ахмедова", title: "Руководитель", floors: [2, 3, 4, 5, 6], phone: "+7 900 200-00-01", seed: true },
  { id: "mgr-low", role: "manager", name: "Марат Гусев", title: "Управляющий", floors: [2, 3, 4], phone: "+7 900 200-00-02", seed: true },
  { id: "mgr-high", role: "manager", name: "Нина Ершова", title: "Управляющий", floors: [5, 6], phone: "+7 900 200-00-03", seed: true },
  { id: "plumb", role: "crew", name: "Илья Морозов", title: "Сантехник", floors: [], phone: "+7 900 200-00-04", seed: true },
  { id: "spark", role: "crew", name: "Карен Аветисян", title: "Электрик", floors: [], phone: "+7 900 200-00-05", seed: true },
  { id: "hand", role: "crew", name: "Олег Щукин", title: "Мастер", floors: [], phone: "+7 900 200-00-06", seed: true },
];

const people = seedPeople.map((person) => ({ ...person }));
const extraPeople = [];
const STAFF_KEY = "salam-residences-staff";
const DEMO_PIN = "2026";

function normalizePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) return `7${digits.slice(1)}`;
  if (digits.length === 10) return `7${digits}`;
  return digits;
}

function formatPhone(digits) {
  const d = normalizePhone(digits);
  if (d.length !== 11) return String(digits || "").trim();
  return `+${d[0]} ${d.slice(1, 4)} ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9)}`;
}

function makeInviteCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "SR-";
  for (let i = 0; i < 4; i += 1) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

function readStaffStore() {
  try {
    const raw = globalThis.localStorage?.getItem(STAFF_KEY);
    const saved = raw ? JSON.parse(raw) : null;
    return {
      people: Array.isArray(saved?.people) ? saved.people : [],
      accounts: saved?.accounts && typeof saved.accounts === "object" ? saved.accounts : {},
      invites: Array.isArray(saved?.invites) ? saved.invites : [],
      sessionId: typeof saved?.sessionId === "string" ? saved.sessionId : "",
    };
  } catch {
    return { people: [], accounts: {}, invites: [], sessionId: "" };
  }
}

function writeStaffStore(store) {
  writeLocal(STAFF_KEY, store);
}

let staffAccounts = {};
let staffInvites = [];
let staffSessionId = "";

function rebuildPeople() {
  people.length = 0;
  for (const person of seedPeople) people.push({ ...person });
  for (const person of extraPeople) people.push({ ...person });
}

function ensureSeedAccounts(store) {
  for (const person of seedPeople) {
    if (store.accounts[person.id]) continue;
    store.accounts[person.id] = {
      phone: normalizePhone(person.phone),
      pin: DEMO_PIN,
      registeredAt: AS_OF,
      seed: true,
    };
  }
}

function applyStaff() {
  const store = readStaffStore();
  ensureSeedAccounts(store);
  extraPeople.length = 0;
  for (const person of store.people) {
    if (!person?.id || !person.name || seedPeople.some((seed) => seed.id === person.id)) continue;
    if (!["manager", "crew", "lead"].includes(person.role)) continue;
    const floors =
      person.role === "lead"
        ? [2, 3, 4, 5, 6]
        : Array.isArray(person.floors)
          ? person.floors.map(Number).filter((n) => n > 0)
          : [];
    extraPeople.push({
      id: person.id,
      role: person.role,
      name: person.name,
      title:
        person.title ||
        (person.role === "lead" ? "Руководитель" : person.role === "manager" ? "Управляющий" : "Сотрудник"),
      floors,
      houseId: person.houseId || SEED_HOUSE_ID,
      phone: formatPhone(person.phone),
      seed: false,
    });
  }
  staffAccounts = { ...store.accounts };
  staffInvites = store.invites
    .filter((invite) => invite?.code && ["manager", "crew"].includes(invite.role))
    .map((invite) => ({ ...invite }));
  staffSessionId = store.sessionId && (seedPeople.some((p) => p.id === store.sessionId) || extraPeople.some((p) => p.id === store.sessionId))
    ? store.sessionId
    : "";
  rebuildPeople();
  writeStaffStore({
    people: extraPeople,
    accounts: staffAccounts,
    invites: staffInvites,
    sessionId: staffSessionId,
  });
}

function persistStaff() {
  beginPersist();
  writeStaffStore({
    people: extraPeople,
    accounts: staffAccounts,
    invites: staffInvites,
    sessionId: staffSessionId,
  });
}

const seedTasks = [
  {
    id: "t-leak",
    at: AS_OF,
    unitCode: "305",
    floor: 3,
    title: "Течь под раковиной",
    text: "Жилец сообщил утром. Перекрыть воду и заменить прокладку.",
    fromId: "mgr-low",
    toId: "plumb",
    status: "new",
  },
  {
    id: "t-light",
    at: AS_OF,
    unitCode: "502",
    floor: 5,
    title: "Нет света в санузле",
    text: "Не работают лампа и выключатель. Жилец дома до вечера.",
    fromId: "mgr-high",
    toId: "spark",
    status: "new",
  },
  {
    id: "t-door",
    at: AS_OF,
    unitCode: "606",
    floor: 6,
    title: "Не закрывается доводчик",
    text: "Дверь студии хлопает. Подтянуть доводчик.",
    fromId: "mgr-high",
    toId: "hand",
    status: "read",
  },
  {
    id: "t-round",
    at: AS_OF,
    unitCode: "",
    floor: null,
    title: "Обход долгов по коммуналке",
    text: "Сегодня связаться со студиями 201, 301 и 401. Текст напоминания собирается в карточке дома.",
    fromId: "lead",
    toId: "mgr-low",
    status: "new",
  },
  {
    id: "t-hall",
    at: AS_OF,
    unitCode: "",
    floor: 6,
    title: "Мигает лампа на площадке 6 этажа",
    text: "Поменять лампу до конца дня.",
    fromId: "lead",
    toId: "spark",
    status: "new",
  },
];

const userTasks = [];
const taskStatus = new Map();
const whatsappOpened = new Set();
const TASK_KEY = "salam-residences-tasks";

function readTaskStore() {
  try {
    const raw = globalThis.localStorage?.getItem(TASK_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeTaskStore() {
  writeLocal(TASK_KEY, {
    status: Object.fromEntries(taskStatus),
    created: userTasks,
    whatsapp: [...whatsappOpened],
  });
}

function restoreTasks() {
  const saved = readTaskStore();
  if (!saved) return;
  for (const task of saved.created || []) {
    if (!task || !task.id || !task.title || !task.text || !task.fromId || !task.toId) continue;
    userTasks.push({
      ...task,
      at: AS_OF,
      unitCode: task.unitCode || "",
      floor: task.floor || null,
      status: "new",
    });
  }
  for (const [id, status] of Object.entries(saved.status || {})) {
    if (status === "read" || status === "closed") taskStatus.set(id, status);
  }
  for (const id of saved.whatsapp || []) {
    if (typeof id === "string" && id) whatsappOpened.add(id);
  }
}

function allTasks() {
  return seedTasks.concat(userTasks).map((task) => ({
    ...task,
    status: taskStatus.get(task.id) || task.status,
  }));
}

function taskFloor(task) {
  if (task.floor) return task.floor;
  if (!task.unitCode) return null;
  return getUnit(task.unitCode)?.floor ?? null;
}

export function listPeople() {
  return people.slice();
}

export function personById(id) {
  return people.find((person) => person.id === id) || null;
}

export function currentSessionId() {
  return staffSessionId || "";
}

export function currentSession() {
  return personById(staffSessionId);
}

export function isRegistered(personId) {
  return Boolean(staffAccounts[personId]);
}

export function listInvites() {
  return staffInvites
    .slice()
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || String(a.code).localeCompare(String(b.code)));
}

export function inviteByCode(code) {
  const needle = String(code || "").trim().toUpperCase();
  return staffInvites.find((invite) => invite.code === needle) || null;
}

export function createInvite({ role, title, floors, phone, nameHint, fromId, houseId }) {
  const from = personById(fromId);
  if (!from || from.role !== "lead") return { error: "Приглашения создаёт только руководитель." };
  const kind = role === "crew" ? "crew" : "manager";
  const label = String(title || "").trim() || (kind === "manager" ? "Управляющий" : "Сотрудник");
  if (label.length < 2 || label.length > 40) return { error: "Должность — от 2 до 40 знаков." };
  const knownHouses = [SEED_HOUSE_ID, ...extraHouses.map((house) => house.id)];
  const assignedHouse =
    kind === "manager"
      ? knownHouses.includes(houseId)
        ? houseId
        : activeHouseId || SEED_HOUSE_ID
      : SEED_HOUSE_ID;
  const floorList =
    kind === "manager"
      ? [...new Set(String(floors || "")
          .split(/[\s,;]+/)
          .map(Number)
          .filter((n) => Number.isInteger(n) && n >= 1 && n <= 9))].sort((a, b) => a - b)
      : [];
  if (kind === "manager" && floorList.length === 0) return { error: "Укажите этажи управляющего, например 2 3 4." };
  const phoneDigits = phone ? normalizePhone(phone) : "";
  if (phone && phoneDigits.length !== 11) return { error: "Телефон приглашения — 11 цифр, начиная с 7." };
  if (staffInvites.filter((invite) => !invite.acceptedAt).length >= 20) return { error: "Слишком много открытых приглашений." };
  let code = makeInviteCode();
  while (staffInvites.some((invite) => invite.code === code)) code = makeInviteCode();
  const invite = {
    id: `inv-${Date.now()}-${staffInvites.length}`,
    code,
    role: kind,
    title: label,
    floors: floorList,
    houseId: assignedHouse,
    phone: phoneDigits,
    nameHint: String(nameHint || "").trim(),
    createdAt: AS_OF,
    acceptedAt: null,
    acceptedBy: null,
  };
  staffInvites.unshift(invite);
  persistStaff();
  return { invite };
}

export function revokeInvite(inviteId, actorId) {
  const actor = personById(actorId);
  if (!actor || actor.role !== "lead") return { error: "Снять приглашение может только руководитель." };
  const index = staffInvites.findIndex((invite) => invite.id === inviteId);
  if (index < 0) return { error: "Такого приглашения нет." };
  if (staffInvites[index].acceptedAt) return { error: "Это приглашение уже использовано." };
  const [gone] = staffInvites.splice(index, 1);
  persistStaff();
  return { invite: gone };
}

/** Первый вход заказчика: сам себя как руководитель, без кода приглашения. */
export function registerOwner({ name, phone, pin }) {
  const fullName = String(name || "").trim();
  if (fullName.length < 2 || fullName.length > 60) return { error: "Имя — от 2 до 60 знаков." };
  const phoneDigits = normalizePhone(phone);
  if (phoneDigits.length !== 11) return { error: "Введите телефон полностью, 11 цифр." };
  if (Object.values(staffAccounts).some((account) => account.phone === phoneDigits)) {
    return { error: "Этот телефон уже зарегистрирован. Войдите по PIN на экране «Вход»." };
  }
  const pinClean = String(pin || "").trim();
  if (!/^\d{4}$/.test(pinClean)) return { error: "PIN — ровно 4 цифры." };
  const id = `owner-${Date.now()}`;
  const person = {
    id,
    role: "lead",
    name: fullName,
    title: "Руководитель",
    floors: [2, 3, 4, 5, 6],
    phone: formatPhone(phoneDigits),
    seed: false,
  };
  extraPeople.push(person);
  rebuildPeople();
  staffAccounts[id] = { phone: phoneDigits, pin: pinClean, registeredAt: AS_OF, seed: false };
  staffSessionId = id;
  persistStaff();
  return { person };
}

export function registerWithInvite({ code, name, phone, pin }) {
  const invite = inviteByCode(code);
  if (!invite) return { error: "Код приглашения не найден." };
  if (invite.acceptedAt) return { error: "Этот код уже использовали. Попросите новый." };
  const fullName = String(name || "").trim();
  if (fullName.length < 2 || fullName.length > 60) return { error: "Имя — от 2 до 60 знаков." };
  const phoneDigits = normalizePhone(phone);
  if (phoneDigits.length !== 11) return { error: "Введите телефон полностью, 11 цифр." };
  if (invite.phone && invite.phone !== phoneDigits) {
    return { error: "Телефон не совпадает с приглашением. Проверьте номер у руководителя." };
  }
  if (Object.values(staffAccounts).some((account) => account.phone === phoneDigits)) {
    return { error: "Этот телефон уже зарегистрирован. Войдите по PIN." };
  }
  const pinClean = String(pin || "").trim();
  if (!/^\d{4}$/.test(pinClean)) return { error: "PIN — ровно 4 цифры." };
  const id = `staff-${Date.now()}`;
  const person = {
    id,
    role: invite.role,
    name: fullName,
    title: invite.title,
    floors: invite.floors.slice(),
    houseId: invite.houseId || SEED_HOUSE_ID,
    phone: formatPhone(phoneDigits),
    seed: false,
  };
  extraPeople.push(person);
  rebuildPeople();
  staffAccounts[id] = { phone: phoneDigits, pin: pinClean, registeredAt: AS_OF, seed: false };
  invite.acceptedAt = AS_OF;
  invite.acceptedBy = id;
  staffSessionId = id;
  persistStaff();
  return { person, invite };
}

export function loginStaff({ phone, pin }) {
  const phoneDigits = normalizePhone(phone);
  const pinClean = String(pin || "").trim();
  if (phoneDigits.length !== 11) return { error: "Введите телефон полностью." };
  if (!/^\d{4}$/.test(pinClean)) return { error: "PIN — ровно 4 цифры." };
  const entry = Object.entries(staffAccounts).find(([, account]) => account.phone === phoneDigits);
  if (!entry) return { error: "Такого телефона нет. Нужно приглашение руководителя." };
  const [personId, account] = entry;
  if (account.pin !== pinClean) return { error: "Неверный PIN." };
  const person = personById(personId);
  if (!person) return { error: "Учётная запись повреждена. Обратитесь к руководителю." };
  staffSessionId = personId;
  persistStaff();
  return { person };
}

export function logoutStaff() {
  staffSessionId = "";
  persistStaff();
}

export function removeStaff(personId, actorId) {
  const actor = personById(actorId);
  if (!actor || actor.role !== "lead") return { error: "Снять сотрудника может только руководитель." };
  if (seedPeople.some((person) => person.id === personId)) return { error: "Учебных сотрудников сети снять нельзя." };
  const index = extraPeople.findIndex((person) => person.id === personId);
  if (index < 0) return { error: "Такого сотрудника нет." };
  const [gone] = extraPeople.splice(index, 1);
  delete staffAccounts[personId];
  if (staffSessionId === personId) staffSessionId = "";
  rebuildPeople();
  persistStaff();
  return { person: gone };
}

export function teamDirectory() {
  return listPeople().map((person) => ({
    ...person,
    registered: isRegistered(person.id),
    accountPhone: staffAccounts[person.id]?.phone || normalizePhone(person.phone),
  }));
}

export { DEMO_PIN, formatPhone, normalizePhone };

const CREW_RULES = [
  { id: "plumb", words: ["теч", "вод", "кран", "раковин", "унитаз", "труб", "канализ", "смесител", "затоп"] },
  { id: "spark", words: ["свет", "ламп", "элект", "автомат", "розет", "щиток", "провод"] },
  { id: "hand", words: ["двер", "доводчик", "замок", "окн", "петл", "ручк"] },
];

function crewBySpecialty(kind) {
  const words = {
    plumb: ["сантех"],
    spark: ["электр"],
    hand: ["мастер"],
  }[kind] || [];
  const crew = people.filter((person) => person.role === "crew");
  const seed = personById(kind);
  if (seed) return seed;
  return (
    crew.find((person) => words.some((word) => person.title.toLowerCase().includes(word))) ||
    crew[0] ||
    null
  );
}

/** По тексту проблемы выбирает мастера. Пустая строка, если слов мало. */
export function suggestCrew(text) {
  const hay = String(text || "").toLowerCase();
  let best = null;
  for (const rule of CREW_RULES) {
    for (const word of rule.words) {
      const at = hay.indexOf(word);
      if (at >= 0 && (!best || at < best.at)) best = { at, id: rule.id };
    }
  }
  if (!best) return null;
  const person = crewBySpecialty(best.id);
  if (!person) return null;
  const reason = {
    plumb: "Похоже на воду. Система ставит сантехника.",
    spark: "Похоже на свет. Система ставит электрика.",
    hand: "Похоже на дверь или замок. Система ставит мастера.",
  }[best.id];
  return { id: person.id, name: person.name, title: person.title, phone: person.phone, reason };
}

export function whatsappHref(task) {
  const to = personById(task.toId);
  const from = personById(task.fromId);
  const digits = String(to?.phone || "").replace(/\D/g, "");
  if (!to || !from || digits.length < 11) return "";
  const place = task.unitCode ? `Студия ${task.unitCode}` : task.floor ? `Этаж ${task.floor}` : "Дом";
  const text = [
    "Salam Residences",
    `Поручение: ${task.title}`,
    place,
    task.text,
    `От ${from.name}, ${from.title.toLowerCase()}.`,
  ].join("\n");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function markWhatsapp(taskId) {
  if (!allTasks().some((task) => task.id === taskId)) return false;
  beginPersist();
  whatsappOpened.add(taskId);
  writeTaskStore();
  return true;
}

export function whatsappWasOpened(taskId) {
  return whatsappOpened.has(taskId);
}

function canPost(from, to) {
  if (!from || !to || from.id === to.id) return false;
  if (from.role === "lead") return to.role === "manager" || to.role === "crew";
  if (from.role === "manager") return to.role === "lead" || to.role === "crew";
  return false;
}

function canSeeTask(person, task) {
  if (person.role === "lead") return true;
  if (person.role === "crew") return task.toId === person.id;
  if (task.fromId === person.id || task.toId === person.id) return true;
  const floor = taskFloor(task);
  return floor != null && person.floors.includes(floor);
}

export function tasksVisibleTo(personId) {
  const person = personById(personId);
  if (!person) return [];
  const rank = { new: 0, read: 1, closed: 2 };
  return allTasks()
    .filter((task) => task.at === AS_OF && canSeeTask(person, task))
    .sort((a, b) => rank[a.status] - rank[b.status] || String(b.unitCode).localeCompare(String(a.unitCode)));
}

export function unreadFor(personId) {
  return tasksVisibleTo(personId).filter((task) => task.status === "new" && task.toId === personId).length;
}

export function recipientsFor(personId) {
  const person = personById(personId);
  if (!person) return [];
  return people.filter((other) => canPost(person, other));
}

export function postTask({ fromId, toId, title, text, unitCode }) {
  const from = personById(fromId);
  const to = personById(toId);
  if (!canPost(from, to)) return { error: "Кому это поручение отправить, из этого доступа нельзя." };
  const titleClean = String(title || "").trim();
  const textClean = String(text || "").trim();
  if (!titleClean || !textClean) return { error: "Напишите проблему и сообщение." };
  let floor = null;
  let code = "";
  const rawCode = String(unitCode || "").trim();
  if (rawCode) {
    const unit = getUnit(rawCode);
    if (!unit) return { error: "Такой студии в доме нет." };
    if (from.role === "manager" && !from.floors.includes(unit.floor)) {
      return { error: "Эта студия на чужих этажах." };
    }
    floor = unit.floor;
    code = unit.code;
  }
  beginPersist();
  const task = {
    id: `t-user-${Date.now()}-${userTasks.length}`,
    at: AS_OF,
    unitCode: code,
    floor,
    title: titleClean,
    text: textClean,
    fromId,
    toId,
    status: "new",
  };
  userTasks.push(task);
  writeTaskStore();
  return { task };
}

export function markTaskRead(taskId, actorId) {
  const task = allTasks().find((item) => item.id === taskId);
  const actor = personById(actorId);
  if (!task || !actor || task.toId !== actor.id || task.status !== "new") return false;
  beginPersist();
  taskStatus.set(taskId, "read");
  writeTaskStore();
  return true;
}

export function closeTask(taskId, actorId) {
  const actor = personById(actorId);
  const task = allTasks().find((item) => item.id === taskId);
  if (!task || !actor || actor.role === "crew" || task.status === "closed" || !canSeeTask(actor, task)) return false;
  beginPersist();
  taskStatus.set(taskId, "closed");
  writeTaskStore();
  return true;
}

restoreTasks();

const CARD_KEY = "salam-residences-cards";

function readCards() {
  try {
    const raw = globalThis.localStorage?.getItem(CARD_KEY);
    const saved = raw ? JSON.parse(raw) : null;
    return {
      removed: Array.isArray(saved?.removed) ? saved.removed : [],
      added: Array.isArray(saved?.added) ? saved.added : [],
      edits: saved?.edits && typeof saved.edits === "object" ? saved.edits : {},
    };
  } catch {
    return { removed: [], added: [], edits: {} };
  }
}

function writeCards(store) {
  writeLocal(CARD_KEY, store);
}

function spliceWhere(list, pred) {
  for (let index = list.length - 1; index >= 0; index -= 1) {
    if (pred(list[index])) list.splice(index, 1);
  }
}

function issueOpenUtilities(stayId, area, unitKind = "living") {
  if (unitKind === "parking") return;
  for (const service of UTILITY_SERVICES) {
    utilityBills.push({
      id: `util-${stayId}-${service.id}`,
      stayId,
      service: service.id,
      month: UTILITY_MONTH,
      amount: utilityAmount(service.id, area),
      paidAt: null,
    });
  }
}

function chargeCard(stayId, card) {
  const parking = card.unitKind === "parking";
  entries.push({
    id: `e-${card.code}-deposit`,
    stayId,
    at: card.start,
    kind: "deposit",
    label: parking ? "Залог за место" : "Получен залог",
    amount: card.monthlyRate,
  });
  if (card.start <= "2026-10-31" && card.end >= "2026-10-01") {
    entries.push({
      id: `e-${card.code}-rent-2026-10`,
      stayId,
      at: "2026-10-01",
      kind: "rent",
      label: parking ? `Парковка, ${formatMonth("2026-10-01")}` : `Проживание, ${formatMonth("2026-10-01")}`,
      amount: card.monthlyRate,
    });
  }
}

function parseCard(input) {
  const code = String(input.code || "").trim();
  const existing = unitByCode.get(code);
  const unitKind = normalizeUnitKind(input.unitKind || existing?.unitKind);
  const parking = unitKind === "parking";
  const floor = Number(input.floor);
  const areaM2 = Math.round(Number(input.areaM2));
  const monthlyRate = Math.round(Number(input.monthlyRate));
  const name = String(input.name || "").trim();
  const phone = String(input.phone || "").trim();
  const start = String(input.start || "");
  const end = String(input.end || "");
  const inventoryText = String(input.inventory || "").trim();
  const contract = String(input.contract || "").trim();
  if (!/^\d{3,6}$/.test(code)) return { error: "Номер — от трёх до шести цифр." };
  if (!Number.isInteger(floor) || floor < 0 || floor > 30) return { error: "Этаж — от 0 до 30. Ноль значит без этажа." };
  if (parking) {
    if (!Number.isInteger(areaM2) || areaM2 < 0 || areaM2 > 40) return { error: "Площадь места — до 40 м² (можно 0)." };
    if (!Number.isInteger(monthlyRate) || monthlyRate < 500) return { error: "Тариф места — от 500 ₽." };
  } else {
    if (!Number.isInteger(areaM2) || areaM2 < 8 || areaM2 > 200) return { error: "Площадь — от 8 до 200 м²." };
    if (!Number.isInteger(monthlyRate) || monthlyRate < 1000) return { error: "Тариф укажите в рублях, от 1 000." };
  }
  if (!name || name.length > 80) return { error: parking ? "Напишите, на кого место." : "Напишите имя жильца." };
  if (!phone || phone.length > 24) return { error: "Напишите телефон." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end < start) {
    return { error: "Дата заезда должна быть не позже конца договора." };
  }
  const houseId = String(input.houseId || "").trim();
  return {
    code,
    floor,
    areaM2: parking && !areaM2 ? 12 : areaM2,
    monthlyRate,
    name,
    phone,
    start,
    end,
    inventory: inventoryText || (parking ? "Машиноместо" : inventory(areaM2)),
    contract: contract || (parking ? `PK-${code}` : `SR-${code}`),
    unitKind,
    ...(houseId ? { houseId } : {}),
  };
}

function codeTaken(code, exceptUnitId) {
  return units.some((unit) => unit.code === code && unit.id !== exceptUnitId);
}

function mountCard(card) {
  const unitKind = normalizeUnitKind(card.unitKind);
  const unit = {
    id: `u-${card.code}`,
    code: card.code,
    floor: unitKind === "parking" ? 0 : card.floor,
    areaM2: card.areaM2,
    monthlyRate: card.monthlyRate,
    inventory: card.inventory,
    status: "occupied",
    custom: true,
    houseId: card.houseId || SEED_HOUSE_ID,
    unitKind,
    label: card.label || undefined,
  };
  const party = { id: `p-${card.code}`, name: card.name, phone: card.phone };
  const stay = {
    id: `s-${card.code}`,
    unitId: unit.id,
    partyId: party.id,
    contract: card.contract,
    start: card.start,
    end: card.end,
  };
  units.push(unit);
  parties.push(party);
  stays.push(stay);
  unitById.set(unit.id, unit);
  unitByCode.set(unit.code, unit);
  partyById.set(party.id, party);
  stayByUnit.set(unit.id, stay);
  stayByParty.set(party.id, stay);
  chargeCard(stay.id, { ...card, unitKind });
  issueOpenUtilities(stay.id, card.areaM2, unitKind);
  return unit;
}

function occupyUnit(unit, card) {
  unit.status = "occupied";
  unit.areaM2 = card.areaM2;
  unit.monthlyRate = card.monthlyRate;
  unit.inventory = card.inventory;
  unit.floor = normalizeUnitKind(card.unitKind) === "parking" ? 0 : card.floor;
  unit.custom = true;
  unit.unitKind = normalizeUnitKind(card.unitKind || unit.unitKind);
  const party = { id: `p-${unit.code}`, name: card.name, phone: card.phone };
  const stay = {
    id: `s-${unit.code}`,
    unitId: unit.id,
    partyId: party.id,
    contract: card.contract,
    start: card.start,
    end: card.end,
  };
  parties.push(party);
  stays.push(stay);
  partyById.set(party.id, party);
  stayByUnit.set(unit.id, stay);
  stayByParty.set(party.id, stay);
  chargeCard(stay.id, { ...card, code: unit.code, unitKind: unit.unitKind });
  issueOpenUtilities(stay.id, card.areaM2, unit.unitKind);
  return unit;
}

function vacateSlot(unit) {
  const stay = stayByUnit.get(unit.id);
  if (!stay) return;
  const stayId = stay.id;
  spliceWhere(entries, (entry) => entry.stayId === stayId);
  spliceWhere(userPayments, (entry) => entry.stayId === stayId);
  spliceWhere(userReminders, (item) => item.stayId === stayId);
  spliceWhere(userUtilityPays, (item) => String(item.id).startsWith(`util-${stayId}-`));
  spliceWhere(utilityBills, (bill) => bill.stayId === stayId);
  spliceWhere(parties, (item) => item.id === stay.partyId);
  spliceWhere(stays, (item) => item.id === stayId);
  partyById.delete(stay.partyId);
  stayByUnit.delete(unit.id);
  stayByParty.delete(stay.partyId);
  unit.status = "vacant";
  unit.areaM2 = 0;
  unit.monthlyRate = 0;
  unit.inventory = "";
  writeStore();
}

function patchCard(unitId, card) {
  const unit = unitById.get(unitId);
  const stay = stayByUnit.get(unitId);
  const party = stay ? partyById.get(stay.partyId) : null;
  if (!unit || !stay || !party) return null;
  if (unit.code !== card.code) {
    unitByCode.delete(unit.code);
    unit.code = card.code;
    unitByCode.set(unit.code, unit);
  }
  unit.floor = card.floor;
  unit.areaM2 = card.areaM2;
  unit.monthlyRate = card.monthlyRate;
  unit.inventory = card.inventory;
  party.name = card.name;
  party.phone = card.phone;
  stay.start = card.start;
  stay.end = card.end;
  stay.contract = card.contract;
  const paidUtility = utilityBills.some((bill) => bill.stayId === stay.id && bill.paidAt);
  if (!paidUtility) {
    for (const bill of utilityBills) {
      if (bill.stayId === stay.id) bill.amount = utilityAmount(bill.service, card.areaM2);
    }
  }
  return unit;
}

function forgetCard(unitId) {
  const unit = unitById.get(unitId);
  const stay = stayByUnit.get(unitId);
  if (!unit || !stay) return null;
  const code = unit.code;
  const stayId = stay.id;
  spliceWhere(entries, (entry) => entry.stayId === stayId);
  spliceWhere(userPayments, (entry) => entry.stayId === stayId);
  spliceWhere(userReminders, (item) => item.stayId === stayId);
  spliceWhere(userUtilityPays, (item) => String(item.id).startsWith(`util-${stayId}-`));
  spliceWhere(utilityBills, (bill) => bill.stayId === stayId);
  spliceWhere(vacancies, (gap) => gap.unitId === unitId);
  spliceWhere(units, (item) => item.id === unitId);
  spliceWhere(parties, (item) => item.id === stay.partyId);
  spliceWhere(stays, (item) => item.id === stayId);
  unitById.delete(unitId);
  unitByCode.delete(code);
  partyById.delete(stay.partyId);
  stayByUnit.delete(unitId);
  stayByParty.delete(stay.partyId);
  writeStore();
  return { code, custom: Boolean(unit.custom) };
}

function applyCards() {
  applyHouses();
  const store = readCards();
  for (const unitId of store.removed) forgetCard(unitId);
  for (const [unitId, card] of Object.entries(store.edits)) {
    if (!unitById.has(unitId) || codeTaken(card.code, unitId)) continue;
    patchCard(unitId, card);
  }
  for (const card of store.added) {
    if (!card) continue;
    const existing = unitByCode.get(card.code);
    if (existing?.status === "vacant") occupyUnit(existing, card);
    else if (!existing) mountCard(card);
  }
}

export function heldDeposit() {
  return entries.filter((entry) => entry.kind === "deposit").reduce((sum, entry) => sum + entry.amount, 0);
}

export function heldDepositFor(unitList) {
  return booksForUnits(unitList).deposit;
}

export function cardById(unitId) {
  const unit = unitById.get(unitId);
  if (!unit) return null;
  const stay = stayByUnit.get(unitId);
  if (!stay) {
    return {
      unitId: unit.id,
      code: unit.code,
      floor: unit.floor,
      areaM2: unit.areaM2,
      monthlyRate: unit.monthlyRate,
      inventory: unit.inventory,
      name: "",
      phone: "",
      start: "",
      end: "",
      contract: "",
      vacant: true,
      houseId: unit.houseId || SEED_HOUSE_ID,
    };
  }
  const party = partyById.get(stay.partyId);
  return {
    unitId: unit.id,
    code: unit.code,
    floor: unit.floor,
    areaM2: unit.areaM2,
    monthlyRate: unit.monthlyRate,
    inventory: unit.inventory,
    name: party.name,
    phone: party.phone,
    start: stay.start,
    end: stay.end,
    contract: stay.contract,
    vacant: false,
    houseId: unit.houseId || SEED_HOUSE_ID,
  };
}

export function listCards(houseId) {
  return units
    .filter((unit) => !houseId || (unit.houseId || SEED_HOUSE_ID) === houseId)
    .map((unit) => cardById(unit.id))
    .sort((a, b) => a.code.localeCompare(b.code, "ru"));
}

export function saveCard(input, unitId) {
  const card = parseCard(input);
  if (card.error) return card;
  beginPersist();
  if (unitId) {
    const current = unitById.get(unitId);
    if (!current) return { error: "Карточка не найдена." };
    if (codeTaken(card.code, unitId)) return { error: `Студия ${card.code} уже есть.` };
    if (current.custom && current.code !== card.code) {
      return { error: "Номер новой студии лучше не менять: заведите карточку заново." };
    }
    const stored = { ...card, houseId: current.houseId || card.houseId || SEED_HOUSE_ID };
    const unit = patchCard(unitId, stored);
    const store = readCards();
    if (current.custom) {
      store.added = store.added.map((row) => (row.code === current.code ? stored : row));
    } else {
      store.edits[unitId] = stored;
    }
    writeCards(store);
    return { unit };
  }
  const existing = unitByCode.get(card.code);
  if (existing) {
    if (existing.status !== "vacant") return { error: `Студия ${card.code} уже есть.` };
    card.houseId = existing.houseId || SEED_HOUSE_ID;
    const unit = occupyUnit(existing, card);
    const store = readCards();
    store.added.push(card);
    writeCards(store);
    return { unit, opened: true };
  }
  card.houseId = card.houseId || SEED_HOUSE_ID;
  const unit = mountCard(card);
  const store = readCards();
  store.added.push(card);
  writeCards(store);
  return { unit, opened: true };
}

export function removeCard(unitId) {
  const unit = unitById.get(unitId);
  if (!unit) return { error: "Карточка не найдена." };
  beginPersist();
  if (unit.slot && stayByUnit.has(unitId)) {
    const code = unit.code;
    vacateSlot(unit);
    const store = readCards();
    store.added = store.added.filter((row) => row.code !== code);
    writeCards(store);
    return { code, vacated: true };
  }
  if (units.length <= 1) return { error: "Последнюю карточку дома убирать нельзя." };
  const gone = forgetCard(unitId);
  if (!gone) return { error: "Карточка не найдена." };
  const store = readCards();
  if (gone.custom) store.added = store.added.filter((row) => row.code !== gone.code);
  else {
    store.removed.push(unitId);
    delete store.edits[unitId];
  }
  writeCards(store);
  return gone;
}

const HOUSE_KEY = "salam-residences-houses";
const extraHouses = [];
let activeHouseId = SEED_HOUSE_ID;

function readHouses() {
  try {
    const raw = globalThis.localStorage?.getItem(HOUSE_KEY);
    const saved = raw ? JSON.parse(raw) : null;
    return {
      active: typeof saved?.active === "string" ? saved.active : SEED_HOUSE_ID,
      houses: Array.isArray(saved?.houses) ? saved.houses : [],
    };
  } catch {
    return { active: SEED_HOUSE_ID, houses: [] };
  }
}

function writeHouses(store) {
  writeLocal(HOUSE_KEY, store);
}

function seedHouseSpec() {
  return {
    id: SEED_HOUSE_ID,
    name: "Salam Residences",
    address: "Учебный дом, студии 18–35 м²",
    studios: 35,
    floors: 5,
    perFloor: 7,
    parking: 0,
    mode: "floors",
    kind: "studios",
    rowsPerBand: 4,
    perRow: 4,
    serial: 0,
    seed: true,
  };
}

function faceFromSpec(spec, code) {
  const prefix = String(spec.serial || "");
  if (!prefix || spec.seed || !code.startsWith(prefix)) return code;
  const rest = code.slice(prefix.length);
  if (spec.mode === "numbers") return String(Number(rest));
  return rest;
}

function faceCode(unit) {
  if (!unit) return "";
  return unit.label || unit.code;
}

const LIVING_UNIT_KINDS = new Set(["room", "studio", "apartment", "living"]);

function normalizeUnitKind(value) {
  if (value === "parking") return "parking";
  if (value === "room" || value === "studio" || value === "apartment") return value;
  return "living";
}

function pushVacant(spec, code, floor, extras = {}) {
  if (unitByCode.has(code)) return;
  const unitKind = normalizeUnitKind(extras.unitKind);
  const unit = {
    id: `u-${code}`,
    code,
    label: extras.label || faceFromSpec(spec, code),
    floor: unitKind === "parking" ? 0 : floor,
    areaM2: 0,
    monthlyRate: 0,
    inventory: "",
    status: "vacant",
    houseId: spec.id,
    custom: true,
    slot: true,
    unitKind,
  };
  units.push(unit);
  unitById.set(unit.id, unit);
  unitByCode.set(code, unit);
}

function parkingCode(serial, index) {
  return `${serial}0${String(index).padStart(3, "0")}`;
}

function pushParking(spec) {
  const count = Math.max(0, Math.round(Number(spec.parking) || 0));
  for (let index = 1; index <= count; index += 1) {
    pushVacant(spec, parkingCode(spec.serial, index), 0, { unitKind: "parking", label: `P${index}` });
  }
}

function levelTotal(level) {
  return Math.max(0, Number(level.rooms) || 0) + Math.max(0, Number(level.studios) || 0) + Math.max(0, Number(level.apartments) || 0);
}

function parseLevels(raw) {
  let list = raw;
  if (typeof raw === "string") {
    try {
      list = JSON.parse(raw);
    } catch {
      return { error: "Не удалось прочитать состав этажей." };
    }
  }
  if (!Array.isArray(list) || list.length === 0) return { error: "Добавьте хотя бы один этаж." };
  if (list.length > 20) return { error: "Этажей сейчас до 20." };
  const levels = [];
  let living = 0;
  for (let index = 0; index < list.length; index += 1) {
    const row = list[index] || {};
    const floor = Math.round(Number(row.floor ?? index + 1));
    const rooms = Math.round(Number(row.rooms) || 0);
    const studios = Math.round(Number(row.studios) || 0);
    const apartments = Math.round(Number(row.apartments) || 0);
    if (!Number.isInteger(floor) || floor < 1 || floor > 30) return { error: "Номер этажа — от 1 до 30." };
    for (const [label, value] of [
      ["комнат", rooms],
      ["студий", studios],
      ["квартир", apartments],
    ]) {
      if (!Number.isInteger(value) || value < 0 || value > 60) {
        return { error: `На этаже ${floor}: ${label} — от 0 до 60.` };
      }
    }
    const total = rooms + studios + apartments;
    if (total > 60) return { error: `На этаже ${floor} слишком много помещений (макс. 60).` };
    if (total === 0) return { error: `Этаж ${floor}: укажите комнаты, студии или квартиры.` };
    living += total;
    levels.push({ floor, rooms, studios, apartments });
  }
  if (living < 1 || living > 300) return { error: "Во всём доме от 1 до 300 помещений." };
  return { levels, living };
}

function planCodes(spec) {
  if (spec.mode === "custom" && Array.isArray(spec.levels)) {
    const codes = [];
    for (const level of spec.levels) {
      const total = levelTotal(level);
      for (let door = 1; door <= total; door += 1) {
        codes.push(`${spec.serial}${level.floor}${String(door).padStart(2, "0")}`);
      }
    }
    return codes;
  }
  if (spec.mode === "numbers") {
    return Array.from({ length: spec.studios }, (_, index) => `${spec.serial}${String(index + 1).padStart(3, "0")}`);
  }
  if (spec.mode === "floors") {
    const codes = [];
    for (let floor = 1; floor <= spec.floors; floor += 1) {
      for (let door = 1; door <= spec.perFloor; door += 1) {
        codes.push(`${spec.serial}${floor}${String(door).padStart(2, "0")}`);
      }
    }
    return codes;
  }
  return null;
}

function buildCustomLevels(spec) {
  for (const level of spec.levels || []) {
    const queue = [
      ...Array(Math.max(0, level.rooms || 0)).fill("room"),
      ...Array(Math.max(0, level.studios || 0)).fill("studio"),
      ...Array(Math.max(0, level.apartments || 0)).fill("apartment"),
    ];
    queue.forEach((kind, index) => {
      const door = index + 1;
      const code = `${spec.serial}${level.floor}${String(door).padStart(2, "0")}`;
      const short = kind === "room" ? "Ком" : kind === "studio" ? "Ст" : "Кв";
      pushVacant(spec, code, level.floor, {
        unitKind: kind,
        label: `${short}${door}`,
      });
    });
  }
  pushParking(spec);
}

function buildGrid(spec) {
  if (spec.mode === "custom") {
    buildCustomLevels(spec);
    return;
  }
  const planned = planCodes(spec);
  if (planned) {
    planned.forEach((code, index) => {
      const floor = spec.mode === "numbers" ? 0 : Math.floor(index / spec.perFloor) + 1;
      const fallbackKind = spec.kind === "apartments" ? "apartment" : spec.kind === "hotel" ? "room" : "studio";
      pushVacant(spec, code, floor, { unitKind: fallbackKind });
    });
    pushParking(spec);
    return;
  }
  const perBand = spec.rowsPerBand * 4;
  let left = spec.studios;
  let band = 1;
  while (left > 0) {
    const inBand = Math.min(perBand, left);
    for (let index = 0; index < inBand; index += 1) {
      const code = `${spec.serial}${band}${String(index + 1).padStart(2, "0")}`;
      pushVacant(spec, code, band, { unitKind: "studio" });
    }
    left -= inBand;
    band += 1;
  }
  pushParking(spec);
}

function applyHouses() {
  const store = readHouses();
  for (const spec of store.houses) {
    if (!spec?.id || extraHouses.some((house) => house.id === spec.id)) continue;
    extraHouses.push(spec);
    buildGrid(spec);
  }
  if (store.active === SEED_HOUSE_ID || extraHouses.some((house) => house.id === store.active)) {
    activeHouseId = store.active;
  }
}

export function currentHouseId() {
  return activeHouseId;
}

export function listHouses() {
  return [seedHouseSpec(), ...extraHouses].map((spec) => {
    const list = units.filter((unit) => (unit.houseId || SEED_HOUSE_ID) === spec.id);
    const living = list.filter((unit) => unit.unitKind !== "parking");
    const parking = list.filter((unit) => unit.unitKind === "parking");
    return {
      ...spec,
      parking: spec.parking || parking.length,
      total: spec.seed ? living.length : spec.studios,
      occupied: living.filter((unit) => unit.status !== "vacant").length,
      parkingTotal: parking.length,
      parkingOccupied: parking.filter((unit) => unit.status !== "vacant").length,
    };
  });
}

/** Сводка сети для владельца: занятость, долги, парковка. */
export function networkBrief() {
  const houses = listHouses().filter((house) => !house.seed);
  const focus = houses.length ? houses : listHouses();
  let livingTotal = 0;
  let livingOccupied = 0;
  let parkingTotal = 0;
  let parkingOccupied = 0;
  let charged = 0;
  let paid = 0;
  let due = 0;
  for (const house of focus) {
    livingTotal += house.total;
    livingOccupied += house.occupied;
    parkingTotal += house.parkingTotal;
    parkingOccupied += house.parkingOccupied;
    const unitList = units.filter(
      (unit) => (unit.houseId || SEED_HOUSE_ID) === house.id && unit.status !== "vacant",
    );
    const books = booksForUnits(unitList);
    charged += books.charged;
    paid += books.paid;
    due += openFolios()
      .filter((row) => (unitOf(row.stay.unitId).houseId || SEED_HOUSE_ID) === house.id)
      .reduce((sum, row) => sum + row.due, 0);
  }
  return {
    houses: focus.length,
    livingTotal,
    livingOccupied,
    parkingTotal,
    parkingOccupied,
    charged,
    paid,
    due,
    fill: livingTotal ? Math.round((livingOccupied / livingTotal) * 100) : 0,
  };
}

export function setCurrentHouse(id) {
  const known = id === SEED_HOUSE_ID || extraHouses.some((house) => house.id === id);
  if (!known) return null;
  beginPersist();
  activeHouseId = id;
  const store = readHouses();
  store.active = id;
  writeHouses(store);
  return id;
}

export function createHouse(input) {
  const name = String(input.name || "").trim();
  const address = String(input.address || "").trim();
  const kind = ["house", "apartments", "studios", "hotel"].includes(input.kind) ? input.kind : "house";
  if (name.length < 2 || name.length > 60) return { error: "Название — от 2 до 60 знаков." };
  if (!address || address.length > 80) return { error: "Напишите адрес или короткую пометку." };
  if (extraHouses.length >= 12) return { error: "Сейчас сеть держит двенадцать добавленных объектов." };

  const parking = Math.round(Number(input.parking));
  if (!Number.isInteger(parking) || parking < 0 || parking > 200) {
    return { error: "Парковочных мест — от 0 до 200." };
  }

  let mode = "custom";
  let floors = 0;
  let perFloor = 0;
  let studios = 0;
  let levels = null;

  const hasLevels = input.levels != null && String(input.levels).trim() !== "";
  if (hasLevels || input.mode === "custom" || (!input.mode && input.levels !== undefined)) {
    const parsed = parseLevels(input.levels);
    if (parsed.error) return parsed;
    mode = "custom";
    levels = parsed.levels;
    floors = levels.length;
    studios = parsed.living;
    perFloor = 0;
  } else if (input.mode === "numbers") {
    mode = "numbers";
    studios = Math.round(Number(input.studios));
    if (!Number.isInteger(studios) || studios < 1 || studios > 200) return { error: "Номеров от 1 до 200." };
  } else {
    mode = "floors";
    floors = Math.round(Number(input.floors));
    perFloor = Math.round(Number(input.perFloor));
    if (!Number.isInteger(floors) || floors < 1 || floors > 20) return { error: "Этажей от 1 до 20." };
    if (!Number.isInteger(perFloor) || perFloor < 1 || perFloor > 60) return { error: "На этаже от 1 до 60 номеров." };
    studios = floors * perFloor;
  }

  const serial = Math.max(1, ...extraHouses.map((house) => house.serial || 1)) + 1;
  const spec = {
    id: `h-${serial}`,
    name,
    address,
    kind,
    mode,
    studios,
    floors,
    perFloor,
    parking,
    levels: levels || undefined,
    rowsPerBand: floors || 1,
    perRow: perFloor || 4,
    serial,
    seed: false,
  };
  const codes = planCodes(spec) || [];
  if (codes.some((code) => unitByCode.has(code))) return { error: "Такие номера уже есть в сети." };
  for (let index = 1; index <= parking; index += 1) {
    if (unitByCode.has(parkingCode(serial, index))) return { error: "Коды парковки пересекаются с уже существующими." };
  }
  beginPersist();
  extraHouses.push(spec);
  buildGrid(spec);
  activeHouseId = spec.id;
  const store = readHouses();
  store.houses.push(spec);
  store.active = spec.id;
  writeHouses(store);
  return { house: spec };
}

export function removeHouse(id) {
  if (id === SEED_HOUSE_ID) return { error: "Учебный дом Salam Residences остаётся в сети." };
  const spec = extraHouses.find((house) => house.id === id);
  if (!spec) return { error: "Такого дома нет." };
  beginPersist();
  const doomed = units.filter((unit) => unit.houseId === id).map((unit) => unit.id);
  for (const unitId of doomed) {
    if (stayByUnit.has(unitId)) forgetCard(unitId);
    else {
      const unit = unitById.get(unitId);
      if (!unit) continue;
      spliceWhere(units, (item) => item.id === unitId);
      unitById.delete(unitId);
      unitByCode.delete(unit.code);
    }
  }
  extraHouses.splice(extraHouses.findIndex((house) => house.id === id), 1);
  const store = readHouses();
  store.houses = store.houses.filter((house) => house.id !== id);
  const cards = readCards();
  cards.added = cards.added.filter((row) => row.houseId !== id);
  writeCards(cards);
  if (activeHouseId === id) activeHouseId = SEED_HOUSE_ID;
  store.active = activeHouseId;
  writeHouses(store);
  return { name: spec.name };
}

export function houseOctober(houseId) {
  const stayIds = new Set(
    stays
      .filter((stay) => (unitOf(stay.unitId).houseId || SEED_HOUSE_ID) === houseId)
      .map((stay) => stay.id),
  );
  let charged = 0;
  let paid = 0;
  let deposit = 0;
  for (const entry of entries) {
    if (!stayIds.has(entry.stayId)) continue;
    if (entry.kind === "deposit") deposit += entry.amount;
    if (entry.kind === "rent" && entry.at.startsWith("2026-10")) charged += entry.amount;
    if (entry.kind === "payment" && entry.at.startsWith("2026-10")) paid += entry.amount;
  }
  return { charged, paid, deposit };
}

applyStaff();
applyCards();
