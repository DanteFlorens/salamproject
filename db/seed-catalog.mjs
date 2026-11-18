/** Учебный каталог студий для серверных PDF (зеркало seed из domain.js). */

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
  18, 22, 27, 35, 20, 24, 31, 19, 23, 28, 33, 21, 26, 30, 18, 25, 29, 35, 22, 27, 32, 20, 24, 34, 19, 28, 31, 23, 26, 30, 21, 33, 25, 29, 18,
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

export const SEED_HOUSE_ID = "h-salam";

export const SEED_STAFF = [
  { id: "lead", role: "lead", name: "Лейла Ахмедова", title: "Руководитель", floors: [2, 3, 4, 5, 6], phone: "+7 900 200-00-01" },
  { id: "mgr-low", role: "manager", name: "Марат Гусев", title: "Управляющий", floors: [2, 3, 4], phone: "+7 900 200-00-02" },
  { id: "mgr-high", role: "manager", name: "Нина Ершова", title: "Управляющий", floors: [5, 6], phone: "+7 900 200-00-03" },
  { id: "plumb", role: "crew", name: "Илья Морозов", title: "Сантехник", floors: [], phone: "+7 900 200-00-04" },
  { id: "spark", role: "crew", name: "Карен Аветисян", title: "Электрик", floors: [], phone: "+7 900 200-00-05" },
  { id: "hand", role: "crew", name: "Олег Щукин", title: "Мастер", floors: [], phone: "+7 900 200-00-06" },
];

export const DEMO_PIN = "2026";

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

export function buildSeedCatalog() {
  const units = [];
  const parties = [];
  const stays = [];
  const deposits = new Map();
  let index = 0;

  for (const floor of [2, 3, 4, 5, 6]) {
    for (let door = 1; door <= 7; door += 1) {
      const code = `${floor}0${door}`;
      const area = AREAS[index];
      const rate = tariff(area, floor);
      const start = STARTS[index % STARTS.length];
      const end = contractEnd(start, index);
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
        houseId: SEED_HOUSE_ID,
        unitKind: "living",
      });
      parties.push({ id: partyId, name: NAMES[index], phone: phone(index) });
      stays.push({ id: stayId, unitId, partyId, contract: `SR-${code}`, start, end });
      deposits.set(stayId, rate);
      index += 1;
    }
  }

  return { units, parties, stays, deposits };
}
