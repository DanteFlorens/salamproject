import {
  SEED_HOUSE_ID,
  booksForUnits,
  createHouse,
  currentHouseId,
  listHouses,
  markUnremindedUtilityReminders,
  networkBrief,
  openFolios,
  ownerDailyDigest,
  removeHouse,
  setCurrentHouse,
  unitOf,
  units,
  withPersistNotice,
} from "../domain.js";
import { formatMoney, ruCount } from "../format.js";
import { currentAccess } from "../app/access.js";
import {
  HOUSE_KINDS,
  KIND_PLACEHOLDERS,
  housePreview,
  kindMeta,
  layoutFact,
  levelPhrase,
  normalizeDraftLevels,
  viewHouseDraft,
} from "../app/labels.js";
import { useApp } from "../app/store.jsx";

const FIELDS = [
  ["rooms", "Комнаты"],
  ["studios", "Студии"],
  ["apartments", "Квартиры"],
];

export function HousesPage() {
  const { ui, patch, go, openHouse } = useApp();
  if (currentAccess()?.role !== "lead") {
    return (
      <article>
        <h1 className="page-title">Дома</h1>
        <p className="lede">Этот раздел ведёт руководитель.</p>
      </article>
    );
  }
  const active = currentHouseId();
  const draft = viewHouseDraft(ui.houseDraft);
  const step = Math.min(3, Math.max(1, Number(ui.houseStep) || 1));
  const brief = networkBrief();
  const digest = ownerDailyDigest();
  const preview = housePreview(draft.levels, Number(draft.parking) || 0);
  const stepTitle = ["Что за объект", "Этажи и помещения", "Название и адрес"][step - 1];

  function openDigestHref(houseId, href) {
    if (houseId) setCurrentHouse(houseId);
    go(href, { retain: true, desk: href.includes("/apartments/") ? "money" : "overview" });
  }

  function remindUtilitiesToday() {
    const count = digest.utilities.unremindedCount;
    if (!count) {
      patch({ notice: "Ненапомненной коммуналки на сегодня нет." });
      return;
    }
    const ok = window.confirm(
      `Отметить напоминания по ${ruCount(count, "студии", "студиям", "студиям")} с открытой коммуналкой? Деньги и оплаты не изменятся — только флаг «напомнили сегодня».`,
    );
    if (!ok) return;
    const result = markUnremindedUtilityReminders();
    patch({
      notice: withPersistNotice(
        result.count
          ? `Напоминания отмечены: ${ruCount(result.count, "студия", "студии", "студий")}. Текст для жильцов — в доске дома, раздел коммуналки.`
          : "Ненапомненной коммуналки не осталось.",
      ),
    });
  }

  function saveDraft(partial, extra = {}) {
    patch({ houseDraft: { ...draft, ...partial }, ...extra });
  }

  function setLevel(floor, field, value) {
    const next = Math.max(0, Math.min(60, Number(value) || 0));
    saveDraft({
      levels: draft.levels.map((level) => (level.floor === floor ? { ...level, [field]: next } : level)),
    });
  }

  function bump(floor, field, delta) {
    const level = draft.levels.find((item) => item.floor === floor);
    setLevel(floor, field, Number(level?.[field] || 0) + delta);
  }

  function setParking(value) {
    saveDraft({ parking: Math.max(0, Math.min(200, Number(value) || 0)) });
  }

  function onFloors(value) {
    const floors = String(Math.min(20, Math.max(1, Number(value) || 1)));
    const levels = normalizeDraftLevels(draft.levels, floors);
    patch({ houseDraft: { ...draft, floors, levels }, houseStep: 2 });
  }

  function copyFirst() {
    const first = draft.levels[0];
    saveDraft(
      {
        levels: draft.levels.map((level) => ({
          ...level,
          rooms: first.rooms,
          studios: first.studios,
          apartments: first.apartments,
        })),
      },
      { notice: "Состав 1 этажа скопирован на все этажи. Можно править любой этаж отдельно." },
    );
  }

  function next() {
    if (step === 2) {
      const empty = draft.levels.find((level) => level.rooms + level.studios + level.apartments === 0);
      if (empty) {
        patch({ notice: `Этаж ${empty.floor}: укажите хотя бы комнаты, студии или квартиры.` });
        return;
      }
    }
    patch({ houseStep: Math.min(3, step + 1), houseDraft: draft });
  }

  function back() {
    patch({ houseStep: Math.max(1, step - 1), houseDraft: draft });
  }

  function onSubmit(event) {
    event.preventDefault();
    if (currentAccess()?.role !== "lead") return;
    const payload = {
      name: draft.name,
      address: draft.address,
      kind: draft.kind,
      mode: "custom",
      floors: String(draft.levels.length),
      parking: String(draft.parking ?? 0),
      levels: draft.levels,
    };
    const result = createHouse(payload);
    if (result.error) {
      patch({ houseDraft: payload, houseStep: 3, notice: result.error });
      return;
    }
    const layout = result.house.levels.map((level) => `${level.floor} эт. ${levelPhrase(level)}`).join("; ");
    const park =
      result.house.parking > 0
        ? ` · ${ruCount(result.house.parking, "парковочное место", "парковочных места", "парковочных мест")}`
        : "";
    go("/work", {
      houseDraft: null,
      houseStep: 1,
      draft: null,
      cardId: "",
      desk: "plan",
      notice: withPersistNotice(
        `«${result.house.name}» готово: ${layout}${park}. На плане заселите помещения и парковку.`,
      ),
      retain: true,
    });
  }

  return (
    <article className="launch-page">
      <p className="kicker">Сеть владельца</p>
      <h1 className="page-title">Дома</h1>
      <p className="lede">На каждом этаже — своё число комнат, студий и квартир. Парковка — отдельно по дому. Управляющие потом обновляют заселение онлайн.</p>
      <section className="portfolio" aria-label="Картина сети">
        <div className="portfolio-card">
          <span className="portfolio-label">Дома</span>
          <strong>{brief.houses}</strong>
        </div>
        <div className="portfolio-card">
          <span className="portfolio-label">Занятость</span>
          <strong>{brief.fill}%</strong>
          <span className="portfolio-sub">
            {brief.livingOccupied}/{brief.livingTotal}
          </span>
        </div>
        <div className="portfolio-card">
          <span className="portfolio-label">Парковка</span>
          <strong>
            {brief.parkingOccupied}/{brief.parkingTotal || 0}
          </strong>
        </div>
        <div className="portfolio-card">
          <span className="portfolio-label">Долг сети</span>
          <strong className={brief.due > 0 ? "due" : undefined}>{formatMoney(brief.due)}</strong>
        </div>
        <div className="portfolio-card wide">
          <span className="portfolio-label">Октябрь · приход</span>
          <strong>{formatMoney(brief.paid)}</strong>
          <span className="portfolio-sub">начислено {formatMoney(brief.charged)}</span>
        </div>
      </section>
      <section className="owner-digest" aria-label="Брифинг владельца на сегодня">
        <p className="kicker">На сегодня · {digest.asOf}</p>
        <h2>Брифинг владельца</h2>
        <p>{digest.headline}</p>
        <div className="owner-digest-grid">
          <div>
            <span className="portfolio-label">Первые ходы</span>
            {digest.priorities.length ? (
              <ol className="moves owner-digest-moves">
                {digest.priorities.map((row) => (
                  <li key={`${row.houseId}-${row.move.id}`}>
                    <button type="button" className="digest-link" onClick={() => openDigestHref(row.houseId, row.move.href)}>
                      <span className="move-copy">
                        <span>
                          {row.houseName}: {row.move.title}
                        </span>
                        <span className="move-detail">{row.move.detail}</span>
                      </span>
                      {row.move.amount > 0 ? <strong>{formatMoney(row.move.amount)}</strong> : null}
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="quiet">Открытых ходов нет.</p>
            )}
          </div>
          <div>
            <span className="portfolio-label">Коммуналка без напоминания</span>
            <p className="owner-digest-stat">
              {digest.utilities.unremindedCount ? (
                <>
                  <strong className="due">{formatMoney(digest.utilities.due)}</strong>
                  <span className="quiet">
                    {" "}
                    · {ruCount(digest.utilities.unremindedCount, "студия ждёт", "студии ждут", "студий ждут")} текста
                  </span>
                </>
              ) : (
                <span className="quiet">Все с долгом уже отмечены на сегодня.</span>
              )}
            </p>
            {digest.utilities.unremindedCount ? (
              <button type="button" className="remind digest-batch" onClick={remindUtilitiesToday}>
                Отметить напоминания всем
              </button>
            ) : null}
            <span className="portfolio-label">Договоры ≤ 31 дня</span>
            {digest.renewals.soonest ? (
              <p className="quiet">
                Ближе всего {digest.renewals.soonest.label} · через {digest.renewals.soonest.daysLeft} дн. · всего{" "}
                {digest.renewals.count}
              </p>
            ) : (
              <p className="quiet">Ближайших окончаний нет.</p>
            )}
            {digest.renewals.rows.length ? (
              <ul className="owner-digest-renewals">
                {digest.renewals.rows.map((row) => (
                  <li key={row.stayId}>
                    <button type="button" className="text-link" onClick={() => openDigestHref(row.houseId, row.href)}>
                      {row.label} · {row.daysLeft} дн.
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </section>
      <section className="section">
        <h2>Ваши дома</h2>
        <p className="quiet">Нажмите дом — откроются план, жильцы, парковка и деньги только по нему. Сводные сутки/неделя/месяц — в «Отчётах».</p>
        <div className="house-grid">
          {listHouses().map((house) => {
            const kind = house.seed ? "Учебный дом" : kindMeta(house.kind).name;
            const unitsOfHouse = units.filter((unit) => (unit.houseId || SEED_HOUSE_ID) === house.id);
            const books = booksForUnits(unitsOfHouse.filter((unit) => unit.status !== "vacant"));
            const due = openFolios()
              .filter((row) => (unitOf(row.stay.unitId).houseId || SEED_HOUSE_ID) === house.id)
              .reduce((sum, row) => sum + row.due, 0);
            const parkLine = house.parkingTotal > 0 ? ` · парковка ${house.parkingOccupied}/${house.parkingTotal}` : "";
            return (
              <article key={house.id} className={house.id === active ? "house-card on" : "house-card"}>
                <button type="button" onClick={() => openHouse(house.id)}>
                  <span className="cell-code">{house.name}</span>
                  <span className="cell-meta">
                    {kind} · {house.address}
                  </span>
                  <span className="cell-meta">
                    {house.occupied}/{house.total} занято{parkLine}
                  </span>
                  <span className="cell-meta">{layoutFact(house)}</span>
                  <span className="cell-meta">
                    Начислено {formatMoney(books.charged)} · долг {formatMoney(due)}
                  </span>
                </button>
                {house.seed ? null : (
                  <button
                    type="button"
                    onClick={() => {
                      const gone = removeHouse(house.id);
                      patch({
                        notice: withPersistNotice(
                          gone.name ? `Дом «${gone.name}» снят из сети.` : gone.error || "Дом не снят.",
                        ),
                      });
                    }}
                  >
                    Удалить
                  </button>
                )}
              </article>
            );
          })}
        </div>
      </section>
      <form className="house-wizard" data-wizard-step={step} onSubmit={onSubmit}>
        <div className="wiz-head">
          <div>
            <p className="kicker">Новый объект · шаг {step} из 3</p>
            <h2>{stepTitle}</h2>
          </div>
          <div className="wiz-dots" aria-hidden="true">
            {[1, 2, 3].map((n) => (
              <span key={n} className={n === step ? "wiz-dot on" : n < step ? "wiz-dot done" : "wiz-dot"}>
                {n}
              </span>
            ))}
          </div>
        </div>
        {step === 1 ? (
          <div className="wiz-panel">
            <p className="quiet">Тип объекта — общая пометка. Состав каждого этажа зададите на следующем шаге.</p>
            <div className="kind-grid" role="radiogroup" aria-label="Тип объекта">
              {HOUSE_KINDS.map(([id, label, hint]) => (
                <label key={id} className={id === draft.kind ? "kind-tile on" : "kind-tile"}>
                  <input type="radio" name="kind" value={id} checked={id === draft.kind} onChange={() => saveDraft({ kind: id })} />
                  <span className="kind-name">{label}</span>
                  <span className="kind-hint">{hint}</span>
                </label>
              ))}
            </div>
            <div className="wiz-nav">
              <button type="button" className="ios-go" onClick={next}>
                Дальше — этажи
              </button>
            </div>
          </div>
        ) : null}
        {step === 2 ? (
          <div className="wiz-panel">
            <p className="quiet">Пример: на 1 этаже — 1 студия, 2 квартиры и 1 комната; на других этажах — свой набор. Сколько нужно — столько и ставьте.</p>
            <div className="level-toolbar">
              <label className="level-floors">
                Этажей
                <input type="number" min="1" max="20" value={draft.levels.length} onChange={(event) => onFloors(event.target.value)} />
              </label>
              <button type="button" className="quiet-btn" onClick={copyFirst}>
                Скопировать 1 этаж на все
              </button>
            </div>
            <div className="level-list">
              {draft.levels.map((level) => {
                const total = level.rooms + level.studios + level.apartments;
                return (
                  <section className="level-card" key={level.floor}>
                    <div className="level-head">
                      <h3>Этаж {level.floor}</h3>
                      <span className="level-total">{total ? levelPhrase(level) : "пока пусто"}</span>
                    </div>
                    <div className="level-rows">
                      {FIELDS.map(([field, label]) => (
                        <div className="level-row" key={field}>
                          <span>{label}</span>
                          <div className="stepper">
                            <button type="button" className="stepper-btn" aria-label="Меньше" onClick={() => bump(level.floor, field, -1)}>
                              −
                            </button>
                            <input
                              className="stepper-input"
                              type="number"
                              min="0"
                              max="60"
                              inputMode="numeric"
                              value={level[field]}
                              onChange={(event) => setLevel(level.floor, field, event.target.value)}
                            />
                            <button type="button" className="stepper-btn" aria-label="Больше" onClick={() => bump(level.floor, field, 1)}>
                              +
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
            <p className="ios-caption">Парковочные места по этому дому</p>
            <div className="parking-row">
              <div className="stepper">
                <button type="button" className="stepper-btn" aria-label="Меньше" onClick={() => setParking(Number(draft.parking) - 1)}>
                  −
                </button>
                <input
                  className="stepper-input"
                  type="number"
                  min="0"
                  max="200"
                  inputMode="numeric"
                  value={draft.parking}
                  onChange={(event) => setParking(event.target.value)}
                />
                <button type="button" className="stepper-btn" aria-label="Больше" onClick={() => setParking(Number(draft.parking) + 1)}>
                  +
                </button>
              </div>
              <span className="quiet">От 0 до 200. На плане — отдельная лента P1, P2…</span>
            </div>
            <p className="ios-preview">{preview.text}</p>
            <div className="wiz-nav">
              <button type="button" className="quiet-btn" onClick={back}>
                Назад
              </button>
              <button type="button" className="ios-go" onClick={next}>
                Дальше — название
              </button>
            </div>
          </div>
        ) : null}
        {step === 3 ? (
          <div className="wiz-panel">
            <div className="ios-group">
              <label className="ios-row">
                Название
                <input
                  name="name"
                  required
                  placeholder={KIND_PLACEHOLDERS[draft.kind] || "Дроздова 1"}
                  value={draft.name}
                  onChange={(event) => saveDraft({ name: event.target.value })}
                />
              </label>
              <label className="ios-row">
                Адрес
                <input
                  name="address"
                  required
                  placeholder="улица Дроздова, 1"
                  value={draft.address}
                  onChange={(event) => saveDraft({ address: event.target.value })}
                />
              </label>
            </div>
            <div className="wiz-summary">
              <p className="wiz-sum-title">{draft.name.trim() || "Без названия"}</p>
              <p className="quiet">
                {kindMeta(draft.kind).name} · {draft.address.trim() || "адрес не указан"}
              </p>
              <p className="quiet">
                {draft.levels.map((level) => (
                  <span key={level.floor}>
                    Эт. {level.floor}: {levelPhrase(level)}
                    <br />
                  </span>
                ))}
              </p>
              <p className="quiet">{preview.parkText.trim()}</p>
            </div>
            <div className="wiz-nav">
              <button type="button" className="quiet-btn" onClick={back}>
                Назад
              </button>
              <button type="submit" className="ios-go">
                Создать дом
              </button>
            </div>
          </div>
        ) : null}
      </form>
    </article>
  );
}
