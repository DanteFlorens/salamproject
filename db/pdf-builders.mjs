import PDFDocument from "pdfkit";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { getKv } from "./postgres.mjs";
import { DEMO_PIN, SEED_HOUSE_ID, SEED_STAFF, buildSeedCatalog } from "./seed-catalog.mjs";

const FONT_REGULAR = fileURLToPath(new URL("./fonts/Roboto-Regular.ttf", import.meta.url));
const FONT_BOLD = fileURLToPath(new URL("./fonts/Roboto-Bold.ttf", import.meta.url));

export function safeStr(val, fallback = "—") {
  const text = String(val ?? "").trim();
  return text || fallback;
}

export function safeList(inventory, emptyLabel = "Опись имущества не заполнена") {
  if (Array.isArray(inventory)) {
    const items = inventory.map((item) => String(item ?? "").trim()).filter(Boolean);
    return items.length ? items : [emptyLabel];
  }
  const raw = String(inventory ?? "").trim();
  if (!raw) return [emptyLabel];
  const parts = raw
    .split(/[,;•\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length ? parts : [raw];
}

function formatMoneyRu(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${new Intl.NumberFormat("ru-RU").format(Math.round(n))} ₽`;
}

function formatDateRu(iso) {
  const text = String(iso || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "не указано";
  const [y, m, d] = text.split("-").map(Number);
  const months = [
    "января",
    "февраля",
    "марта",
    "апреля",
    "мая",
    "июня",
    "июля",
    "августа",
    "сентября",
    "октября",
    "ноября",
    "декабря",
  ];
  return `${d} ${months[m - 1]} ${y}`;
}

async function readKvValue(key) {
  const row = await getKv(key);
  return row?.value && typeof row.value === "object" ? row.value : null;
}

function depositFromBooks(books, stayId, fallback) {
  const payments = Array.isArray(books?.payments) ? books.payments : [];
  const deposit = payments.find((entry) => entry?.stayId === stayId && entry?.kind === "deposit");
  if (deposit && Number.isFinite(Number(deposit.amount))) return Number(deposit.amount);
  return fallback;
}

function cardToContext(card, house) {
  const code = String(card.code || "").trim();
  const unitId = `u-${code}`;
  const stayId = `s-${code}`;
  const rate = Number(card.monthlyRate) || 0;
  return {
    unit: {
      id: unitId,
      code,
      floor: card.floor,
      areaM2: card.areaM2,
      monthlyRate: rate,
      inventory: card.inventory,
      status: "occupied",
      houseId: card.houseId || house?.id || SEED_HOUSE_ID,
      unitKind: card.unitKind || "living",
    },
    stay: {
      id: stayId,
      unitId,
      partyId: `p-${code}`,
      contract: card.contract || `SR-${code}`,
      start: card.start,
      end: card.end,
    },
    resident: {
      id: `p-${code}`,
      name: card.name,
      phone: card.phone,
    },
    house,
    deposit: rate,
  };
}

/**
 * Собирает контекст договора: seed + cards + houses (+ books для залога).
 */
export async function resolveContractContext(unitCode) {
  const code = String(unitCode || "").trim();
  if (!code) {
    const error = new Error("Не указан код студии");
    error.status = 400;
    throw error;
  }

  const housesStore = (await readKvValue("salam-residences-houses")) || {};
  const cards = (await readKvValue("salam-residences-cards")) || { removed: [], added: [], edits: {} };
  const books = (await readKvValue("salam-residences-books")) || {};

  const houseList = Array.isArray(housesStore.houses) ? housesStore.houses : [];
  const defaultHouse = {
    id: SEED_HOUSE_ID,
    name: "Salam Residences",
    address: "Учебный дом, студии 18–35 м²",
  };
  const pickHouse = (houseId) => houseList.find((h) => h?.id === houseId) || defaultHouse;

  const removed = new Set((Array.isArray(cards.removed) ? cards.removed : []).map(String));
  const added = Array.isArray(cards.added) ? cards.added : [];
  const edits = cards.edits && typeof cards.edits === "object" ? cards.edits : {};

  const addedCard = added.find((row) => String(row?.code) === code);
  if (addedCard) {
    const house = pickHouse(addedCard.houseId);
    const ctx = cardToContext(addedCard, house);
    ctx.deposit = depositFromBooks(books, ctx.stay.id, ctx.deposit);
    return ctx;
  }

  const catalog = buildSeedCatalog();
  const unit = catalog.units.find((item) => item.code === code);
  if (!unit || removed.has(unit.id)) {
    const error = new Error("Студия не найдена или снята с учёта");
    error.status = 404;
    throw error;
  }

  const edit = edits[unit.id];
  if (edit) {
    const house = pickHouse(edit.houseId || unit.houseId);
    const ctx = cardToContext({ ...edit, code: edit.code || code }, house);
    ctx.deposit = depositFromBooks(books, ctx.stay.id, ctx.deposit);
    return ctx;
  }

  if (unit.status === "vacant") {
    const error = new Error("Нет активного проживания");
    error.status = 404;
    throw error;
  }

  const stay = catalog.stays.find((item) => item.unitId === unit.id);
  const resident = catalog.parties.find((item) => item.id === stay?.partyId);
  if (!stay || !resident) {
    const error = new Error("Нет активного проживания");
    error.status = 404;
    throw error;
  }

  const house = pickHouse(unit.houseId);
  return {
    unit,
    stay,
    resident,
    house,
    deposit: depositFromBooks(books, stay.id, catalog.deposits.get(stay.id) ?? unit.monthlyRate),
  };
}

export function registerPdfFonts(doc) {
  if (!fs.existsSync(FONT_REGULAR) || !fs.existsSync(FONT_BOLD)) {
    const error = new Error("Шрифты Roboto не найдены в db/fonts/");
    error.status = 500;
    throw error;
  }
  doc.registerFont("Roboto", FONT_REGULAR);
  doc.registerFont("Roboto-Bold", FONT_BOLD);
}

/**
 * Рисует договор аренды в уже созданный PDFDocument.
 */
export function buildContractPdf(doc, ctx) {
  registerPdfFonts(doc);
  doc.font("Roboto");

  const contractNo = safeStr(ctx.stay?.contract, `SR-${safeStr(ctx.unit?.code, "—")}`);
  const houseName = safeStr(ctx.house?.name, "Salam Residences");
  const houseAddress = safeStr(ctx.house?.address, "не указано");
  const residentName = safeStr(ctx.resident?.name, "не указано");
  const residentPhone = safeStr(ctx.resident?.phone, "не указано");
  const unitCode = safeStr(ctx.unit?.code, "—");
  const floor = ctx.unit?.floor != null && ctx.unit.floor !== "" ? String(ctx.unit.floor) : "—";
  const area = ctx.unit?.areaM2 != null && Number(ctx.unit.areaM2) > 0 ? `${ctx.unit.areaM2} м²` : "не указано";
  const rate = formatMoneyRu(ctx.unit?.monthlyRate);
  const deposit = formatMoneyRu(ctx.deposit ?? ctx.unit?.monthlyRate);
  const start = formatDateRu(ctx.stay?.start);
  const end = formatDateRu(ctx.stay?.end);
  const inventoryItems = safeList(ctx.unit?.inventory);

  doc.font("Roboto-Bold").fontSize(16).text("ДОГОВОР АРЕНДЫ", { align: "center" });
  doc.moveDown(0.4);
  doc.font("Roboto").fontSize(11).text(`№ ${contractNo}`, { align: "center" });
  doc.text(`Дата составления: ${formatDateRu(ctx.stay?.start)}`, { align: "center" });
  doc.moveDown(0.8);

  doc.font("Roboto-Bold").fontSize(12).text(houseName);
  doc.font("Roboto").fontSize(10).fillColor("#333").text(houseAddress);
  doc.fillColor("#000");
  doc.moveDown(0.8);

  doc.font("Roboto-Bold").fontSize(11).text("1. Стороны");
  doc.font("Roboto").fontSize(10);
  doc.text(`Арендодатель (оператор дома): ${houseName}`);
  doc.text(`Арендатор: ${residentName}`);
  doc.text(`Телефон арендатора: ${residentPhone}`);
  doc.moveDown(0.6);

  doc.font("Roboto-Bold").fontSize(11).text("2. Объект и условия");
  doc.font("Roboto").fontSize(10);
  doc.text(`Студия: ${unitCode}`);
  doc.text(`Этаж: ${floor}`);
  doc.text(`Площадь: ${area}`);
  doc.text(`Ставка аренды: ${rate} в месяц`);
  doc.text(`Залог: ${deposit}`);
  doc.moveDown(0.6);

  doc.font("Roboto-Bold").fontSize(11).text("3. Срок проживания");
  doc.font("Roboto").fontSize(10);
  doc.text(`С ${start} по ${end}`);
  doc.moveDown(0.6);

  doc.font("Roboto-Bold").fontSize(11).text("4. Опись имущества");
  doc.font("Roboto").fontSize(10);
  doc.moveDown(0.3);

  const tableTop = doc.y;
  const colNo = 50;
  const colItem = 90;
  const colW = 460;
  doc.font("Roboto-Bold");
  doc.text("№", colNo, tableTop, { width: 30 });
  doc.text("Наименование", colItem, tableTop, { width: colW });
  doc
    .moveTo(colNo, tableTop + 14)
    .lineTo(colNo + colW + 40, tableTop + 14)
    .stroke("#999");
  doc.font("Roboto");
  let y = tableTop + 20;
  inventoryItems.forEach((item, index) => {
    if (y > 720) {
      doc.addPage();
      y = 50;
    }
    doc.text(String(index + 1), colNo, y, { width: 30 });
    doc.text(item, colItem, y, { width: colW });
    y = doc.y + 6;
  });
  doc.y = y + 8;

  doc.moveDown(0.4);
  doc.font("Roboto").fontSize(9).fillColor("#555");
  doc.text("Операционный черновик (для внутренней работы). Не является юридически заверенным бланком.");
  doc.fillColor("#000");
  doc.moveDown(1.2);

  doc.font("Roboto").fontSize(10);
  const sigY = doc.y;
  doc.text("Арендодатель: ____________________ / подпись /", 50, sigY);
  doc.text("Арендатор: ____________________ / подпись /", 50, sigY + 28);
}

export function createContractDocument(ctx) {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 48, bottom: 48, left: 50, right: 50 },
    info: {
      Title: `Договор ${safeStr(ctx.stay?.contract, "SR")}`,
      Author: "Salam Residences",
    },
  });
  return doc;
}

/** Пишет договор в doc; вызывающий делает doc.pipe(res) до или после build, затем doc.end(). */
export function writeContractPdf(doc, ctx) {
  buildContractPdf(doc, ctx);
}

/** Проверка PIN сотрудника по KV + seed. */
export async function verifyStaffPin({ staffId, pin, role }) {
  const id = String(staffId || "").trim();
  const pinClean = String(pin || "").trim();
  if (!id || !/^\d{4}$/.test(pinClean)) {
    const error = new Error("Нужны staffId и PIN из 4 цифр");
    error.status = 400;
    throw error;
  }

  const store = (await readKvValue("salam-residences-staff")) || {};
  const accounts = store.accounts && typeof store.accounts === "object" ? { ...store.accounts } : {};
  for (const person of SEED_STAFF) {
    if (!accounts[person.id]) {
      accounts[person.id] = { phone: person.phone.replace(/\D/g, ""), pin: DEMO_PIN, seed: true };
    }
  }

  const account = accounts[id];
  if (!account) {
    const error = new Error("Сотрудник не найден");
    error.status = 401;
    throw error;
  }
  if (String(account.pin) !== pinClean) {
    const error = new Error("Неверный PIN");
    error.status = 401;
    throw error;
  }

  const people = [
    ...SEED_STAFF,
    ...(Array.isArray(store.people) ? store.people : []),
  ];
  const person = people.find((row) => row?.id === id);
  const resolvedRole = person?.role || role || "crew";
  return {
    staffId: id,
    role: resolvedRole,
    name: person?.name || id,
  };
}
