import { useEffect, useRef } from "react";
import { AS_OF, partyOf, residence, stayOfUnit, unreadFor } from "../domain.js";
import { formatDate } from "../format.js";
import { floorPhrase, scopeUnits } from "../app/access.js";
import { placeLabel } from "../app/labels.js";
import { useApp } from "../app/store.jsx";

function commandItems(me, query) {
  if (!me) return [];
  const needle = query.trim().toLowerCase();
  const items = [];
  if (me.role !== "crew") {
    if (me.role === "lead") {
      items.push(
        { id: "homes", label: "Дома", hint: "Сеть объектов", href: "/" },
        { id: "work", label: "Текущий дом", hint: "План и жильцы", href: "/work", desk: "overview" },
        { id: "reports", label: "Отчёты", hint: "Все дома · сутки/неделя/месяц", href: "/reports" },
        { id: "tasks", label: "Задачи", hint: "Поручения", href: "/tasks" },
        { id: "team", label: "Команда", hint: "Приглашения", href: "/team" },
      );
    } else {
      items.push(
        { id: "home", label: "Дом", hint: "Ваши этажи", href: "/work", desk: "overview" },
        { id: "tasks", label: "Задачи", hint: "Поручения", href: "/tasks" },
      );
    }
    for (const unit of scopeUnits()) {
      const stay = unit.status === "vacant" ? null : stayOfUnit(unit.id);
      const party = stay ? partyOf(stay.partyId) : null;
      items.push({
        id: `u-${unit.id}`,
        label: `${placeLabel(unit)}${party ? ` · ${party.name}` : " · свободна"}`,
        hint: unit.status === "vacant" ? "Заселить" : `Этаж ${unit.floor || "—"}`,
        href: `/apartments/${unit.code}`,
      });
    }
  } else {
    items.push({ id: "tasks", label: "Поручения", hint: "Сегодня", href: "/tasks" });
  }
  if (!needle) return items.slice(0, 12);
  return items.filter((item) => `${item.label} ${item.hint}`.toLowerCase().includes(needle)).slice(0, 12);
}

function NavLink({ href, children }) {
  const { path } = useApp();
  const active = path === href;
  return (
    <a className={active ? "nav-link active" : "nav-link"} href={`#${href}`} aria-current={active ? "page" : undefined}>
      {children}
    </a>
  );
}

function Palette({ items, index, onRun }) {
  const { ui, patch } = useApp();
  useEffect(() => {
    if (!ui.paletteOpen) return;
    const field = document.getElementById("palette-q");
    field?.focus();
    const len = field?.value.length ?? 0;
    field?.setSelectionRange(len, len);
  }, [ui.paletteOpen]);

  if (!ui.paletteOpen) return null;
  return (
    <div
      className="palette"
      role="dialog"
      aria-modal="true"
      aria-label="Команды"
      onClick={(event) => {
        if (event.target === event.currentTarget) patch({ paletteOpen: false });
      }}
    >
      <div className="palette-panel">
        <input
          id="palette-q"
          className="palette-input"
          type="search"
          placeholder="Квартира, жилец, раздел…"
          value={ui.paletteQuery}
          autoComplete="off"
          onChange={(event) => patch({ paletteQuery: event.target.value, paletteIndex: 0 })}
        />
        <div className="palette-list">
          {items.length ? (
            items.map((item, i) => (
              <button type="button" key={item.id} className={i === index ? "palette-item on" : "palette-item"} onClick={() => onRun(item)}>
                <span>{item.label}</span>
                <span className="palette-hint">{item.hint}</span>
              </button>
            ))
          ) : (
            <p className="quiet">Ничего не найдено.</p>
          )}
        </div>
        <p className="palette-foot">Enter — открыть · Esc — закрыть · ↑↓ — выбрать</p>
      </div>
    </div>
  );
}

export function Shell({ children }) {
  const { me, ui, patch, go, logout, homeFor } = useApp();
  const uiRef = useRef(ui);
  const meRef = useRef(me);
  uiRef.current = ui;
  meRef.current = me;
  const items = commandItems(me, ui.paletteQuery);
  const index = Math.min(ui.paletteIndex, Math.max(items.length - 1, 0));
  const unread = unreadFor(me.id);
  const taskLabel = `${me.role === "crew" ? "Поручения" : "Задачи"}${unread ? ` · ${unread}` : ""}`;
  const home = homeFor(me);

  function run(item) {
    go(item.href, {
      paletteOpen: false,
      paletteQuery: "",
      paletteIndex: 0,
      ...(item.desk ? { desk: item.desk } : {}),
    });
  }

  useEffect(() => {
    function onKey(event) {
      const state = uiRef.current;
      const who = meRef.current;
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (!who || who.role === "crew") return;
        patch((prev) => ({
          ...prev,
          paletteOpen: !prev.paletteOpen,
          paletteQuery: "",
          paletteIndex: 0,
        }));
        return;
      }
      if (!state.paletteOpen) return;
      const list = commandItems(who, state.paletteQuery);
      const current = Math.min(state.paletteIndex, Math.max(list.length - 1, 0));
      if (event.key === "Escape") {
        patch({ paletteOpen: false });
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        patch({ paletteIndex: Math.min(current + 1, Math.max(list.length - 1, 0)) });
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        patch({ paletteIndex: Math.max(current - 1, 0) });
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        const item = list[current];
        if (item) run(item);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [patch, go]);

  return (
    <div className={me.role === "crew" ? "shell app" : "shell"}>
      <aside className="aside">
        <a className="brand" href={`#${home}`}>
          <span className="brand-mark">{residence.brand}</span>
          <span className="brand-line">{residence.line}</span>
        </a>
        <nav className="nav" aria-label="Разделы">
          {me.role === "crew" ? <NavLink href="/tasks">{taskLabel}</NavLink> : null}
          {me.role === "lead" ? (
            <>
              <NavLink href="/">Дома</NavLink>
              <NavLink href="/work">Объект</NavLink>
              <NavLink href="/reports">Отчёты</NavLink>
              <NavLink href="/tasks">{taskLabel}</NavLink>
              <NavLink href="/team">Команда</NavLink>
            </>
          ) : null}
          {me.role === "manager" ? (
            <>
              <NavLink href="/work">Дом</NavLink>
              <NavLink href="/tasks">{taskLabel}</NavLink>
            </>
          ) : null}
        </nav>
        {me.role !== "crew" ? (
          <button
            type="button"
            className="cmd-launch"
            onClick={() => patch({ paletteOpen: true, paletteQuery: "", paletteIndex: 0 })}
          >
            Поиск ⌘K
          </button>
        ) : null}
        <div className="access session-box">
          <span>Вы вошли</span>
          <strong className="session-name">{me.name}</strong>
          <span className="session-role">
            {me.title}
            {me.role === "manager" ? ` · этажи ${floorPhrase(me.floors)}` : ""}
          </span>
          <button type="button" className="quiet-btn session-out" onClick={logout}>
            Выйти
          </button>
        </div>
        <p className="aside-note">
          Сначала дома в сети, внутри каждого — план, жильцы и деньги. «Отчёты» — сутки, неделя и месяц по всем домам сразу.
        </p>
      </aside>
      <div className="main">
        <div className="topline">
          <span>
            {me.name} · {me.title.toLowerCase()}
          </span>
          <time dateTime={AS_OF}>{formatDate(AS_OF)}</time>
        </div>
        {ui.notice ? (
          <p className="notice" role="status" aria-live="polite">
            {ui.notice}
          </p>
        ) : null}
        {children}
      </div>
      <Palette items={items} index={index} onRun={run} />
    </div>
  );
}
