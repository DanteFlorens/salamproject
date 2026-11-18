# HANDOFF для аудита и плана PDF (Salam Residences)

Скопируй **весь этот файл** в чат нейросети. Скриншоты лежат рядом в папке `audit-handoff/` (прикрепи PNG).

---

## 1. Что это за платформа (своими словами)

Это **операционная CRM / кабинет владельца сети доходных домов**, не интернет-магазин и не B2B-каталог товаров.

- Владелец (lead) видит сеть домов, внутри дома — план студий, жильцов, деньги, задачи команде.
- Управляющий (manager) ведёт свои этажи.
- Сотрудник (crew) видит только поручения.
- Учёт: юнит (студия) → проживание (stay) → лицевой счёт (аренда, залог, коммуналка) → оплаты/расходы.
- Данные: учебный дом Salam Residences, 35 студий на этажах 2–6, демо на дату `2026-10-26`.
- PDF в продукте **ещё нет**. Логичные точки кнопок: карточка студии/жильца (договор, акт, счёт) и отчёты сети/дома.

Важно: в коде **нет** `server.js` / `main.js` / `#cabinet?pane=catalog`. Реальные файлы: `server.mjs`, `src/main.jsx`, React UI в `src/ui/*`, API в `db/http.mjs`, SQLite в `db/sqlite.mjs` (файл БД в `data/`, не `florens.sqlite`).

---

## 2. package.json

```json
{
  "name": "salam-residences",
  "private": true,
  "version": "0.3.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build && node pack.mjs",
    "preview": "vite preview",
    "pack": "node pack.mjs",
    "test": "node --test tests/**/*.test.js",
    "legacy": "node server.mjs"
  },
  "dependencies": {
    "react": "^19.3.1",
    "react-dom": "^19.3.1"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.7.0",
    "vite": "^6.3.5",
    "vitest": "^3.1.4"
  }
}
```

Стек: React 19 + Vite 6 + Node `http` API + SQLite (через `db/sqlite.mjs`). PDFKit **не установлен**.

Запуск: `npm run legacy` или `npm run dev` → `http://127.0.0.1:5173`.

Демо-вход: телефон `+7 900 200-00-01`, PIN из `DEMO_PIN` в `domain.js` (показан на экране входа).

---

## 3. Структура проекта

```
salamproject/
  package.json
  vite.config.js
  index.html
  pack.mjs
  server.mjs                 # static + делегирует /api/* в db/http.mjs
  Salam-Residences.html      # single-file build
  db/
    sqlite.mjs               # openDatabase, kv, houses, money_events
    http.mjs                 # JSON API /api/*
    merge.mjs
    vite-plugin.mjs
  src/
    main.jsx                 # вход React (аналог «main.js»)
    App.jsx                  # hash-роутинг экранов
    domain.js                # домен: units, stays, ledger, staff, tasks
    persist.js               # SQLite = источник правды, localStorage = кэш
    format.js
    styles.css
    app/
      routes.js              # redirect по ролям
      store.jsx
      access.js
      labels.js
    ui/
      Auth.jsx
      Shell.jsx              # навигация: Дома / Объект / Отчёты / Задачи / Команда
      HousesPage.jsx         # сеть домов + мастер нового объекта
      HousePage.jsx          # desk: overview | plan | people | money | more
      DetailPages.jsx        # карточка студии + карточка жильца  ← PDF сюда
      ReportsPage.jsx        # сутки/неделя/месяц по сети         ← PDF сюда опционально
      TasksPage.jsx
      TeamPage.jsx
      bits.jsx               # Folio, PaymentForm, UtilityPanel…
    ai/                      # локальный консультант по дому
  tests/                     # node:test
  data/                      # runtime SQLite
  audit-handoff/             # скриншоты + этот файл
```

---

## 4. Экраны (что на скриншотах)

| Файл | Экран | URL |
|------|--------|-----|
| `01-houses.png` | Сеть домов владельца | `#/` |
| `02-house-overview.png` | Объект · вкладка «Сейчас» | `#/work` |
| `03-house-plan.png` | Объект · «План» (сетка студий) | `#/work` desk=plan |
| `04-apartment-201.png` | Карточка студии 201 | `#/apartments/201` |
| `05-apartment-stay.png` | Блок «Проживание» (жилец, договор SR-201, опись) | то же |
| `06-reports.png` | Отчёты сети (сутки/неделя/месяц) | `#/reports` |

Навигация lead: Дома → Объект → Отчёты → Задачи → Команда.  
Внутри объекта desks: Сейчас / План / Жильцы / Деньги / Ещё.

