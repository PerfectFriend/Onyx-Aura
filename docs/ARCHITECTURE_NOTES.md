# ✦ NAILIX / ONYX-AURA — АРХИТЕКТУРНЫЕ ЗАМЕТКИ (ARCHITECTURE NOTES) ✦

> **Этап:** 1. Архитектурная гигиена (Завершён)  
> **Спринт:** 1.4 — Error Boundaries + финальная гигиена App  
> **Автор:** Женя (Сеньор-разработчик)  
> **Ревьюер:** Гриша (Аудитор & Архитектор эволюции)  
> **Дата:** 14 ноября 2026 г.

---

## 🏛️ 1. Обоснование выбора State-подхода (Hooks vs Zustand vs Context)

В рамках Спринта 1.1 мы рассматривали три архитектурных паттерна управления состоянием:

### Вариант A: React Context + useReducer
- *Плюсы:* Встроен в React, избавляет от prop drilling.
- *Минусы:* Провоцирует избыточные ререндеры дочерних компонентов при изменении любого поля в едином объекте контекста без тяжелой мемоизации (`useMemo` / селекторы), увеличивает шаблонный код (ActionTypes, reducers, dispatch).

### Вариант B: Внешний store (Zustand)
- *Плюсы:* Отличные гранулярные селекторы, работа вне React-дерева.
- *Минусы:* Требует установки внешней зависимости, вводит глобальный синглтон-стейт, который сложнее изолировать в SSR/тестовых окружениях до этапа Local-First (Этап 2).

### Вариант C: Композиционные доменные хуки (Domain Composition Hooks) — ВЫБРАННЫЙ ПАТТЕРН 🏆
- **Почему выбран для Спринта 1.1 и 1.2:**
  1. **Zero Bundle Overhead**: 0 дополнительных килобайт в продакшен-бандле.
  2. **React 19 Native**: 100% совместимость с новым компилятором React 19 без конфликтов версий.
  3. **Плавная и безопасная миграция**: Позволяет последовательно выселять стейт-квартиры из `App.tsx` с шагом в один спринт без риска регрессий.
  4. **Изоляция и читаемость**: Логика UI-хрома (`useAppChrome`), бизнес-флоу бронирования (`useBookingFlow`), чата (`useChatConcierge`) и роя (`useCryptoSwarm`) стали чистыми, типизированными модулями с четким публичным контрактом.
  5. **Готовность к следующему шагу**: Любой из этих хуков на Этапе 2 (Local-First / IndexedDB) может быть прозрачно обернут в Zustand-стор или Context без изменения интерфейса модальных окон и страниц.

---

## ✂️ 2. Что вынесено в Спринте 1.1

### Модуль 1: `src/hooks/useAppChrome.ts`
- **Зона ответственности:** Системный UI-хром и локализация.
- **Инкапсулированные задачи:**
  - Тема оформления (`theme`: `'dark' | 'light'`) с автоопределением `prefers-color-scheme`.
  - Синхронизация классов на `document.body` и `document.documentElement` (`theme-dark`, `dark`, `theme-light`, `light`) и сохранение в `localStorage`.
  - Мультиязычность: автоопределение языка пользователя (`detectUserLanguage()`), активный словарь переводов `t`, переключение `document.documentElement.lang` и `dir` (поддержка RTL).
  - Управление обоями Cyber-Gaudí (`wallpaper`, модалка выбора, сохранение пресета).

### Модуль 2: `src/hooks/useBookingFlow.ts`
- **Зона ответственности:** Жизненный цикл клиентской записи к мастеру.
- **Инкапсулированные задачи:**
  - Коллекция подтвержденных записей `appointments`.
  - Стейт шага 1: `isBookingModalOpen`, целевой мастер `bookingArtistTarget`, выбранный арт-образ `bookingLookTarget`.
  - Стейт шага 2: `isCheckoutOpen`, данные бронирования `pendingBookingDetails`.
  - Стейт модалки «Мои записи»: `isAppointmentsModalOpen`.
  - Хендлеры: `handleStartBookingWithLook`, `handleStartBookingWithArtist`, `handleProceedToCheckout`, `handlePaymentSuccess`, `handleReleaseEscrow`, `handleTriggerAppointmentReminder`.
  - Оркестрация отправки 24ч и 2ч напоминаний (`reminderService`), бродкаста события в пир-сеть (`cryptoCloudSwarm`), генерации тоста.

