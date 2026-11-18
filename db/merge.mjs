/** Серверные merge-стратегии для слегка масштабируемого обмена. */

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function mergeById(baseList, incomingList, idKey = "id") {
  const map = new Map();
  for (const item of asArray(baseList)) {
    const id = item?.[idKey];
    if (id == null || id === "") continue;
    map.set(String(id), item);
  }
  for (const item of asArray(incomingList)) {
    const id = item?.[idKey];
    if (id == null || id === "") continue;
    map.set(String(id), item);
  }
  return [...map.values()];
}

function mergeReminders(baseList, incomingList) {
  const map = new Map();
  for (const item of [...asArray(baseList), ...asArray(incomingList)]) {
    if (!item?.stayId || !item?.at) continue;
    map.set(`${item.stayId}::${item.at}`, item);
  }
  return [...map.values()];
}

function mergeBooks(server, client) {
  const base = asObject(server);
  const next = asObject(client);
  return {
    ...base,
    ...next,
    payments: mergeById(base.payments, next.payments),
    expenses: mergeById(base.expenses, next.expenses),
    utilities: mergeById(base.utilities, next.utilities),
    reminders: mergeReminders(base.reminders, next.reminders),
  };
}

function mergeHouses(server, client) {
  const base = asObject(server);
  const next = asObject(client);
  return {
    ...base,
    ...next,
    active: typeof next.active === "string" ? next.active : base.active || "h-salam",
    houses: mergeById(base.houses, next.houses),
  };
}

function mergeStaff(server, client) {
  const base = asObject(server);
  const next = asObject(client);
  return {
    ...base,
    ...next,
    people: mergeById(base.people, next.people),
    accounts: { ...asObject(base.accounts), ...asObject(next.accounts) },
    invites: mergeById(base.invites, next.invites, "code"),
    sessionId: typeof next.sessionId === "string" ? next.sessionId : base.sessionId || "",
  };
}

function mergeTasks(server, client) {
  const base = asObject(server);
  const next = asObject(client);
  return {
    ...base,
    ...next,
    status: { ...asObject(base.status), ...asObject(next.status) },
    created: mergeById(base.created, next.created),
    whatsapp: [...new Set([...asArray(base.whatsapp), ...asArray(next.whatsapp)].filter(Boolean))],
  };
}

function mergeCards(server, client) {
  const base = asObject(server);
  const next = asObject(client);
  const removed = [...new Set([...asArray(base.removed), ...asArray(next.removed)].filter(Boolean))];
  return {
    ...base,
    ...next,
    removed,
    added: mergeById(base.added, next.added, "code"),
    edits: { ...asObject(base.edits), ...asObject(next.edits) },
  };
}

const MERGERS = {
  "salam-residences-books": mergeBooks,
  "salam-residences-houses": mergeHouses,
  "salam-residences-staff": mergeStaff,
  "salam-residences-tasks": mergeTasks,
  "salam-residences-cards": mergeCards,
};

export function mergeStoreValue(key, serverValue, clientValue) {
  const merge = MERGERS[key];
  if (!merge) return clientValue;
  if (serverValue == null) return clientValue;
  if (clientValue == null) return serverValue;
  return merge(serverValue, clientValue);
}

export function emptyBooks() {
  return { payments: [], expenses: [], utilities: [], reminders: [] };
}

export function emptyHouses() {
  return { active: "h-salam", houses: [] };
}
