import { useEffect, useState } from "react";
import {
  AS_OF,
  CONTRACT_SOON_DAYS,
  booksForUnits,
  cardById,
  endingWithin,
  getUnit,
  listCards,
  listHouses,
  openFolios,
  parties,
  partyOf,
  removeCard,
  rentDue,
  saveCard,
  stayOfParty,
  stays,
  unitOf,
  utilityDue,
  withPersistNotice,
} from "../domain.js";
import { formatArea, formatDate, lastName, ruCount } from "../format.js";
import { canEditUnits, currentAccess, floorPhrase, inScope, scopeUnits, workingHouseId } from "../app/access.js";
import { houseOfUnit, layoutFact, placeLabel, rateLabel, unitKindMeta } from "../app/labels.js";
import { useApp } from "../app/store.jsx";
import {
  CellCard,
  Consultant,
  Money,
  MoneyStrip,
  MovementSection,
  PersonLink,
  PictureSection,
  ReminderSection,
  UnitLink,
  VacancySection,
} from "./bits.jsx";
import { DayTasks } from "./TasksPage.jsx";

const AREA_CHOICES = [12, 14, 16, 18, 20, 22, 24, 25, 28, 30, 32, 35, 40, 45, 50, 60, 70, 80];
const RATE_CHOICES = [10000, 12000, 15000, 18000, 20000, 22000, 25000, 28000, 30000, 35000, 40000, 45000, 50000, 60000, 80000, 100000];
const PARK_RATE_CHOICES = [3000, 4000, 5000, 6000, 7000, 8000, 10000, 12000, 15000];

function cardFormValues(ui) {
  if (ui.draft) return ui.draft;
  const card = ui.cardId ? cardById(ui.cardId) : null;
  if (card) return card;
  return {
    code: "",
    floor: "",
    areaM2: 22,
    monthlyRate: "25000",
    name: "",
    phone: "",
    start: AS_OF,
    end: "2027-10-26",
    inventory: "",
    contract: "",
  };
}

function ChoiceRow({ values, current, labelOf, onPick }) {
  return (
    <div className="pick-row">
      {values.map((value) => (
        <button
          type="button"
          key={value}
          className={String(current) === String(value) ? "choice on" : "choice"}
          onClick={() => onPick(value)}
        >
          {labelOf(value)}
        </button>
      ))}
    </div>
  );
}

