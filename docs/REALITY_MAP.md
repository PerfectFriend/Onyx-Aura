# ✦ NAILIX / ONYX-AURA — КАРТА РЕАЛЬНОСТИ (REALITY MAP) ✦

> **Статус**: Канонический документ честности (актуализирован в Этапе 4 · Спринт 4.1 «Foundation only: честные платежи без PCI-полей и серверный WebAuthn challenge stub»)  
> **Версия**: 3.3  
> **Дата обновления**: 17 ноября 2026 г.  
> **Исполнитель**: Женя (Сеньор-разработчик)  
> **Аудиторы**: Гриша (Архитектор эволюции) & Колян (Cross-Model Auditor, Claude Sonnet 5.5)  
> **Основание**: Закон 1, 7, 8 и 10 Канонического Манифеста AI-разработчика (`MANIFEST_CANONICAL_AI_DEVELOPER.md`)

---

## 📌 Классификация статусов (Чёткое правило, `L-07`)

По рекомендации кросс-аудита (`L-07`) статус зависит от того, завершён ли сценарий целиком или работает строго локально на одном устройстве:

- 🟢 **`REAL`** — Работает целиком и без обходных ограничений как техническая подсистема (движок IndexedDB + устойчивость сбоев, самохостинг шрифтов, build-time CSP, RFC 5545 `.ics` генератор, Haptics API, формула гаверсинусов, Zero-PCI доменный порт `PaymentProvider`) **или** как полноценный пользовательский инструмент, не требующий второй стороны/сервера.
- 🔵 **`LOCAL_ONLY`** — Подлинная клиентская логика в браузере с локальным сохранением в IndexedDB, но **без серверной авторизации прав, серверного SPKI-реестра или доставки второй стороне** (WebAuthn Passkeys с проверкой подписи в браузере, Бронирование и записи, Портфолио с лайками/избранным, Карта пинов, Реклама, Аналитика).
- 🔴 **`SIMULATED`** — Математическая или UI-имитация (`[SIM] MockPaymentProvider`, `BroadcastChannel`, `setTimeout`, Canvas 2D overlay, `[SIM] Демо Passkey`, расчёт демо-отзывов и депозитов). **Обязательно маркируется бейджем `[SIM]` в коде и UI**.
- 🟡 **`PROTOTYPE`** — Рабочий технический каркас, требующий доработки платформенной обвязки или подключения БД перед релизом (например, серверный одноразовый `WebAuthnChallengeStubStore` в `/api/auth/webauthn/*` без серверной проверки COSE-подписи; WebView `MainActivity.java` в `android-build/`, `K-18`).
- ⚪ **`PLANNED`** — Запланировано на будущие этапы (`EVOLUTION_PLAN.md`: Stripe Hosted Checkout + серверная SPKI-проверка Спринта 4.2, сеть Этапа 5, MediaPipe 3D AR Этапа 6).

---

## 🔧 1. Технические возможности (Technical Capabilities)

