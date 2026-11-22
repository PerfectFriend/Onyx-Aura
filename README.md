# ✦ NAILIX — Haute Manicure Art Network ✦
### *Cyberpunk × Antoni Gaudí × Van Gogh Aesthetic Social Ecosystem*

<p align="center">
  <img src="./public/assets/images/hero_nailix_cyber_gaudi_1790126105708.jpg" alt="Nailix Cyber-Gaudí Hero Banner" width="100%" style="border-radius: 14px; box-shadow: 0 20px 50px rgba(0,0,0,0.6);" />
</p>

<p align="center">
  <a href="https://onyx-aura.ai.studio/"><img src="https://img.shields.io/badge/Live_Demo-onyx--aura.ai.studio-d4af37?style=for-the-badge&logo=google&logoColor=white" alt="Live Demo" /></a>
  <img src="https://img.shields.io/badge/React-19-61dafb?style=for-the-badge&logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-6.0-3178c6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript 6.0" />
  <img src="https://img.shields.io/badge/Vite-6-646cff?style=for-the-badge&logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/Tailwind-CSS_v4-38bdf8?style=for-the-badge&logo=tailwindcss&logoColor=white" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/PWA-Ready-10b981?style=for-the-badge&logo=pwa&logoColor=white" alt="PWA Ready" />
</p>

---

## 🏛️ О проекте / About Nailix

**Nailix (Onyx Aura)** — это веб-платформа и PWA-витрина авторского маникюрного искусства в эстетике Cyberpunk, Antoni Gaudí и Vincent van Gogh.

Приложение объединяет реальные клиентские инструменты (галерея, карта студий с формулой гаверсинусов, экспорт встреч в календари Google / Apple / Outlook, PWA) с явно помеченными интерактивными симуляциями **`[SIM]`** (демо-чекaут, жюри друзей, чат-консьерж, AR-сетка поверх камеры).

> ⚖️ **Архитектурная честность**: В соответствии с [Каноническим Манифестом AI-разработчика](./MANIFEST_CANONICAL_AI_DEVELOPER.md) статус каждого модуля зафиксирован в [Карте Реальности](./docs/REALITY_MAP.md) (`REAL`, `LOCAL_ONLY`, `SIMULATED [SIM]`, `PLANNED`).

---

## ✨ Ключевые возможности / Core Highlights

### 1. 📅 Бронирование, Offline-First База, Passkeys и Календарный сервис · 🟢 `REAL` (Storage) / 🔵 `LOCAL_ONLY` (App Flows)
- **Local-First IndexedDB v3**: Записи к мастерам, лайки/избранное, отзывы, чат и пины карты сохраняются локально в браузере через `SalonRepository` + `ResilientStorageAdapter` (`getDetailed`: `ok | missing | unreadable`, изоляция сбоев чтения, поэлементный карантин `quarantine:` с экспортом `.json`, non-secret passthrough), миграции `v1 → v2 → v3`, защита от более новой схемы (`read-only`), единотранзакционная очередь `OutboxMutation` (`*WithOutbox` + strict allowlist без вытеснения `pending_sync`) и debounced кросс-вкладочный sync без remount открытых модалок.
- **WebAuthn / Passkeys & Secret Hygiene (Этап 3.1 → 3.3)**: Церемония FIDO2 (`navigator.credentials.create`/`.get`) с честным разделением `signature_verified` vs `presence_only`, извлечением SPKI из CBOR/COSE `attestationObject`, локальной проверкой подписи (`crypto.subtle.verify` ES256/RS256), `rpIdHash`, обязательным `UV` для роли мастера, поддержкой флага `BE` (0x08) синхронизируемых ключей, TTL сессии 8 часов, discoverable fallback, узкой проверкой секретов `assertNoSecretLikeFields` (JWT / `Authorization: Bearer`) и build-time `Content-Security-Policy` без `script-src 'unsafe-inline'` (самохостинг `@fontsource/*`). Авторизация локальная (`LOCAL_ONLY`); серверная верификация — Этап 4. В песочницах доступен `[SIM] Демо Passkey`.
- **Мгновенная синхронизация в Google Calendar / Microsoft Outlook** через веб-ссылки с предзаполненными параметрами.
- **Экспорт в Apple Calendar / Outlook** через генерацию файла `.ics` (iCalendar RFC 5545) с напоминаниями `VALARM`.
- Просмотр записей и безопасный диалог **«Сбросить локальную демо-базу»** (с раздельным сбросом данных салона и ключей Passkey) в модальном окне «Мои записи».