function ResidentSheet() {
  const { ui, patch } = useApp();
  const [form, setForm] = useState(() => cardFormValues(ui));

  useEffect(() => {
    setForm(cardFormValues(ui));
  }, [ui.cardId, ui.draft]);

  useEffect(() => {
    if (!ui.focusSheet && !ui.scrollSheet && !ui.scrollPeople) return;
    if (ui.scrollPeople) document.getElementById("people")?.scrollIntoView({ block: "start" });
    if (ui.scrollSheet) document.getElementById("resident-sheet")?.scrollIntoView({ block: "nearest" });
    if (ui.focusSheet) document.querySelector("#resident-sheet [name=name]")?.focus();
    patch({ focusSheet: false, scrollSheet: false, scrollPeople: false });
  }, [ui.focusSheet, ui.scrollSheet, ui.scrollPeople, patch]);

  if (!canEditUnits()) return null;
  if (!ui.draft && !ui.cardId) return null;
  const values = form;
  const unit = getUnit(String(values.code));
  if (unit && !inScope(unit)) return null;
  const house = unit ? houseOfUnit(unit) : listHouses().find((item) => item.id === workingHouseId());
  const parking = unit?.unitKind === "parking";
  const noun = parking ? "место" : unitKindMeta(unit?.unitKind || house?.kind).one;
  const titled = noun.charAt(0).toUpperCase() + noun.slice(1);
  const label = unit ? placeLabel(unit) : values.code;
  const numbered = parking || String(values.floor) === "0" || house?.mode === "numbers";
  const editing = Boolean(ui.cardId);
  const rateDefault = parking ? "5000" : "25000";
  const rateNow = values.monthlyRate ? rateLabel(values.monthlyRate) : parking ? "5 тыс" : "25 тыс";
  const rates = parking ? PARK_RATE_CHOICES : RATE_CHOICES;

  function onSubmit(event) {
    event.preventDefault();
    if (!canEditUnits()) return;
    const draft = {
      code: String(values.code || ""),
      floor: String(parking || numbered ? "0" : values.floor || ""),
      areaM2: String(values.areaM2 || (parking ? 12 : 22)),
      monthlyRate: String(values.monthlyRate || rateDefault),
      name: form.name,
      phone: form.phone,
      start: form.start,
      end: form.end,
      inventory: values.inventory || (parking ? "Машиноместо" : ""),
      contract: values.contract || "",
      unitKind: unit?.unitKind || values.unitKind || "living",
      houseId: unit?.houseId || workingHouseId(),
    };
    if (unit && !inScope(unit)) {
      patch({ notice: "Эта карточка вне вашей зоны." });
      return;
    }
    const result = saveCard(draft, ui.cardId);
    if (result.error) {
      patch({ draft, notice: result.error });
      return;
    }
    const ok = result.opened
      ? parking
        ? `Место ${placeLabel(result.unit)} закреплено. Владелец видит это в сети.`
        : `Номер ${placeLabel(result.unit)} заселён. Октябрь начислен и пока не оплачен.`
      : `${parking ? "Место" : "Номер"} ${placeLabel(result.unit)} сохранён.`;
    patch({
      draft: null,
      cardId: "",
      notice: withPersistNotice(ok),
    });
  }

  function release() {
    const gone = removeCard(ui.cardId);
    patch({
      cardId: "",
      draft: null,
      notice: withPersistNotice(
        gone.vacated
          ? `Студия ${gone.code} снова свободна.`
          : gone.code
            ? `Карточка ${gone.code} снята с дома.`
            : gone.error || "Карточку снять не удалось.",
      ),
    });
  }

  return (
    <form className="resident-sheet" id="resident-sheet" onSubmit={onSubmit}>
      <p className="kicker">{parking ? "Парковка" : numbered ? "Без этажа" : `Этаж ${values.floor}`}</p>
      <h2>
        {editing ? (parking ? "Место" : "Жилец") : parking ? "Закрепить" : "Поселить"} · {titled} {label}
      </h2>
      <p className="quiet">
        {parking
          ? "Кто арендует место, телефон и тариф. Управляющий обновляет онлайн — владелец видит в отчётах."
          : "Имя и телефон. Площадь, тариф и срок уже стоят — смените лентой, если нужно."}
      </p>
      <div className="ios-group">
        <label className="ios-row">
          {parking ? "Арендатор" : "Жилец"}
          <input name="name" required value={form.name || ""} placeholder="Имя и фамилия" autoComplete="name" onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />
        </label>
        <label className="ios-row">
          Телефон
          <input name="phone" required value={form.phone || ""} placeholder="+7" autoComplete="tel" onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))} />
        </label>
      </div>
      {parking ? null : (
        <>
          <p className="choice-label">
            Площадь · <span>{String(values.areaM2 || 22)}</span> м²
          </p>
          <ChoiceRow values={AREA_CHOICES} current={values.areaM2} labelOf={(n) => String(n)} onPick={(value) => setForm((prev) => ({ ...prev, areaM2: value }))} />
        </>
      )}
      <p className="choice-label">
        Тариф в месяц · <span>{rateNow}</span>
      </p>
      <ChoiceRow
        values={rates}
        current={values.monthlyRate || rateDefault}
        labelOf={rateLabel}
        onPick={(value) => setForm((prev) => ({ ...prev, monthlyRate: value }))}
      />
      <div className="ios-group">
        <label className="ios-row">
          {parking ? "С" : "Заехал"}
          <input name="start" type="date" required value={form.start || ""} onChange={(event) => setForm((prev) => ({ ...prev, start: event.target.value }))} />
        </label>
        <label className="ios-row">
          Договор до
          <input name="end" type="date" required value={form.end || ""} onChange={(event) => setForm((prev) => ({ ...prev, end: event.target.value }))} />
        </label>
      </div>
      <div className="sheet-actions">
        <button type="submit" className="ios-go">
          {editing ? "Сохранить" : parking ? "Закрепить место" : "Поселить"}
        </button>
        <button type="button" className="quiet-btn" onClick={() => patch({ cardId: "", draft: null, notice: "" })}>
          Закрыть
        </button>
        {editing ? (
          <button type="button" className="quiet-btn" onClick={release}>
            Освободить
          </button>
        ) : null}
      </div>
    </form>
  );
}