---

## ✂️ 3. Что вынесено в Спринте 1.2

### Архитектурное решение: Разделение Chat и Swarm на два независимых хука
Хотя чат отправляет сообщения через `cryptoCloudSwarm.broadcastBlock('CHAT_MESSAGE_BUFFERED')`, мы разделили их на два независимых домена:
1. `useChatConcierge` — пользовательский UI-срез (шторка чата, непрочитанные, треды, авторы);
2. `useCryptoSwarm` — инфраструктурный слой симуляции P2P (пиры, пинги, бекапы, бродкаст).
**Обоснование:** Это соответствует принципу единственной ответственности (SRP). Чат может рендериться на мобильном экране отдельно от панели управления симуляцией узлов, а при переходе к реальному WebRTC/WebSocket на Этапе 4 чат не потянет за собой эмулятор пиров.

### Модуль 3: `src/hooks/useChatConcierge.ts`
- **Зона ответственности:** E2E-криптографический чат и консьерж-сервис мастеров.
- **Инкапсулированные задачи:**
  - Список сообщений `chatMessages` (инициализация `INITIAL_CHATS`).
  - Состояние открытия шторки `isChatOpen`, `openChat(artistOrId?)`, `closeChat()`.
  - Счётчик непрочитанных `unreadChatCount`, сброс при открытии диалога.
  - Хендлер `handleSendMessage` с формированием структуры `ChatMessage` (включая цитирование арт-образов) и отправкой зашифрованного чанка в пир-буфер.

### Модуль 4: `src/hooks/useCryptoSwarm.ts`
- **Зона ответственности:** Управление локальным симулированным узлом CryptoCloud и роем пиров `[SIM]`.
- **Инкапсулированные задачи:**
  - Состояние узла `swarmState` и список подключенных пиров `peers`.
  - Автоматическая подписка на события шины `cryptoCloudSwarm.subscribe` на маунте с авто-очисткой.
  - Мемоизированный подсчёт узлов онлайн `swarmOnlineCount`.
  - Экспорт криптографического снапшота базы (`handleExportCryptoCloudBackup`) с генерацией Blob и проверкой SHA-256.
  - Симуляция пинга сети (`handleSimulatePeerPulse`).
  - Фасадный хелпер `broadcastBlock` для безопасной отправки событий другими модулями (отзывы, инстаграм-синхронизация, рекламные кампании).

---

## ✂️ 4. Что вынесено в Спринте 1.3

### Архитектурное решение: Два раздельных доменных хука через коллбеки к Swarm
Вместо того чтобы импортировать `cryptoCloudSwarm` напрямую внутрь галереи или рекламы, оба хука принимают опциональные коллбеки (`onSyncPostToSwarm`, `onNotify`, `onBroadcastToSwarm`). `App.tsx` как дирижёр связывает их с `swarm.broadcastBlock` и toast-очередью.
**Обоснование:** Полная инверсия зависимостей (DIP): `usePortfolioGallery` и `useSponsoredAds` ничего не знают о реализации `[SIM]`-роя или системе уведомлений и легко тестируются в отрыве от инфраструктуры.

### Модуль 5: `src/hooks/usePortfolioGallery.ts`
- **Зона ответственности:** Поток арт-образов портфолио, пользовательские реакции, просмотр в лайтбоксе и импорт из Instagram.
- **Инкапсулированные задачи:**
  - Коллекция работ `items` (инициализация `INITIAL_PORTFOLIO`).
  - Коллекции лайков `likedIds` и сохранений `savedIds` (`Set<string>`), чистые иммутабельные апдейты в `handleToggleLike` и `handleToggleSave`.
  - Модалка просмотра `selectedLightboxItem`, фасады `openLightbox`, `closeLightbox` и бесшовный переход в бронирование `handleStartBookingWithLookFromLightbox`.
  - Импорт постов из Instagram (`handleImportInstagramPost`) с делегированием синка в рой и нотификации через инъектированные коллбеки.

