import { booksForUnits, listHouses, moneySpan, openFolios, SEED_HOUSE_ID, unitOf, units } from "../domain.js";
import { workingHouseId } from "../app/access.js";
import { useApp } from "../app/store.jsx";
import { Money, SpanCards } from "./bits.jsx";

export function ReportsPage() {
  const { ui, openHouse, me } = useApp();
  if (!me || me.role === "crew") {
    return (
      <article>
        <h1 className="page-title">Отчёты</h1>
        <p className="lede">Отчёты смотрит руководитель или управляющий.</p>
      </article>
    );
  }
  const houseList = me.role === "lead" ? listHouses() : listHouses().filter((house) => house.id === workingHouseId());
  const spans = ["day", "week", "month"].map((id) => {
    const span = moneySpan(id);
    const byHouse = houseList.map((house) => {
      const lines = span.lines.filter((line) => (line.houseId || SEED_HOUSE_ID) === house.id);
      const inflow = lines.filter((line) => line.direction === "in").reduce((sum, line) => sum + line.amount, 0);
      const outflow = lines.filter((line) => line.direction === "out").reduce((sum, line) => sum + line.amount, 0);
      return { house, inflow, outflow, net: inflow - outflow };
    });
    const inflow = byHouse.reduce((sum, row) => sum + row.inflow, 0);
    const outflow = byHouse.reduce((sum, row) => sum + row.outflow, 0);
    return { ...span, byHouse, inflow, outflow, net: inflow - outflow };
  });
  const active = spans.find((span) => span.id === ui.span) || spans[2];
  const houseRows = houseList.map((house) => {
    const unitList = units.filter((unit) => (unit.houseId || SEED_HOUSE_ID) === house.id);
    const occupied = unitList.filter((unit) => unit.status !== "vacant");
    if (me.role === "manager") {
      const scoped = occupied.filter((unit) => unit.unitKind === "parking" || unit.floor === 0 || me.floors.includes(unit.floor));
      const scopedUnits = unitList.filter((unit) => unit.unitKind === "parking" || unit.floor === 0 || me.floors.includes(unit.floor));
      return {
        house,
        occupied: scoped.length,
        total: scopedUnits.length,
        books: booksForUnits(scoped),
        due: openFolios()
          .filter((row) => {
            const unit = unitOf(row.stay.unitId);
            if ((unit.houseId || SEED_HOUSE_ID) !== house.id) return false;
            if (unit.unitKind === "parking" || unit.floor === 0) return true;
            return me.floors.includes(unit.floor);
          })
          .reduce((sum, row) => sum + row.due, 0),
      };
    }
    return {
      house,
      occupied: occupied.length,
      total: unitList.length,
      books: booksForUnits(occupied),
      due: openFolios()
        .filter((row) => (unitOf(row.stay.unitId).houseId || SEED_HOUSE_ID) === house.id)
        .reduce((sum, row) => sum + row.due, 0),
    };
  });

  return (
    <article>
      <p className="kicker">{me.role === "lead" ? "Вся сеть" : "Ваши этажи"}</p>
      <h1 className="page-title">Отчёты</h1>
      <p className="lede">Картина на ладони: сутки, неделя и месяц по всем домам. Нажмите дом в таблице — откроется его план и счета.</p>
      <SpanCards spans={spans} activeId={active.id} />
      <section className="section">
        <h2>{active.title} по домам</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Дом</th>
                <th className="num">Приход</th>
                <th className="num">Расход</th>
                <th className="num">Итог</th>
              </tr>
            </thead>
            <tbody>
              {active.byHouse.map((row) => (
                <tr key={row.house.id}>
                  <td>{row.house.name}</td>
                  <td className="num">
                    <Money value={row.inflow} sign="+" />
                  </td>
                  <td className="num due">
                    <Money value={row.outflow} sign="−" />
                  </td>
                  <td className={row.net < 0 ? "num due" : "num"}>
                    <Money value={row.net} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="section">
        <h2>Октябрь · дома</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Дом</th>
                <th className="num">Занято</th>
                <th className="num">Начислено</th>
                <th className="num">Получено</th>
                <th className="num">Долг</th>
              </tr>
            </thead>
            <tbody>
              {houseRows.map((row) => (
                <tr key={row.house.id}>
                  <td>
                    <button type="button" className="text-link" onClick={() => openHouse(row.house.id)}>
                      {row.house.name}
                    </button>
                  </td>
                  <td className="num">
                    {row.occupied}/{row.total}
                  </td>
                  <td className="num">
                    <Money value={row.books.charged} />
                  </td>
                  <td className="num">
                    <Money value={row.books.paid} />
                  </td>
                  <td className={row.due > 0 ? "num due" : "num"}>
                    <Money value={row.due} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </article>
  );
}
