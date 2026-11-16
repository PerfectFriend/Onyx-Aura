# ✦ NAILIX / ONYX-AURA — КАРТА РЕАЛЬНОСТИ (REALITY MAP) ✦

> **Статус**: Канонический документ честности (актуализирован в Спринте 2.2 и Этапе 3.1 «Идентичность и безопасность»)  
> **Версия**: 3.0  
> **Дата обновления**: 15 ноября 2026 г.  
> **Исполнитель**: Женя (Сеньор-разработчик)  
> **Аудиторы**: Гриша (Архитектор эволюции) & Колян (Cross-Model Auditor)  
> **Основание**: Закон 1, 7, 8 и 10 Канонического Манифеста AI-разработчика (`MANIFEST_CANONICAL_AI_DEVELOPER.md`)

---

## 📌 Классификация статусов

- 🟢 **`REAL`** — Полностью работающий клиентский функционал (включая локальную персистентность IndexedDB между перезагрузками страницы и оффлайн-очередь мутаций без скрытой имитации).
- 🔵 **`LOCAL_ONLY`** — Реальная клиентская бизнес-логика без серверного бэкенда (в браузере пользователя данные живут локально, но пока без кросс-устройственной облачной синхронизации).
- 🔴 **`SIMULATED`** — Инженерная симуляция / математический макет (локальный SHA-256, `BroadcastChannel`, `setTimeout`, Canvas 2D overlay вместо реального Web3/E2E/Carrier SMS/MediaPipe AR). **Обязательно маркируется бейджем `[SIM]` в коде и UI**.
- 🟡 **`UI_ONLY`** — Презентационный или локально-управляемый UI без подключения внешнего OAuth / API провайдера.
- ⚪ **`PLANNED`** — Архитектурно запланировано в `EVOLUTION_PLAN.md`, но пока не реализовано.

---

## 🗺️ Матрица компонентов и фичей

