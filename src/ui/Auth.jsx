import {
  DEMO_PIN,
  inviteByCode,
  loginStaff,
  registerOwner,
  registerWithInvite,
  residence,
  setCurrentHouse,
  withPersistNotice,
} from "../domain.js";
import { requestFlorensSession } from "../florensToken.js";
import { flushPersist } from "../persist.js";
import { floorPhrase } from "../app/access.js";
import { useApp } from "../app/store.jsx";

async function bindFlorensToken(person, pin) {
  if (!person?.id || person.role === "crew") return;
  try {
    await flushPersist();
  } catch {
    /* seed-аккаунты всё равно проходят на сервере */
  }
  await requestFlorensSession({ staffId: person.id, pin, role: person.role });
}

function digits(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 4);
}

function AuthTabs({ active }) {
  const tab = (id, href, label) => (
    <a className={active === id ? "desk-tab on" : "desk-tab"} href={`#${href}`}>
      {label}
    </a>
  );
  return (
    <div className="auth-tabs">
      {tab("login", "/login", "Вход")}
      {tab("owner", "/owner", "Я владелец")}
      {tab("join", "/join", "По коду")}
    </div>
  );
}

function joinCodeFromPath(path) {
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "join" && parts[1]) return decodeURIComponent(parts[1]).toUpperCase();
  return "";
}

function pinOk(pin) {
  return /^\d{4}$/.test(pin);
}

export function AuthPage() {
  const { path } = useApp();
  if (path.startsWith("/join")) return <JoinPage key={path} />;
  if (path === "/owner") return <OwnerPage />;
  return <LoginPage />;
}

function LoginPage() {
  const { ui, patch, go } = useApp();
  const draft = ui.loginDraft || { phone: "", pin: "" };

  function setField(name, value) {
    const next = name === "pin" ? digits(value) : value;
    patch((prev) => ({
      ...prev,
      loginDraft: { phone: "", pin: "", ...prev.loginDraft, [name]: next },
    }));
  }

  async function onSubmit(event) {
    event.preventDefault();
    const next = { phone: draft.phone.trim(), pin: draft.pin.trim() };
    if (!next.phone) {
      patch({ loginDraft: next, notice: "Введите телефон." });
      return;
    }
    if (!pinOk(next.pin)) {
      patch({ loginDraft: next, notice: "PIN — ровно 4 цифры, без пробелов." });
      return;
    }
    const result = loginStaff(next);
    if (result.error) {
      patch({ loginDraft: next, notice: result.error });
      return;
    }
    await bindFlorensToken(result.person, next.pin);
    if (result.person.role === "manager" && result.person.houseId) setCurrentHouse(result.person.houseId);
    const href = result.person.role === "crew" ? "/tasks" : result.person.role === "lead" ? "/" : "/work";
    go(href, {
      loginDraft: null,
      notice: withPersistNotice(`Здравствуйте, ${result.person.name}. Доступ открыт.`),
      retain: true,
    });
  }

  return (
    <article>
      <p className="kicker">Владелец и команда</p>
      <h1 className="page-title">Вход</h1>
      <p className="lede">
        Если вы уже зарегистрированы — телефон и PIN. Новый заказчик сначала проходит вкладку <strong>Я владелец</strong>.
      </p>
      <AuthTabs active="login" />
      <form className="entry-form auth-form" noValidate onSubmit={onSubmit}>
        <label>
          Телефон
          <input name="phone" value={draft.phone} placeholder="+7 …" inputMode="tel" autoComplete="tel" onChange={(event) => setField("phone", event.target.value)} />
        </label>
        <label>
          PIN · 4 цифры
          <input name="pin" type="password" value={draft.pin} inputMode="numeric" maxLength={4} placeholder="1234" autoComplete="off" spellCheck={false} onChange={(event) => setField("pin", event.target.value)} />
        </label>
        <button type="submit">Войти</button>
      </form>
      <div className="empty-card auth-hint">
        <h2>Ещё нет аккаунта?</h2>
        <p className="quiet">
          <a className="text-link" href="#/owner">Зарегистрироваться как руководитель</a> — своё имя и телефон, затем раздел «Команда».
          <br />
          Учебное демо Лейлы: <span className="contract">+7 900 200-00-01</span>, PIN <span className="contract">{DEMO_PIN}</span>.
        </p>
      </div>
    </article>
  );
}