function PeopleBoard() {
  const { ui, beginOccupy, beginEdit } = useApp();
  if (!canEditUnits()) return null;
  const houseId = workingHouseId();
  const house = listHouses().find((item) => item.id === houseId);
  const me = currentAccess();
  const tiles = listCards(houseId).filter((card) => {
    const unit = getUnit(card.code);
    return unit && inScope(unit);
  });
  const numbered = house?.mode === "numbers";
  return (
    <section className="section" id="people">
      <h2>{me?.role === "manager" ? "Ваша зона" : "Жильцы и парковка"}</h2>
      <p className="quiet">
        {house?.name || "Дом"}. Нажмите карточку и внесите актуальные данные. {numbered ? "Этажей нет, только номера." : "Этаж уже на карточке."}
      </p>
      <ResidentSheet />
      <div className="people-grid">
        {tiles.length ? (
          tiles.map((card) => {
            const unit = getUnit(card.code);
            const label = unit ? placeLabel(unit) : card.code;
            const parking = unit?.unitKind === "parking";
            const open = (ui.draft && ui.draft.code === card.code) || ui.cardId === card.unitId;
            if (card.vacant) {
              return (
                <button type="button" key={card.code} className={`people-card free${parking ? " parking" : ""}${open ? " on" : ""}`} onClick={() => beginOccupy(card.code, card.floor)}>
                  <span className="cell-code">{label}</span>
                  <span className="cell-meta">{parking ? "свободно" : "свободна"}</span>
                </button>
              );
            }
            return (
              <button type="button" key={card.unitId} className={`people-card${parking ? " parking" : ""}${open ? " on" : ""}`} onClick={() => beginEdit(card.unitId)}>
                <span className="cell-code">{label}</span>
                <span className="cell-meta">{card.name}</span>
              </button>
            );
          })
        ) : (
          <p className="quiet">В зоне пока нет карточек.</p>
        )}
      </div>
    </section>
  );
}

function HouseBar() {
  const { openHouse } = useApp();
  if (currentAccess()?.role !== "lead") return null;
  const active = workingHouseId();
  return (
    <div className="house-bar">
      {listHouses().map((house) => (
        <button
          type="button"
          key={house.id}
          className={house.id === active ? "house-chip on" : "house-chip"}
          aria-pressed={house.id === active}
          onClick={() => openHouse(house.id)}
        >
          <span>{house.name}</span>
          <span>
            {house.occupied}/{house.total}
          </span>
        </button>
      ))}
      <a className="text-link" href="#/">
        Все дома
      </a>
    </div>
  );
}

