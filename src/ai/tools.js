import {
  SEED_HOUSE_ID,
  getParty,
  housePicture,
  networkBrief,
  openFolios,
  ownerDailyDigest,
  personById,
  rentDue,
  stays,
  tasksVisibleTo,
} from "../domain.js";

const BLOCK_UNIT =
  /долг|кто должен|задолжен|задач|поручен|все дома|вся сеть|по сети|по всем домам|сеть домов|брифинг|что сегодня|на сегодня|сводка владельца|(?:^|\s)сеть(?:\s|$)/;

function houseOf(unit) {
  return unit?.houseId || SEED_HOUSE_ID;
}

export function codeIn(text) {
  const match = String(text || "").match(/(?:^|[^0-9])(\d{3})(?![0-9])/);
  return match ? match[1] : "";
}

function actor(ctx) {
  const session = ctx?.session;
  if (!session?.id || !session.role) return null;
  const person = personById(session.id);
  if (!person || person.role !== session.role) return null;
  return person;
}

function scopedUnit(ctx, code) {
  const asked = String(code ?? "");
  if (!/^\d{3}$/.test(asked) || typeof ctx.findUnit !== "function") return { status: "unknown" };
  const unit = ctx.findUnit(asked);
  if (!unit || unit.code !== asked || houseOf(unit) !== ctx.houseId) return { status: "unknown" };
  const visible = Array.isArray(ctx.units) ? ctx.units : [];
  if (!visible.some((item) => item && item.id === unit.id && item.code === asked)) return { status: "forbidden" };
  return { status: "ok", unit };
}

function residentOf(unit) {
  const stay = stays.find((item) => item.unitId === unit.id) || null;
  if (!stay) return { resident: null, due: 0 };
  return { resident: getParty(stay.partyId)?.name || null, due: rentDue(stay.id) };
}

export const tools = [
  {
    id: "owner.digest",
    title: "Брифинг владельца",
    roles: ["lead"],
    examples: ["брифинг", "что сегодня"],
    parse(text) {
      if (
        text === "брифинг" ||
        /(?:^|\s)(?:брифинг|что сегодня|на сегодня|сводка владельца|день владельца)(?:\s|$)/.test(text)
      ) {
        return {};
      }
      return null;
    },
    run(_args, ctx) {
      if (actor(ctx)?.role !== "lead") return { status: "forbidden", text: "Этого из вашего доступа не видно." };
      const data = ownerDailyDigest();
      return {
        status: "ok",
        text: data.headline,
        data,
      };
    },
  },
  {
    id: "network.brief",
    title: "Сеть домов",
    roles: ["lead"],
    examples: ["все дома"],
    parse(text) {
      if (text === "сеть" || /(?:^|\s)(?:все дома|вся сеть|по сети|по всем домам|сеть домов)(?:\s|$)/.test(text)) {
        return {};
      }
      return null;
    },
    run(_args, ctx) {
      if (actor(ctx)?.role !== "lead") return { status: "forbidden", text: "Этого из вашего доступа не видно." };
      const data = networkBrief();
      return {
        status: "ok",
        text: `Домов ${data.houses}, заполнено ${data.fill}%, долг ${data.due}.`,
        data,
      };
    },
  },
  {
    id: "rent.due",
    title: "Долги по аренде",
    roles: ["lead", "manager"],
    examples: ["кто должен"],
    parse(text) {
      if (!/долг|кто должен|задолжен/.test(text)) return null;
      const code = codeIn(text);
      return code ? { code } : {};
    },
    run(args, ctx) {
      const units = Array.isArray(ctx.units) ? ctx.units : [];
      let ids = new Set(units.map((unit) => unit.id));
      if (args.code) {
        const found = scopedUnit(ctx, args.code);
        if (found.status !== "ok") {
          return found.status === "forbidden"
            ? { status: "forbidden", text: "Этой студии нет в вашем доступе." }
            : { status: "unknown", text: "Такой студии нет." };
        }
        ids = new Set([found.unit.id]);
      }
      const byId = new Map(units.map((unit) => [unit.id, unit]));
      const rows = openFolios()
        .filter((row) => ids.has(row.stay.unitId))
        .map((row) => ({
          code: byId.get(row.stay.unitId)?.code || "",
          due: row.due,
        }));
      const due = rows.reduce((sum, row) => sum + row.due, 0);
      const text = args.code
        ? rows.length
          ? `Долг по студии ${args.code}: ${due}.`
          : `По студии ${args.code} открытого долга нет.`
        : rows.length
          ? `Долг по аренде ${due}, студий ${rows.length}.`
          : "Открытых долгов по аренде нет.";
      return { status: "ok", text, data: { due, count: rows.length, rows } };
    },
  },
  {
    id: "tasks.list",
    title: "Задачи",
    roles: ["lead", "manager", "crew"],
    examples: ["задачи"],
    parse(text) {
      if (!/задач|поручен/.test(text)) return null;
      const code = codeIn(text);
      return code ? { code } : {};
    },
    run(args, ctx) {
      const person = actor(ctx);
      if (!person) return { status: "forbidden", text: "Этого из вашего доступа не видно." };
      let rows = tasksVisibleTo(person.id).map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        unitCode: task.unitCode,
        text: task.text,
      }));
      if (args.code) rows = rows.filter((task) => task.unitCode === String(args.code));
      const text = args.code
        ? rows.length
          ? `Задач по студии ${args.code}: ${rows.length}.`
          : "По этому номеру задач нет."
        : rows.length
          ? `Задач ${rows.length}.`
          : "Открытых задач нет.";
      return { status: "ok", text, data: { count: rows.length, rows } };
    },
  },
  {
    id: "house.brief",
    title: "Сводка дома",
    roles: ["lead", "manager"],
    examples: ["сводка"],
    parse(text) {
      if (codeIn(text)) return null;
      if (text === "дом" || /(?:^|\s)(?:сводка|что по дому|картина|состояние дома)(?:\s|$)/.test(text)) return {};
      return null;
    },
    run(_args, ctx) {
      const data = housePicture(Array.isArray(ctx.units) ? ctx.units : []);
      return {
        status: "ok",
        text: `Студий ${data.units}. Аренда к сбору ${data.rentDue}, коммуналка ${data.utilityDue}.`,
        data,
      };
    },
  },
  {
    id: "unit.lookup",
    title: "Студия",
    roles: ["lead", "manager"],
    examples: ["студия 203"],
    parse(text) {
      const code = codeIn(text);
      if (!code || BLOCK_UNIT.test(text)) return null;
      return { code };
    },
    run(args, ctx) {
      const found = scopedUnit(ctx, args.code);
      if (found.status === "forbidden") return { status: "forbidden", text: "Этой студии нет в вашем доступе." };
      if (found.status !== "ok") return { status: "unknown", text: "Такой студии нет." };
      const { resident, due } = residentOf(found.unit);
      return {
        status: "ok",
        text: resident ? `Студия ${found.unit.code}: ${resident}. Долг ${due}.` : `Студия ${found.unit.code} свободна.`,
        data: {
          code: found.unit.code,
          floor: found.unit.floor,
          status: found.unit.status,
          resident,
          due,
        },
      };
    },
  },
];
