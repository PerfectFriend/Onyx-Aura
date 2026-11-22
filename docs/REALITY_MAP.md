# ✦ NAILIX / ONYX-AURA — КАРТА РЕАЛЬНОСТИ (REALITY MAP) ✦

> **Статус**: Канонический документ честности (актуализирован в Этапе 4 · Спринт 4.5 «Деплой, возврат Stripe и атомарность без сюрпризов»)  
> **Версия**: 3.7  
> **Дата обновления**: 22 ноября 2026 г.  
> **Исполнитель**: Женя (Сеньор-разработчик)  
> **Аудиторы**: Гриша (Архитектор эволюции) & Колян (Cross-Model Auditor, Claude Sonnet 5.5)  
> **Основание**: Закон 1, 7, 8 и 10 Канонического Манифеста AI-разработчика (`MANIFEST_CANONICAL_AI_DEVELOPER.md`)

---

## 📌 Классификация статусов (Чёткое правило, `L-07`)

По рекомендации кросс-аудита (`L-07`) статус зависит от того, завершён ли сценарий целиком или работает строго локально на одном устройстве:

- 🟢 **`REAL`** — Работает целиком и без обходных ограничений как техническая подсистема (движок IndexedDB + устойчивость сбоев, серверная WebAuthn SPKI крипто-проверка с COSE-привязкой, `409` анти-сквоттингом и серверным назначением ролей + `HttpOnly` HMAC-сессии, HTTP Security Headers + CSP `frame-ancestors 'self'` + HSTS, самохостинг шрифтов, build-time CSP, RFC 5545 `.ics` генератор, Haptics API, формула гаверсинусов, Zero-PCI доменный порт `PaymentProvider` + серверный каталог цен) **или** как полноценный пользовательский инструмент.
- 🔵 **`LOCAL_ONLY`** — Подлинная клиентская логика в браузере с локальным сохранением в IndexedDB, но **без облачной синхронизации второй стороне** (локальная база записей и портфолио без облачной БД студии, Карта пинов, Реклама, Аналитика, а также локальный вход при недоступности серверного SPKI).
- 🔴 **`SIMULATED`** — Математическая или UI-имитация (`[SIM] MockPaymentProvider`, `BroadcastChannel`, `setTimeout`, Canvas 2D overlay, `[SIM] Демо Passkey`, расчёт демо-отзывов и депозитов при отсутствии `STRIPE_SECRET_KEY`). **Обязательно маркируется бейджем `[SIM]` в коде и UI**.
- 🟡 **`PROTOTYPE`** — Рабочий технический каркас, требующий секретов окружения/платформенной обвязки для запуска в бою (Stripe Hosted Checkout SAQ-A + Webhook + return-цикл ожидает реальных `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` в окружении и живых прогонов; WebView `MainActivity.java` в `android-build/`, `K-18`).
- ⚪ **`PLANNED`** — Запланировано на будущие этапы (`EVOLUTION_PLAN.md`: облачная многопользовательская сеть Этапа 5, MediaPipe 3D AR Этапа 6).

---

## 🔧 1. Технические возможности (Technical Capabilities)

