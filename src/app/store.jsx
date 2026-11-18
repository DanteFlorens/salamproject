import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  AS_OF,
  currentSession,
  getUnit,
  listHouses,
  logoutStaff,
  setCurrentHouse,
  unitOf,
  units,
} from "../domain.js";
import { canEditUnits, inScope, workingHouseId } from "./access.js";
import { placeLabel } from "./labels.js";
import { revokeFlorensSession } from "../florensToken.js";
import { homeFor, readPath, redirectTarget, sameHash } from "./routes.js";

export { homeFor, isAuthPath, readPath, redirectTarget, sameHash } from "./routes.js";

const AppContext = createContext(null);

function mergeNavigation(prev, extra) {
  const retain = Boolean(extra?.retain);
  const rest = { ...(extra || {}) };
  delete rest.retain;
  const next = { ...prev, ...rest };
  if (retain) return { ...next, crewPicked: false };
  return {
    ...next,
    notice: Object.prototype.hasOwnProperty.call(rest, "notice") ? rest.notice : "",
    crewPicked: false,
    cardId: Object.prototype.hasOwnProperty.call(rest, "cardId") ? rest.cardId : "",
    draft: Object.prototype.hasOwnProperty.call(rest, "draft") ? rest.draft : null,
  };
}

const initialUi = {
  span: "month",
  desk: "overview",
  notice: "",
  inviteDraft: null,
  loginDraft: null,
  ownerDraft: null,
  crewPicked: false,
  cardId: "",
  draft: null,
  houseDraft: null,
  houseStep: 1,
  paletteOpen: false,
  paletteQuery: "",
  paletteIndex: 0,
  focusSheet: false,
  scrollSheet: false,
  scrollPeople: false,
};

export function AppProvider({ children }) {
  const [ui, setUi] = useState(initialUi);
  const [path, setPath] = useState(() => readPath());
  const [revision, setRevision] = useState(0);
  const pendingRef = useRef(null);

  const bump = useCallback(() => setRevision((n) => n + 1), []);

  const patch = useCallback((partial) => {
    setUi((prev) => (typeof partial === "function" ? partial(prev) : { ...prev, ...partial }));
    setRevision((n) => n + 1);
  }, []);

  const go = useCallback((href, extra = {}) => {
    if (sameHash(href)) {
      const rest = { ...extra };
      delete rest.retain;
      setUi((prev) => ({ ...prev, ...rest }));
      setRevision((n) => n + 1);
      return;
    }
    pendingRef.current = extra;
    location.hash = href;
  }, []);

  const openHouse = useCallback(
    (id) => {
      if (currentSession()?.role !== "lead") return;
      setCurrentHouse(id);
      const picked = listHouses().find((house) => house.id === id);
      go("/work", {
        draft: null,
        cardId: "",
        desk: "overview",
        notice: picked ? `Открыт «${picked.name}». План, жильцы и деньги — только по этому дому.` : "",
        retain: true,
      });
    },
    [go],
  );

  const beginOccupy = useCallback(
    (code, floor) => {
      if (!canEditUnits()) return;
      const unit = getUnit(code);
      if (unit && !inScope(unit)) return;
      const parking = unit?.unitKind === "parking";
      const draft = {
        code,
        floor: parking ? "0" : floor || "",
        areaM2: parking ? 12 : 22,
        monthlyRate: parking ? "5000" : "25000",
        name: "",
        phone: "",
        start: AS_OF,
        end: "2027-10-26",
        inventory: parking ? "Машиноместо" : "",
        contract: "",
        unitKind: unit?.unitKind || "living",
        houseId: unit?.houseId || workingHouseId(),
      };
      const label = unit ? placeLabel(unit) : code;
      go("/work", {
        cardId: "",
        desk: "plan",
        draft,
        notice: parking
          ? `${label}. Закрепите арендатора места — данные сразу в картине владельца.`
          : `${label}. Впишите имя и телефон. Тариф уже стоит, лентой его можно сменить.`,
        focusSheet: true,
        scrollSheet: true,
        retain: true,
      });
    },
    [go],
  );

  const beginEdit = useCallback(
    (unitId) => {
      if (!canEditUnits()) return;
      const unit = unitOf(unitId) || units.find((item) => item.id === unitId);
      if (unit && !inScope(unit)) return;
      patch({
        cardId: unitId,
        draft: null,
        notice: unit?.unitKind === "parking" ? "Обновите арендатора места." : "Поправьте жильца и сохраните.",
        focusSheet: true,
        scrollSheet: true,
        desk: "people",
      });
    },
    [patch],
  );

  const logout = useCallback(() => {
    logoutStaff();
    void revokeFlorensSession();
    go("/login", {
      notice: "Вы вышли. Войдите по телефону и PIN.",
      paletteOpen: false,
      retain: true,
    });
  }, [go]);

  useEffect(() => {
    const onHash = () => {
      const extra = pendingRef.current;
      pendingRef.current = null;
      setPath(readPath());
      setUi((prev) => mergeNavigation(prev, extra));
      setRevision((n) => n + 1);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [path]);

  const me = currentSession();
  const sessionKey = me ? `${me.id}:${me.role}` : "";

  useEffect(() => {
    const dest = redirectTarget(path, currentSession());
    if (!dest?.href || sameHash(dest.href)) {
      if (dest?.desk) setUi((prev) => (prev.desk === dest.desk ? prev : { ...prev, desk: dest.desk }));
      return;
    }
    pendingRef.current = dest.desk ? { desk: dest.desk } : null;
    location.hash = dest.href;
  }, [path, revision, sessionKey]);

  const value = useMemo(
    () => ({ ui, path, revision, me, patch, bump, go, openHouse, beginOccupy, beginEdit, logout, homeFor }),
    [ui, path, revision, me, patch, bump, go, openHouse, beginOccupy, beginEdit, logout],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp вне провайдера");
  return ctx;
}
