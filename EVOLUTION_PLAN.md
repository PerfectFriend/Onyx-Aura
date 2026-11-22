# ✦ NAILIX / ONYX-AURA — ДЕТАЛЬНЫЙ ПЛАН ЭВОЛЮЦИИ ✦

**Версия:** 1.0 · 11 ноября 2026  
**Владелец плана:** Гриша  
**Исполнитель этапов:** Женя  

Этот документ — живой. Гриша может вносить правки после каждого аудита.  
Женя работает строго по текущему утверждённому этапу.

---

## ЭТАП 0. ФУНДАМЕНТ И ЧЕСТНОСТЬ (текущий стартовый)

**Цель:** Сделать кодовую базу честной, прозрачной и готовой к качественной эволюции.

### 0.1 Инвентаризация реальности
- Создать файл `docs/REALITY_MAP.md`.
- Для каждой заявленной фичи (из README и UI) указать статус:
  - `REAL` — реально работает end-to-end
  - `SIMULATED` — красивая имитация (BroadcastChannel, локальный SHA, mock peers и т.д.)
  - `UI_ONLY` — только интерфейс, логики нет
  - `PLANNED` — ещё не начато
- Явно пометить все «on-chain», «CryptoCloud», «DAO», «escrow», «P2P swarm» как SIMULATED.

### 0.2 Вынос симуляций
- Создать папку `src/simulation/`.
- Перенести туда:
  - `cryptoLedger.ts`
  - `cryptocloud.ts` (оставить только настоящий SHA-256 и BroadcastChannel как утилиту, если нужна)
  - всю генерацию fake peers, fake block heights, fake escrow hashes.
- В UI и сервисах заменить прямые импорты на явные `import { ... } from '../simulation/...'` или feature-flag.

### 0.3 Базовое качество
- Добавить ESLint (flat config) + Prettier.
- Включить `strict: true` в tsconfig (если ещё не).
- Добавить скрипты: `lint`, `typecheck`, `format`.
- Убрать все `any`, магические строки вынести в константы.
- Настроить простой Vitest + 3–5 smoke-тестов на ключевые утилиты (`calendarSync`, `geoDistance`, `haptics`).

### 0.4 Документация в репозитории
- `MANIFESTO.md` (уже есть)
- `EVOLUTION_PLAN.md` (этот файл)
- `docs/DEVELOPMENT_JOURNAL.md` (журнал переписки)
- Обновить README: честно описать, что сейчас demo/prototype, а что планируется.

**Критерий приёмки Этапа 0:**  
Гриша может открыть REALITY_MAP и за 30 секунд понять, где правда, а где театр.  
`npm run lint && npm run typecheck && npm test` проходят без ошибок.

---

## ЭТАП 1. АРХИТЕКТУРНАЯ ГИГИЕНА

**Цель:** Убрать god-component, ввести слои, сделать код масштабируемым.

1.1 Разрезание `App.tsx`  
- Вынести стейт и хендлеры в dedicated hooks / stores.  
- Компоненты должны получать данные через props или контекст, а не тянуть всё из корня.

1.2 Слои (рекомендуемая структура)
```
src/
  domain/          # чистые типы, бизнес-правила, value objects
  application/     # use-cases, orchestration
  infrastructure/  # localStorage, IndexedDB, crypto, geolocation, notifications
  presentation/    # React components, hooks, pages
  simulation/      # всё, что пока не настоящее
```

1.3 State management  
Женя выбирает и обосновывает: Zustand **или** React Context + useReducer.  
Не Redux без крайней необходимости.

1.4 Error handling  
- React Error Boundaries  
- Централизованный logger (даже если пока console + local buffer)

**Критерий:** App.tsx становится тонким orchestration-слоем < 150–200 строк.

---

## ЭТАП 2. ДАННЫЕ И LOCAL-FIRST

- Заменить hardcoded `initialData.ts` на репозитории + seed.
- Ввести IndexedDB (или OPFS) через чистый abstraction layer.
- Offline-first: все действия клиента сохраняются локально, потом синхронизируются (пока даже без сервера — просто готовность).

---

## ЭТАП 3. ИДЕНТИЧНОСТЬ И БЕЗОПАСНОСТЬ

- WebAuthn / Passkeys как основной способ входа.
- Никаких plaintext секретов.
- Content Security Policy, правильные headers (если появится сервер).

