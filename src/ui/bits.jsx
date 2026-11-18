import { useRef, useState } from "react";
import {
  AS_OF,
  contractEnding,
  depositOf,
  housePicture,
  markReminder,
  moneySpan,
  partyOf,
  payOpenUtilities,
  payUtility,
  recordExpense,
  recordPayment,
  rentDue,
  rentJournal,
  stayOfUnit,
  unitOf,
  utilityDebtors,
  utilityDue,
  utilityLines,
  vacancyOf,
  vacancyReport,
  withPersistNotice,
} from "../domain.js";
import { formatArea, formatDate, formatMoney, lastName, ruCount } from "../format.js";
import { currentAccess, floorPhrase, inScope, scopedLines, scopeUnits, workingHouseId } from "../app/access.js";
import { labelOfCode, monthLabel, placeLabel, unitKindMeta } from "../app/labels.js";
import { useApp } from "../app/store.jsx";

export function Money({ value, sign = "" }) {
  const formatted = formatMoney(value);
  const symbol = "₽";
  const number = formatted.replace(symbol, "").trim();
  return (
    <>
      {sign}
      {number} <span className="rub">{symbol}</span>
    </>
  );
}

export function TextLink({ href, className = "text-link", children }) {
  const to = href.startsWith("#") || href.startsWith("tel:") || href.startsWith("http") ? href : `#${href}`;
  return (
    <a className={className} href={to}>
      {children}
    </a>
  );
}

export function UnitLink({ code }) {
  return <TextLink href={`/apartments/${code}`}>{labelOfCode(code)}</TextLink>;
}

export function PersonLink({ id, name }) {
  return <TextLink href={`/residents/${id}`}>{name}</TextLink>;
}

export function MoneyStrip({ charged, paid, due, deposit }) {
  return (
    <dl className="metrics">
      <div>
        <dt>Начислено в октябре</dt>
        <dd>
          <Money value={charged} />
        </dd>
      </div>
      <div>
        <dt>Получено в октябре</dt>
        <dd>
          <Money value={paid} />
        </dd>
      </div>
      <div>
        <dt>Открытый долг</dt>
        <dd className={due > 0 ? "due" : undefined}>
          <Money value={due} />
        </dd>
      </div>
      <div>
        <dt>Залог на руках</dt>
        <dd>
          <Money value={deposit} />
        </dd>
      </div>
    </dl>
  );
}

function readMoney(raw) {
  return Math.round(Number(String(raw || "").replace(",", ".")));
}

function validDate(at) {
  return /^\d{4}-\d{2}-\d{2}$/.test(at);
}

export function PaymentForm({ stayId, defaultAmount }) {
  const { patch } = useApp();
  const busy = useRef(false);
  function onSubmit(event) {
    event.preventDefault();
    if (busy.current) return;
    const data = new FormData(event.target);
    const amount = readMoney(data.get("amount"));
    const at = String(data.get("at") || "");
    if (!Number.isFinite(amount) || amount <= 0 || !validDate(at)) {
      patch({ notice: "Укажите сумму больше нуля и дату." });
      return;
    }
    busy.current = true;
    const result = recordPayment({ stayId, amount, at });
    busy.current = false;
    if (result.error) {
      patch({ notice: result.error });
      return;
    }
    if (result.duplicate) {
      patch({ notice: "Эта оплата уже была внесена. Повторно не записали." });
      return;
    }
    patch({
      notice: withPersistNotice(`Оплата ${formatMoney(amount)} внесена. Долг и отчёты уже пересчитаны.`),
      span: at === AS_OF ? "day" : "month",
    });
  }
  return (
    <form className="entry-form" onSubmit={onSubmit} key={`${stayId}-${defaultAmount}`}>
      <h2>Оплата</h2>
      <label>
        Сумма, ₽
        <input name="amount" inputMode="numeric" min="1" step="1" required defaultValue={defaultAmount} />
      </label>
      <label>
        Дата
        <input name="at" type="date" required defaultValue={AS_OF} />
      </label>
      <button type="submit">Внести оплату</button>
    </form>
  );
}

