# ✦ NAILIX / ONYX-AURA — КАРТА РЕАЛЬНОСТИ (REALITY MAP) ✦

> **Статус**: Канонический документ честности (актуализирован в Спринте 1.5 «Честный ремонт»)  
> **Версия**: 1.1  
> **Дата обновления**: 14 ноября 2026 г.  
> **Исполнитель**: Женя (Сеньор-разработчик)  
> **Аудиторы**: Гриша (Архитектор эволюции) & Колян (Cross-Model Auditor)  
> **Основание**: Закон 1, 7, 8 и 10 Канонического Манифеста AI-разработчика (`MANIFEST_CANONICAL_AI_DEVELOPER.md`)

---

## 📌 Классификация статусов

- 🟢 **`REAL`** — Полностью работающий клиентский функционал (end-to-end без скрытой имитации; для вычислений/экспорта/APIs браузера не требующий фальшивых обещаний).
- 🔵 **`LOCAL_ONLY`** — Реальная бизнес-логика в памяти текущей браузерной сессии (`useState`), **без сохранения между перезагрузками страницы** до подключения IndexedDB/сервера на Этапе 2. Пользователь честно предупреждается об этом в интерфейсе и Root ErrorBoundary.
- 🔴 **`SIMULATED`** — Инженерная симуляция / математический макет (локальный SHA-256, `BroadcastChannel`, `setTimeout`, Canvas 2D overlay вместо реального Web3/E2E/Carrier SMS/MediaPipe AR). **Обязательно маркируется бейджем `[SIM]` в коде и UI**.
- 🟡 **`UI_ONLY`** — Презентационный или локально-управляемый UI без подключения внешнего OAuth / API провайдера.
- ⚪ **`PLANNED`** — Архитектурно запланировано в `EVOLUTION_PLAN.md`, но пока не реализовано.

---

## 🗺️ Матрица компонентов и фичей