| Подсистема / Возможность | Файлы реализации | Статус | Доказательство и ограничения |
| :--- | :--- | :---: | :--- |
| **Server WebAuthn SPKI Crypto, COSE Binding, Durable Invite Roles & `HttpOnly` Sessions** | `server.ts`, `src/domain/webauthnCbor.ts`, `src/server/originPolicy.ts`, `src/server/rateLimiter.ts`, `src/server/challengeService.ts`, `src/server/serverStore.ts`, `src/server/webAuthnServerVerifier.ts`, `src/server/sessionService.ts`, `src/server/apiRouter.ts` | 🟢 **`REAL`** | Одноразовые 32-байтовые challenge (TTL `120 с`, изолированные квоты на IP с поддержкой хопов `TRUST_PROXY` + HTTP `429`), обязательный `authenticatorData`/`attestationObject` со сверкой COSE-ключа и `credentialId === rawIdBase64Url`, `409` анти-сквоттинг, строгие `P-256`/`rsa`, серверное назначение ролей (`client` по умолчанию; `master` только по одноразовому коду `>= 16` символов `NAILIX_MASTER_INVITE_CODES` с атомарным сохранением SHA-256 хэша в `.data/nailix-server.json`), HMAC-SHA256 `HttpOnly` cookie `nailix_sid`. Отказ старта production без `NAILIX_SESSION_SECRET` при активных `STRIPE_SECRET_KEY` / `NAILIX_MASTER_INVITE_CODES` / `NAILIX_STRICT_SECRETS=1` (в showcase Cloud Run без внешних секретов — эфемерный 32-байтовый CSPRNG-ключ + громкое предупреждение при пустых `APP_URL`/`NAILIX_ALLOWED_ORIGINS`). |
| **HTTP Security Headers, HSTS & Strict Offline CSP** | `src/server/securityHeaders.ts`, `server.ts`, `src/infrastructure/security/csp.ts`, `src/utils/qrGenerator.ts` | 🟢 **`REAL`** | Express выдаёт `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security` в production/HTTPS, HTTP `Content-Security-Policy` (`frame-ancestors 'self'` по умолчанию в production, `img-src 'self' data: blob:` с локальным оффлайн-QR `qrcode`), проверку `Origin`/`Sec-Fetch-Site` на мутирующих запросах и JSON `404` для неизвестных `/api/*`. |
| **Stripe Hosted Checkout Adapter (SAQ-A), Catalog Pricing & Webhooks** | `src/domain/serviceCatalog.ts`, `src/server/stripeProvider.ts`, `src/infrastructure/payments/hostedCheckoutProvider.ts`, `src/hooks/useBookingFlow.ts` | 🟡 **`PROTOTYPE`** (Ожидает реальные ключи Stripe) | Сервер отдаёт котировки через `GET /api/payments/quote`, игнорирует клиентский `amountUsd`, ограничивает `$10 000`, строит составной `Idempotency-Key` (`409` при конфликте параметров на открытой брони), сохраняет `appointmentDate`/`appointmentTimeSlot`, отдаёт минимальный `GET /api/payments/intents/:id` (без URL сессии и провайдера), различает `partially_refunded` / `released` / `disputed` + запасную корреляцию по `payment_intent` и помечает сироты `unmatched`. Клиент привязывает возврат строго через `matchIntentToAppointment` (без `booking_ref` из URL) и не выдумывает бронь при её отсутствии локально. Без `STRIPE_*` в env честно переключается на `[SIM] MockPaymentProvider`. |
| **Payment Domain Port & Zero-PCI Boundary** | `src/domain/payments.ts`, `src/domain/serviceCatalog.ts`, `docs/PAYMENTS_ADR.md`, `src/components/CheckoutModal.tsx` | 🟢 **`REAL`** | Чистый контракт `PaymentProvider` (`DepositIntent`, `DepositSession`, целые центы `toMinorUnits`), серверный каталог цен (`CANONICAL_SERVICE_CATALOG`) и ноль карточных `<input>` (`PAN` / `MM/YY` / `CVC`) в DOM (контролируется тестом Zero-PCI Watchdog). |
| **Local-First Resilient Storage Engine** | `src/domain/storage.ts`, `src/domain/schemas.ts`, `src/infrastructure/storage/indexedDbAdapter.ts`, `src/infrastructure/storage/salonRepository.ts` | 🟢 **`REAL`** | `IndexedDBAdapter` (`tx.oncomplete`, `setMany`) + `ResilientStorageAdapter.getDetailed()` (`ok \| missing \| unreadable`), Web Locks, debounced `BroadcastChannel`, карантин с passthrough (`N-03`), миграции `v1 → v2 → v3`, `read-only` для будущих схем. |
| **Transactional Outbox & Seed Isolation** | `src/infrastructure/storage/salonRepository.ts`, `src/domain/storage.ts` | 🟢 **`REAL`** | Атомарные `*WithOutbox` транзакции (`commitWithOutbox`), strict allowlist `sanitizeOutboxPayload` (без ПДн), триггеры `online`/`visibilitychange`/`pagehide`/`beforeunload` и разметка `origin: 'seed' \| 'user'`. |
| **Load-then-Mount & Live Cross-Tab Sync** | `src/hooks/useSalonBootstrap.ts`, `src/App.tsx`, `src/components/ErrorBoundary.tsx` | 🟢 **`REAL`** | Единый `useReducer`, экран загрузки до чтения БД, sync через `externalRevision` без размонтирования модалок и экспорт `.json` карантина. |
| **Client WebAuthn Crypto & Secret Hygiene** | `src/domain/identity.ts`, `src/domain/webauthnCbor.ts`, `src/infrastructure/identity/webAuthnService.ts`, `src/infrastructure/identity/secretHygiene.ts` | 🟢 **`REAL`** | Локальная SPKI-проверка + общий CBOR/COSE парсер `webauthnCbor.ts`, `UP/UV`, `BE=1`, и узкая проверка секретов `assertNoSecretLikeFields`. |
| **Build-Time Strict CSP, Self-Hosted Fonts & Local QR (`N-10`)** | `src/infrastructure/security/csp.ts`, `src/utils/qrGenerator.ts`, `vite.config.ts`, `index.html`, `src/main.tsx` | 🟢 **`REAL`** | Локальные шрифты `@fontsource/*`, production build `<meta>` CSP без `script-src 'unsafe-inline'` и внешних доменов изображений, 100% локальный offline QR-генератор. |
| **Universal Calendar Export (.ICS + Web Links)** | `src/utils/calendarSync.ts`, `src/components/CalendarSyncButtons.tsx` | 🟢 **`REAL`** | Валидные файлы RFC 5545 `.ics` с `VALARM` и безопасные `<a>` ссылки Google Calendar / Outlook. |
| **Haptics & Geo Distance Math** | `src/utils/haptics.ts`, `src/services/geoDistance.ts` | 🟢 **`REAL`** | `navigator.vibrate`, формула гаверсинусов и `navigator.geolocation`. |
| **PWA & Workbox Offline Precache** | `vite.config.ts`, `public/manifest.webmanifest` | 🟢 **`REAL`** | Production Service Worker (`devOptions.enabled: false`), precache картинок и `.woff2`. |
| **Скрипт сборки Android APK** | `scripts/build-apk.sh`, `docs/KEY_ROTATION_RUNBOOK.md` | 🟢 **`REAL`** | Сборка в `dist-apk/` со строгим `env:NAILIX_KEYSTORE_PASS`. |
| **Android WebView Native Shell** | `android-build/` (`MainActivity.java`) | 🟡 **`PROTOTYPE`** | Каркас TWA/WebView перенесён в бэклог `K-18`. |

