# Salam Residences — пакет для аудита архитектуры

Скопируй этот файл целиком в нейросеть. Живой UI снаружи открывается только через туннель (localhost недоступен).

## Что это

Операционная платформа сети доходных домов (React SPA + SQLite API).
Версия: `0.3.0` (`package.json`). Домен: дома → юниты → жильцы/проживания → лицевой счёт (начисления/оплаты/залог/коммуналка) + команда/задачи.

## Как запускается

- Dev UI: `npm run dev` (Vite, порт `5173`)
- Legacy Node static + API: `npm run legacy` → `node server.mjs`
- Сборка: `npm run build` → `vite build` + `pack.mjs` → `Salam-Residences.html`
- Тесты: `npm test` (`node --test tests/**/*.test.js`)

Локальный URL: `http://127.0.0.1:5173` (недоступен извне без туннеля).

## Дерево исходников (без node_modules)

```
salamproject/
  package.json
  vite.config.js
  index.html
  pack.mjs
  server.mjs                 # Node http: static + /api/*
  Salam-Residences.html     # упакованный single-file билд
  AUDIT-FOR-AI.md           # этот файл
  public/sw.js
  db/
    sqlite.mjs              # SQLite: kv, houses, money_events, health
    http.mjs                # HTTP API /api/*
    merge.mjs               # merge стратегий для kv-снимков
    vite-plugin.mjs         # API middleware в Vite
  src/
    main.jsx
    App.jsx                 # маршрутизация экранов по hash
    styles.css
    domain.js               # доменная модель + операции (ядро)
    persist.js              # клиент: SQLite=истина, localStorage=кэш
    format.js
    app/
      routes.js             # path helpers + role redirects
      store.jsx             # AppProvider / useApp
      access.js
      labels.js
    ui/
      Auth.jsx
      Shell.jsx
      HousesPage.jsx
      HousePage.jsx
      DetailPages.jsx       # квартира / жилец
      ReportsPage.jsx
      TasksPage.jsx
      TeamPage.jsx
      bits.jsx
    ai/
      index.js
      kernel.js
      plan.js
      tools.js
  tests/
    audit-correctness.test.js
    persist-reliability.test.js
    data-coverage.test.js
    scale.test.js
    sqlite.test.js
    exchange.test.js
    ai-kernel.test.js
    react-routes.test.js
    staff.test.js
    ledger.test.js
  data/                     # SQLite файлы (runtime)
```

## Слои

1. **UI (React)** — hash-роутинг (`#/work`, `#/reports`, …), роли lead / manager / crew.
2. **Domain (`src/domain.js`)** — фонды, юниты, stays, ledger, staff, invites, tasks, vacancy/reports.
3. **Persist (`src/persist.js`)** — ключи KV в SQLite + кэш localStorage + очередь flush + revisions.
4. **DB (`db/sqlite.mjs`)** — таблицы kv / derived houses / money events; merge через `db/merge.mjs`.
5. **HTTP (`db/http.mjs`)** — JSON API; подключается и в Vite middleware, и в `server.mjs`.

## KV store keys

- `salam-residences-books`
- `salam-residences-staff`
- `salam-residences-tasks`
- `salam-residences-cards`
- `salam-residences-houses`

При конфликте revisions: books можно merge; остальные — replace полного снимка.

## HTTP API (`db/http.mjs`)

| Method | Path | Назначение |
|--------|------|------------|
| GET | `/api/health` | статус БД |
| GET | `/api/kv` | все ключи |
| PUT/POST | `/api/kv` | batch put (`merge` optional) |
| GET/PUT/POST | `/api/kv/:key` | один ключ |
| GET | `/api/houses` | список домов |
| GET | `/api/money?houseId&kind&limit` | денежные события |
| POST | `/api/ops/payment` | append оплаты |
| POST | `/api/ops/expense` | append расхода |
| POST | `/api/ops/house` | upsert дома |
| PUT/POST | `/api/ops/house/active` | активный дом |

Ответы через `sendJson` (не бинарный стрим). CORS: `*` на JSON API. Auth-заголовка `X-Florens-Token` в текущем API **нет**.

## Роли и маршруты

- Не авторизован: `/login`, `/owner`, `/join…`
- `crew` → только `/tasks`
- `manager` → `/work` (не лендинг домов)
- `lead` → `/` дома, `/work`, `/reports`, `/team`, `/tasks`, детали квартиры/жильца

Файлы: `src/app/routes.js`, `src/App.jsx`, `src/ui/*`.

## Важные доменные операции (ориентиры в `domain.js`)

- Деньги: `recordPayment`, `recordExpense`, `payUtility`, `payOpenUtilities`
- Договоры/вакансии: `contractEnding`, `vacancyOf`, `housePicture`
- Staff: `registerOwner`, `registerWithInvite`, `loginStaff`, `createInvite`
- Persist UX: `withPersistNotice`, `takePersistWarning`
- Seed house: `SEED_HOUSE_ID = "h-salam"`

## Что уже НЕ является частью текущего кода

- Нет `server.js` / `main.js` — сервер: `server.mjs`, фронт-вход: `src/main.jsx`
- Нет PDFKit / PDF-эндпоинтов / `downloadPdf()`
- Нет обязательной авторизации API через `X-Florens-Token`

Если аудируете план PDF — это **будущие** правки поверх текущего контура, а не существующая реализация.

## Как дать нейросети больше деталей

1. Вставь этот файл.
2. Приложи содержимое ключевых файлов по запросу: `db/http.mjs`, `db/sqlite.mjs`, `src/persist.js`, `src/domain.js`, `src/App.jsx`, `src/app/routes.js`.
3. Для UI-аудита открой публичный туннель к `5173` и пришли URL.
