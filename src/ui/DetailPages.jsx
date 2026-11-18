import { useState } from "react";
import { AS_OF, contractDaysLeft, contractEnding, getParty, getUnit, partyOf, rentDue, stayOfParty, stayOfUnit, unitOf } from "../domain.js";
import { daysBetween, formatArea, formatDate, ruCount } from "../format.js";
import { downloadPdf } from "../pdfDownload.js";
import { floorPhrase, inScope } from "../app/access.js";
import { placeLabel, unitTitle } from "../app/labels.js";
import { useApp } from "../app/store.jsx";
import { Folio, Money, PaymentForm, PersonLink, TextLink, UnitLink, UtilityPanel, VacancyPanel } from "./bits.jsx";

function telHref(phone) {
  return `tel:${String(phone || "").replace(/\s/g, "")}`;
}

export function ApartmentPage({ code }) {
  const { beginOccupy, me, patch } = useApp();
  const [pdfBusy, setPdfBusy] = useState(false);
  const unit = getUnit(code);

  if (!unit) {
    return (
      <article>
        <h1 className="page-title">Такой студии нет</h1>
        <p>
          <TextLink href="/work">Вернуться к плану дома</TextLink>
        </p>
      </article>
    );
  }
  const label = placeLabel(unit);
  const titled = unitTitle(unit);
  const place = unit.floor ? `этаж ${unit.floor}` : "без этажа";
  if (unit.status === "vacant") {
    return (
      <article>
        <TextLink className="back" href="/work">
          План дома
        </TextLink>
        <p className="kicker">
          {titled} · {place}
        </p>
        <h1 className="display">{label}</h1>
        <p className="lede">Свободна. Карточка жильца и учёт появятся после заселения.</p>
        <p>
          <button type="button" onClick={() => beginOccupy(unit.code, unit.floor)}>
            Заселить
          </button>
        </p>
      </article>
    );
  }
  if (me.role === "manager" && !inScope(unit)) {
    return (
      <article>
        <TextLink className="back" href="/work">
          К своим этажам
        </TextLink>
        <h1 className="page-title">
          {titled} {label}
        </h1>
        <p className="lede">Её ведёт другой управляющий. В этом доступе этажи {floorPhrase(me.floors)}.</p>
      </article>
    );
  }
  const stay = stayOfUnit(unit.id);
  const party = partyOf(stay.partyId);
  const daysLeft = daysBetween(AS_OF, stay.end);
  const due = rentDue(stay.id);

  async function onDownloadContract() {
    if (pdfBusy || !stay) return;
    setPdfBusy(true);
    try {
      await downloadPdf(`/api/pdf/contract/${encodeURIComponent(unit.code)}`, `contract-${stay.contract || unit.code}.pdf`);
    } catch (error) {
      patch({ notice: error?.message || "Не удалось скачать договор PDF." });
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <article>
      <TextLink className="back" href="/work">
        План дома
      </TextLink>
      <p className="kicker">
        {titled} · {place} · {formatArea(unit.areaM2)}
      </p>
      <h1 className="display">{label}</h1>
      <p className="lede">
        Занята · <Money value={unit.monthlyRate} /> в месяц
      </p>
      {contractEnding(stay) ? (
        <p className="soon">
          Договор заканчивается {formatDate(stay.end)}. Осталось {ruCount(daysLeft, "день", "дня", "дней")}.
        </p>
      ) : null}
      <div className="split">
        <section>
          <h2>Проживание</h2>
          <dl className="facts">
            <div>
              <dt>Жилец</dt>
              <dd>
                <PersonLink id={party.id} name={party.name} />
              </dd>
            </div>
            <div>
              <dt>Телефон</dt>
              <dd>
                <a className="text-link" href={telHref(party.phone)}>
                  {party.phone}
                </a>
              </dd>
            </div>
            <div>
              <dt>Заехал</dt>
              <dd>{formatDate(stay.start)}</dd>
            </div>
            <div>
              <dt>Договор до</dt>
              <dd>{formatDate(stay.end)}</dd>
            </div>
            <div>
              <dt>Номер</dt>
              <dd>{stay.contract}</dd>
            </div>
            <div>
              <dt>Опись</dt>
              <dd>{unit.inventory}</dd>
            </div>
          </dl>
          {stay && me?.role !== "crew" ? (
            <p style={{ marginTop: "1rem" }}>
              <button type="button" disabled={pdfBusy} onClick={onDownloadContract}>
                {pdfBusy ? "Готовим PDF…" : "Договор PDF (черновик)"}
              </button>
            </p>
          ) : null}
        </section>
        <div className="sheet">
          <Folio stay={stay} />
          <PaymentForm stayId={stay.id} defaultAmount={due > 0 ? due : unit.monthlyRate} />
          <UtilityPanel stay={stay} />
        </div>
      </div>
      <VacancyPanel unit={unit} />
    </article>
  );
}

export function ResidentPage({ id }) {
  const { me } = useApp();
  const party = getParty(id);
  const stay = party ? stayOfParty(party.id) : undefined;

  if (!party || !stay) {
    return (
      <article>
        <h1 className="page-title">Такого жильца нет</h1>
        <p>
          <TextLink href="/work">К списку жильцов</TextLink>
        </p>
      </article>
    );
  }
  const unit = unitOf(stay.unitId);
  if (me.role === "manager" && !inScope(unit)) {
    return (
      <article>
        <TextLink className="back" href="/work">
          К жильцам дома
        </TextLink>
        <h1 className="page-title">{party.name}</h1>
        <p className="lede">
          Студия {placeLabel(unit)} в доступе другого управляющего. Здесь этажи {floorPhrase(me.floors)}.
        </p>
      </article>
    );
  }
  const daysLeft = contractDaysLeft(stay);
  const due = rentDue(stay.id);
  return (
    <article>
      <TextLink className="back" href="/work">
        Жильцы дома
      </TextLink>
      <p className="kicker">Жилец · студия {placeLabel(unit)}</p>
      <h1 className="person">{party.name}</h1>
      <p className="lede">
        Проживает с {formatDate(stay.start)}. Договор {stay.contract} до {formatDate(stay.end)}.
      </p>
      {contractEnding(stay) ? <p className="soon">Договор заканчивается. Осталось {ruCount(daysLeft, "день", "дня", "дней")}.</p> : null}
      <div className="split">
        <section>
          <h2>Карточка</h2>
          <dl className="facts">
            <div>
              <dt>Студия</dt>
              <dd>
                <UnitLink code={unit.code} /> · {formatArea(unit.areaM2)}
              </dd>
            </div>
            <div>
              <dt>Тариф</dt>
              <dd>
                <Money value={unit.monthlyRate} /> в месяц
              </dd>
            </div>
            <div>
              <dt>Телефон</dt>
              <dd>
                <a className="text-link" href={telHref(party.phone)}>
                  {party.phone}
                </a>
              </dd>
            </div>
            <div>
              <dt>Опись</dt>
              <dd>{unit.inventory}</dd>
            </div>
          </dl>
        </section>
        <div>
          <Folio stay={stay} />
          <PaymentForm stayId={stay.id} defaultAmount={due > 0 ? due : unit.monthlyRate} />
        </div>
      </div>
      <UtilityPanel stay={stay} />
    </article>
  );
}
