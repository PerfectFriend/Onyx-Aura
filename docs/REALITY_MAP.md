# ✦ NAILIX / ONYX-AURA — КАРТА РЕАЛЬНОСТИ (REALITY MAP) ✦

> **Статус**: Канонический документ честности (Этап 0.1)  
> **Версия**: 1.0  
> **Дата утверждения**: 11 ноября 2026 г.  
> **Исполнитель**: Женя (Сеньор-разработчик)  
> **Аудитор**: Гриша (Аудитор & Архитектор эволюции)  
> **Основание**: Закон 1, 7, 8 и 10 Канонического Манифеста AI-разработчика (`MANIFEST_CANONICAL_AI_DEVELOPER.md`)

---

## 📌 Классификация статусов

- 🟢 **`REAL`** — Полностью работающий функционал (end-to-end), не использующий фальшивые заглушки или скрытую имитацию.
- 🔴 **`SIMULATED`** — Инженерная симуляция / математический макет (локальный SHA-256, `BroadcastChannel`, `useState` вместо P2P/блокчейна). **Обязательно маркируется бейджем `[SIM]` и красной палитрой**.
- 🟡 **`UI_ONLY`** — Чистый пользовательский интерфейс без активного бекенда или внешней интеграции.
- ⚪ **`PLANNED`** — Архитектурно запланировано в `EVOLUTION_PLAN.md`, но пока не реализовано.

---

## 🗺️ Матрица компонентов и фичей

| Фича / Модуль | Файлы реализации | Статус | Доказательство и технический комментарий |
| :--- | :--- | :---: | :--- |
| **Haute Manicure Portfolio** | `src/components/PortfolioGallery.tsx`, `src/data/initialData.ts` | 🟢 **`REAL`** | Реальный интерактивный каталог, фильтрация по стилям, модальный Lightbox, 100% локальные HD-ассеты в `public/assets/images/`. |
| **Интеллектуальная запись (Booking)** | `src/components/BookingModal.tsx`, `src/components/ClientAppointmentsModal.tsx` | 🟢 **`REAL`** | Полный клиентский flow выбора мастера, даты, слота и услуги, динамический пересчет депозита и сохранение записи в сессионный стейт. |
| **Universal Calendar Sync** | `src/utils/calendarSync.ts`, `src/components/CalendarSyncButtons.tsx` | 🟢 **`REAL`** | Генерация валидного RFC 5545 `.ics` файла (Apple Calendar, Outlook) с таймзонами и напоминаниями, а также прямой URL-энкодинг в Google Calendar. |
| **Радар студий & Геолокация** | `src/services/geoDistance.ts`, `src/components/ClientLocationMap.tsx` | 🟢 **`REAL`** | Точный математический расчет по формуле гаверсинусов (Haversine formula), получение реальных координат пользователя через `navigator.geolocation`. |
| **Тактильный виброотклик (Haptics)** | `src/utils/haptics.ts` | 🟢 **`REAL`** | Прямой вызов нативного Web API `navigator.vibrate` с паттернами легкого, среднего и подтверждающего отклика. |
| **PWA & Offline Engine** | `vite.config.ts`, `public/manifest.webmanifest`, `src/main.tsx` | 🟢 **`REAL`** | Полноценный Service Worker (Workbox), 176 локальных ресурсов в предзагрузке (~38 МБ), правила `cleanupOutdatedCaches`, `skipWaiting`, `clientsClaim`. |
| **Сборка Android APK** | `scripts/build-apk.sh`, `android-build/` | 🟢 **`REAL`** | Скрипт сборки автономного APK-пакета с манифестом Android, ключами подписи и веб-ассетами. |
| **Рекламная платформа & Кампании** | `src/components/SponsoredAdsBanner.tsx`, `src/components/AdCampaignManagerModal.tsx`, `src/data/advertisements.ts` | 🟢 **`REAL`** | Рендеринг баннеров, трекинг показов/кликов в сессии, создание новых рекламных кампаний мастерами. |
| **Панель аналитики студий** | `src/components/AdminAnalyticsDashboard.tsx` | 🟢 **`REAL`** | Расчет выручки, среднего чека, загрузки мастеров и конверсии на основе актуального массива записей. |
| **CryptoCloud & Web3 Ledger** | `src/simulation/cryptocloud.ts`, `src/simulation/cryptoLedger.ts`, `src/components/CryptoCloudPanel.tsx` | 🔴 **`SIMULATED`** | **[SIM]** Локальное хеширование через Web Crypto `crypto.subtle.digest('SHA-256')` и эмуляция сетевых пиров через `BroadcastChannel`. Настоящего блокчейна, газа и RPC-узлов нет. |
| **On-Chain Escrow & Смарт-контракты** | `src/simulation/cryptocloud.ts`, `src/components/CheckoutModal.tsx` | 🔴 **`SIMULATED`** | **[SIM]** Защищенный депозит имитируется через генерацию локального хеша и таймер переключения статусов. |
| **Децентрализованное жюри (DAO)** | `src/components/FriendModerationSection.tsx` | 🔴 **`SIMULATED`** | **[SIM]** Голосование арбитров круга друзей реализовано через локальный `useState`. Отсутствует P2P-синхронизация голосов между реальными устройствами. |
| **Репутационный реестр мастеров** | `src/components/ReputationLedger.tsx` | 🔴 **`SIMULATED`** | **[SIM]** Таблица скоринга пересчитывается в памяти браузера, а не из распределенного смарт-контракта. |
| **Чат с ателье (Live Concierge)** | `src/components/ChatDrawer.tsx` | 🔴 **`SIMULATED`** | **[SIM]** Диалог с мастером эмулируется скриптовыми автоответами по таймеру; WebSockets / SSE бэкенд отсутствует. |
| **Виртуальная AR-примерка ногтей** | `src/components/AndroidExperienceView.tsx` | 🔴 **`SIMULATED`** | **[SIM]** Отображение видеопотока камеры с наложением статического слоя дизайна (canvas 2D overlay), без нейросетевого 3D-трекинга фаланг пальцев (MediaPipe/TFLite запланирован на Этапе 6). |
| **Instagram Social Sync** | `src/components/InstagramSyncSection.tsx` | 🟡 **`UI_ONLY`** | Статический презентационный блок с переключателями; авторизация Instagram Basic Display API не подключена. |
| **Децентрализованное хранилище (IPFS/Arweave)** | — | ⚪ **`PLANNED`** | Запланировано в `EVOLUTION_PLAN.md` на этапе децентрализации медиа. |
| **WebAuthn / Passkeys вход** | — | ⚪ **`PLANNED`** | Запланировано на Этапе 3 Плана Эволюции. |

---

## 📊 Итоговая сводка честности (Summary)

- 🟢 **REAL**: **9 фичей** (~53%) — Высококачественный production-grade интерфейс, галерея, бронирование, календарный RFC 5545 экспорт, геолокация, PWA/Service Worker, локальные медиа-ассеты.
- 🔴 **SIMULATED**: **6 фичей** (~35%) — CryptoCloud, Escrow, DAO-модерация, Репутация, Чат, AR-примерка. Вынесены в `src/simulation/` и маркированы бейджами `[SIM]`.
- 🟡 **UI_ONLY**: **1 фича** (~6%) — Instagram Showcase.
- ⚪ **PLANNED**: **2 фичи** (~6%) — WebAuthn, децентрализованный сторидж.

---

*«Честность в коде — честность перед миром.»*  
*Документ проверен и зафиксирован в репозитории NailiX.*