### 2. 💅 Галерея Высокого Нейл-Арта (Haute Couture Gallery) · 🔵 `LOCAL_ONLY`
- Интерактивный каталог эксклюзивных дизайнов с фильтрами по категориям и Lightbox-просмотром.
- Локальное хранение ассетов в `public/assets/images/` и самохостинг шрифтов `@fontsource/*` без привязки к внешним CDN.

| Gaudí Trencadís Mosaic | Cyberpunk 3D Chrome | Aurora Glass Prisms | Velvet Noir Cat-Eye |
|:---:|:---:|:---:|:---:|
| <img src="./public/assets/images/portfolio_gaudi_mosaic_nails_1790126128212.jpg" width="220" /> | <img src="./public/assets/images/portfolio_cyber_chrome_1790123880263.jpg" width="220" /> | <img src="./public/assets/images/portfolio_aurora_glass_1790123870720.jpg" width="220" /> | <img src="./public/assets/images/portfolio_velvet_cateye.jpg" width="220" /> |

### 3. 🤝 Жюри и Круг доверия (Friend Jury) · 🔴 `[SIM]`
- Прототип голосования по спорным кейсам в памяти браузера (`useState`); многопользовательская сеть запланирована на Этап 5.

### 4. 💎 Stripe Hosted Checkout (SAQ-A Ready) & CryptoCloud · 🟢 `REAL` (Port/HTTP Boundary) / 🟡 `PROTOTYPE` (Env Keys) / 🔴 `[SIM]` (Demo)
- В `CheckoutModal` полностью удалены поля ввода карт (`PAN / MM/YY / CVC`, см. [`docs/PAYMENTS_ADR.md`](./docs/PAYMENTS_ADR.md)); превью депозита работает через доменный порт `PaymentProvider`. При заданном `STRIPE_SECRET_KEY` в окружении активируется редирект на Stripe Hosted Checkout SAQ-A с проверкой HMAC-SHA256 вебхуков (`/api/payments/webhooks/stripe`), а без ключа честно действует `[SIM] MockPaymentProvider`.
- [SIM] Локальная имитация межвкладочного обмена (`BroadcastChannel`) + Web Crypto `SHA-256` (`src/simulation/cryptocloud.ts`) — открытый `.sim.json`-снимок пользовательских записей (`origin: 'user'`).

### 5. 📱 PWA & Сборка Android APK · 🟢 `REAL` (PWA & Script) / 🟡 `PROTOTYPE` (WebView Shell) / 🔴 `[SIM]` (AR)
- Offline-кэширование через Workbox (`vite-plugin-pwa`, включая `.woff2` и локальные изображения) и нативный виброотклик (`navigator.vibrate`).
- **Виртуальная AR-примерка** в `AndroidExperienceView` работает в режиме 🔴 **`[SIM]`** (WebRTC видеопоток + 2D Canvas сетка; MediaPipe 3D-трекинг запланирован на Этап 6).
- **Android APK** собирается локально скриптом `scripts/build-apk.sh` в директорию `dist-apk/` (вне `public/` и `.gitignore`) с ключами подписи строго через `env:NAILIX_KEYSTORE_PASS` — см. [`docs/KEY_ROTATION_RUNBOOK.md`](./docs/KEY_ROTATION_RUNBOOK.md).

### 6. 🗺️ Радар мастеров & Интерактивная карта студий · 🔵 `LOCAL_ONLY`
- Поиск студий и расчёт дистанции по формуле гаверсинусов (`src/services/geoDistance.ts`) и `navigator.geolocation`.

---

## 🛠️ Стек технологий / Tech Stack