| Фича / Модуль | Файлы реализации | Статус | Доказательство и технический комментарий |
| :--- | :--- | :---: | :--- |
| **Haute Manicure Portfolio** | `src/components/PortfolioGallery.tsx`, `src/hooks/usePortfolioGallery.ts`, `src/data/initialData.ts` | 🟢 **`REAL`** | Реальный каталог с локальными изображениями в `public/assets/images/`, фильтрация по категориям и Lightbox-просмотр (пользовательские лайки/сохранения живут в сессии до Этапа 2). |
| **Universal Calendar Sync** | `src/utils/calendarSync.ts`, `src/components/CalendarSyncButtons.tsx` | 🟢 **`REAL`** | Генерация RFC 5545 `.ics` файлов и URL-диплинков в Google Calendar / Outlook без обещаний «on-chain» внутри событий. |
| **Радар студий & Геолокация** | `src/services/geoDistance.ts`, `src/components/ClientLocationMap.tsx` | 🟢 **`REAL`** | Формула гаверсинусов (Haversine formula) и нативный `navigator.geolocation`. (Редактирование адресов в сессии не переживает F5 до Этапа 2). |
| **Тактильный виброотклик (Haptics)** | `src/utils/haptics.ts` | 🟢 **`REAL`** | Прямой вызов нативного Web API `navigator.vibrate` (работает в поддерживаемых мобильных браузерах). |
| **PWA & Offline Engine** | `vite.config.ts`, `public/manifest.webmanifest`, `src/main.tsx` | 🟢 **`REAL`** | Production Workbox Service Worker (`devOptions.enabled: false`), кэширование локальных ассетов и шрифтов; установка PWA через `beforeinstallprompt`. |
| **Сборка Android APK** | `scripts/build-apk.sh`, `android-build/`, `docs/KEY_ROTATION_RUNBOOK.md` | 🟢 **`REAL`** | Скрипт сборки локального APK с выводом в `dist-apk/nailix.apk` (вне `public/` и `.gitignore`). Keystore и пароли переведены на env-переменные; `assetlinks.json` ожидает ротации ключа (K-01). |
| **Бронирование и мои записи** | `src/components/BookingModal.tsx`, `src/components/ClientAppointmentsModal.tsx`, `src/hooks/useBookingFlow.ts` | 🔵 **`LOCAL_ONLY`** | Рабочий flow выбора мастера, динамических будущих дат и расчёта суммы; хранится **только в памяти текущей сессии** (сбросится при перезагрузке до Этапа 2 Local-First). |
| **Рекламная платформа & Кампании** | `src/components/SponsoredAdsBanner.tsx`, `src/components/AdCampaignManagerModal.tsx`, `src/hooks/useSponsoredAds.ts` | 🔵 **`LOCAL_ONLY`** | Создание и отображение промо-карточек внутри текущей сессии браузера без внешнего рекламного биллинга и серверной персистентности. |
| **Панель аналитики студий** | `src/components/AdminAnalyticsDashboard.tsx` | 🔵 **`LOCAL_ONLY`** | Живой расчёт метрик по массиву сессионных записей и генерация печатного отчёта; часть сравнительных показателей явно помечена как `[SIM]`. |
| **CryptoCloud & Peer Sync** | `src/simulation/cryptocloud.ts`, `src/hooks/useCryptoSwarm.ts`, `src/components/CryptoCloudPanel.tsx` | 🔴 **`SIMULATED`** | **[SIM]** Локальное SHA-256 хеширование с явным флагом fallback (`isRealSha256`), `BroadcastChannel` между вкладками и экспорт открытого `.sim.json` снапшота без шифрования. |
| **Checkout Deposit Preview** | `src/simulation/cryptocloud.ts`, `src/components/CheckoutModal.tsx` | 🔴 **`SIMULATED`** | **[SIM]** Демо-превью удержания депозита (фиат/токен) через локальный SHA-256 и `setTimeout`. Настоящих платёжных шлюзов и смарт-контрактов нет. |
| **Жюри круга друзей (Friend Jury)** | `src/components/FriendModerationSection.tsx` | 🔴 **`SIMULATED`** | **[SIM]** Демонстрационное голосование по кворуму в `useState` без мультипользовательской сети. |
| **Репутационный реестр мастеров** | `src/simulation/cryptoLedger.ts`, `src/components/ReputationLedger.tsx` | 🔴 **`SIMULATED`** | **[SIM]** Таблица демо-отзывов и хэшей в памяти браузера; пользовательские отправки честно помечаются `verifiedInPerson: false` (`[SIM] Unverified Demo`). |
| **Чат с ателье (Concierge Chat)** | `src/hooks/useChatConcierge.ts`, `src/components/ChatDrawer.tsx` | 🔴 **`SIMULATED`** | **[SIM]** Скриптовый консьерж-автоответчик по `setTimeout` с выбором треда мастера; без E2E-шифрования и WebSocket-сервера. |
| **Reminder Dispatch (Push & SMS)** | `src/services/reminderService.ts` | 🔴 **`SIMULATED`** | **[SIM]** Мгновенный in-app toast + опциональный `new Notification(...)` браузера (при наличии разрешения). Реальный SMS-шлюз и отложенный backend-планировщик не подключены (K-05). |
| **Виртуальная AR-примерка ногтей** | `src/components/AndroidExperienceView.tsx` | 🔴 **`SIMULATED`** | **[SIM]** Видеопоток WebRTC с 2D Canvas сеткой/фигурами поверх видео без нейросетевого 3D-трекинга пальцев (MediaPipe/TFLite запланирован на Этап 6). |
| **Instagram Social Sync** | `src/components/InstagramSyncSection.tsx` | 🔴 **`SIMULATED`** | **[SIM]** Демонстрационный пресет импорта постов с нулевыми синтетическими метриками и явным уведомлением об отсутствии Meta OAuth API (K-03, K-05). |
| **IndexedDB Persistence Layer** | — | ⚪ **`PLANNED`** | Запланировано в `EVOLUTION_PLAN.md` на Этап 2 (Local-First) — заменит статус `LOCAL_ONLY`. |
| **WebAuthn / Passkeys вход** | — | ⚪ **`PLANNED`** | Запланировано на Этапе 3 Плана Эволюции. |

---

## 📊 Итоговая сводка честности (Summary)

- 🟢 **`REAL`**: **6 модулей** — Галерея портфолио с локальными ассетами, RFC 5545 календарный экспорт, Haversine гео-радар, Haptics Web API, PWA/Workbox и скрипт локальной сборки APK (вне Git/public).
- 🔵 **`LOCAL_ONLY`**: **3 модуля** — Бронирование/Записи, Рекламный менеджер и Панель аналитики работают на реальном UI/состоянии в памяти сессии (до Этапа 2 IndexedDB).
- 🔴 **`SIMULATED`**: **8 модулей** — CryptoCloud, Checkout Preview, Friend Jury, Reputation Ledger, Studio Chat, `reminderService`, AR 2D Overlay и Instagram Demo Sync. Все честно маркированы `[SIM]`.
- ⚪ **`PLANNED`**: **2 направления** — Local-First Persistence (Этап 2) и WebAuthn/Passkeys (Этап 3).

---

*«Честность в коде — честность перед миром.»*  
*Актуализировано в Спринте 1.5 согласно замечаниям K-01, K-05 и K-19.*