export function Folio({ stay }) {
  const deposit = depositOf(stay.id);
  const journal = rentJournal(stay.id);
  const due = rentDue(stay.id);
  return (
    <div className="folio">
      <h2>Залог</h2>
      <p className="quiet">
        Залог <Money value={deposit.amount} /> удерживается с {formatDate(deposit.at)}.
      </p>
      <h2 className="folio-next">Проживание</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Дата</th>
              <th>Статья</th>
              <th className="num">Начисление</th>
              <th className="num">Оплата</th>
              <th className="num">Сальдо</th>
            </tr>
          </thead>
          <tbody>
            {journal.map(({ entry, balance }) => (
              <tr key={`${entry.at}-${entry.kind}-${entry.amount}-${entry.label}`}>
                <td>{formatDate(entry.at)}</td>
                <td>{entry.label}</td>
                <td className="num">{entry.kind === "rent" ? <Money value={entry.amount} /> : "—"}</td>
                <td className="num">{entry.kind === "payment" ? <Money value={entry.amount} /> : "—"}</td>
                <td className={balance > 0 ? "num due" : "num"}>
                  <Money value={balance} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={due > 0 ? "balance due" : "balance"}>
        {due > 0 ? (
          <>
            К оплате <Money value={due} />
          </>
        ) : (
          "Начисления закрыты"
        )}
      </p>
      <p className="quiet">
        Договор <span className="contract">{stay.contract}</span>
      </p>
    </div>
  );
}

export function UtilityPanel({ stay }) {
  const { patch } = useApp();
  const [at, setAt] = useState(AS_OF);
  const lines = utilityLines(stay.id);
  const due = utilityDue(stay.id);

  function payOne(id) {
    if (!validDate(at)) {
      patch({ notice: "Укажите дату оплаты." });
      return;
    }
    const paid = payUtility(id, at);
    if (!paid) {
      patch({ notice: "Эта строка уже закрыта." });
      return;
    }
    patch({
      notice: withPersistNotice(`${paid.title}, ${formatMoney(paid.amount)}, записано как оплата. Отчёты пересчитаны.`),
      span: at === AS_OF ? "day" : "month",
    });
  }

  function payAll() {
    if (!validDate(at)) {
      patch({ notice: "Укажите дату оплаты." });
      return;
    }
    const paid = payOpenUtilities(stay.id, at);
    if (!paid) {
      patch({ notice: "Открытой коммуналки нет." });
      return;
    }
    patch({
      notice: withPersistNotice(`Коммуналка ${formatMoney(paid.amount)} записана. Отчёты пересчитаны.`),
      span: at === AS_OF ? "day" : "month",
    });
  }

  return (
    <section className="utility-panel">
      <h2>Коммуналка, октябрь</h2>
      <p className="quiet">
        Газ, свет и вода отдельно от проживания. Открыто <Money value={due} />.
      </p>
      <label className="util-date">
        Дата оплаты
        <input type="date" value={at} onChange={(event) => setAt(event.target.value)} />
      </label>
      {lines.map((line) => (
        <div className="util-line" key={line.id}>
          <span>{line.title}</span>
          <span>
            <Money value={line.amount} />
          </span>
          {line.paidAt ? (
            <span className="util-paid">оплачено {formatDate(line.paidAt)}</span>
          ) : (
            <button type="button" onClick={() => payOne(line.id)}>
              Отметить оплату
            </button>
          )}
        </div>
      ))}
      {due > 0 ? (
        <button type="button" onClick={payAll}>
          Оплатить всё открытое
        </button>
      ) : (
        <p className="quiet">Октябрь по коммуналке закрыт.</p>
      )}
    </section>
  );
}

export function VacancyPanel({ unit }) {
  const loss = vacancyOf(unit.id);
  if (loss.amount === 0) {
    return (
      <section className="utility-panel">
        <h2>Недозаработано</h2>
        <p className="quiet">Между жильцами простоя не было. Студию сдали сразу после выезда.</p>
      </section>
    );
  }
  return (
    <section className="utility-panel">
      <h2>Недозаработано</h2>
      <p className="quiet">
        Деньги, которые дом не получил, потому что студию не сдали сразу. День стоит как месячный тариф, делённый на число дней в этом месяце. Это не долг жильца.
      </p>
      {loss.gaps.map((gap) => (
        <p key={`${gap.from}-${gap.to}`}>
          Выезд {formatDate(gap.from)}, следующее заселение {formatDate(gap.to)}. {ruCount(gap.days, "день", "дня", "дней")} студия стояла пустой.
        </p>
      ))}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Месяц</th>
              <th className="num">Простой</th>
              <th className="num">Сумма</th>
            </tr>
          </thead>
          <tbody>
            {loss.months.map((slice) => (
              <tr key={slice.month}>
                <td>{monthLabel(slice.month)}</td>
                <td className="num">{ruCount(slice.days, "день", "дня", "дней")}</td>
                <td className="num">
                  <Money value={slice.amount} />
                </td>
              </tr>
            ))}
            <tr>
              <td>Итого</td>
              <td className="num">{ruCount(loss.days, "день", "дня", "дней")}</td>
              <td className="num">
                <Money value={loss.amount} />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function lineTotals(lines) {
  const inflow = lines.filter((line) => line.direction === "in").reduce((sum, line) => sum + line.amount, 0);
  const outflow = lines.filter((line) => line.direction === "out").reduce((sum, line) => sum + line.amount, 0);
  return { inflow, outflow, net: inflow - outflow };
}

export function SpanCards({ spans, activeId }) {
  const { patch } = useApp();
  return (
    <div className="spans">
      {spans.map((span) => (
        <button
          type="button"
          key={span.id}
          className={span.id === activeId ? "span-card active" : "span-card"}
          onClick={() => patch({ span: span.id })}
        >
          <span className="span-title">{span.title}</span>
          <span className="span-range">
            {formatDate(span.from)}
            {span.from === span.to ? "" : ` — ${formatDate(span.to)}`}
          </span>
          <span className="span-row">
            <span>Пополнения</span>
            <span className="span-figure">
              <Money value={span.inflow} />
            </span>
          </span>
          <span className="span-row">
            <span>Расходы</span>
            <span className="span-figure">
              <Money value={span.outflow} />
            </span>
          </span>
          <span className="span-row">
            <span>Итог</span>
            <span className={span.net < 0 ? "span-figure due" : "span-figure"}>
              <Money value={span.net} />
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

export function MovementSection() {
  const { ui, patch } = useApp();
  const spans = ["day", "week", "month"].map((id) => {
    const span = moneySpan(id);
    const lines = scopedLines(span.lines);
    return { ...span, lines, ...lineTotals(lines) };
  });
  const active = spans.find((span) => span.id === ui.span) || spans[2];

  function onExpense(event) {
    event.preventDefault();
    const data = new FormData(event.target);
    const amount = readMoney(data.get("amount"));
    const at = String(data.get("at") || "");
    if (!Number.isFinite(amount) || amount <= 0 || !validDate(at)) {
      patch({ notice: "Укажите сумму больше нуля и дату." });
      return;
    }
    const label = String(data.get("label") || "").trim();
    if (!label) {
      patch({ notice: "Укажите статью расхода." });
      return;
    }
    recordExpense({ label, amount, at, houseId: workingHouseId() });
    patch({
      notice: withPersistNotice(`Расход ${formatMoney(amount)} записан по текущему объекту. Отчёты уже пересчитаны.`),
      span: at === AS_OF ? "day" : "month",
      desk: "money",
    });
    event.target.reset();
  }

  return (
    <section className="section">
      <h2>Движение денег</h2>
      <p className="quiet">
        Сутки, неделя и месяц считаются от операционного дня. Оплата проживания и коммуналки — пополнение, запись по дому — расход. Полоса выше считает только проживание и залог.
      </p>
      <SpanCards spans={spans} activeId={active.id} />
      <h3 className="lines-title">{active.title}</h3>
      {active.lines.length === 0 ? (
        <p className="quiet">За этот период движений нет. Новая оплата или расход появятся здесь сразу.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Дата</th>
                <th>Кто</th>
                <th>Статья</th>
                <th className="num">Сумма</th>
              </tr>
            </thead>
            <tbody>
              {active.lines.map((line, index) => (
                <tr key={`${line.at}-${line.who}-${line.label}-${index}`}>
                  <td>{formatDate(line.at)}</td>
                  <td>{line.who}</td>
                  <td>{line.label}</td>
                  <td className={line.direction === "out" ? "num due" : "num"}>
                    <Money value={line.amount} sign={line.direction === "out" ? "−" : "+"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <form className="entry-form" onSubmit={onExpense}>
        <h3>Расход дома</h3>
        <label>
          Статья
          <input name="label" required placeholder="Уборка, ремонт, расходники" />
        </label>
        <label>
          Сумма, ₽
          <input name="amount" inputMode="numeric" min="1" step="1" required />
        </label>
        <label>
          Дата
          <input name="at" type="date" required defaultValue={AS_OF} />
        </label>
        <button type="submit">Записать расход</button>
      </form>
    </section>
  );
}

function reminderCopy(stay) {
  const party = partyOf(stay.partyId);
  const unit = unitOf(stay.unitId);
  const open = utilityLines(stay.id).filter((line) => !line.paidAt);
  const due = open.reduce((sum, line) => sum + line.amount, 0);
  const list = open.map((line) => `${line.title.toLowerCase()} ${formatMoney(line.amount)}`).join(", ");
  const first = party.name.split(" ")[0];
  return `${first}, студия ${placeLabel(unit)}. Не оплачена коммуналка за октябрь: ${list}. Итого ${formatMoney(due)}. Salam Residences.`;
}

export function ReminderSection() {
  const { patch } = useApp();
  const occupied = scopeUnits().filter((unit) => unit.status !== "vacant");
  const rows = utilityDebtors().filter(({ stay }) => inScope(unitOf(stay.unitId)));
  const note =
    occupied.length === 0
      ? "Сначала заселите карточки — тогда появится коммуналка октября."
      : rows.length === 0
        ? "Октябрь закрыт."
        : `${ruCount(rows.length, "студия", "студии", "студий")} не закрыли октябрь. Кнопка готовит текст и отмечает, что напоминание уже собрано.`;

  function remind(stay) {
    markReminder(stay.id);
    patch({ notice: withPersistNotice(reminderCopy(stay)) });
  }

  return (
    <section className="section">
      <h2>Коммуналка, кому напомнить</h2>
      <p className="quiet">{note}</p>
      {occupied.length === 0 ? (
        <p className="quiet">Пока нет жильцов — напоминать некому. Заселите студию на плане.</p>
      ) : rows.length === 0 ? (
        <p className="quiet">Все студии оплатили газ, свет и воду за октябрь.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Студия</th>
                <th>Жилец</th>
                <th>Телефон</th>
                <th>Не оплачено</th>
                <th className="num">Сумма</th>
                <th>Напоминание</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ stay, due, open, remindedAt }) => {
                const unit = unitOf(stay.unitId);
                const party = partyOf(stay.partyId);
                const reminded = remindedAt === AS_OF ? "сегодня" : remindedAt ? formatDate(remindedAt) : "ещё нет";
                return (
                  <tr key={stay.id}>
                    <td>
                      <UnitLink code={unit.code} />
                    </td>
                    <td>
                      <PersonLink id={party.id} name={party.name} />
                    </td>
                    <td>
                      <a className="text-link" href={`tel:${party.phone.replace(/\s/g, "")}`}>
                        {party.phone}
                      </a>
                    </td>
                    <td>{open.map((line) => line.title).join(", ")}</td>
                    <td className="num due">
                      <Money value={due} />
                    </td>
                    <td>
                      <span className="remind-state">{reminded}</span>
                      <button type="button" className="remind" onClick={() => remind(stay)}>
                        {remindedAt === AS_OF ? "Текст ещё раз" : "Напоминание"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function VacancySection() {
  if (currentAccess()?.role !== "lead") return null;
  const report = vacancyReport(scopeUnits().filter((unit) => unit.status !== "vacant"));
  return (
    <section className="section">
      <h2>Недозаработано</h2>
      <p className="quiet">
        Сводка для руководителя. Простой — дни между выездом и следующим заселением. Выезд 5-го и сдача 15-го дают десять дней. Сумма по дому <Money value={report.amount} /> за {ruCount(report.days, "день", "дня", "дней")}.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Месяц</th>
              <th className="num">Студий</th>
              <th className="num">Дней</th>
              <th className="num">Сумма</th>
            </tr>
          </thead>
          <tbody>
            {report.months.map((slice) => (
              <tr key={slice.month}>
                <td>{monthLabel(slice.month)}</td>
                <td className="num">{slice.units}</td>
                <td className="num">{ruCount(slice.days, "день", "дня", "дней")}</td>
                <td className="num">
                  <Money value={slice.amount} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Студия</th>
              <th>Простой</th>
              <th className="num">Дней</th>
              <th>По месяцам</th>
              <th className="num">Итого</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map(({ unit, loss }) => (
              <tr key={unit.id}>
                <td>
                  <UnitLink code={unit.code} />
                </td>
                <td>{loss.gaps.map((item) => `${formatDate(item.from)} — ${formatDate(item.to)}`).join("; ")}</td>
                <td className="num">{ruCount(loss.days, "день", "дня", "дней")}</td>
                <td>{loss.months.map((slice) => `${monthLabel(slice.month)} ${formatMoney(slice.amount)}`).join(", ")}</td>
                <td className="num">
                  <Money value={loss.amount} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function PictureSection({ unitList }) {
  const me = currentAccess();
  const picture = housePicture(unitList);
  const first = picture.moves[0];
  const scope = me?.role === "manager" ? `Этажи ${floorPhrase(me.floors)}. ` : "";
  const lead = first
    ? `${scope}Первое дело — ${first.title.toLowerCase()}, ${first.detail}.`
    : `${scope}По студиям и жильцам сейчас нет открытых дыр.`;
  return (
    <section className="section">
      <h2>Картина дома</h2>
      <p className="quiet">{lead} Считается из карточек квартир и жильцов: аренда, коммуналка, простой и срок договора.</p>
      <ol className="moves">
        {picture.moves.map((move) => (
          <li key={move.id}>
            <a href={`#${move.href}`}>
              <span className="move-copy">
                <span>{move.title}</span>
                <span className="move-detail">{move.detail}</span>
              </span>
              {move.amount > 0 ? (
                <strong>
                  <Money value={move.amount} />
                </strong>
              ) : null}
            </a>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function Consultant({ unitList }) {
  const occupied = unitList.filter((unit) => unit.status !== "vacant");
  const vacant = unitList.filter((unit) => unit.status === "vacant");
  const picture = housePicture(occupied.length ? occupied : unitList);
  const potential = occupied.reduce((sum, unit) => sum + unit.monthlyRate, 0);
  const vacancyPotential = vacant.reduce((sum, unit) => sum + (unit.monthlyRate || 25000), 0);
  const rent = picture.moves.find((move) => move.id === "rent");
  const loss = picture.moves.find((move) => move.id === "loss");
  const renew = picture.moves.find((move) => move.id === "renew");
  const util = picture.moves.find((move) => move.id === "utility");
  const steps = [];
  if (vacant.length && !occupied.length) {
    steps.push({
      rank: 1,
      title: "Заселить свободные",
      text: `${ruCount(vacant.length, "карточка свободна", "карточки свободны", "карточек свободны")}. Потенциал при типичном тарифе около ${formatMoney(vacancyPotential || vacant.length * 25000)} в месяц.`,
      href: "/houses",
    });
  } else if (vacant.length) {
    steps.push({
      rank: steps.length + 1,
      title: "Дозаселить",
      text: `${ruCount(vacant.length, "свободная студия", "свободные студии", "свободных студий")} без дохода. Нажмите карточку на плане.`,
      href: "/",
    });
  }
  if (rent) {
    steps.push({
      rank: 1,
      title: "Собрать аренду",
      text: `${formatMoney(picture.rentDue)} уже начислено. ${rent.detail}. Это самый быстрый прирост кассы.`,
      href: rent.href,
    });
  }
  if (util) {
    steps.push({
      rank: 2,
      title: "Закрыть коммуналку",
      text: `${formatMoney(picture.utilityDue)}. ${util.detail}. Отдельно от проживания — проще напоминать.`,
      href: util.href,
    });
  }
  if (loss) {
    steps.push({
      rank: 3,
      title: "Убрать простой",
      text: `Уже ${formatMoney(picture.lossAmount)}. ${loss.detail}${renew ? ` Следующий риск: ${renew.detail}` : ""}`,
      href: loss.href,
    });
  } else if (renew) {
    steps.push({
      rank: 4,
      title: "Сдать в день выезда",
      text: renew.detail,
      href: renew.href,
    });
  }
  steps.sort((a, b) => a.rank - b.rank);
  const rest = steps.slice(1);
  return (
    <aside className="consultant">
      <p className="kicker">AI · для руководителя</p>
      <h2>Консультант</h2>
      <p className="quiet">Локальный советник: читает карточки дома и ранжирует шаги по деньгам. Без облака — только ваши внесённые данные.</p>
      <p>
        Потолок по заселённым — <Money value={potential} /> · {ruCount(occupied.length, "студия", "студии", "студий")}
        {vacant.length ? ` · свободно ${vacant.length}` : ""}.
      </p>
      {steps[0] ? (
        <p className="ai-next">
          <strong>Сейчас:</strong> {steps[0].title}. {steps[0].text}
        </p>
      ) : (
        <p>
          По этим карточкам открытых дыр нет. Месяц может остаться близко к потолку <Money value={potential} />.
        </p>
      )}
      {rest.length ? (
        <ol className="moves ai-steps">
          {rest.map((step) => (
            <li key={step.title}>
              <a href={`#${step.href}`}>
                <span>{step.title}</span>
                <span className="move-detail">{step.text}</span>
              </a>
            </li>
          ))}
        </ol>
      ) : null}
      {steps[0] ? <p><TextLink href={steps[0].href}>Открыть первый шаг</TextLink></p> : null}
    </aside>
  );
}

export function CellCard({ unit }) {
  const { beginOccupy } = useApp();
  const parking = unit.unitKind === "parking";
  const kind = unitKindMeta(unit.unitKind);
  if (unit.status === "vacant") {
    return (
      <article className={`cell vacant${parking ? " parking" : ""} ${unit.unitKind || ""}`}>
        <button type="button" className="cell-open" onClick={() => beginOccupy(unit.code, unit.floor)}>
          <span className="cell-code">{placeLabel(unit)}</span>
          <span className="cell-meta">{kind.vacant}</span>
        </button>
      </article>
    );
  }
  const stay = stayOfUnit(unit.id);
  const due = rentDue(stay.id);
  const utilities = utilityDue(stay.id);
  const party = partyOf(stay.partyId);
  const ending = contractEnding(stay);
  const missed = vacancyOf(unit.id).amount;
  const debtLabel = due > 0 ? `Долг ${formatMoney(due)}` : "Аренда закрыта";
  const otherLabel = utilities
    ? `Коммуналка ${formatMoney(utilities)}`
    : missed
      ? `Простой ${formatMoney(missed)}`
      : ending
        ? "Договор заканчивается"
        : "Без отдельных отметок";
  const diamondClass = utilities ? "on" : missed ? "miss" : ending ? "soon" : "";
  const href = `#/apartments/${unit.code}`;
  return (
    <article className={`cell${parking ? " parking" : ""}`}>
      <a className="cell-open" href={href}>
        <span className="cell-code">{placeLabel(unit)}</span>
        <span className="cell-meta">
          {parking ? `место · ${lastName(party.name)}` : `${formatArea(unit.areaM2)} · ${lastName(party.name)}`}
        </span>
      </a>
      <span className="marks">
        <a className={due > 0 ? "mark round on" : "mark round"} href={href} title={debtLabel} aria-label={debtLabel}></a>
        <a className={`mark diamond ${diamondClass}`} href={href} title={otherLabel} aria-label={otherLabel}></a>
      </span>
    </article>
  );
}