| Подсистема / Возможность | Файлы реализации | Статус | Доказательство и ограничения |
| :--- | :--- | :---: | :--- |
| **Local-First Resilient Storage Engine** | `src/domain/storage.ts`, `src/domain/schemas.ts`, `src/infrastructure/storage/indexedDbAdapter.ts`, `src/infrastructure/storage/salonRepository.ts` | 🟢 **`REAL`** | `IndexedDBAdapter` (`tx.oncomplete`, батчевый `setMany`) + `ResilientStorageAdapter.getDetailed()` различает `'ok' \| 'missing' \| 'unreadable'` (`N-01`, не сидирует и не затирает нечитаемые ключи, держит `degraded` до очистки `unreadableKeys` и `pendingRetryKeys`), очередью Web Locks (`navigator.locks`), debounced кросс-вкладочным `BroadcastChannel` (`tabId` фильтр), поэлементной карантинизацией `quarantine:<collection>:<ts>` с non-secret passthrough (`N-03`), миграциями `v1 → v2 → v3` (`N-02`) и режимом `read-only` при более новой схеме (`> 3`). |
| **Transactional Outbox & Seed Isolation** | `src/infrastructure/storage/salonRepository.ts`, `src/domain/storage.ts` | 🟢 **`REAL`** | Атомарные `*WithOutbox` транзакции (`commitWithOutbox` пишет коллекцию + `outbox` + `schemaMeta` за 1 вызов `setMany`), strict allowlist `sanitizeOutboxPayload` (без ПДн) и триггеры дозаписи на `online` / `visibilitychange` / `pagehide` / `beforeunload` (`N-06`). Стартовые данные имеют `origin: 'seed'` (включая авто-разметку v2→v3 при миграции `N-02`). |
| **Payment Domain Port & Zero-PCI Boundary** | `src/domain/payments.ts`, `docs/PAYMENTS_ADR.md`, `src/components/CheckoutModal.tsx` | 🟢 **`REAL`** | Чистый контракт `PaymentProvider` (`DepositIntent`, `DepositSession`, целые центы `toMinorUnits`). Из `CheckoutModal.tsx` полностью удалены все поля номера карты / `MM/YY` / `CVC` (контролируется тестом Zero-PCI Watchdog). Реальный шлюз Stripe Hosted Checkout (SAQ-A) перенесён на Спринт 4.2. |
| **Server API & WebAuthn Challenge Stub** | `server.ts`, `src/server/apiRouter.ts`, `src/server/challengeService.ts` | 🟡 **`PROTOTYPE`** | Express 5 (`PORT=3000`) выдаёт одноразовый 32-байтовый WebAuthn challenge (TTL `120 с`, макс. `2000` записей) через `POST /api/auth/webauthn/challenge`, проверяет `clientDataJSON` (`type`, `challenge`, `origin`) и флаг `UP` на `POST /api/auth/webauthn/verify`, потребляя challenge ровно 1 раз. **Честное ограничение 4.1:** возвращает `verificationTier: 'challenge_stub_only'` и `cryptographicServerVerified: false` — серверной COSE/SPKI-проверки подписи и БД ещё нет (Этап 4.2). `GET /api/payments/provider` возвращает статус `mock_sim` / `hostedCheckoutConfigured: false`. |
| **Load-then-Mount & Live Cross-Tab Sync** | `src/hooks/useSalonBootstrap.ts`, `src/App.tsx`, `src/components/ErrorBoundary.tsx` | 🟢 **`REAL`** | Единый `useReducer` (0 ref-зеркал и 0 дублей состояния `N-09`), экран загрузки до чтения БД, обновление срезов из соседней вкладки через `externalRevision` **без размонтирования** открытых модалок/черновиков (`key={resetEpoch}` срабатывает только при полном сбросе демо `N-04`). Корневой `ErrorBoundary` и баннер позволяют экспортировать `.json` карантина (`N-03`). |
| **WebAuthn Crypto & Secret Hygiene** | `src/domain/identity.ts`, `src/infrastructure/identity/webAuthnService.ts`, `src/infrastructure/identity/secretHygiene.ts` | 🟢 **`REAL`** | Честный тип результата `verification: 'signature_verified' \| 'presence_only'` (`W11/W12`, при отсутствии SPKI и в режиме `webauthn_presence_only` вход не маркируется криптопроверенным), извлечение SPKI из CBOR/COSE `attestationObject`, проверка `UP` + обязательный `UV` для `master` (`W7`), учёт флага синхронизируемых Passkey `BE` (`0x08`) при расхождении `signCount` (`W10`), узкие JWT/`Authorization: Bearer` правила без ложных срабатываний на обычный текст (`N-07`). *(Как продуктовый вход: см. `LOCAL_ONLY` ниже)*. |
| **Build-Time CSP & Self-Hosted Fonts** | `src/infrastructure/security/csp.ts`, `vite.config.ts`, `index.html`, `src/main.tsx` | 🟢 **`REAL`** | Шрифты `Plus Jakarta Sans`, `Syne`, `JetBrains Mono` перенесены в `@fontsource/*` (0 запросов на Google Fonts). Vite-плагин собирает production `<meta>` CSP без `script-src 'unsafe-inline'` и без внешних шрифтов. *Ограничение бэклога (`N-10`): QR-превью в `AndroidExperienceView` ещё использует `api.qrserver.com` (разрешён в `img-src`), замена на локальный генератор запланирована; HTTP-заголовки и `frame-ancestors` появятся на сервере Этапа 4.2.* |
| **Universal Calendar Export (.ICS + Web Links)** | `src/utils/calendarSync.ts`, `src/components/CalendarSyncButtons.tsx` | 🟢 **`REAL`** | Генерация валидных файлов RFC 5545 `.ics` с `VALARM` и ссылок Google Calendar / Outlook без вымышленных крипто-хешей внутри описания. |
| **Haptics & Geo Distance Math** | `src/utils/haptics.ts`, `src/services/geoDistance.ts` | 🟢 **`REAL`** | Прямой вызов `navigator.vibrate` и расчёт расстояний по формуле гаверсинусов + `navigator.geolocation`. |
| **PWA & Workbox Offline Precache** | `vite.config.ts`, `public/manifest.webmanifest` | 🟢 **`REAL`** | Production Service Worker (`devOptions.enabled: false`), кэширование локальных картинок и `.woff2` шрифтов; `beforeinstallprompt`. |
| **Скрипт сборки Android APK** | `scripts/build-apk.sh`, `docs/KEY_ROTATION_RUNBOOK.md` | 🟢 **`REAL`** | Сборка в `dist-apk/` (вне `public/` и `.gitignore`), пароли строго из `env:NAILIX_KEYSTORE_PASS`, отказ при отсутствии keystore. |
| **Android WebView Native Shell** | `android-build/` (`MainActivity.java`) | 🟡 **`PROTOTYPE`** | Каркас под Capacitor/TWA присутствует, но WebView-разрешения камеры, загрузок и `file://` для WebAuthn отложены в бэклог `K-18`. |