function OwnerPage() {
  const { ui, patch, go } = useApp();
  const draft = ui.ownerDraft || { name: "", phone: "", pin: "", pinConfirm: "" };

  function setField(name, value) {
    const next = name === "pin" || name === "pinConfirm" ? digits(value) : value;
    patch((prev) => ({
      ...prev,
      ownerDraft: { name: "", phone: "", pin: "", pinConfirm: "", ...prev.ownerDraft, [name]: next },
    }));
  }

  async function onSubmit(event) {
    event.preventDefault();
    const next = {
      name: draft.name.trim(),
      phone: draft.phone.trim(),
      pin: draft.pin.trim(),
      pinConfirm: draft.pinConfirm.trim(),
    };
    if (!next.name) {
      patch({ ownerDraft: next, notice: "Введите своё имя и фамилию." });
      return;
    }
    if (!next.phone) {
      patch({ ownerDraft: next, notice: "Введите свой телефон." });
      return;
    }
    if (!pinOk(next.pin)) {
      patch({ ownerDraft: next, notice: "PIN — ровно 4 цифры, без пробелов." });
      return;
    }
    if (next.pin !== next.pinConfirm) {
      patch({ ownerDraft: next, notice: "PIN и повтор не совпадают." });
      return;
    }
    const result = registerOwner({ name: next.name, phone: next.phone, pin: next.pin });
    if (result.error) {
      patch({ ownerDraft: next, notice: result.error });
      return;
    }
    await bindFlorensToken(result.person, next.pin);
    go("/", {
      ownerDraft: null,
      notice: withPersistNotice(
        `${result.person.name}, вы руководитель. Создайте дом или откройте учебный — затем зовите команду.`,
      ),
      retain: true,
    });
  }

  return (
    <article>
      <p className="kicker">Заказчик / владелец дома</p>
      <h1 className="page-title">Регистрация руководителя</h1>
      <p className="lede">Здесь заказчик заводит себя под своим именем и телефоном. Код приглашения не нужен. После входа открывается раздел «Команда» — уже оттуда приглашают управляющих и мастеров.</p>
      <AuthTabs active="owner" />
      <form className="entry-form auth-form" noValidate onSubmit={onSubmit}>
        <label>
          Ваше имя и фамилия
          <input name="name" value={draft.name} placeholder="Как к вам обращаться в системе" autoComplete="name" onChange={(event) => setField("name", event.target.value)} />
        </label>
        <label>
          Ваш телефон
          <input name="phone" value={draft.phone} placeholder="+7 …" inputMode="tel" autoComplete="tel" onChange={(event) => setField("phone", event.target.value)} />
        </label>
        <label>
          Придумайте PIN · 4 цифры
          <input name="pin" type="password" value={draft.pin} inputMode="numeric" maxLength={4} placeholder="1234" autoComplete="off" spellCheck={false} onChange={(event) => setField("pin", event.target.value)} />
        </label>
        <label>
          Повторите PIN
          <input name="pinConfirm" type="password" value={draft.pinConfirm} inputMode="numeric" maxLength={4} placeholder="ещё раз те же 4 цифры" autoComplete="off" spellCheck={false} onChange={(event) => setField("pinConfirm", event.target.value)} />
        </label>
        <button type="submit">Зарегистрироваться как руководитель</button>
      </form>
      <p className="quiet">
        Уже регистрировались? <a className="text-link" href="#/login">Войти</a>. Хотите только посмотреть демо — войдите учебным аккаунтом Лейлы на экране входа.
      </p>
    </article>
  );
}