### Модуль 6: `src/hooks/useSponsoredAds.ts`
- **Зона ответственности:** Встроенные спонсорские кампании и модалка менеджера рекламы.
- **Инкапсулированные задачи:**
  - Список кампаний `ads` (`INITIAL_SPONSORED_ADS`).
  - Состояние модалки `isAdManagerOpen`, фасады `openAdManager` / `closeAdManager`.
  - Создание новой кампании `handleCreateAdCampaign` с опциональным бродкастом события `NEW_SPONSORED_CAMPAIGN` через переданный фасад `onBroadcastToSwarm`.

---

## 🛡️ 5. Что вынесено и усилено в Спринте 1.4

### Двухуровневый React Error Boundary (`src/components/ErrorBoundary.tsx`)
Чтобы падение одного интерактивного виджета, карты или `[SIM]`-панели никогда не приводило к «белому экрану» всего приложения:
- **Уровень 1 (`level="root"` в `src/main.tsx`):** Оборачивает корневой `<App />`. При фатальной ошибке рендера отображает спокойный экран восстановления в стиле Onyx-Aura («Салон временно на паузе») с кнопками попытки восстановления и перезагрузки страницы — без сырого stack trace для клиента.
- **Уровень 2 (`level="section"` в `src/App.tsx`):** Изолирует тяжёлые, картографические, мобильные и `[SIM]`-секции:
  - `PortfolioGallery` («Галерея портфолио»)
  - `ClientLocationMap` («Карта локаций»)
  - `FriendModerationSection` («Круг доверия DAO [SIM]»)
  - `ArtistsView` («Каталог мастеров»)
  - `ReputationLedger` («Реестр отзывов [SIM]»)
  - `InstagramSyncSection` («Синхронизация Instagram»)
  - `CryptoCloudPanel` («CryptoCloud Swarm [SIM]»)
  - `AdminAnalyticsDashboard` («Аналитика студии»)
  - `AndroidExperienceView` («AR-примерка и Android Suite»)
  - `ChatDrawer` («Чат-консьерж»)
  При сбое секция мягко уходит на паузу с кнопкой «Перезагрузить секцию», а остальной салон продолжает штатно работать.

### Модуль 7: `src/hooks/useAppShell.ts` + доочистка `useAppChrome.ts`
- **`useAppShell.ts`:** Инкапсулировал оболочку навигации (`activeTab`, `userRole`), ленивый разбор PWA deep links (`?tab=...`, `?action=book|ar`), модалку разрешений `isPermissionsModalOpen`, очередь toast-уведомлений и жизненный цикл подписки на `reminderService` + запрос push-разрешений.
- **`useAppChrome.ts`:** Взял на себя вычисление `wallpaperClass`, полностью убрав стилевой маппинг обоев из `App.tsx`.

### Осознанное решение: Что оставлено в `App.tsx` как оркестраторный стейт
В `src/App.tsx` намеренно оставлены только **3 `useState`** (и **0 `useEffect`**):
- `artists` (`INITIAL_ARTISTS`)
- `reviews` (`INITIAL_REVIEWS`)
- `anchorPoints` (`INITIAL_ANCHOR_POINTS`)
**Почему:** Эти три коллекции связывают сразу несколько доменов (мастера читаются в бронировании, чате, отзывах и карте; при добавлении отзыва пересчитывается рейтинг мастера и уходит блок в `[SIM]`-рой). Выносить их в синтетические обёртки ради красивой цифры было бы преждевременно — именно они станут первым источником истины при переходе на **Этап 2 (Local-First / IndexedDB + Repository layer)**.