---

## 📱 2. Продуктовые функции (Product Features)

| Фича | Файлы реализации | Статус | Что работает сегодня vs что ждёт Этап 5–6 |
| :--- | :--- | :---: | :--- |
| **Вход по Passkey — серверный путь (`SERVER SPKI`)** | `server.ts`, `src/server/apiRouter.ts`, `src/server/webAuthnServerVerifier.ts`, `src/server/sessionService.ts` | 🟢 **`REAL`** *(1-экземплярное `.data`)* | Регистрация с COSE/SPKI-привязкой (`credentialId === rawIdBase64Url`), `409` анти-сквоттинг, атомарные хэшированные инвайты мастера (`>= 16` символов) в `.data/nailix-server.json` и `HttpOnly` HMAC cookie `nailix_sid`. На одиночном инстансе без Cloud SQL/Redis состояние `.data` эфемерно при редеплое; в showcase-режиме без `NAILIX_SESSION_SECRET` ключ cookie пересоздаётся при старте контейнера. |
| **Вход по Passkey — локальный / iframe fallback** | `src/infrastructure/identity/webAuthnService.ts`, `src/hooks/useIdentitySession.ts`, `src/components/PasskeyAuthModal.tsx` | 🔵 **`LOCAL_ONLY`** / 🔴 **`[SIM]`** | Когда серверный API недоступен (статика/оффлайн), работает локальный FIDO2 WebAuthn в IndexedDB (`client_local_only`). В изолированном iframe без FIDO2 доступен явный `[SIM] Демо Passkey` (имитация без криптографии). |
| **Бронирование и Депозит (Zero-PCI)** | `src/components/BookingModal.tsx`, `src/components/CheckoutModal.tsx`, `src/hooks/useBookingFlow.ts`, `src/server/stripeProvider.ts` | 🟡 **`PROTOTYPE` (SAQ-A Cycle)** / 🔴 **`[SIM]` без ключей** | При наличии `STRIPE_SECRET_KEY` в env UI показывает серверную котировку `/api/payments/quote`, сохраняет `pending`-бронь до перехода на Stripe Checkout, а при возврате по `?intent_id=...` строго сверяет `matchIntentToAppointment` (без `booking_ref` из URL) и корректно различает `captured` / `partially_refunded` / `disputed` / `released`. Облачный календарь студии — Этап 5. |
| **Галерея портфолио + Лайки/Избранное** | `src/components/PortfolioGallery.tsx`, `src/hooks/usePortfolioGallery.ts` | 🔵 **`LOCAL_ONLY`** | Сохранение в IndexedDB одной транзакцией `setMany` с outbox. |
| **Радар студий и точки клиента** | `src/components/ClientLocationMap.tsx` | 🔵 **`LOCAL_ONLY`** | Геолокация и локальное хранение точек в IndexedDB. |
| **Рекламный кабинет и лента** | `src/components/SponsoredAdsBanner.tsx`, `src/components/AdCampaignManagerModal.tsx`, `src/hooks/useSponsoredAds.ts` | 🔵 **`LOCAL_ONLY`** | Промо-карточки в IndexedDB; биллинг `$NAIL` помечен `[SIM]`. |
| **Аналитика студии** | `src/components/AdminAnalyticsDashboard.tsx` | 🔵 **`LOCAL_ONLY`** | Локальные записи + seed baseline; криптовалютные блоки помечены `[SIM]`. |
| **CryptoCloud & Экспорт сессии** | `src/simulation/cryptocloud.ts`, `src/hooks/useCryptoSwarm.ts`, `src/components/CryptoCloudPanel.tsx` | 🔴 **`SIMULATED`** | **[SIM]** Локальный `BroadcastChannel` и открытый `.sim.json` с SHA-256. |
| **Жюри круга друзей (Friend Jury)** | `src/components/FriendModerationSection.tsx` | 🔴 **`SIMULATED`** | **[SIM]** Локальное голосование в `useState`; сеть — Этап 5. |
| **Репутационный реестр мастеров** | `src/simulation/cryptoLedger.ts`, `src/components/ReputationLedger.tsx` | 🔴 **`SIMULATED`** | **[SIM]** Локальный расчёт рейтинга, но подтверждение визитов и `$NAIL` — симуляция. |
| **Чат с ателье (Concierge Chat)** | `src/hooks/useChatConcierge.ts`, `src/components/ChatDrawer.tsx` | 🔴 **`SIMULATED`** | **[SIM]** IndexedDB-сообщения + локальный бот на `setTimeout`. |
| **Напоминания (Push & SMS)** | `src/services/reminderService.ts` | 🔴 **`SIMULATED`** | **[SIM]** Локальный toast + опциональный `Notification` без SMS-шлюза. |
| **Виртуальная AR-примерка ногтей** | `src/components/AndroidExperienceView.tsx` | 🔴 **`SIMULATED`** | **[SIM]** WebRTC-камера + 2D Canvas сетка; MediaPipe 3D — Этап 6. |
| **Instagram Social Sync** | `src/components/InstagramSyncSection.tsx` | 🔴 **`SIMULATED`** | **[SIM]** Демо-каталог пресетов без Meta OAuth API. |
| **Multi-User Network & 3D AR** | — | ⚪ **`PLANNED`** | Этап 5 (межпользовательская синхронизация), Этап 6 (MediaPipe 3D AR). |