- **Frontend Core**: [React 19](https://react.dev/), [TypeScript 6.0.3](https://www.typescriptlang.org/) (pinned)
- **Server & Security (Этап 4.1 → 4.5)**: [Express 5](https://expressjs.com/) (`server.ts`, `src/server/*`) — серверная крипто-проверка WebAuthn SPKI (`P-256`/`rsa`, обязательный COSE/AT, `credentialId === rawIdBase64Url`, `409` анти-сквоттинг, долговечные хэшированные одноразовые инвайты `>= 16` символов `NAILIX_MASTER_INVITE_CODES`, `HttpOnly` HMAC-сессии `nailix_sid`), политика `origin`/`rpId` для production, `TRUST_PROXY` с числом хопов, скользящий rate-limit + изоляция квот challenge, эндпоинт котировок `/api/payments/quote` + Stripe Hosted Checkout SAQ-A и `Stripe-Signature` вебхуки (включая частичные возвраты, споры, корреляцию по `payment_intent`), хранение в `.data/nailix-server.json`, HTTP HSTS + CSP (`frame-ancestors 'self'`, `img-src 'self' data: blob:`) и раздача Vite/static на порту `3000`
- **Bundler & Tooling**: [Vite 8](https://vitejs.dev/), [Vitest](https://vitest.dev/) (+ `@vitest/coverage-v8`), [ESLint 9](https://eslint.org/) (`recommendedTypeChecked`, `no-floating-promises`, `react-hooks`, `jsx-a11y/recommended`)
- **Styling & Typography**: [Tailwind CSS v4](https://tailwindcss.com/), Self-hosted `@fontsource/*` (Plus Jakarta Sans, Syne, JetBrains Mono)
- **Motion & Icons**: [Motion](https://motion.dev/), [Lucide React](https://lucide.dev/)
- **Identity & Security**: FIDO2 `WebAuthn / Passkeys` (`navigator.credentials` + общий CBOR/COSE парсер `webauthnCbor.ts` + серверная и локальная SPKI-проверка + `HttpOnly` cookie), одноразовые server challenges по IP-квотам, 100% локальный QR (`qrcode`, `N-10`), Schema Allowlists + `assertNoSecretLikeFields`, build-time + HTTP CSP без `script-src 'unsafe-inline'` и внешних доменов изображений
- **Local-First Storage**: Native `IndexedDB` (schema v3 + `v1 → v2 → v3` migration registry + quarantine export) via `ResilientStorageAdapter` + `SalonRepository` + Transactional Offline `OutboxMutation` Queue
- **PWA & Offline Engine**: [Vite Plugin PWA](https://vite-pwa-org.netlify.app/), Workbox
- **Calendar Engine**: RFC 5545 iCalendar generator + Google/Outlook Calendar URL builder

---

## 📂 Структура проекта / Project Structure

```bash
├── docs/                    # Аудит-журнал, Карта Реальности v3.7, PAYMENTS_ADR, Архитектура, Runbook ротации ключа
├── scripts/
│   ├── build-apk.sh         # Локальная сборка APK в dist-apk/ (строго через env:NAILIX_KEYSTORE_PASS)
│   └── ci.workflow.yml      # Шаблон GitHub Actions CI (копировать в .github/workflows/ci.yml под PAT со scope workflow)
├── public/                  # Статические ассеты, PWA-иконки, assetlinks.json
│   └── assets/images/       # Локальные изображения (портфолио, баннеры, аватары)
├── server.ts                # Точка входа Express 5 (Security Headers + /api + Vite dev / dist prod, порт 3000)
├── src/
│   ├── __tests__/           # Vitest (honestyWatchdog, paymentFoundation, serverIdentityAndStripe, serverHardening, stage45, ...)
│   ├── components/          # UI-компоненты, модалки (вкл. PasskeyAuthModal, Zero-PCI CheckoutModal), ErrorBoundary
│   ├── data/                # Начальные seed-фикстуры (origin: 'seed') для SalonRepository
│   ├── domain/              # Чистые контракты Payments, ServiceCatalog, WebAuthnCbor, IDs (createId/createShortId), Storage, Schema Validators, IdentitySession
│   ├── hooks/               # Доменные хуки + useSalonBootstrap + useIdentitySession + useAppShell
│   ├── i18n/                # Словарь переводов UI на 10 языков (LTR + RTL) + словарь тостов/серверных кодов (messages.ts)
│   ├── infrastructure/      # HostedCheckoutProvider & MockPaymentProvider [SIM], IndexedDBAdapter, модульный SalonRepository v3 (Seed/Migrations/Outbox/Collections), WebAuthnService, SecretHygiene, CSP
│   ├── server/              # ServerStateStore, ServerSessionService, WebAuthnServerVerifier, OriginPolicy, RateLimiter, AuditLog, StripeHostedCheckoutService, SecurityHeaders, API Router
│   ├── services/            # geoDistance (REAL) и reminderService ([SIM])
│   ├── simulation/          # Явно изолированные [SIM] модули (cryptocloud, cryptoLedger)
│   ├── test-utils/          # Экспортируемый сканер честности (honesty.ts) для мета-тестов
│   ├── utils/               # qrGenerator.ts (локальный offline QR), calendarSync.ts (RFC 5545), haptics.ts
│   ├── App.tsx              # Load-then-Mount (<App /> → useSalonBootstrap → <SalonApp key={resetEpoch} />)
│   └── main.tsx             # Точка входа React + самохостинговые шрифты + Root ErrorBoundary
├── eslint.config.js         # Type-checked TS/React/A11y ESLint конфиг
├── vite.config.ts           # Конфигурация Vite, CSP-плагин и PWA Workbox
├── vitest.config.ts         # Настройки Vitest + пороги V8-покрытия
└── package.json & package-lock.json
```

---

## 🚀 Быстрый старт / Getting Started

```bash
git clone https://github.com/PerfectFriend/Onyx-Aura.git
cd Onyx-Aura
npm ci
npm run dev
```

Проверка качества кода:

```bash
npm run lint
npm run typecheck
npm run test:coverage
npm run build
```

> **Примечание по покрытию (`vitest.config.ts`)**: `npm run test:coverage` рассчитывает V8-метрики строго по доменному, инфраструктурному, серверному слоям и утилитам (`src/domain/**/*.ts`, `src/infrastructure/**/*.ts`, `src/server/**/*.ts`, `src/utils/**/*.ts`), не включая UI-компоненты, React-хуки и `[SIM]`-модули.

Локальная сборка APK выполняется по инструкции в [`docs/KEY_ROTATION_RUNBOOK.md`](./docs/KEY_ROTATION_RUNBOOK.md).

### ☁️ Чек-лист деплоя в Cloud Run (`V-01`)
- **`APP_URL` / `NAILIX_ALLOWED_ORIGINS`:** задать реальный `https://...` адрес сервиса — иначе в `production` браузерные `POST` (`/api/auth/webauthn/*`, `/api/payments/checkout-session`) получат `HTTP 403` (сервер выведет громкое предупреждение при старте).
- **`TRUST_PROXY=1`:** включить (или указать точное число прокси-хопов), чтобы за балансировщиком Cloud Run лимитер частоты и квоты challenge разделялись по реальному IP клиента из `X-Forwarded-For`.
- **Один экземпляр (`min=1, max=1`) и эфемерное состояние:** файл `.data/nailix-server.json` живёт в контейнере и теряется при редеплое/рестарте; в showcase-режиме без `NAILIX_SESSION_SECRET` ключ HMAC cookie создаётся заново при старте процесса. Для боевого запуска со Stripe и инвайт-кодами (`>= 16` символов) `NAILIX_SESSION_SECRET` строго обязателен.
- **Production entrypoint (`tsx` vs compiled JS):** сейчас скрипт `"start"` запускает `NODE_ENV=production tsx server.ts` напрямую ради совместимости с текущим Cloud Run рантаймом и минимальных cold-start изменений. Плановый переход для выделенного Node-контейнера: предкомпиляция `server.ts` в `dist-server/server.js` на этапе `npm run build` и запуск через `node dist-server/server.js` без runtime-зависимости от `tsx`.

---

<p align="center">
  <sub>Разработано для платформы <b>Nailix Haute Manicure Art Network</b>.</sub>
</p>