---

## 📦 6. Полный реестр хуков Этапа 1 (`src/hooks/`)

| Хук | Спринт | Ответственность |
|---|---|---|
| `useAppChrome.ts` | 1.1 / 1.4 | Тема (`dark`/`light`), i18n (10 языков + RTL), обои + `wallpaperClass` |
| `useBookingFlow.ts` | 1.1 / 1.4 | Бронирование → Escrow Checkout `[SIM]` → Appointments → Напоминания |
| `useChatConcierge.ts` | 1.2 | Шторка чата, сообщения, непрочитанные, буферизация в рой |
| `useCryptoSwarm.ts` | 1.2 | Подписка на `cryptoCloudSwarm`, пиры, бэкапы, `broadcastBlock` `[SIM]` |
| `usePortfolioGallery.ts` | 1.3 | Галерея портфолио, лайки/сохранения, лайтбокс, импорт Instagram |
| `useSponsoredAds.ts` | 1.3 | Промо-кампании, модалка менеджера рекламы, бродкаст в рой |
| `useAppShell.ts` | 1.4 | Вкладки, роли, PWA deep links, `reminderService` + toast-очередь |

---

## 📉 7. Итоговые метрики Этапа 1 (Архитектурная гигиена)

- **Исходный размер `src/App.tsx` (до Этапа 1):** **899 строк**, **21 `useState`**, системные DOM/storage/subscription `useEffect`.
- **После Спринта 1.1:** **755 строк** (−144)
- **После Спринта 1.2:** **685 строк** (−70)
- **После Спринта 1.3:** **603 строки** (−82)
- **После Спринта 1.4:** **564 строки** (−39 строк, несмотря на добавление 10 декларативных `<ErrorBoundary>` обёрток в JSX!)
- **Общее сокращение кода `App.tsx`:** **−335 строк (−37.3%)**
- **Сокращение `useState` в `App.tsx`:** **21 → 3 (−85.7%)**
- **Количество `useEffect` в `App.tsx`:** **0** (100% side-effects изолированы в хуках!)

### Критерии закрытия Этапа 1 — выполнены (с доработкой в Спринте 1.5):
- ✅ `App.tsx` читается как чистый оркестратор-дирижёр: подключает 7 доменных хуков и рендерит секции/модалки.
- ✅ Работает двухуровневая защита `ErrorBoundary` (root + per-section).
- ✅ Все `[SIM]`-модули остаются честно изолированными в `src/simulation/` и `src/services/reminderService.ts` и промаркированы.
- ✅ Сформирован честный отчёт по Спринту 1.5 и тест-сторож честности (`honestyWatchdog.test.ts`).

---

## 🔍 8. Честные архитектурные заметки после аудита Спринта 1.5 (`K-15`)

По итогам перекрёстного ревью Коляна (`docs/KOLYAN_REVIEW_STAGE1.md`) и решения Гриши `[DECISION]` от `2026-11-14 14:00 CET` в `docs/DEVELOPMENT_JOURNAL.md`:

1. **Официальный пересмотр целевых метрик `App.tsx` и слоёв:**
   - Исходный ориентир `App.tsx < 150–200 строк` признан смягчённым: текущие ~560 строк + 7 доменных хуков + 2-уровневый `ErrorBoundary` — достаточная база Stage 1 без искусственного переусложнения.
   - Разделение на `domain / application / infrastructure / presentation` официально перенесено на стык Этапа 1 → Этапа 2 при внедрении IndexedDB Repository.
2. **Честная фиксация прямого связывания (DIP gap):**
   - В отличие от `usePortfolioGallery` и `useSponsoredAds` (которые получают `onBroadcastToSwarm` через коллбеки), хуки `useBookingFlow` и `useChatConcierge` **напрямую импортируют `cryptoCloudSwarm`** (`src/simulation/cryptocloud.ts`).
   - Это осознанный временный компромисс Этапа 1; на Этапе 2 вызовы симуляции будут переведены за абстракцию `SyncTransport` / инъекцию зависимостей аналогично Спринту 1.3.
