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

### 1. 📅 Бронирование, Offline-First База и Календарный сервис · 🟢 `REAL`
- **Local-First IndexedDB**: Записи к мастерам, лайки/избранное, отзывы, чат и пины карты сохраняются локально в браузере через чистый `SalonRepository` с идемпотентным сидом и оффлайн-очередью мутаций (`OutboxMutation`).
- **Мгновенная синхронизация в Google Calendar / Microsoft Outlook** через веб-ссылки с предзаполненными параметрами.
- **Экспорт в Apple Calendar / Outlook** через генерацию файла `.ics` (iCalendar RFC 5545) с напоминаниями `VALARM`.
- Просмотр записей и сброс демо-БД в модальном окне «Мои записи».

### 2. 💅 Галерея Высокого Нейл-Арта (Haute Couture Gallery) · 🟢 `REAL`
- Интерактивный каталог эксклюзивных дизайнов с фильтрами по категориям и Lightbox-просмотром.
- Локальное хранение ассетов в `public/assets/images/` без привязки к внешним CDN.

| Gaudí Trencadís Mosaic | Cyberpunk 3D Chrome | Aurora Glass Prisms | Velvet Noir Cat-Eye |
|:---:|:---:|:---:|:---:|
| <img src="./public/assets/images/portfolio_gaudi_mosaic_nails_1790126128212.jpg" width="220" /> | <img src="./public/assets/images/portfolio_cyber_chrome_1790123880263.jpg" width="220" /> | <img src="./public/assets/images/portfolio_aurora_glass_1790123870720.jpg" width="220" /> | <img src="./public/assets/images/portfolio_velvet_cateye.jpg" width="220" /> |

### 3. 🤝 Жюри и Круг доверия (Friend Jury) · 🔴 `[SIM]`
- Прототип голосования по спорным кейсам в памяти браузера (`useState`); многопользовательская сеть запланирована на Этап 5.

### 4. 💎 Мультивалютный демо-чекаут & CryptoCloud · 🔴 `[SIM]`
- Превью удержания депозита в фиатных и токен-валютах.
- Локальная симуляция `BroadcastChannel` + Web Crypto `SHA-256` (`src/simulation/cryptocloud.ts`) без настоящих блокчейн-транзакций или шифрования снапшотов.

### 5. 📱 PWA & Сборка Android APK · 🟢 `REAL` / 📷 AR 2D Overlay · 🔴 `[SIM]`
- Offline-кэширование через Workbox (`vite-plugin-pwa`) и нативный виброотклик (`navigator.vibrate`).
- **Виртуальная AR-примерка** в `AndroidExperienceView` работает в режиме 🔴 **`[SIM]`** (WebRTC видеопоток + 2D Canvas сетка; MediaPipe 3D-трекинг запланирован на Этап 6).
- **Android APK** собирается локально скриптом `scripts/build-apk.sh` в директорию `dist-apk/` (вне `public/` и `.gitignore`) с ключами подписи из переменных окружения — см. [`docs/KEY_ROTATION_RUNBOOK.md`](./docs/KEY_ROTATION_RUNBOOK.md).

### 6. 🗺️ Радар мастеров & Интерактивная карта студий · 🟢 `REAL`
- Поиск студий и расчёт дистанции по формуле гаверсинусов (`src/services/geoDistance.ts`) и `navigator.geolocation`.

---

## 🛠️ Стек технологий / Tech Stack

- **Frontend Core**: [React 19](https://react.dev/), [TypeScript 6.0](https://www.typescriptlang.org/)
- **Bundler & Tooling**: [Vite 6](https://vitejs.dev/), [Vitest](https://vitest.dev/), [ESLint 9](https://eslint.org/) (`typescript-eslint`, `react-hooks`, `jsx-a11y`)
- **Styling & Design System**: [Tailwind CSS v4](https://tailwindcss.com/), Custom Cyber-Gaudí Ornament Engine
- **Motion & Icons**: [Motion](https://motion.dev/), [Lucide React](https://lucide.dev/)
- **Local-First Storage**: Native `IndexedDB` via `StorageAdapter` + `SalonRepository` + Offline `OutboxMutation` Queue (with `MemoryStorageAdapter` fallback)
- **PWA & Offline Engine**: [Vite Plugin PWA](https://vite-pwa-org.netlify.app/), Workbox
- **Calendar Engine**: RFC 5545 iCalendar generator + Google/Outlook Calendar URL builder

---

## 📂 Структура проекта / Project Structure

```bash
├── docs/                   # Аудит-журнал, Карта Реальности, Архитектура, Runbook ротации ключа
├── scripts/
│   └── build-apk.sh        # Локальная сборка APK в dist-apk/ (через env NAILIX_KEYSTORE_*)
├── public/                 # Статические ассеты, PWA-иконки, assetlinks.json
│   └── assets/images/      # Локальные изображения (портфолио, баннеры, аватары)
├── src/
│   ├── __tests__/          # Unit-тесты (Vitest): honestyWatchdog, localFirstRepository, calendarSync, geoDistance, haptics, ErrorBoundary
│   ├── components/         # UI-компоненты, модалки, ErrorBoundary
│   ├── data/               # Начальные seed-фикстуры для SalonRepository
│   ├── domain/             # Чистые интерфейсы StorageAdapter, OutboxMutation, HydratedSalonData
│   ├── hooks/              # Доменные хуки + useLocalFirstHydration
│   ├── i18n/               # Словарь переводов на 10 языков (LTR + RTL)
│   ├── infrastructure/     # IndexedDBAdapter, MemoryStorageAdapter, SalonRepository + Outbox
│   ├── services/           # geoDistance (REAL) и reminderService ([SIM])
│   ├── simulation/         # Явно изолированные [SIM] модули (cryptocloud, cryptoLedger)
│   ├── utils/              # calendarSync.ts (RFC 5545), haptics.ts
│   ├── App.tsx             # Чистый оркестратор хуков и ErrorBoundary-секций (0 useState, 0 useEffect)
│   └── main.tsx            # Точка входа React + Root ErrorBoundary
├── eslint.config.js        # Strict TS/React/A11y ESLint конфиг
├── vite.config.ts          # Конфигурация Vite и PWA Workbox
└── package.json
```

---

## 🚀 Быстрый старт / Getting Started

```bash
git clone https://github.com/PerfectFriend/Onyx-Aura.git
cd Onyx-Aura
npm install
npm run dev
```

Проверка качества кода:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Локальная сборка APK выполняется по инструкции в [`docs/KEY_ROTATION_RUNBOOK.md`](./docs/KEY_ROTATION_RUNBOOK.md).

---

<p align="center">
  <sub>Разработано для платформы <b>Nailix Haute Manicure Art Network</b>.</sub>
</p>
