/** Клиентский контур X-Florens-Token для PDF и защищённых API. */

const STORAGE_KEY = "florens-token";
const listeners = new Set();

function storage() {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

export function getFlorensToken() {
  const store = storage();
  if (!store?.getItem) return "";
  return store.getItem(STORAGE_KEY) || "";
}

export function setFlorensToken(token) {
  const store = storage();
  const value = String(token || "").trim();
  if (store?.setItem) {
    if (value) store.setItem(STORAGE_KEY, value);
    else store.removeItem(STORAGE_KEY);
  }
  for (const fn of listeners) fn(value);
  return value;
}

export function clearFlorensToken() {
  return setFlorensToken("");
}

export function onFlorensTokenChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Запрашивает токен у сервера после успешного PIN-входа.
 * @returns {Promise<{ ok: boolean, token?: string, error?: string }>}
 */
export async function requestFlorensSession({ staffId, pin, role }) {
  try {
    const response = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staffId, pin, role }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      clearFlorensToken();
      return { ok: false, error: body?.error || `HTTP ${response.status}` };
    }
    const token = String(body?.token || "").trim();
    if (!token) {
      clearFlorensToken();
      return { ok: false, error: "Сервер не выдал токен" };
    }
    setFlorensToken(token);
    return { ok: true, token, role: body.role, name: body.name };
  } catch (error) {
    clearFlorensToken();
    return { ok: false, error: error?.message || "Сеть недоступна" };
  }
}

export async function revokeFlorensSession() {
  const token = getFlorensToken();
  clearFlorensToken();
  if (!token) return;
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      headers: { "X-Florens-Token": token },
    });
  } catch {
    /* ignore */
  }
}