---

## 5. Данные, уже есть в системе (для PDF)

Из карточки студии / stay / party (пример 201):

- юнит: код `201`, этаж, м², ставка/мес, опись (`inventory`)
- жилец: имя, телефон
- stay: `start`, `end`, номер договора (`contract`, напр. `SR-201`)
- folio: залог, начисления проживания, оплаты
- коммуналка отдельными строками
- дом: имя, адрес/описание, сетка этажей
- деньги сети: оплаты/расходы в отчётах и `/api/money`

KV-ключи SQLite:

- `salam-residences-books`
- `salam-residences-staff`
- `salam-residences-tasks`
- `salam-residences-cards`
- `salam-residences-houses`

---

## 6. Текущий HTTP API (куда стыковать PDF)

Файл: `db/http.mjs` (не Express `res.send` хелпер проекта — свой `sendJson`).

| Method | Path |
|--------|------|
| GET | `/api/health` |
| GET/PUT/POST | `/api/kv`, `/api/kv/:key` |
| GET | `/api/houses` |
| GET | `/api/money` |
| POST | `/api/ops/payment` |
| POST | `/api/ops/expense` |
| POST | `/api/ops/house` |
| PUT/POST | `/api/ops/house/active` |

Сейчас все ответы — JSON через `sendJson`. Бинарного стрима PDF нет.  
Заголовка `X-Florens-Token` в API **пока нет** (клиентский `persist.js` шлёт обычный `fetch` с `Content-Type: application/json`).

Точка входа сервера: `server.mjs` → `handleApi(req, res, url)`.

---

## 7. Где вешать кнопки скачивания (реальные места в UI)

1. **Карточка студии** — `src/ui/DetailPages.jsx` → `ApartmentPage`  
   Рядом с блоком «Проживание» / Folio: «Скачать договор PDF», позже «Счёт / акт».
2. **Карточка жильца** — тот же файл → `ResidentPage`.
3. **Опционально отчёты** — `src/ui/ReportsPage.jsx`: PDF сводки сутки/неделя/месяц.
4. **Не существует** `#cabinet?pane=catalog` и «карточка сделки B2B» — это другая модель. Ближайший аналог «сделки» здесь = **проживание (stay) на юните**.

Фронтовый хелпер скачивания логично класть рядом с API-слоем клиента (`src/persist.js` или новый `src/pdfDownload.js`), вызывать из `DetailPages.jsx` / `ReportsPage.jsx`. Вход приложения — `src/main.jsx`, не `main.js`.

---

## 8. Принятые требования к PDF (из согласования владельца)

1. Авторизация PDF-эндпоинтов строго через заголовок `X-Florens-Token` (как планировали для API Florens; в Salam это **новый** контур — нужно ввести и на клиенте).
2. Поток PDFKit: `doc.pipe(res)` напрямую, **минуя** JSON-хелпер `sendJson` / любой `send()`.
3. На фронте универсальный `downloadPdf()`: передача `X-Florens-Token`, проверка `response.ok`, защита от двойного клика, фолбэки пустых полей.

Ошибки стрима: если headers ещё не ушли — JSON/текст ошибка; если стрим уже начат — `res.destroy()` / обрыв без второй попытки `writeHead`.  
Пустые поля из БД: подставлять «—» / «не указано», не падать генератору.

---

## 9. Фрагмент: карточка студии (место кнопки)

Файл `src/ui/DetailPages.jsx` — после заголовка / в блоке проживания уже есть поля договора. Сюда же кнопка PDF:

- Жилец, телефон, заехал, договор до, номер договора, опись
- Справа: Folio + форма оплаты + коммуналка

Роуты React (hash): `#/apartments/:code`, `#/residents/:id`, `#/work`, `#/reports`, `#/`.

---

## 10. Просьба к аудирующей нейросети

Составь **пошаговый план** (без кода или с минимальными псевдо-сигнатурами) внедрения PDF под **эту** архитектуру:

- какие роуты добавить в `db/http.mjs` / `server.mjs` и где;
- какие хелперы генерации;
- как обработать ошибки стрима и пустые поля;
- какие правки во фронте (`DetailPages.jsx`, опционально `ReportsPage.jsx`, хелпер `downloadPdf`);
- как ввести `X-Florens-Token` согласованно с текущим staff-login (сейчас PIN-сессия в domain/local store, не token header).

Не предлагай `server.js`/`main.js`/`#cabinet?pane=catalog`, если не как маппинг «старые имена → новые файлы».
