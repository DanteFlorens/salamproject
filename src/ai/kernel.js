import { normalize } from "./plan.js";

const FAIL = "Не получилось посчитать.";
const MAX_PHRASE = 500;

function envelope({ ok, code, tool = null, args = null, text, data = null }) {
  return { ok, code, tool, args, text, data };
}

function catalog(list) {
  return list.map((tool) => ({
    id: String(tool.id),
    title: String(tool.title || tool.id),
    roles: tool.roles.slice(),
    examples: Array.isArray(tool.examples) ? tool.examples.slice() : [],
  }));
}

function forPlan(tool) {
  return {
    ...catalog([tool])[0],
    parse: tool.parse,
  };
}

function allowed(tools, session) {
  if (!session?.role) return [];
  return tools.filter((tool) => Array.isArray(tool.roles) && tool.roles.includes(session.role));
}

function unknownText(list) {
  const hints = list.map((tool) => tool.examples?.[0]).filter(Boolean);
  if (!hints.length) return "Не понял запрос.";
  return `Не понял запрос. Можно спросить: ${hints.join("; ")}.`;
}

function plainArgs(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const args = {};
  for (const key of Object.keys(value)) {
    const item = value[key];
    if (item === null || ["string", "number", "boolean"].includes(typeof item)) args[key] = item;
  }
  return args;
}

function plainData(value) {
  if (value == null) return null;
  return JSON.parse(JSON.stringify(value));
}

function acceptContext(context) {
  if (!context || typeof context !== "object" || Array.isArray(context)) return null;
  if (!context.session || typeof context.session !== "object") {
    return { session: null, houseId: "", units: [], findUnit: () => null };
  }
  if (typeof context.houseId !== "string" || !Array.isArray(context.units)) return null;
  return {
    session: context.session,
    houseId: context.houseId,
    units: context.units.slice(),
    findUnit: typeof context.findUnit === "function" ? context.findUnit : () => null,
  };
}

export function createKernel({ tools = [], plan, readContext }) {
  const list = tools.slice();

  return {
    listTools(session) {
      return catalog(allowed(list, session));
    },

    ask(text, context) {
      if (typeof text !== "string" || !text.trim()) {
        return envelope({ ok: false, code: "unknown", text: "Напишите, что нужно узнать." });
      }
      if (text.length > MAX_PHRASE) {
        return envelope({ ok: false, code: "unknown", text: "Слишком длинный запрос." });
      }

      let ctx;
      try {
        ctx = context === undefined ? readContext() : acceptContext(context);
      } catch {
        return envelope({ ok: false, code: "error", text: FAIL });
      }
      if (!ctx) return envelope({ ok: false, code: "error", text: FAIL });
      if (!ctx.session?.role) return envelope({ ok: false, code: "auth", text: "Сначала войдите." });

      const visible = allowed(list, ctx.session);
      let choice;
      try {
        choice = plan(normalize(text), visible.map(forPlan));
      } catch {
        return envelope({ ok: false, code: "error", text: FAIL });
      }
      if (!choice?.id) return envelope({ ok: false, code: "unknown", text: unknownText(visible) });

      const tool = visible.find((item) => item.id === choice.id);
      const args = plainArgs(choice.args);
      if (!tool) {
        return envelope({
          ok: false,
          code: "forbidden",
          tool: String(choice.id),
          args,
          text: "Этого из вашего доступа не видно.",
        });
      }

      try {
        const result = tool.run(args, ctx) || {};
        if (result.status === "forbidden") {
          return envelope({
            ok: false,
            code: "forbidden",
            tool: tool.id,
            args,
            text: typeof result.text === "string" ? result.text : "Этого из вашего доступа не видно.",
          });
        }
        if (result.status === "unknown") {
          return envelope({
            ok: false,
            code: "unknown",
            tool: tool.id,
            args,
            text: typeof result.text === "string" ? result.text : unknownText(visible),
          });
        }
        if (result.status !== "ok") return envelope({ ok: false, code: "error", tool: tool.id, args, text: FAIL });
        return envelope({
          ok: true,
          code: "ok",
          tool: tool.id,
          args,
          text: typeof result.text === "string" ? result.text : "",
          data: plainData(result.data),
        });
      } catch {
        return envelope({ ok: false, code: "error", tool: tool.id, args, text: FAIL });
      }
    },
  };
}