3. **Lifecycle-очистка `CryptoCloudEngine`:**
   - В `src/simulation/cryptocloud.ts` добавлен метод `destroy()` для явного закрытия `BroadcastChannel` и очистки слушателей в тестах и при размонтировании провайдера.
4. **Границы чистоты слоёв (UI ↔ `simulation/`):**
   - На Этапе 1 `ReputationLedger`, `CheckoutModal` и `FriendModerationSection` всё ещё обращаются к `src/simulation/` напрямую. В Спринте 1.5 сломаны дублирующие шимы `src/services/cryptoLedger.ts` и `src/services/cryptocloud.ts` — импорты приведены к единому источнику правды `src/simulation/*`. На Этапе 2 фасады переедут в сервисный слой хранилища.

---

## 💾 9. Этап 2 — Данные и Local-First Architecture (`src/domain/` + `src/infrastructure/storage/`)

### Архитектурный слоёный срез Этапа 2:
1. **Доменные контракты (`src/domain/storage.ts`):**
   - Чистые интерфейсы `StorageAdapter`, `StorageKey`, `OutboxMutation`, `DataLayerMeta`, `HydratedSalonData` без зависимостей от DOM, React или `simulation/`.
2. **Инфраструктурный драйвер IndexedDB + Fallback (`src/infrastructure/storage/indexedDbAdapter.ts`):**
   - `IndexedDBAdapter` (`nailix_local_first_v1`, store `salon_kv`): ленивое переиспользуемое подключение (`dbPromise`), обработка `onversionchange`, безопасные readonly/readwrite транзакции.
   - `MemoryStorageAdapter`: детерминированный fallback поверх `Map` (позволяет тестам проверять эмуляцию перезагрузки страницы через общую `Map`) + автоматический откат при отсутствии `indexedDB` или блокировке приватным режимом браузера.
3. **Репозиторий + Идемпотентный Seed + Offline Outbox (`src/infrastructure/storage/salonRepository.ts`):**
   - Внутри `SalonRepository` сериализована очередь записи `enqueueWrite()` (исключает гонки чтение→изменение→запись в `outbox` и `schemaMeta`).
   - `ensureSeededAndLoad()` подгружает все сохранённые коллекции и точечно засевает только недостающие ключи из `createSeedSnapshot()`, **никогда не перезаписывая** уже сохранённые записи и лайки пользователя.
   - При ошибках чтения/записи (например, `QuotaExceededError` / `SecurityError`) репозиторий деградирует на `MemoryStorageAdapter` без падения UI.
   - Все мутации фиксируются в оффлайн-очередь `OutboxMutation` (`status: 'pending_sync'`), готовую к последовательной отправке при подключении сервера на Этапе 4–5 (а также поддержан ручной/демо сброс `resetToSeed()` и `flushOutboxLocalDemo()`).
4. **Оркестрация и защита от ранних гонок (`src/hooks/useLocalFirstHydration.ts`):**
   - Вынесены оставшиеся 3 кросс-доменных `useState` из `App.tsx` (`artists`, `reviews`, `anchorPoints`) → в `App.tsx` стало **0 `useState` и 0 `useEffect`**.
   - Механизм `dirtyEntitiesRef` гарантирует, что если пользователь успел кликнуть в первые ~2мс до окончания асинхронного открытия IndexedDB, запоздавшая гидратация не затрёт свежие действия клиента.
5. **Закрытие долгов `K-14` и `K-15` из Спринта 1.5:**
   - **DIP завершён (`K-15`):** из `useBookingFlow.ts` и `useChatConcierge.ts` полностью удалены прямые импорты `cryptoCloudSwarm` — передаётся чистый коллбек `onBroadcastToSwarm` из `App.tsx`.
   - **Атомарный лайк (`K-14`):** в `usePortfolioGallery.ts` `handleToggleLike` и `handleToggleSave` используют актуальные refs + атомарное обновление `likedIds` и `items.likes` с записью обоих в IndexedDB и `outbox`.
