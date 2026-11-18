import { getUnit, currentSession } from "../domain.js";
import { scopeUnits, workingHouseId } from "../app/access.js";
import { createKernel } from "./kernel.js";
import { rulesPlan } from "./plan.js";
import { tools } from "./tools.js";

function readContext() {
  const session = currentSession();
  if (!session?.role) return { session: null, houseId: "", units: [], findUnit: () => null };
  return {
    session,
    houseId: workingHouseId(),
    units: session.role === "crew" ? [] : scopeUnits().slice(),
    findUnit(code) {
      if (typeof code !== "string" || !/^\d{3}$/.test(code)) return null;
      return getUnit(code) || null;
    },
  };
}

const kernel = createKernel({ tools, plan: rulesPlan, readContext });

export function ask(text, context) {
  return kernel.ask(text, context);
}

export function listTools(session) {
  return kernel.listTools(session ?? currentSession());
}

export { createKernel, rulesPlan, tools };