---

## 📱 2. Продуктовые функции (Product Features)

| Фича | Файлы реализации | Статус | Что работает сегодня vs что ждёт Этап 4.2–6 |
| :--- | :--- | :---: | :--- |
| **Вход по Passkey / Биометрии** | `src/hooks/useIdentitySession.ts`, `src/components/PasskeyAuthModal.tsx`, `src/server/challengeService.ts` | 🔵 **`LOCAL_ONLY`** / 🔴 **`[SIM]` Fallback** | Настоящая FIDO2-церемония устройства и локальная крипто-проверка подписи по SPKI (TTL 8 часов, discoverable `allowCredentials: []`, `webauthn_passkey` vs `webauthn_presence_only`, `UV` для мастера, флаг `BE`) + запрос одноразового server challenge у `POST /api/auth/webauthn/challenge` (с fallback в static/offline). **Но** серверный stub пока отдаёт `cryptographicServerVerified: false` — серверная БД ключей и проверка ролей выйдут в Спринте 4.2. В iframe/SSR доступен `[SIM] Демо Passkey`. |
| **Бронирование и Мои записи** | `src/components/BookingModal.tsx`, `src/components/ClientAppointmentsModal.tsx`, `src/hooks/useBookingFlow.ts` | 🔵 **`LOCAL_ONLY`** | Клиентский поток записи надёжно сохраняется в IndexedDB одной транзакцией вместе с outbox (`N-06`) и не сбрасывается при обновлениях в соседней вкладке (`N-04`). Серверный календарь слотов и реальная оплата — Спринт 4.2+. |
| **Галерея портфолио + Лайки/Избранное** | `src/components/PortfolioGallery.tsx`, `src/hooks/usePortfolioGallery.ts` | 🔵 **`LOCAL_ONLY`** | Лайки/сохранения и портфолио пишутся одной атомарной транзакцией `setMany` вместе с outbox; область видимости — локальный браузер. |
| **Радар студий и точки клиента** | `src/components/ClientLocationMap.tsx` | 🔵 **`LOCAL_ONLY`** | Геолокация и сохранение точек «Дом/Работа/Салон» в IndexedDB через транзакционный `updateAnchorPointWithOutbox` (без облачной карты). |
| **Рекламный кабинет и лента** | `src/components/SponsoredAdsBanner.tsx`, `src/components/AdCampaignManagerModal.tsx`, `src/hooks/useSponsoredAds.ts` | 🔵 **`LOCAL_ONLY`** | Создание и фильтрация промо-карточек с сохранением в IndexedDB; рекламный биллинг/аукцион `$NAIL` помечен `[SIM]`. |
| **Аналитика студии** | `src/components/AdminAnalyticsDashboard.tsx` | 🔵 **`LOCAL_ONLY`** | Агрегация локальных записей пользователя + seed baseline; блок депозитов и расчёт в криптовалютах помечены `[SIM]`. |
| **CryptoCloud & Экспорт сессии** | `src/simulation/cryptocloud.ts`, `src/hooks/useCryptoSwarm.ts`, `src/components/CryptoCloudPanel.tsx` | 🔴 **`SIMULATED`** | **[SIM]** Локальный `BroadcastChannel` между вкладками и экспорт открытого `.sim.json`-снапшота (`origin: 'user'`) с SHA-256 без шифрования. |
| **Checkout Deposit Preview (`MockPaymentProvider`)** | `src/components/CheckoutModal.tsx`, `src/infrastructure/payments/mockPaymentProvider.ts`, `src/simulation/cryptocloud.ts` | 🔴 **`SIMULATED`** | **[SIM]** Превью депозита через `[SIM] MockPaymentProvider` (реализация порта `PaymentProvider`): ноль карточных `<input>` в DOM, ноль реальных списаний, локальный SHA-256. Подключение Stripe Hosted Checkout (SAQ-A) — Спринт 4.2. |
| **Жюри круга друзей (Friend Jury)** | `src/components/FriendModerationSection.tsx` | 🔴 **`SIMULATED`** | **[SIM]** Локальное голосование в `useState`; многопользовательская сеть — Этап 5. |
| **Репутационный реестр мастеров** | `src/simulation/cryptoLedger.ts`, `src/components/ReputationLedger.tsx` | 🔴 **`SIMULATED`** | **[SIM]** Демо-отзывы и точный пересчёт рейтинга (`domain/rating.ts` + `addReviewAndUpdateArtistWithOutbox`) пишутся в IndexedDB атомарно с outbox, но проверка визитов и баллы `$NAIL` остаются симуляцией. |
| **Чат с ателье (Concierge Chat)** | `src/hooks/useChatConcierge.ts`, `src/components/ChatDrawer.tsx` | 🔴 **`SIMULATED`** | **[SIM]** Сообщения пишутся в IndexedDB (включая обычный текст со словом «bearer» `N-07`), автоответчик — локальный бот на `setTimeout`. |
| **Напоминания (Push & SMS)** | `src/services/reminderService.ts` | 🔴 **`SIMULATED`** | **[SIM]** Локальный toast + опциональный `new Notification(...)`; SMS-шлюз не подключён. |
| **Виртуальная AR-примерка ногтей** | `src/components/AndroidExperienceView.tsx` | 🔴 **`SIMULATED`** | **[SIM]** WebRTC-камера + 2D Canvas сетка; MediaPipe 3D-трекинг запланирован на Этап 6. |
| **Instagram Social Sync** | `src/components/InstagramSyncSection.tsx` | 🔴 **`SIMULATED`** | **[SIM]** Импортируемые пресеты сохраняются в локальной галерее, источник — встроенный демо-каталог без Meta OAuth API. |
| **Stripe Hosted Checkout + Серверная SPKI-сессия** | — | ⚪ **`PLANNED`** | Этап 4 · Спринт 4.2 (`docs/PAYMENTS_ADR.md`): серверная проверка COSE/SPKI-подписи по реестру в БД, `HttpOnly` cookie, HTTP CSP заголовки и Stripe Hosted Checkout + Webhooks. |