6. **Почему Native IndexedDB (vs `idb` vs `localStorage`) и что осознанно НЕ персистим (Спринт 2.1):**
   - *vs `localStorage`:* `localStorage` синхронен (блокирует UI-поток на крупных массивах портфолио/истории), ограничен ~5 МБ и требует ручного сериализованного `JSON.stringify`/`parse` при каждом чихе. IndexedDB работает асинхронно, нативно хранит structured objects и подходит для дальнейшего роста медиа-кэша и `OutboxMutation`.
   - *vs `idb`:* Нативный `IndexedDBAdapter` (172 строки) позволил обойтись **без новой npm-зависимости**, дал прямой контроль над пулингом `dbPromise`, обработкой `onversionchange` и мгновенным переключением на `MemoryStorageAdapter` при ошибках приватного режима.
   - *Осознанно остаётся эфемерным (`[SIM]` / UI):* не отправленный черновик в текстовом инпуте `ChatDrawer`, `[SIM]`-голосование жюри (`FriendModerationSection`), временные счётчики пиров (`useCryptoSwarm`) и UI-тосты — симулированный сетевой консенсус и эфемерные черновики не должны засорять локальную БД до появления настоящего сетевого слоя (Этап 4–5).

---

## 🔐 10. Спринт 2.2 (Local-First UX) и Этап 3 · Спринт 3.1 (WebAuthn Passkeys, Secret Hygiene & CSP)

### 10.1. Полировка Local-First UX (Спринт 2.2)
1. **Спокойное состояние загрузки до гидрации (`App.tsx`):**
   - Пока `!localFirst.isHydrated`, приложение не рендерит интерактивный дашборд поверх seed-заглушек, а показывает нейтральный тематический экран *«Загружаем локальные данные салона…»*, исключая визуальный скачок `seed → IndexedDB`.
2. **Честная индикация движка и локального Outbox (`ClientAppointmentsModal`, `CryptoCloudPanel`):**
   - Пользователь явно видит активный адаптер (`IndexedDB (локально в браузере)` или `Memory Fallback`) и число мутаций со статусом `pending_sync` с прямой пометкой, что это локальная оффлайн-очередь без облачной синхронизации.
   - Кнопка сброса в `ClientAppointmentsModal` переименована строго в **«Сбросить локальную демо-базу»**.

### 10.2. Идентичность и безопасность (Этап 3 · Спринт 3.1)
1. **Чистый домен идентичности (`src/domain/identity.ts`):**
   - Введены типы `PasskeyCredentialRecord`, `IdentitySession`, `WebAuthnCapabilityReport`, `AuthMethod`. В структуре данных **физически отсутствуют** поля для паролей, сид-фраз или приватных ключей.
2. **Реальный WebAuthn API + честный `[SIM]` Fallback (`src/infrastructure/identity/webAuthnService.ts`):**
   - `registerWebAuthnPasskey` и `authenticateWebAuthnPasskey` используют `navigator.credentials.create` / `.get` с алгоритмами `ES256 (-7)` и `RS256 (-257)` и криптографически случайным challenge (`crypto.getRandomValues` на 32 байта). Приватные ключи не покидают TPM / Secure Enclave устройства.
   - Поле `verificationScope: 'client_local_only'` в `IdentitySession` честно фиксирует, что серверная проверка подписи challenge перенесена на Этап 4.
   - Для окружений без доступа к WebAuthn (например, изолированный iframe-превью или Node SSR) предусмотрен явный opt-in сценарий `createSimulatedDemoPasskey`, маркированный `[SIM]` в реестре, Navbar и модалке.
