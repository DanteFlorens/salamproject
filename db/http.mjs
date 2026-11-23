import { randomUUID } from "node:crypto";
import {
  STORE_KEYS,
  appendExpense,
  appendPayment,
  getKv,
  health,
  listHouses,
  listKv,
  listMoneyEvents,
  putKv,
  putKvBatch,
  setActiveHouse,
  upsertHouseSpec,
} from "./postgres.mjs";
import {
  createContractDocument,
  resolveContractContext,
  safeStr,
  verifyStaffPin,
  writeContractPdf,
} from "./pdf-builders.mjs";

/** Активные PDF/API-сессии в памяти процесса: token → { staffId, role, name, at } */
const sessions = new Map();

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,PUT,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Florens-Token",
};

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...CORS,
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 8_000_000) {
        reject(Object.assign(new Error("Body too large"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!chunks.length) {
        resolve(null);
        return;
      }
      const raw = Buffer.concat(chunks).toString("utf8");
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(Object.assign(new Error("Invalid JSON"), { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}

function notFound(res) {
  sendJson(res, 404, { error: "not found" });
}

function headerToken(req) {
  const raw = req.headers["x-florens-token"];
  return typeof raw === "string" ? raw.trim() : "";
}

/**
 * Проверяет X-Florens-Token. Crew — 403. Возвращает session или false, если ответ уже отправлен.
 */
export function requirePdfAuth(req, res) {
  const token = headerToken(req);
  if (!token) {
    sendJson(res, 401, { error: "Нужен заголовок X-Florens-Token" });
    return false;
  }
  const session = sessions.get(token);
  if (!session) {
    sendJson(res, 401, { error: "Сессия недействительна. Войдите снова." });
    return false;
  }
  if (session.role === "crew") {
    sendJson(res, 403, { error: "Скачивание PDF недоступно для роли crew" });
    return false;
  }
  return session;
}

function issueSession(person) {
  const token = randomUUID();
  sessions.set(token, {
    staffId: person.staffId,
    role: person.role,
    name: person.name,
    at: Date.now(),
  });
  return token;
}

/**
 * Handles /api/* for Node http or Vite connect middleware.
 * Returns true if the request was handled.
 */
export async function handleApi(req, res, url) {
  const pathname = url.pathname;
  if (!pathname.startsWith("/api/")) return false;

  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return true;
  }

  try {
    if (pathname === "/api/health" && req.method === "GET") {
      sendJson(res, 200, await health());
      return true;
    }

    if (pathname === "/api/auth/session" && req.method === "POST") {
      const body = await readBody(req);
      const person = await verifyStaffPin({
        staffId: body?.staffId || body?.id,
        pin: body?.pin,
        role: body?.role,
      });
      const token = issueSession(person);
      sendJson(res, 200, {
        ok: true,
        token,
        staffId: person.staffId,
        role: person.role,
        name: person.name,
      });
      return true;
    }

    if (pathname === "/api/auth/logout" && req.method === "POST") {
      const token = headerToken(req);
      if (token) sessions.delete(token);
      sendJson(res, 200, { ok: true });
      return true;
    }

    const pdfContract = pathname.match(/^\/api\/pdf\/contract\/([^/]+)$/);
    if (pdfContract && req.method === "GET") {
      const session = requirePdfAuth(req, res);
      if (!session) return true;

      const unitCode = decodeURIComponent(pdfContract[1]);
      let ctx;
      try {
        ctx = await resolveContractContext(unitCode);
      } catch (error) {
        const status = Number(error?.status) || 500;
        sendJson(res, status, { error: error?.message || "Не удалось собрать договор" });
        return true;
      }

      const contractNo = safeStr(ctx.stay?.contract, `SR-${unitCode}`);
      const filename = `contract-${contractNo.replace(/[^\w.-]+/g, "_")}.pdf`;
      let piped = false;
      try {
        const doc = createContractDocument(ctx);
        writeContractPdf(doc, ctx);
        res.writeHead(200, {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
          ...CORS,
        });
        piped = true;
        doc.on("error", () => {
          if (!res.writableEnded) res.destroy();
        });
        doc.pipe(res);
        doc.end();
      } catch (error) {
        if (!piped) {
          sendJson(res, Number(error?.status) || 500, {
            error: error?.message || "Ошибка генерации PDF",
          });
        } else if (!res.writableEnded) {
          res.destroy();
        }
      }
      return true;
    }

    if (pathname === "/api/kv" && req.method === "GET") {
      sendJson(res, 200, { ...(await listKv()), keysList: STORE_KEYS });
      return true;
    }

    if (pathname === "/api/kv" && (req.method === "PUT" || req.method === "POST")) {
      const body = await readBody(req);
      const entries = body?.keys && typeof body.keys === "object" ? body.keys : body;
      if (!entries || typeof entries !== "object" || Array.isArray(entries)) {
        sendJson(res, 400, { error: "Expected object of store keys" });
        return true;
      }
      const saved = await putKvBatch(entries, {
        // По умолчанию replace: полный снимок domain не должен воскрешать удаления через merge.
        merge: body?.merge === true,
        revisions: body?.revisions,
      });
      sendJson(res, 200, {
        ok: true,
        saved,
        revisions: Object.fromEntries(saved.map((row) => [row.key, row.revision])),
      });
      return true;
    }

    const kvMatch = pathname.match(/^\/api\/kv\/([^/]+)$/);
    if (kvMatch) {
      const key = decodeURIComponent(kvMatch[1]);
      if (req.method === "GET") {
        const row = await getKv(key);
        if (!row) {
          sendJson(res, 404, { error: "missing", key });
          return true;
        }
        sendJson(res, 200, row);
        return true;
      }
      if (req.method === "PUT" || req.method === "POST") {
        const body = await readBody(req);
        const value = body && Object.prototype.hasOwnProperty.call(body, "value") ? body.value : body;
        const saved = await putKv(key, value, {
          merge: body?.merge === true,
          expectedRevision: body?.revision ?? body?.expectedRevision,
        });
        sendJson(res, 200, { ok: true, ...saved });
        return true;
      }
    }

    if (pathname === "/api/houses" && req.method === "GET") {
      sendJson(res, 200, { houses: await listHouses() });
      return true;
    }

    if (pathname === "/api/money" && req.method === "GET") {
      sendJson(res, 200, {
        events: await listMoneyEvents({
          houseId: url.searchParams.get("houseId") || undefined,
          kind: url.searchParams.get("kind") || undefined,
          limit: url.searchParams.get("limit") || 200,
        }),
      });
      return true;
    }

    if (pathname === "/api/ops/payment" && req.method === "POST") {
      const body = await readBody(req);
      const payment = body?.payment || body;
      const saved = await appendPayment(payment);
      sendJson(res, 200, { ok: true, ...saved });
      return true;
    }

    if (pathname === "/api/ops/expense" && req.method === "POST") {
      const body = await readBody(req);
      const expense = body?.expense || body;
      const saved = await appendExpense(expense);
      sendJson(res, 200, { ok: true, ...saved });
      return true;
    }

    if (pathname === "/api/ops/house" && req.method === "POST") {
      const body = await readBody(req);
      const house = body?.house || body;
      const saved = await upsertHouseSpec(house, body?.active);
      sendJson(res, 200, { ok: true, ...saved });
      return true;
    }

    if (pathname === "/api/ops/house/active" && (req.method === "PUT" || req.method === "POST")) {
      const body = await readBody(req);
      const saved = await setActiveHouse(body?.id || body?.active);
      sendJson(res, 200, { ok: true, ...saved });
      return true;
    }

    notFound(res);
    return true;
  } catch (error) {
    const status = Number(error?.status) || 500;
    sendJson(res, status, {
      error: error?.message || "server error",
      ...(error?.body && typeof error.body === "object" ? error.body : {}),
    });
    return true;
  }
}

/** Connect-style middleware for Vite. */
export function apiMiddleware(req, res, next) {
  const host = req.headers.host || "127.0.0.1";
  const url = new URL(req.url || "/", `http://${host}`);
  if (!url.pathname.startsWith("/api/")) {
    next();
    return;
  }
  Promise.resolve(handleApi(req, res, url)).catch((error) => {
    sendJson(res, 500, { error: error?.message || "server error" });
  });
}
