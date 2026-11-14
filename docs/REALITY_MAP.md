# ✦ NAILIX / ONYX-AURA — КАРТА РЕАЛЬНОСТИ (REALITY MAP) ✦

> **Статус**: Канонический документ честности (актуализирован в Этапе 2 «Данные и Local-First»)  
> **Версия**: 2.0  
> **Дата обновления**: 14 ноября 2026 г.  
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
| **Local-First IndexedDB Repository & Offline Outbox** | `src/domain/storage.ts`, `src/infrastructure/storage/indexedDbAdapter.ts`, `src/infrastructure/storage/salonRepository.ts`, `src/hooks/useLocalFirstHydration.ts` | 🟢 **`REAL`** | Чистая абстракция `StorageAdapter` поверх нативного IndexedDB (`nailix_local_first_v1`), идемпотентный seed начальных фикстур, автоматический fallback в `MemoryStorageAdapter` при недоступности IDB и персистентная очередь `OutboxMutation` (готова к будущему синку с сервером). |
| **Haute Manicure Portfolio + Likes/Saves** | `src/components/PortfolioGallery.tsx`, `src/hooks/usePortfolioGallery.ts` | 🟢 **`REAL`** | Каталог с локальными ассетами, фильтрацией, Lightbox и **персистентными** лайками/избранным, сохраняемыми атомарно в IndexedDB без гонок. |
| **Бронирование и мои записи** | `src/components/BookingModal.tsx`, `src/components/ClientAppointmentsModal.tsx`, `src/hooks/useBookingFlow.ts` | 🟢 **`REAL`** | Реальный поток выбора мастера и будущих дат с **сохранением записей в IndexedDB между перезагрузками**, экспортом `.ics` и кнопкой сброса демо-БД (`resetToSeed`). (Сам этап оплаты/эскроу остаётся `[SIM]`). |
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
| **WebAuthn / Passkeys & Encryption** | — | ⚪ **`PLANNED`** | Запланировано на Этапе 3 Плана Эволюции (заменит открытое локальное хранение без авторизации). |

---

## 📊 Итоговая сводка честности (Summary)

- 🟢 **`REAL`**: **9 модулей** — IndexedDB Repository + Offline Outbox, Портфолио с персистентными лайками/сохранениями, Бронирование и Записи в IndexedDB, Карта локаций + сохранение пинов/адресов, Рекламные кампании, RFC 5545 календарный экспорт, Haptics Web API, PWA/Workbox и скрипт локальной сборки APK.
- 🔵 **`LOCAL_ONLY`**: **1 модуль** — Панель аналитики студий (считает реальные агрегаты по данным IndexedDB без облачного сервера).
- 🔴 **`SIMULATED`**: **8 модулей** — CryptoCloud, Checkout Preview, Friend Jury, Reputation Ledger (`[SIM]` хэши/баллы при персистентных отзывах), Studio Chat (`[SIM]` автоответчик при персистентной переписке), `reminderService`, AR 2D Overlay и Instagram Demo Sync.
- ⚪ **`PLANNED`**: **1 ближайшее направление** — WebAuthn / Passkeys и клиентская защита секретов (Этап 3).

---

*«Честность в коде — честность перед миром.»*  
*Актуализировано в Этапе 2 («Данные и Local-First»): локальные данные переживают перезагрузку, оффлайн-мутации пишутся в Outbox.*
