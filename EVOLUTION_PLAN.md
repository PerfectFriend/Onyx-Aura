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

## ЭТАП 5–8 (кратко)

5. Социальный слой и репутация (без DAO-театра)  
6. Настоящий mobile (Capacitor / Tauri) + реальный AR  
7. Performance, a11y, battery, full i18n  
8. Production readiness (CI/CD, monitoring, security review, docs)

---

## ТЕКУЩИЙ СТАТУС

**Активный этап:** 0. Фундамент и Честность  
**Следующее задание Жене:** см. журнал `docs/DEVELOPMENT_JOURNAL.md`