function HouseResidents() {
  const rows = parties
    .map((party) => {
      const stay = stayOfParty(party.id);
      if (!stay) return null;
      const unit = unitOf(stay.unitId);
      if (!inScope(unit)) return null;
      return { party, stay, unit, due: rentDue(stay.id) };
    })
    .filter(Boolean)
    .sort((a, b) => lastName(a.party.name).localeCompare(lastName(b.party.name), "ru"));
  if (!rows.length) {
    return (
      <section className="section">
        <h2>Жильцы этого дома</h2>
        <div className="empty-card">
          <h2>Пока пусто</h2>
          <p className="quiet">Заселите студии на вкладке «План» — список появится здесь.</p>
        </div>
      </section>
    );
  }
  return (
    <section className="section">
      <h2>Жильцы этого дома</h2>
      <p className="quiet">Только текущий объект. Другие дома — через «Все дома».</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Жилец</th>
              <th>Студия</th>
              <th>Договор до</th>
              <th className="num">Аренда</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ party, stay, unit, due }) => (
              <tr key={party.id}>
                <td>
                  <PersonLink id={party.id} name={party.name} />
                </td>
                <td>
                  <UnitLink code={unit.code} />
                </td>
                <td>{formatDate(stay.end)}</td>
                <td className={due > 0 ? "num due" : "num"}>{due > 0 ? <Money value={due} /> : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function HouseLedger() {
  const rows = stays
    .map((stay) => ({
      stay,
      unit: unitOf(stay.unitId),
      party: partyOf(stay.partyId),
      due: rentDue(stay.id),
    }))
    .filter((row) => inScope(row.unit))
    .sort((a, b) => b.due - a.due || a.unit.code.localeCompare(b.unit.code));
  if (!rows.length) return null;
  return (
    <section className="section">
      <h2>Счета дома</h2>
      <p className="quiet">Аренда и коммуналка только по этому объекту.</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Студия</th>
              <th>Жилец</th>
              <th className="num">Тариф</th>
              <th className="num">Аренда</th>
              <th className="num">Коммуналка</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ unit, party, stay, due }) => {
              const util = utilityDue(stay.id);
              return (
                <tr key={stay.id}>
                  <td>
                    <UnitLink code={unit.code} />
                  </td>
                  <td>
                    <PersonLink id={party.id} name={party.name} />
                  </td>
                  <td className="num">
                    <Money value={unit.monthlyRate} />
                  </td>
                  <td className={due > 0 ? "num due" : "num"}>{due > 0 ? <Money value={due} /> : "—"}</td>
                  <td className={util > 0 ? "num due" : "num"}>{util > 0 ? <Money value={util} /> : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function HousePage() {
  const { ui, patch } = useApp();
  const me = currentAccess();
  const mine = scopeUnits();
  const living = mine.filter((unit) => unit.unitKind !== "parking");
  const parkingUnits = mine.filter((unit) => unit.unitKind === "parking");
  const occupied = living.filter((unit) => unit.status !== "vacant");
  const houseInfo = listHouses().find((item) => item.id === workingHouseId()) || listHouses()[0];
  const mineFloors = [...new Set(living.map((unit) => unit.floor))].sort((a, b) => a - b);
  const october = booksForUnits(mine.filter((unit) => unit.status !== "vacant"));
  const open = openFolios().filter((row) => inScope(unitOf(row.stay.unitId)));
  const openDue = open.reduce((sum, row) => sum + row.due, 0);
  const renewals = endingWithin(CONTRACT_SOON_DAYS).filter(({ stay }) => inScope(unitOf(stay.unitId)));
  const areas = occupied.map((unit) => unit.areaM2).filter((area) => area > 0);
  const area = areas.reduce((sum, value) => sum + value, 0);
  const areaSpan = areas.length ? `от ${Math.min(...areas)} до ${Math.max(...areas)} м² · всего ${formatArea(area)}` : "карточки ещё пустые";
  const positiveFloors = mineFloors.filter((floor) => floor > 0);
  const floorText =
    houseInfo.mode === "numbers"
      ? "без этажей"
      : positiveFloors.length
        ? `этажи ${floorPhrase(positiveFloors)}`
        : "этажи появятся с домом";
  const parkOcc = parkingUnits.filter((unit) => unit.status !== "vacant").length;
  const moneyNote =
    me?.role === "manager"
      ? `Ваши этажи ${floorPhrase(me.floors)}${parkingUnits.length ? " и парковка" : ""}. Данные видит владелец.`
      : `${houseInfo.name}. ${ruCount(open.length, "счёт открыт", "счёта открыты", "счетов открыто")}.`;
  const pictureUnits = occupied.length ? occupied : living;
  const desk = ui.desk;
  const tab = (id, label) => (
    <button
      type="button"
      key={id}
      className={desk === id ? "desk-tab on" : "desk-tab"}
      aria-pressed={desk === id}
      onClick={() => patch({ desk: id })}
    >
      {label}
    </button>
  );

  const livingRack = mineFloors.map((floor) => {
    const cells = living.filter((unit) => unit.floor === floor).sort((a, b) => a.code.localeCompare(b.code, "ru"));
    const band = floor === 0 || houseInfo.mode === "numbers" ? "Номера" : `Этаж ${floor}`;
    return (
      <section className="rack-floor" aria-label={band} key={`f-${floor}`}>
        <h3 className="floor-name">{band}</h3>
        {cells.map((unit) => (
          <CellCard key={unit.id} unit={unit} />
        ))}
      </section>
    );
  });
  const parkingRack = parkingUnits.length ? (
    <section className="rack-floor parking-rack" aria-label="Парковка">
      <h3 className="floor-name">
        Парковка · {parkOcc}/{parkingUnits.length}
      </h3>
      {parkingUnits
        .slice()
        .sort((a, b) => a.code.localeCompare(b.code, "ru"))
        .map((unit) => (
          <CellCard key={unit.id} unit={unit} />
        ))}
    </section>
  ) : null;

  return (
    <article className="house-page">
      <p className="kicker">{houseInfo.name}</p>
      <HouseBar />
      <div className="hero">
        <h1 className="display">
          <span className="display-figure">{occupied.length}</span>
          <span className="display-caption">занято из {living.length || mine.length}</span>
        </h1>
        <dl className="passport">
          <dt>Адрес</dt>
          <dd>{houseInfo.address}</dd>
          <dt>Площади</dt>
          <dd>{areaSpan}</dd>
          <dt>Сетка</dt>
          <dd>{layoutFact(houseInfo)}</dd>
          <dt>Этажи</dt>
          <dd>{floorText}</dd>
          {parkingUnits.length ? (
            <>
              <dt>Парковка</dt>
              <dd>
                {parkOcc} из {parkingUnits.length} мест
              </dd>
            </>
          ) : null}
        </dl>
      </div>
      <div className="desk-tabs" role="tablist" aria-label="Разделы дома">
        {tab("overview", "Сейчас")}
        {tab("plan", "План")}
        {tab("people", "Жильцы")}
        {tab("money", "Деньги")}
        {tab("more", "Ещё")}
      </div>
      {desk === "overview" ? (
        <>
          <div className="lead-grid">
            <PictureSection unitList={pictureUnits} />
            {me?.role === "lead" ? <Consultant unitList={living} /> : null}
          </div>
          <MoneyStrip charged={october.charged} paid={october.paid} due={openDue} deposit={october.deposit} />
          <p className="quiet">{moneyNote}</p>
          {houseInfo.seed ? (
            <DayTasks />
          ) : (
            <section className="section">
              <h2>Дальше</h2>
              <p className="quiet">На вкладке «План» заселите студии и закрепите парковку — появятся долги и картина дома.</p>
            </section>
          )}
        </>
      ) : null}
      {desk === "plan" ? (
        <section className="section">
          <h2>План объекта</h2>
          <p className="quiet">
            {canEditUnits() ? "Свободную карточку нажмите — внесите жильца или арендатора места. " : ""}
            {living.some((unit) => unit.status === "vacant") && !occupied.length ? "Все свободны — начните с любой карточки. " : ""}
            Круг — долг. Ромб — коммуналка, договор или простой.
          </p>
          {canEditUnits() ? <ResidentSheet /> : null}
          <div className="rack">
            {livingRack.length || parkingRack ? (
              <>
                {livingRack}
                {parkingRack}
              </>
            ) : (
              <p className="quiet">В этом объекте пока нет номеров.</p>
            )}
          </div>
        </section>
      ) : null}
      {desk === "people" ? (
        <>
          <PeopleBoard />
          <HouseResidents />
        </>
      ) : null}
      {desk === "money" ? (
        <>
          <MovementSection />
          <ReminderSection />
          <HouseLedger />
        </>
      ) : null}
      {desk === "more" ? (
        <>
          <section className="section">
            <h2>Договоры заканчиваются</h2>
            {renewals.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Студия</th>
                      <th>Жилец</th>
                      <th>До</th>
                      <th className="num">Осталось</th>
                    </tr>
                  </thead>
                  <tbody>
                    {renewals.map(({ stay, daysLeft }) => {
                      const unit = unitOf(stay.unitId);
                      const party = partyOf(stay.partyId);
                      return (
                        <tr key={stay.id}>
                          <td>
                            <UnitLink code={unit.code} />
                          </td>
                          <td>
                            <PersonLink id={stay.partyId} name={party.name} />
                          </td>
                          <td>{formatDate(stay.end)}</td>
                          <td className="num">{ruCount(daysLeft, "день", "дня", "дней")}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="quiet">В ближайший месяц договоры не заканчиваются.</p>
            )}
          </section>
          {houseInfo.seed ? <VacancySection /> : null}
        </>
      ) : null}
    </article>
  );
}

