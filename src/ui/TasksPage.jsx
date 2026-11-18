import { useState } from "react";
import {
  closeTask,
  currentSession,
  markTaskRead,
  markWhatsapp,
  personById,
  postTask,
  recipientsFor,
  suggestCrew,
  tasksVisibleTo,
  whatsappHref,
  whatsappWasOpened,
  withPersistNotice,
} from "../domain.js";
import { ruCount } from "../format.js";
import { floorPhrase } from "../app/access.js";
import { useApp } from "../app/store.jsx";

function taskStatusLabel(status) {
  if (status === "read") return "Прочитано";
  if (status === "closed") return "Закрыто";
  return "Не прочитано";
}

export function TaskCard({ task, withActions }) {
  const { patch } = useApp();
  const from = personById(task.fromId);
  const to = personById(task.toId);
  const me = currentSession();
  const place = task.unitCode ? `Студия ${task.unitCode}` : task.floor ? `Этаж ${task.floor}` : "Дом";
  const href = me?.role === "crew" ? "" : whatsappHref(task);
  const waNote = whatsappWasOpened(task.id) ? "WhatsApp уже открыт на этот номер." : "Сообщение уйдёт на этот номер.";

  function read() {
    const done = markTaskRead(task.id, me.id);
    patch({
      notice: withPersistNotice(done ? "Поручение отмечено прочитанным." : "Это поручение уже прочитано."),
    });
  }
  function close() {
    const done = closeTask(task.id, me.id);
    patch({
      notice: withPersistNotice(done ? "Задача закрыта." : "Закрыть эту задачу из текущего доступа нельзя."),
    });
  }
  function onWhatsapp() {
    markWhatsapp(task.id);
    patch({
      notice: withPersistNotice(`WhatsApp открыт на ${to.phone}. В сообщении поручение и кто его поставил.`),
    });
  }

  return (
    <article className={`task ${task.status}`}>
      <p className="kicker">
        {place} · {to.title.toLowerCase()}
        {to.phone ? ` · ${to.phone}` : ""}
      </p>
      <h2>{task.title}</h2>
      <p>{task.text}</p>
      <p className="quiet">
        От {from.name}, {from.title.toLowerCase()}. Кому: {to.name}, {to.title.toLowerCase()}.
      </p>
      <p className="task-status">{taskStatusLabel(task.status)}</p>
      {withActions && (me.id === task.toId && task.status === "new" || (me.role !== "crew" && task.status !== "closed") || href) ? (
        <div className="task-actions">
          {withActions && me.id === task.toId && task.status === "new" ? (
            <button type="button" onClick={read}>
              Прочитано
            </button>
          ) : null}
          {withActions && me.role !== "crew" && task.status !== "closed" ? (
            <button type="button" onClick={close}>
              Закрыть
            </button>
          ) : null}
          {href ? (
            <>
              <a className="wa" href={href} target="_blank" rel="noopener" onClick={onWhatsapp}>
                WhatsApp · {to.phone}
              </a>
              <span className="quiet">{waNote}</span>
            </>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export function DayTasks() {
  const me = currentSession();
  const open = tasksVisibleTo(me.id).filter((task) => task.status !== "closed");
  const note =
    me.role === "lead"
      ? "Весь дом. Поручение уходит управляющему или сотруднику и открывает WhatsApp на его номер."
      : `Этажи ${floorPhrase(me.floors)}. Задачи чужих этажей сюда не попадают. WhatsApp открывается на номер того, кому поручение.`;
  return (
    <section className="section">
      <h2>Задачи на сегодня</h2>
      <p className="quiet">{note}</p>
      {open.length ? (
        <div className="task-board">
          {open.map((task) => (
            <TaskCard key={task.id} task={task} withActions={false} />
          ))}
        </div>
      ) : (
        <p className="quiet">На сегодня открытых задач нет.</p>
      )}
      <p>
        <a className="text-link" href="#/tasks">
          Открыть поручения
        </a>
      </p>
    </section>
  );
}

function PhoneJob({ task, primary }) {
  const { patch } = useApp();
  const from = personById(task.fromId);
  const me = currentSession();
  const place = task.unitCode ? `Студия ${task.unitCode}` : task.floor ? `Этаж ${task.floor}` : "Дом";
  return (
    <article className={primary ? "phone-job primary" : "phone-job"}>
      <p className="kicker">{place}</p>
      <h2>{task.title}</h2>
      <p>{task.text}</p>
      <p className="quiet">
        От {from.name}, {from.title.toLowerCase()}. {taskStatusLabel(task.status)}.
      </p>
      {primary && task.status === "new" ? (
        <button
          type="button"
          className="app-act"
          onClick={() => {
            const done = markTaskRead(task.id, me.id);
            patch({
              notice: withPersistNotice(
                done ? "Поручение отмечено прочитанным." : "Это поручение уже прочитано.",
              ),
            });
          }}
        >
          Прочитано
        </button>
      ) : null}
    </article>
  );
}

function TaskForm() {
  const { ui, patch } = useApp();
  const me = currentSession();
  const [hint, setHint] = useState("Напишите течь, свет или дверь. Система сама выберет специалиста.");
  if (me?.role === "crew") return null;
  const people = recipientsFor(me.id);

  function onSuggest(event) {
    if (ui.crewPicked) return;
    const form = event.target.form;
    const found = suggestCrew(`${form.elements.title.value} ${form.elements.text.value}`);
    if (!found) {
      setHint("Напишите течь, свет или дверь. Система сама выберет специалиста.");
      return;
    }
    form.elements.to.value = found.id;
    setHint(`${found.reason} ${found.name}, ${found.phone}.`);
  }

  function onSubmit(event) {
    event.preventDefault();
    const data = new FormData(event.target);
    const result = postTask({
      fromId: me.id,
      toId: String(data.get("to") || ""),
      title: String(data.get("title") || ""),
      text: String(data.get("text") || ""),
      unitCode: String(data.get("unit") || ""),
    });
    if (result.task) {
      const href = whatsappHref(result.task);
      const to = personById(result.task.toId);
      if (href) {
        markWhatsapp(result.task.id);
        window.open(href, "_blank", "noopener");
      }
      patch({
        notice: withPersistNotice(
          href
            ? `Поручение «${result.task.title}» открыто в WhatsApp на ${to.phone}, ${to.name}.`
            : `Поручение «${result.task.title}» записано. У получателя нет номера.`,
        ),
        crewPicked: false,
      });
      event.target.reset();
      setHint("Напишите течь, свет или дверь. Система сама выберет специалиста.");
    } else {
      patch({ notice: result.error || "Поручение не отправилось." });
    }
  }

  return (
    <form className="entry-form" onSubmit={onSubmit}>
      <h2>Новое поручение</h2>
      <label>
        Кому
        <select name="to" required onChange={() => patch({ crewPicked: true })}>
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.title} · {person.name} · {person.phone}
            </option>
          ))}
        </select>
      </label>
      <label>
        Студия
        <input name="unit" inputMode="numeric" placeholder="305, если задача по квартире" />
      </label>
      <label>
        Проблема
        <input name="title" required placeholder="Течь, свет, дверь" onInput={onSuggest} />
      </label>
      <label>
        Сообщение
        <textarea name="text" required placeholder="Что сделать сегодня" onInput={onSuggest} />
      </label>
      <p className="quiet">{hint}</p>
      <button type="submit">Отправить в WhatsApp</button>
    </form>
  );
}

export function TasksPage() {
  const me = currentSession();
  const tasks = tasksVisibleTo(me.id);
  if (me.role === "crew") {
    const open = tasks.filter((task) => task.status !== "closed");
    const [first, ...rest] = open;
    return (
      <article className="app-screen">
        <p className="kicker">
          PWA · {me.title} · {me.phone}
        </p>
        <h1 className="page-title">Сегодня</h1>
        <p className="lede">
          {open.length === 0
            ? "Поручений нет. Добавьте ярлык на телефон — новые задачи откроются как приложение."
            : `${ruCount(open.length, "поручение", "поручения", "поручений")} на сегодня. Сначала верхнее.`}
        </p>
        <p className="install-hint quiet">На iPhone: Поделиться → На экран «Домой». На Android: меню браузера → Установить приложение.</p>
        {first ? (
          <PhoneJob task={first} primary />
        ) : (
          <div className="empty-card crew-empty">
            <h2>Смена спокойная</h2>
            <p className="quiet">Когда руководитель или управляющий отправит поручение, оно появится здесь и в WhatsApp.</p>
          </div>
        )}
        {rest.length ? (
          <>
            <h2>Дальше</h2>
            <div className="task-board">
              {rest.map((task) => (
                <PhoneJob key={task.id} task={task} primary={false} />
              ))}
            </div>
          </>
        ) : null}
      </article>
    );
  }
  const lead =
    me.role === "manager"
      ? `Управляющий этажей ${floorPhrase(me.floors)}. Поручение открывает WhatsApp на номер сотрудника или руководителя.`
      : "Руководитель пишет управляющим или сразу сотрудникам. По тексту проблемы система сама ставит сантехника, электрика или мастера.";
  return (
    <article>
      <p className="kicker">{me.title}</p>
      <h1 className="page-title">{me.name}</h1>
      <p className="lede">{lead}</p>
      {tasks.length ? (
        <div className="task-board">
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} withActions />
          ))}
        </div>
      ) : (
        <p className="quiet">На сегодня поручений нет.</p>
      )}
      <TaskForm />
    </article>
  );
}