---

## ЭТАП 4. ПЛАТЕЖИ — ЧЕСТНЫЙ ВЫБОР

Два возможных пути (Гриша утвердит после обсуждения с Женей):

**Путь A (реальный):**  
Интеграция с настоящим платёжным провайдером + (опционально) настоящие смарт-контракты escrow.

**Путь B (честный):**  
Полностью убрать «on-chain / CryptoCloud / escrow hash» риторику.  
Заменить на прозрачный «Secure Booking with Deposit» без театра.

---

## ЭТАП 5. СОЦИАЛЬНЫЙ СЛОЙ И РЕПУТАЦИЯ (без DAO-театра)

**Статус:** Активный (открыт Гришей 2026-11-22)  
**Цель:** Живой социальный контур салона — отзывы, доверие, видимость мастеров — **без** блокчейн-/DAO-театра.  
**Принцип:** каждая социальная претензия либо проверяема сервером (passkey + бронь), либо честно помечена `[SIM]` / `LOCAL_ONLY`.

Колян вызывается **по итогам всего Этапа 5**, не на каждый спринт.

### 5.1 Гигиена перед сетью (бэклог V-07 / Q-10)
- Разрезать `salonRepository.ts` на модули (collections / outbox / seed / migrations).
- Единый генератор ID (`crypto.randomUUID` / ULID) вместо `Date.now()` в ключах React и доменах.
- i18n для серверных/хуковых тостов (хотя бы en+ru ключи, без захардкоженной кириллицы в infrastructure).
- Убрать/закомментировать мёртвый `GEMINI_API_KEY` из `.env.example`, если не используется.
- Prod entry: документировать путь `tsx` → compiled JS (или тонкий wrapper), без ломки Cloud Run.

### 5.2 Отзывы, привязанные к реальности
- Серверный контур отзывов: создать можно только при наличии **captured/completed** депозита или явной completed-appointment, связанной с `credentialId` автора.
- Хранение отзывов на сервере (store / файл / sqlite — честно в NOTES); публичный `GET` ленты по `artistId`.
- Клиент: Reputation UI читает сервер при наличии API, иначе честный `LOCAL_ONLY` fallback.
- Никаких «immutable on-chain» формулировок; бейдж «Verified after completed booking» только если сервер это подтвердил.

### 5.3 Круг доверия без DAO
- Заменить/переподписать Friend Jury: не «консенсус жюри в блокчейне», а **приглашённые endorsements** (passkey-сессия + optional invite).
- Сервер: `POST /api/trust/endorsements` с rate-limit; список endorsements на профиль мастера.
- UI: честные подписи («Рекомендация от клиента с Passkey», не «DAO vote»).
- Старый `[SIM]`-путь может остаться за флагом для оффлайн-демо.

### 5.4 Общая витрина и лёгкая синхронизация
- Публичный read-model: portfolio items / published looks, которые мастер явно опубликовал (session role master).
- Outbox → сервер: опциональный flush пользовательских мутаций (лайки не обязательны; публикации и отзывы — да).
- Без претензии на P2P-swarm: это **клиент ↔ наш API**, точка.

### 5.5 Сводка этапа
- REALITY_MAP v4.x: социальные модули с точными статусами.
- Тесты на серверные инварианты отзывов/endorsements (негативные: без брони, чужой artist, replay).
- Honesty watchdog не нарушен.
- Короткий `[REPORT]` готовности к аудиту Коляна.

**Критерий закрытия Этапа 5:**  
Гриша видит работающий контур «бронь → депозит → отзыв → рекомендация» с серверными проверками; в UI нет DAO/on-chain театра; Колян может бить в security/social invariants одним проходом.

---

## ЭТАП 6–8 (кратко)

6. Настоящий mobile (Capacitor / Tauri) + реальный AR (MediaPipe и т.п.)  
7. Performance, a11y, battery, full i18n  
8. Production readiness (CI/CD в Actions, monitoring, security review, docs)

---

## ТЕКУЩИЙ СТАТУС

**Активный этап:** 5. Социальный слой и репутация  
**Закрыты:** 0–4 (включая 4.5 V-hardening)  
**Следующее задание Жене:** Спринт 5.1 — см. `docs/DEVELOPMENT_JOURNAL.md`
