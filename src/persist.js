/** Клиентский слой: Postgres на сервере — источник правды, localStorage — кэш. */

import { mergeStoreValue } from "../db/merge.mjs";

export const STORE_KEYS = Object.freeze([
  "salam-residences-books",
  "salam-residences-staff",
  "salam-residences-tasks",
  "salam-residences-cards",
  "salam-residences-houses",
]);

/** Ключи полного снимка: replace + revision. Books при конфликте можно merge. */
const MERGE_ON_CONFLICT = new Set(["salam-residences-books"]);

const queue = new Map();
const revisions = new Map();
let serverOnline = false;
let flushTimer = null;
let hydrateDone = false;
let flushing = false;
let flushFailures = 0;
let lastFlushError = "";
let lastConflict = false;
const MAX_FLUSH_FAILURES = 8;

function storage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

async function api(path, options) {
  if (typeof fetch !== "function") {
    const error = new Error("fetch unavailable");
    error.status = 503;
    throw error;
  }
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!response.ok) {
    const error = new Error(body?.error || `HTTP ${response.status}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

function writeCache(key, value) {
  const store = storage();
  if (!store?.setItem) return false;
  store.setItem(key, JSON.stringify(value));
  return true;
}

function readCache(key) {
  const store = storage();
  if (!store?.getItem) return null;
  const raw = store.getItem(key);
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function rememberRevisions(map) {
  if (!map || typeof map !== "object") return;
  for (const [key, revision] of Object.entries(map)) {
    if (STORE_KEYS.includes(key) && Number.isFinite(Number(revision))) {
      revisions.set(key, Number(revision));
    }
  }
}

function applySnapshot(snapshot) {
  const serverKeys = snapshot?.keys && typeof snapshot.keys === "object" ? snapshot.keys : {};
  rememberRevisions(snapshot?.revisions);
  for (const key of STORE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(serverKeys, key)) {
      writeCache(key, serverKeys[key]);
    }
  }
  return serverKeys;
}

function scheduleFlush() {
  if (flushTimer || flushing) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushQueue();
  }, 40);
}

function revisionPayload(keys) {
  const out = {};
  for (const key of Object.keys(keys)) {
    if (revisions.has(key)) out[key] = revisions.get(key);
  }
  return out;
}

function acceptSaved(saved) {
  if (saved?.revisions) rememberRevisions(saved.revisions);
  else if (Array.isArray(saved?.saved)) {
    rememberRevisions(Object.fromEntries(saved.saved.map((row) => [row.key, row.revision])));
  }
  for (const row of saved?.saved || []) {
    if (row?.key && row.value !== undefined) writeCache(row.key, row.value);
  }
}

async function resolveConflict(batch) {
  lastConflict = true;
  const snapshot = await api("/api/kv");
  const serverKeys = applySnapshot(snapshot);
  for (const [key, value] of Object.entries(batch)) {
    if (!MERGE_ON_CONFLICT.has(key)) continue;
    queue.set(key, mergeStoreValue(key, serverKeys[key], value));
  }
}

async function flushQueue() {
  if (flushing) return !queue.size;
  flushing = true;
  let ok = true;
  let sawConflict = false;
  try {
    while (queue.size) {
      const batch = Object.fromEntries(queue.entries());
      queue.clear();
      try {
        const saved = await api("/api/kv", {
          method: "PUT",
          body: JSON.stringify({
            keys: batch,
            merge: false,
            revisions: revisionPayload(batch),
          }),
        });
        serverOnline = true;
        flushFailures = 0;
        lastFlushError = "";
        acceptSaved(saved);
      } catch (error) {
        if (error?.status === 409) {
          try {
            await resolveConflict(batch);
            sawConflict = true;
            serverOnline = true;
            lastFlushError = "";
            continue;
          } catch (resolveError) {
            lastFlushError = resolveError?.message || error.message || "conflict";
          }
        }
        for (const [key, value] of Object.entries(batch)) {
          if (!queue.has(key)) queue.set(key, value);
        }
        serverOnline = false;
        flushFailures += 1;
        lastFlushError = lastFlushError || error?.message || "flush failed";
        ok = false;
        if (flushFailures >= MAX_FLUSH_FAILURES || typeof fetch !== "function") break;
        await new Promise((resolve) => setTimeout(resolve, Math.min(1000, 40 * flushFailures)));
      }
    }
  } finally {
    flushing = false;
    lastConflict = sawConflict;
    if (queue.size && flushFailures < MAX_FLUSH_FAILURES && typeof fetch === "function") {
      scheduleFlush();
    }
  }
  return ok && !queue.size;
}

/** Тянет снимок с сервера; если сервер пуст — заливает локальный кэш. */
export async function hydratePersist() {
  if (hydrateDone) return { ok: serverOnline, source: "cache" };
  try {
    const snapshot = await api("/api/kv");
    serverOnline = true;
    const serverKeys = snapshot?.keys && typeof snapshot.keys === "object" ? snapshot.keys : {};
    rememberRevisions(snapshot?.revisions);
    const hasServerData = STORE_KEYS.some((key) => Object.prototype.hasOwnProperty.call(serverKeys, key));

    if (hasServerData) {
      applySnapshot(snapshot);
      const orphans = {};
      for (const key of STORE_KEYS) {
        if (Object.prototype.hasOwnProperty.call(serverKeys, key)) continue;
        const value = readCache(key);
        if (value != null) orphans[key] = value;
      }
      if (Object.keys(orphans).length) {
        const saved = await api("/api/kv", {
          method: "PUT",
          body: JSON.stringify({ keys: orphans, merge: false, revisions: revisionPayload(orphans) }),
        });
        acceptSaved(saved);
      }
      hydrateDone = true;
      flushFailures = 0;
      return { ok: true, source: Object.keys(orphans).length ? "server+orphans" : "server" };
    }

    const local = {};
    for (const key of STORE_KEYS) {
      const value = readCache(key);
      if (value != null) local[key] = value;
    }
    if (Object.keys(local).length) {
      const saved = await api("/api/kv", {
        method: "PUT",
        body: JSON.stringify({ keys: local, merge: false }),
      });
      acceptSaved(saved);
    }
    hydrateDone = true;
    flushFailures = 0;
    return { ok: true, source: Object.keys(local).length ? "migrated" : "empty" };
  } catch {
    serverOnline = false;
    hydrateDone = true;
    return { ok: false, source: "offline-cache" };
  }
}

/** Локальная запись + постановка в очередь синка на SQLite. */
export function persistWrite(key, value) {
  const cached = writeCache(key, value);
  queue.set(key, value);
  if (flushFailures >= MAX_FLUSH_FAILURES) flushFailures = 0;
  scheduleFlush();
  return cached;
}

export function isPersistOnline() {
  return serverOnline;
}

export function persistPendingCount() {
  return queue.size;
}

export function persistFlushError() {
  return lastFlushError;
}

export function persistHadConflict() {
  return lastConflict;
}

export function persistRevisions() {
  return Object.fromEntries(revisions.entries());
}

export async function flushPersist() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  return flushQueue();
}

/** Сброс внутренних флагов — только для тестов. */
export function resetPersistForTests() {
  queue.clear();
  revisions.clear();
  serverOnline = false;
  hydrateDone = false;
  flushing = false;
  flushFailures = 0;
  lastFlushError = "";
  lastConflict = false;
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
}