3. **Защита от утечек секретов в открытом виде (`src/infrastructure/identity/secretHygiene.ts`):**
   - `assertNoPlaintextSecrets` проверяет каждую запись `savePasskeys` / `saveIdentitySession` в `SalonRepository` (теперь `async`, чтобы отклонять промисом) и каждый JSON-экспорт в `CryptoCloudEngine.exportSessionSnapshot()` на наличие PEM-заголовков, полей `privateKey` / `secretKey` / `seedPhrase` / `mnemonic` / `password` и PAT-токенов.
4. **Неразрушающая миграция схемы IndexedDB `v1 → v2` (`src/infrastructure/storage/salonRepository.ts`):**
   - Версия `SALON_SCHEMA_VERSION` поднята до `2`; существующие ключи Этапа 2 (`appointments`, `artists`, `reviews`, `portfolio`, `likes`, `saves`, `ads`, `anchorPoints`, `chats`) остаются нетронутыми, а новые ключи (`passkeys`, `identitySession`) аккуратно дозасеваются и хранятся отдельно.
5. **Content Security Policy (`index.html` + заметка на Этап 4):**
   - В `index.html` добавлен тег `<meta http-equiv="Content-Security-Policy">` (`default-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `script-src 'self' 'unsafe-inline'`, шрифты/стили Google Fonts).
   - Директива `frame-ancestors` сознательно **не включена** в `<meta>`-тег (по спецификации W3C `<meta>` CSP её игнорирует и вызывает предупреждение в консоли), а `'unsafe-inline'` на `script-src` оставлен для совместимости бандла Vite SPA до подключения HTTP-заголовков с per-request nonce на сервере Этапа 4.

---

## 🛡️ 11. Спринт 3.2 «Закалка перед Этапом 4» (По итогам кросс-аудита `L-01 … L-19`)

После перекрёстного ревью Коляна (`Claude Sonnet 5.5`) архитектура усилена без добавления новых продуктовых фич:

1. **Устойчивый адаптер хранилища (`src/infrastructure/storage/indexedDbAdapter.ts` · `L-01`):**
   - Введён `ResilientStorageAdapter`: различает временные сбои ввода/вывода (короткий retry + удержание отложенных ключей в `pendingRetryKeys` без переключения движка и потери IndexedDB) и фатальные блокировки движка (`SecurityError` / `IndexedDB unavailable` → переход в `memory_only`).
   - Выведен публичный метод `retryPendingWrites()` и отчёт `StorageHealthReport` (`health: 'ok' | 'degraded' | 'memory_only'`).
   - В UI (`App.tsx`) отображается тихий предупреждающий баннер при статусах `degraded` / `memory_only` и в режиме `readOnlyFutureSchema`, а корневой `ErrorBoundary` честно показывает активный движок (`indexeddb` / `memory`) и предоставляет третью кнопку **«Сбросить локальные данные»** (`emergencyDeleteLocalDatabase`).
2. **Неразрушаемая Outbox-очередь и метка `origin: 'seed' | 'user'` (`L-02`, `L-03`):**
   - `enqueueOutboxMutation` гарантирует, что мутации со статусом `pending_sync` **никогда** не вытесняются лимитом очереди (вытесняются только завершённые `synced`), а payload ограничивается идентификаторами и версией без дублирования ПДн.
   - Сущности поддерживают `origin: 'seed' | 'user'`; стартовые данные салона не попадают в outbox и отфильтровываются методом `SalonRepository.filterUserRecords()` при экспорте `.sim.json` в `CryptoCloudEngine`.
3. **Allowlist-схемы, вторая линия секрет-гигиены и реестр миграций (`src/domain/schemas.ts`, `src/infrastructure/identity/secretHygiene.ts` · `L-05`, `L-06`):**
   - Основной рубеж — строгие белые списки полей для каждой коллекции (`validateAppointments`, `validatePasskeys`, `validateIdentitySession`, `validateReviews` и т. д.), отклоняющие любые посторонние ключи до записи и при загрузке.
   - Повреждённая коллекция на диске не роняет весь интерфейс: сбрасывается только повреждённый срез с фиксацией предупреждения.
   - `assertNoSecretLikeFields` (бывший `assertNoPlaintextSecrets`) честно задокументирован как страховка второго уровня и расширен под `private_key`, JWK `"d"`, `apiKey`, числовой `password`, `Bearer` и `AKIA…`.
   - При обнаружении `schemaVersion > SALON_SCHEMA_VERSION` репозиторий сохраняет исходную метку на диске и переходит в `read-only` режим, не затирая данные будущей версии приложения.
   - Для перехода `v1 → v2` реализован явный массив шагов `MIGRATION_REGISTRY`.
4. **Честная локальная крипто-проверка WebAuthn & TTL (`src/infrastructure/identity/webAuthnService.ts`, `src/domain/identity.ts` · `L-04`, `L-12`):**
   - `authenticateWebAuthnPasskey` проверяет `clientDataJSON` (`type === 'webauthn.get'`, точный `challenge` и `origin`), SHA-256 `rpIdHash`, биты `UP/UV` в `authData`, монотонный `signCount` и проверяет подпись через Web Crypto `crypto.subtle.verify` по сохранённому SPKI (конвертируя ASN.1 DER-подпись ECDSA P-256 в `r‖s`).
   - Введён ограниченный срок жизни локальной сессии (`DEFAULT_SESSION_TTL_MS = 8 ч`, поле `expiresAt`).
   - Реализован discoverable fallback (`allowCredentials: []`) на случай потери локального реестра после сброса БД.
   - Все операции сохранения Passkey/выхода работают по принципу «сначала персистируем, потом обновляем состояние» и не глушат ошибки.
5. **Load-then-Mount & Межвкладочная синхронизация (`src/hooks/useSalonBootstrap.ts`, `src/App.tsx` · `L-11`, `L-14`):**
   - Удалены громоздкие `useLocalFirstHydration.ts` и `useHydrationCommit`: корневой компонент `App` сначала ждёт `useSalonBootstrap()`, а затем монтирует `<SalonApp key={resetEpoch} initialData={...} />`, где доменные хуки (`useBookingFlow`, `usePortfolioGallery`, `useChatConcierge`, `useSponsoredAds`) инициализируются уже готовым срезом и используют атомарный батч `setMany` под защитой Web Locks (`navigator.locks`) и синхронизацией через `BroadcastChannel`.
   - Формула пересчёта рейтинга перенесена в чистый модуль `src/domain/rating.ts` (добавлено накопление `ratingSum`, чтобы исключить дрейф от повторного округления).
6. **Build-time CSP, самохостинговые шрифты и строгий ESLint/CI (`src/infrastructure/security/csp.ts`, `vite.config.ts`, `eslint.config.js`, `scripts/ci.workflow.yml` · `L-07`, `L-08`, `L-15`, `L-17`):**
   - Шрифты встроены через `@fontsource/*` (Workbox кэширует `.woff2`), внешние `<link>` к Google Fonts и запрет зума `user-scalable=no` удалены из `index.html`.
   - `vite.config.ts` переписывает CSP по режиму (`serve` vs `build`): в `dist/index.html` отсутствует `script-src 'unsafe-inline'`.
   - `eslint.config.js` переведён на `recommendedTypeChecked` + `@typescript-eslint/no-floating-promises: 'error'` + `jsxA11y.flatConfigs.recommended`; `typescript` зафиксирован на `6.0.3`, унифицирован lockfile (`package-lock.json` для `npm ci`).
7. **Осознанное решение по `src/types.ts` (`L-18`):**
   - Контракты хранилища (`domain/storage.ts`), схем (`domain/schemas.ts`), идентичности (`domain/identity.ts`) и расчёта рейтинга (`domain/rating.ts`) размещены в `src/domain/`. Базовые продуктовые DTO (`Appointment`, `Artist`, `Review`, `PortfolioItem`, `ChatMessage`, `SponsoredAd`, `ClientAnchorPoint`) сознательно оставлены в `src/types.ts` до подключения серверных контрактов Этапа 4, чтобы не плодить лишние реэкспорты без изменения моделей.


