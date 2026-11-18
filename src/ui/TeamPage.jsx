import { useState } from "react";
import {
  DEMO_PIN,
  SEED_HOUSE_ID,
  createInvite,
  currentHouseId,
  listHouses,
  listInvites,
  removeStaff,
  revokeInvite,
  teamDirectory,
  withPersistNotice,
} from "../domain.js";
import { currentAccess, floorPhrase } from "../app/access.js";
import { useApp } from "../app/store.jsx";

function houseName(id) {
  return listHouses().find((house) => house.id === (id || SEED_HOUSE_ID))?.name || "дом";
}

function emptyInviteForm() {
  return {
    role: "manager",
    title: "Управляющий",
    houseId: currentHouseId(),
    floors: "2 3 4",
    phone: "",
    nameHint: "",
  };
}

export function TeamPage() {
  const { patch } = useApp();
  const me = currentAccess();
  const [form, setForm] = useState(emptyInviteForm);
  const crew = form.role === "crew";
  const invites = listInvites().filter((invite) => !invite.acceptedAt);
  const team = teamDirectory();

  if (!me || me.role !== "lead") {
    return (
      <article>
        <h1 className="page-title">Команда</h1>
        <p className="lede">Приглашения создаёт только руководитель.</p>
      </article>
    );
  }

  function onInvite(event) {
    event.preventDefault();
    const result = createInvite({ ...form, fromId: me.id });
    if (result.error) {
      patch({ inviteDraft: form, notice: result.error });
      return;
    }
    setForm(emptyInviteForm());
    patch({
      inviteDraft: null,
      notice: withPersistNotice(
        `Приглашение ${result.invite.code} готово. Скопируйте код или откройте ссылку регистрации.`,
      ),
    });
  }

  return (
    <article>
      <p className="kicker">Доступы</p>
      <h1 className="page-title">Команда</h1>
      <p className="lede">
        Здесь руководитель приглашает управляющих и специалистов. Человек открывает ссылку или вводит код на экране регистрации, задаёт PIN и входит со своего телефона.
      </p>

      <section className="section">
        <h2>Новое приглашение</h2>
        <form className="entry-form" onSubmit={onInvite}>
          <div className="pick-row" role="radiogroup" aria-label="Роль">
            <label className="pick pick-wide">
              <input
                type="radio"
                name="role"
                value="manager"
                checked={form.role === "manager"}
                onChange={() =>
                  setForm((prev) => ({
                    ...prev,
                    role: "manager",
                    title: !prev.title || prev.title === "Сантехник" ? "Управляющий" : prev.title,
                  }))
                }
              />
              <span>Управляющий</span>
            </label>
            <label className="pick pick-wide">
              <input
                type="radio"
                name="role"
                value="crew"
                checked={form.role === "crew"}
                onChange={() =>
                  setForm((prev) => ({
                    ...prev,
                    role: "crew",
                    title: !prev.title || prev.title === "Управляющий" ? "Сантехник" : prev.title,
                  }))
                }
              />
              <span>Специалист</span>
            </label>
          </div>
          <label>
            Должность
            <input
              name="title"
              required
              value={form.title}
              placeholder="Управляющий, сантехник, электрик"
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
            />
          </label>
          <label className={crew ? "is-hidden" : undefined}>
            Дом
            <select
              name="houseId"
              value={form.houseId}
              onChange={(event) => setForm((prev) => ({ ...prev, houseId: event.target.value }))}
            >
              {listHouses().map((house) => (
                <option key={house.id} value={house.id}>
                  {house.name}
                </option>
              ))}
            </select>
          </label>
          <label className={crew ? "is-hidden" : undefined}>
            Этажи
            <input
              name="floors"
              value={form.floors}
              placeholder="2 3 4"
              onChange={(event) => setForm((prev) => ({ ...prev, floors: event.target.value }))}
            />
          </label>
          <label>
            Телефон <span className="quiet">(необязательно)</span>
            <input
              name="phone"
              value={form.phone}
              placeholder="+7 … если хотите закрепить номер"
              inputMode="tel"
              onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
            />
          </label>
          <label>
            Подсказка имени <span className="quiet">(необязательно)</span>
            <input
              name="nameHint"
              value={form.nameHint}
              placeholder="Как зовут человека"
              onChange={(event) => setForm((prev) => ({ ...prev, nameHint: event.target.value }))}
            />
          </label>
          <button type="submit">Создать код приглашения</button>
        </form>
      </section>

      <section className="section">
        <h2>Открытые приглашения</h2>
        <p className="quiet">Отправьте код в WhatsApp. Регистрация: раздел «Регистрация» на экране входа или ссылка с кодом.</p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Код</th>
                <th>Должность</th>
                <th>Зона</th>
                <th>Телефон</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {invites.length ? (
                invites.map((invite) => (
                  <tr key={invite.id}>
                    <td>
                      <span className="contract">{invite.code}</span>
                    </td>
                    <td>{invite.title}</td>
                    <td>
                      {invite.role === "manager"
                        ? `${houseName(invite.houseId)} · этажи ${floorPhrase(invite.floors)}`
                        : "специалист"}
                    </td>
                    <td>{invite.phone || "любой телефон"}</td>
                    <td>
                      <button
                        type="button"
                        className="quiet-btn"
                        onClick={() => {
                          const origin = location.origin + location.pathname;
                          const text = `Salam Residences — приглашение\nКод: ${invite.code}\nСсылка: ${origin}#/join/${invite.code}\nОткройте ссылку, введите имя, телефон и свой PIN.`;
                          navigator.clipboard?.writeText(text).catch(() => {});
                          patch({ notice: `Код ${invite.code} и ссылка скопированы. Отправьте сотруднику в WhatsApp.` });
                        }}
                      >
                        Копировать код и ссылку
                      </button>
                      <button
                        type="button"
                        className="quiet-btn"
                        onClick={() => {
                          const result = revokeInvite(invite.id, me.id);
                          patch({
                            notice: withPersistNotice(
                              result.invite
                                ? `Приглашение ${result.invite.code} отозвано.`
                                : result.error || "Не удалось отозвать.",
                            ),
                          });
                        }}
                      >
                        Отозвать
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5}>Открытых приглашений нет.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section">
        <h2>Кто уже в системе</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Имя</th>
                <th>Роль</th>
                <th>Зона</th>
                <th>Телефон</th>
                <th>Статус</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {team.map((person) => {
                const scope =
                  person.role === "manager"
                    ? `${houseName(person.houseId)} · этажи ${floorPhrase(person.floors)}`
                    : person.role === "lead"
                      ? "вся сеть"
                      : person.title.toLowerCase();
                return (
                  <tr key={person.id}>
                    <td>{person.name}</td>
                    <td>{person.title}</td>
                    <td>{scope}</td>
                    <td>
                      <a className="text-link" href={`tel:${person.phone.replace(/\s/g, "")}`}>
                        {person.phone}
                      </a>
                    </td>
                    <td>{person.registered ? "в системе" : "нет входа"}</td>
                    <td>
                      {!person.seed && person.role !== "lead" ? (
                        <button
                          type="button"
                          className="quiet-btn"
                          onClick={() => {
                            const result = removeStaff(person.id, me.id);
                            patch({
                              notice: withPersistNotice(
                                result.person
                                  ? `${result.person.name} снят из команды.`
                                  : result.error || "Не удалось снять.",
                              ),
                            });
                          }}
                        >
                          Снять
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="quiet">
          Учебная команда (Лейла и др.) входит с PIN {DEMO_PIN}. Ваши приглашённые задают свой PIN при регистрации по коду.
        </p>
      </section>
    </article>
  );
}