---

## 📊 Итоговая сводка честности (v3.7)

- 🟢 **`REAL` (Технические возможности):** **13 подсистем** — **Server WebAuthn SPKI Crypto + COSE Binding + Durable Hashed Invite Roles & `HttpOnly` Sessions**, **HTTP Security Headers (HSTS + `frame-ancestors 'self'`) & Strict Offline CSP**, **100% Local Offline QR (`N-10`)**, Resilient Storage v3, Transactional Outbox, Payment Domain Port + Server Quote/Catalog Pricing & Zero-PCI Boundary, Load-then-Mount, Client WebAuthn SPKI + Secret Hygiene, `.ics` Export, Geo + Haptics, PWA/Workbox, Local APK Script, Non-PII Security Audit Log.
- 🟡 **`PROTOTYPE`:** **2 каркаса** — **Stripe Hosted Checkout SAQ-A Loop (`stripeProvider.ts` + строгая реконсиляция возврата + частичные возвраты/споры, ждёт реальные `STRIPE_*` ключи в env)** и Android WebView Shell (`K-18`).
- 🔵 **`LOCAL_ONLY` (Продуктовые функции):** **6 функций** (+ локальный FIDO2 fallback без сервера).
- 🔴 **`SIMULATED`:** **7 модулей** (+ `[SIM] Демо Passkey` и `[SIM] MockPaymentProvider` без env-ключей Stripe).
- ⚪ **`PLANNED`:** Multi-User Network (Этап 5), 3D AR MediaPipe (Этап 6).
- 🧪 **Область V8-покрытия (`vitest.config.ts`):** Строго по слоям **`src/domain/**/*.ts` + `src/infrastructure/**/*.ts` + `src/server/**/*.ts` + `src/utils/**/*.ts`**.

---

*«Честность в коде — честность перед миром.»*  
*Версия 3.7 (Этап 4 · Спринт 4.5 «Деплой, возврат Stripe и атомарность без сюрпризов»): закрыты `V-01…V-08` — `TRUST_PROXY` по хопам и громкое предупреждение про пустые origin, строгая привязка `matchIntentToAppointment` без `booking_ref` из URL, хранение `appointmentDate`/`appointmentTimeSlot`, минимальный `GET /intents/:id`, `partially_refunded` / `disputed` / `payment_intent` fallback / `unmatched`, долговечные атомарные SHA-256 инвайты (`>= 16` символов), `GET /api/payments/quote`, `credentialId === rawIdBase64Url`, составной `Idempotency-Key` и разделённые строки Passkey в карте.*