| Фича / Модуль | Файлы реализации | Статус | Доказательство и технический комментарий |
| :--- | :--- | :---: | :--- |
| **Local-First IndexedDB Repository & Offline Outbox** | `src/domain/storage.ts`, `src/infrastructure/storage/indexedDbAdapter.ts`, `src/infrastructure/storage/salonRepository.ts`, `src/hooks/useLocalFirstHydration.ts` | 🟢 **`REAL`** | Чистая абстракция `StorageAdapter` поверх нативного IndexedDB (`nailix_local_first_v1`, схема v2 с неразрушающей миграцией v1→v2), спокойный loading-экран до завершения гидрации, видимый статус движка (`indexeddb` / `memory`) и локальной очереди `OutboxMutation` в UI. |
| **WebAuthn / Passkeys & Secret Hygiene + CSP** | `src/domain/identity.ts`, `src/infrastructure/identity/webAuthnService.ts`, `src/infrastructure/identity/secretHygiene.ts`, `src/hooks/useIdentitySession.ts`, `src/components/PasskeyAuthModal.tsx`, `index.html` | 🟢 **`REAL`** / 🔴 **`[SIM]` Fallback** | Реальная регистрация и вход через FIDO2 WebAuthn (`navigator.credentials.create`/`.get`, ES256/RS256), хранение только публичного ID и SPKI в IndexedDB, проверка `assertNoPlaintextSecrets` на запись и JSON-экспорты, `Content-Security-Policy` `<meta>`. Верификация пока клиентская (`client_local_only`; серверная проверка challenge — Этап 4). Для сред без FIDO2 предусмотрена явная кнопка `[SIM] Демо Passkey`. |
| **Haute Manicure Portfolio + Likes/Saves** | `src/components/PortfolioGallery.tsx`, `src/hooks/usePortfolioGallery.ts` | 🟢 **`REAL`** | Каталог с локальными ассетами, фильтрацией, Lightbox и **персистентными** лайками/избранным, сохраняемыми атомарно в IndexedDB без гонок. |
| **Бронирование и мои записи** | `src/components/BookingModal.tsx`, `src/components/ClientAppointmentsModal.tsx`, `src/hooks/useBookingFlow.ts` | 🟢 **`REAL`** | Реальный поток выбора мастера и будущих дат с **сохранением записей в IndexedDB между перезагрузками**, экспортом `.ics`, индикатором локального движка/outbox и кнопкой «Сбросить локальную демо-базу» (`resetToSeed`). (Сам этап оплаты/эскроу остаётся `[SIM]`). |
| **Радар студий & Карта локаций (Persistence)** | `src/services/geoDistance.ts`, `src/components/ClientLocationMap.tsx` | 🟢 **`REAL`** | Формула гаверсинусов, нативный `navigator.geolocation` и **сохранение** точек клиента (`anchorPoints`) и адресов мастеров в IndexedDB. |
| **Рекламная платформа & Кампании** | `src/components/SponsoredAdsBanner.tsx`, `src/components/AdCampaignManagerModal.tsx`, `src/hooks/useSponsoredAds.ts` | 🟢 **`REAL`** | Создание и отображение промо-карточек с сохранением в локальной базе IndexedDB (внешний рекламный биллинг отсутствует — локальное управление кампанией). |
| **Universal Calendar Sync** | `src/utils/calendarSync.ts`, `src/components/CalendarSyncButtons.tsx` | 🟢 **`REAL`** | Генерация RFC 5545 `.ics` файлов и URL-диплинков в Google Calendar / Outlook без обещаний «on-chain» внутри событий. |
| **Тактильный виброотклик (Haptics)** | `src/utils/haptics.ts` | 🟢 **`REAL`** | Прямой вызов нативного Web API `navigator.vibrate`. |
| **PWA & Offline Engine** | `vite.config.ts`, `public/manifest.webmanifest`, `src/main.tsx` | 🟢 **`REAL`** | Production Workbox Service Worker (`devOptions.enabled: false`), защита от устаревшего `/dev-sw.js` в dev, кэширование локальных ассетов и шрифтов; установка PWA через `beforeinstallprompt`. |
| **Сборка Android APK** | `scripts/build-apk.sh`, `android-build/`, `docs/KEY_ROTATION_RUNBOOK.md` | 🟢 **`REAL`** | Локальная сборка APK в `dist-apk/nailix.apk` (вне Git/`public/`), env-переменные для keystore. |
| **Панель аналитики студий** | `src/components/AdminAnalyticsDashboard.tsx` | 🔵 **`LOCAL_ONLY`** | Живой расчёт метрик по персистентным локальным записям из IndexedDB (без серверного бэкенда; сравнительные метрики помечены `[SIM]`). |
| **CryptoCloud & Peer Sync** | `src/simulation/cryptocloud.ts`, `src/hooks/useCryptoSwarm.ts`, `src/components/CryptoCloudPanel.tsx` | 🔴 **`SIMULATED`** | **[SIM]** Локальное SHA-256 хеширование с флагом fallback (`isRealSha256`), `BroadcastChannel` между вкладками и экспорт открытого `.sim.json` снапшота без шифрования. |
| **Checkout Deposit Preview** | `src/simulation/cryptocloud.ts`, `src/components/CheckoutModal.tsx` | 🔴 **`SIMULATED`** | **[SIM]** Демо-превью удержания депозита (фиат/токен) через локальный SHA-256 и `setTimeout`. Настоящих платёжных шлюзов нет (Этап 4). |
| **Жюри круга друзей (Friend Jury)** | `src/components/FriendModerationSection.tsx` | 🔴 **`SIMULATED`** | **[SIM]** Демонстрационное голосование по кворуму в `useState` без мультипользовательской сети (Этап 5). |
| **Репутационный реестр мастеров** | `src/simulation/cryptoLedger.ts`, `src/components/ReputationLedger.tsx` | 🔴 **`SIMULATED`** | **[SIM]** Демо-отзывы и пересчёт рейтинга теперь сохраняются в IndexedDB, однако хэши и $NAIL-баллы остаются локальной математической симуляцией без серверной верификации (`verifiedInPerson: false`). |
| **Чат с ателье (Concierge Chat)** | `src/hooks/useChatConcierge.ts`, `src/components/ChatDrawer.tsx` | 🔴 **`SIMULATED`** | **[SIM]** Сообщения теперь сохраняются в IndexedDB, но автоответчик — скриптовый локальный бот по `setTimeout` без E2E-шифрования и WebSocket-сервера. |
| **Reminder Dispatch (Push & SMS)** | `src/services/reminderService.ts` | 🔴 **`SIMULATED`** | **[SIM]** Мгновенный in-app toast + опциональный `new Notification(...)` браузера. Реальный SMS-шлюз и отложенный backend-планировщик не подключены. |
| **Виртуальная AR-примерка ногтей** | `src/components/AndroidExperienceView.tsx` | 🔴 **`SIMULATED`** | **[SIM]** Видеопоток WebRTC с 2D Canvas сеткой поверх видео без 3D-трекинга пальцев (Этап 6). |
| **Instagram Social Sync** | `src/components/InstagramSyncSection.tsx` | 🔴 **`SIMULATED`** | **[SIM]** Импортируемые пресеты теперь сохраняются в локальной галерее IndexedDB, но источник — демо-каталог без Meta OAuth API. |
| **Server Challenge Verification & Honest Payment** | — | ⚪ **`PLANNED`** | Запланировано на Этап 4 (`EVOLUTION_PLAN.md`: backend WebAuthn challenge verification, честная интеграция оплаты/условий). |

---

## 📊 Итоговая сводка честности (Summary)

- 🟢 **`REAL`**: **10 модулей** — IndexedDB Repository v2 + Offline Outbox + Hydration UX, WebAuthn/Passkeys + Secret Hygiene + CSP, Портфолио с персистентными лайками/сохранениями, Бронирование и Записи в IndexedDB, Карта локаций + сохранение пинов/адресов, Рекламные кампании, RFC 5545 календарный экспорт, Haptics Web API, PWA/Workbox и скрипт локальной сборки APK.
- 🔵 **`LOCAL_ONLY`**: **1 модуль** — Панель аналитики студий (считает реальные агрегаты по данным IndexedDB без облачного сервера).
- 🔴 **`SIMULATED`**: **8 модулей** (+ `[SIM] Демо Passkey` fallback в песочницах без FIDO2) — CryptoCloud, Checkout Preview, Friend Jury, Reputation Ledger (`[SIM]` хэши/баллы при персистентных отзывах), Studio Chat (`[SIM]` автоответчик при персистентной переписке), `reminderService`, AR 2D Overlay и Instagram Demo Sync.
- ⚪ **`PLANNED`**: Server WebAuthn verification & Real Payment Integration (Этап 4), Real Multi-User Network (Этап 5).

---

*«Честность в коде — честность перед миром.»*  
*Актуализировано в Спринте 2.2 и Этапе 3.1: Passkeys не хранят приватных ключей в JS, CSP активен, честная загрузка до гидрации.*