function JoinPage() {
  const { ui, path, patch, go } = useApp();
  const joinCode = joinCodeFromPath(path);
  const invite = joinCode ? inviteByCode(joinCode) : null;
  const draft = ui.inviteDraft || {
    code: joinCode,
    name: invite?.nameHint || "",
    phone: "",
    pin: "",
    pinConfirm: "",
  };
  const code = joinCode || draft.code || "";

  function setField(name, value) {
    const next = name === "pin" || name === "pinConfirm" ? digits(value) : value;
    patch((prev) => ({
      ...prev,
      inviteDraft: {
        code,
        name: prev.inviteDraft?.name ?? invite?.nameHint ?? "",
        phone: prev.inviteDraft?.phone || "",
        pin: prev.inviteDraft?.pin || "",
        pinConfirm: prev.inviteDraft?.pinConfirm || "",
        ...prev.inviteDraft,
        [name]: next,
      },
    }));
  }

  async function onSubmit(event) {
    event.preventDefault();
    const next = {
      code: (joinCode || draft.code || "").trim(),
      name: draft.name.trim(),
      phone: draft.phone.trim(),
      pin: draft.pin.trim(),
      pinConfirm: draft.pinConfirm.trim(),
    };
    if (!next.code) {
      patch({ inviteDraft: next, notice: "Введите код приглашения от руководителя." });
      return;
    }
    if (!next.name) {
      patch({ inviteDraft: next, notice: "Введите имя и фамилию." });
      return;
    }
    if (!next.phone) {
      patch({ inviteDraft: next, notice: "Введите телефон." });
      return;
    }
    if (!pinOk(next.pin)) {
      patch({ inviteDraft: next, notice: "PIN — ровно 4 цифры, без пробелов." });
      return;
    }
    if (next.pin !== next.pinConfirm) {
      patch({ inviteDraft: next, notice: "PIN и повтор не совпадают. Введите одинаковые 4 цифры в оба поля." });
      return;
    }
    const result = registerWithInvite({ code: next.code, name: next.name, phone: next.phone, pin: next.pin });
    if (result.error) {
      patch({ inviteDraft: next, notice: result.error });
      return;
    }
    await bindFlorensToken(result.person, next.pin);
    if (result.person.role === "manager" && result.person.houseId) setCurrentHouse(result.person.houseId);
    const href = result.person.role === "crew" ? "/tasks" : result.person.role === "lead" ? "/" : "/work";
    go(href, {
      inviteDraft: null,
      notice: withPersistNotice(
        `${result.person.name}, доступ создан. Вы вошли как ${result.person.title.toLowerCase()}.`,
      ),
      retain: true,
    });
  }

  return (
    <article>
      <p className="kicker">Только по приглашению</p>
      <h1 className="page-title">Регистрация сотрудника</h1>
      <p className="lede">Сюда заходит управляющий или специалист с кодом от руководителя. Владелец дома регистрируется на вкладке «Я владелец».</p>
      <AuthTabs active="join" />
      <div className="empty-card auth-hint">
        <h2>Откуда код</h2>
        <p className="quiet">
          Руководитель в разделе <strong>Команда</strong> создаёт приглашение и присылает код <span className="contract">SR-XXXX</span> в WhatsApp.
        </p>
      </div>
      {invite && !invite.acceptedAt ? (
        <p className="quiet">
          Код <span className="contract">{invite.code}</span> · {invite.title}
          {invite.role === "manager" ? ` · этажи ${floorPhrase(invite.floors)}` : ""}
        </p>
      ) : (
        <p className="quiet">Без кода от руководителя зарегистрироваться здесь нельзя.</p>
      )}
      <form className="entry-form auth-form" noValidate onSubmit={onSubmit}>
        <label>
          Код от руководителя
          <input name="code" value={code} placeholder="SR-XXXX" autoComplete="off" spellCheck={false} onChange={(event) => setField("code", event.target.value)} />
        </label>
        <label>
          Имя и фамилия
          <input name="name" value={draft.name || ""} placeholder="Как в WhatsApp" autoComplete="name" onChange={(event) => setField("name", event.target.value)} />
        </label>
        <label>
          Телефон
          <input name="phone" value={draft.phone || ""} placeholder="+7 900 …" inputMode="tel" autoComplete="tel" onChange={(event) => setField("phone", event.target.value)} />
        </label>
        <label>
          PIN · 4 цифры
          <input name="pin" type="password" value={draft.pin || ""} inputMode="numeric" maxLength={4} placeholder="1234" autoComplete="off" spellCheck={false} onChange={(event) => setField("pin", event.target.value)} />
        </label>
        <label>
          Повторите PIN
          <input name="pinConfirm" type="password" value={draft.pinConfirm || ""} inputMode="numeric" maxLength={4} placeholder="ещё раз те же 4 цифры" autoComplete="off" spellCheck={false} onChange={(event) => setField("pinConfirm", event.target.value)} />
        </label>
        <button type="submit">Создать доступ</button>
      </form>
    </article>
  );
}

export function AuthShell({ children }) {
  const { ui } = useApp();
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <a className="brand auth-brand" href="#/login">
          <span className="brand-mark">{residence.brand}</span>
          <span className="brand-line">{residence.line}</span>
        </a>
        {ui.notice ? (
          <p className="notice" role="status" aria-live="polite">
            {ui.notice}
          </p>
        ) : null}
        {children}
      </div>
    </div>
  );
}