---

## 📊 Итоговая сводка честности (v3.3)

- 🟢 **`REAL` (Технические возможности):** **10 подсистем** — Resilient Storage (`getDetailed`, quarantine + passthrough, schema v3), Transactional Outbox (`*WithOutbox` + strict allowlist), **Payment Domain Port & Zero-PCI Boundary** (0 карточных инпутов в DOM), Load-then-Mount (без remount при sync), WebAuthn Client SPKI Crypto + CBOR COSE + UV/BE + Secret Hygiene, Build-time CSP + Self-Hosted Fonts, `.ics` Calendar Export, Geo Math + Haptics, PWA/Workbox, Local APK Build Script.
- 🟡 **`PROTOTYPE`:** **2 каркаса** — **Express Server Challenge Stub (`/api/auth/webauthn/*`, `/api/payments/provider`)** (`cryptographicServerVerified: false`) и Android WebView Shell (`MainActivity.java`, `K-18`).
- 🔵 **`LOCAL_ONLY` (Продуктовые функции):** **6 функций** — Passkey Ceremony (+ server challenge stub), Бронирование и записи, Галерея + лайки/избранное, Карта студий, Менеджер рекламы, Аналитика.
- 🔴 **`SIMULATED`:** **8 модулей** (+ `[SIM] Демо Passkey`) — CryptoCloud, Checkout Preview (`[SIM] MockPaymentProvider`), Friend Jury, Reputation Ledger, Concierge Chat, Reminders, AR 2D Overlay, Instagram Demo Sync.
- ⚪ **`PLANNED`:** Stripe Hosted Checkout & Server SPKI Auth (Этап 4.2), Multi-User Network (Этап 5), 3D AR MediaPipe (Этап 6).
- 🧪 **Область V8-покрытия (`vitest.config.ts`):** Пороги и метрики V8 coverage измеряются строго по слоям **`src/domain/**/*.ts` + `src/infrastructure/**/*.ts` + `src/server/**/*.ts` + `src/utils/**/*.ts`** (без UI-компонентов, хуков и `[SIM]`-слоя).

---

*«Честность в коде — честность перед миром.»*  
*Версия 3.3 (Этап 4 · Спринт 4.1 Foundation): добавлен [`docs/PAYMENTS_ADR.md`](./PAYMENTS_ADR.md), порт `PaymentProvider`, `[SIM] MockPaymentProvider`, удалены все карточные `<input>` из `CheckoutModal`, поднят серверный `Express` WebAuthn challenge stub (`verificationTier: 'challenge_stub_only'`, `cryptographicServerVerified: false`).*
