/** Правила разбора фразы. Позже на это место встаёт модель с тем же ответом: { id, args } или null. */

export function normalize(text) {
  return String(text ?? "")
    .replace(/ё/gi, "е")
    .toLowerCase()
    .replace(/[?!.,;:()«»"'`]/g, " ")
    .replace(/[—–\-№]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function rulesPlan(text, tools) {
  const phrase = normalize(text);
  if (!phrase) return null;
  for (const tool of tools) {
    if (typeof tool.parse !== "function") continue;
    const args = tool.parse(phrase);
    if (args && typeof args === "object" && !Array.isArray(args)) return { id: tool.id, args };
  }
  return null;
}
