const money = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0,
});

const dateLong = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const monthLong = new Intl.DateTimeFormat("ru-RU", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const areaFmt = new Intl.NumberFormat("ru-RU");

export function formatMoney(value) {
  return money.format(value);
}

export function moneyHtml(value) {
  const formatted = money.format(value);
  const sign = "₽";
  const number = formatted.replace(sign, "").trim();
  return `${esc(number)} <span class="rub">${sign}</span>`;
}

export function formatDate(iso) {
  return dateLong.format(new Date(`${iso}T12:00:00Z`)).replace(/\s*г\.$/, "");
}

export function formatMonth(iso) {
  return monthLong.format(new Date(`${iso}T12:00:00Z`));
}

export function formatArea(squareMeters) {
  return `${areaFmt.format(squareMeters)} м²`;
}

export function lastName(fullName) {
  const parts = fullName.split(" ");
  return parts[parts.length - 1] ?? fullName;
}

export function daysBetween(fromIso, toIso) {
  const from = Date.parse(`${fromIso}T12:00:00Z`);
  const to = Date.parse(`${toIso}T12:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}

export function ruCount(n, one, few, many) {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return `${n} ${one}`;
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return `${n} ${few}`;
  return `${n} ${many}`;
}

export function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
