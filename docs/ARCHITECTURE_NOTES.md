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
5. **Content Security Policy (`index.html` + обновление Спринта 3.2):**
   - В `index.html` был добавлен базовый тег `<meta http-equiv="Content-Security-Policy">`. *(Обновлено в 3.2: пакет `@fontsource/*` перевёл все шрифты в локальные `.woff2`, а Vite-плагин `csp-meta-injector` на `vite build` удаляет Google Fonts и полностью убирает `'unsafe-inline'` из `script-src` в `dist/index.html` — см. §11.6).*
   - Директива `frame-ancestors` сознательно **не включена** в `<meta>`-тег (по спецификации W3C `<meta>` CSP её игнорирует и вызывает предупреждение в консоли), она будет добавлена через HTTP-заголовки на сервере Этапа 4.

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
   - Удалены громоздкие `useLocalFirstHydration.ts` и `useHydrationCommit`: корневой компонент `App` сначала ждёт `useSalonBootstrap()`, а затем монтирует `<SalonApp key={resetEpoch} initialData={...} />`, где доменные хуки (`useBookingFlow`, `usePortfolioGallery`, `useChatConcierge`, `useSponsoredAds`) инициализируются уже готовым срезом и используют атомарный батч `IndexedDBAdapter.setMany`. *(Уточнено по `N-09`: очередь Web Locks `navigator.locks` и `BroadcastChannel` реализованы в `src/infrastructure/storage/salonRepository.ts`, а не в `IndexedDBAdapter`).*
   - Формула пересчёта рейтинга перенесена в чистый модуль `src/domain/rating.ts` (добавлено накопление `ratingSum`, чтобы исключить дрейф от повторного округления).
6. **Build-time CSP, самохостинговые шрифты и строгий ESLint/CI (`src/infrastructure/security/csp.ts`, `vite.config.ts`, `eslint.config.js`, `scripts/ci.workflow.yml` · `L-07`, `L-08`, `L-15`, `L-17`):**
   - Шрифты встроены через `@fontsource/*` (Workbox кэширует `.woff2`), внешние `<link>` к Google Fonts и запрет зума `user-scalable=no` удалены из `index.html`.
   - `vite.config.ts` переписывает CSP по режиму (`serve` vs `build`): в `dist/index.html` отсутствует `script-src 'unsafe-inline'`.
   - `eslint.config.js` переведён на `recommendedTypeChecked` + `@typescript-eslint/no-floating-promises: 'error'` + `jsxA11y.flatConfigs.recommended`; `typescript` зафиксирован на `6.0.3`, унифицирован lockfile (`package-lock.json` для `npm ci`).
7. **Осознанное решение по `src/types.ts` (`L-18`):**
   - Контракты хранилища (`domain/storage.ts`), схем (`domain/schemas.ts`), идентичности (`domain/identity.ts`) и расчёта рейтинга (`domain/rating.ts`) размещены в `src/domain/`. Базовые продуктовые DTO (`Appointment`, `Artist`, `Review`, `PortfolioItem`, `ChatMessage`, `SponsoredAd`, `ClientAnchorPoint`) сознательно оставлены в `src/types.ts` до подключения серверных контрактов Этапа 4, чтобы не плодить лишние реэкспорты без изменения моделей.

---

## 🛠️ 12. Спринт 3.3 «Хотфикс хранилища» (`N-01 … N-09`, 17 ноября 2026 г.)

1. **Дискриминированные чтения `getDetailed()` и защита от seed-перезаписи (`N-01`):**
   - `ResilientStorageAdapter.getDetailed<T>(key)` возвращает `{ status: 'ok', value } | { status: 'missing' } | { status: 'unreadable', error }` (а при фатальной блокировке движка и переходе на `memory_only` для новых ключей — `'missing'`).
   - `SalonRepository.ensureSeededAndLoad()` **никогда** не перезаписывает `'unreadable'`-коллекции seed-ом и блокирует запись в них (`unreadableCollections`) до чистого чтения; `recomputeHealth()` удерживает `health: 'degraded'`, пока не опустеют и `unreadableKeys`, и `pendingRetryKeys`.
2. **Схема v3 и backfill `origin` для legacy v2 (`N-02`):**
   - `SALON_SCHEMA_VERSION = 3`, добавлена миграция `v2 → v3` + сквозная разметка `inferOrigin(items, seedIds)`: записи без `origin`, чьи ID не входят в seed-наборы, гарантированно помечаются `origin: 'user'`.
3. **Поэлементный карантин, non-secret passthrough и JSON-экспорт (`N-03`):**
   - `partitionCollectionRecords()` в `src/domain/schemas.ts` отбирает битые элементы или элементы с секретами в `quarantine:<collection>:<ts>`, сохраняя валидные записи и пробрасывая незнакомые несекретные поля (`allowUnknownNonSecret: true`) для forward/backward совместимости.
   - Повреждённые не-массивы перед fallback-сидом копируются в `quarantine:`; `ErrorBoundary` и баннер салона предоставляют выгрузку карантина в `.json`.
4. **Live cross-tab sync без remount (`N-04` & `N-09`):**
   - Из `useSalonBootstrap.ts` удалены `artistsRef`/`reviewsRef`/`anchorPointsRef` и дублирующиеся slice-состояния; переход на единый `useReducer` (`bootstrapData`, `externalRevision`, `resetEpoch`, `storageHealth`, `storageWarnings`, `outbox`).
   - Кросс-вкладочные сообщения фильтруются по `tabId`, дебаунсятся (150 мс) и обновляют хуки по изменению `externalRevision` **без инкремента `resetEpoch` и потери открытых модалок**.
5. **WebAuthn: честные статусы, CBOR SPKI, `UV` и `BE` (`N-05`):**
   - Заменён `verified: boolean` на `verification: 'signature_verified' | 'presence_only'` + метод сессии `'webauthn_passkey' | 'webauthn_presence_only'`.
   - При отсутствии `getPublicKey()` SPKI извлекается из `attestationObject` (`extractSpkiFromAttestationObject`, CBOR/COSE EC2 P-256 & RSA).
   - Для роли `'master'` принудительно проверяется флаг `UV`; при установленном `BE` (`0x08`) немонотонный `signCount` даёт предупреждение без ложной блокировки синхронизируемых ключей.
6. **Единотранзакционный Outbox & триггеры дозаписи (`N-06`):**
   - Репозиторные методы `*WithOutbox`, `saveLikesAndPortfolioAtomic`, `addReviewAndUpdateArtistWithOutbox`, `updateAnchorPointWithOutbox`, `updateMasterSalonWithOutbox` записывают изменённую коллекцию, `outbox` и `schemaMeta` в одной `setMany`-транзакции.
   - `sanitizeOutboxPayload()` переведён на строгий белый список `ALLOWED_OUTBOX_PAYLOAD_KEYS`; в `useSalonBootstrap.ts` подключены обработчики `online`, `visibilitychange`, `pagehide` и `beforeunload`.
7. **Суженный детектор секретов (`N-07` & `N-11`):**
   - `secretHygiene.ts` разрешает обычную английскую речь со словом `bearer`, но продолжает блокировать `Authorization: Bearer <token>` и JWT (`eyJ…`), а `isNonEmptyString` в `schemas.ts` теперь отсекает пустые и пробельные строки (`val.trim().length > 0`).

---

## 💳 13. Этап 4 · Спринт 4.1 «Foundation (Честные платежи и серверная идентичность)»

> Полное решение зафиксировано в [`docs/PAYMENTS_ADR.md`](./PAYMENTS_ADR.md) (читается за 30 секунд).

1. **Zero-PCI Checkout & Чистый порт (`src/domain/payments.ts`, `src/infrastructure/payments/mockPaymentProvider.ts`, `src/components/CheckoutModal.tsx`):**
   - Из `CheckoutModal.tsx` физически удалены прежние декоративные поля карты (`cardNumber`, `cardExp`, `cardCvc` и их `<input>` в DOM) — нарушение этого правила автоматически ловится тестом-сторожем в `src/__tests__/paymentFoundation.test.ts`.
   - Введён чистый доменный порт `PaymentProvider` (`DepositIntent`, `DepositSession`, `toMinorUnits`, `formatMinorUsd`). Активная реализация Спринта 4.1 — `[SIM] MockPaymentProvider` (`mode: 'simulated'`, `isSimulated: true`, `collectsCardInDom: false`), которую на Этапе 4.2 заменит серверный `StripeHostedCheckoutProvider` (SAQ-A redirect).
2. **Express API + WebAuthn Challenge Stub (`server.ts`, `src/server/challengeService.ts`, `src/server/apiRouter.ts`, `src/infrastructure/identity/webAuthnService.ts`):**
   - Приложение запускается через единый `server.ts` (Express 5 + Vite middleware в dev / статика `dist/` в prod, порт `3000`).
   - Эндпоинты `GET /api/payments/provider`, `POST /api/auth/webauthn/challenge` и `POST /api/auth/webauthn/verify` выдают одноразовые 32-байтовые challenge (TTL `120 с`, ограниченный размер стора `2000`), проверяют привязку `clientDataJSON` и флаг `UP` после однократного потребления, и **строго возвращают `verificationTier: 'challenge_stub_only'` и `cryptographicServerVerified: false`**.
   - Клиентский `webAuthnService.ts` запрашивает challenge у `/api/auth/webauthn/challenge` с коротким таймаутом и безопасным fallback на локальный CSPRNG в статичных/оффлайн-средах; реальная серверная COSE/SPKI-проверка подписи и выпуск `HttpOnly` сессий запланированы на Спринт 4.2.

---

## 🔐 14. Этап 4 · Спринт 4.2 «Серверная SPKI-идентичность, `HttpOnly` сессии и Stripe Hosted Checkout (SAQ-A)»

1. **Постоянное серверное хранилище (`src/server/serverStore.ts`):**
   - `FileServerStateStore` (атомарная запись через `.tmp` + `rename` в gitignored `.data/nailix-server.json`) и `InMemoryServerStateStore` для изолированных тестов.
   - Хранит публичные SPKI-ключи (`ServerPasskeyRecord`, явная блокировка секретных полей), активные сессии (`ServerSessionRecord`), `DepositIntent` и окно идемпотентности обработанных вебхуков Stripe (до 500 последних `event.id`).

2. **Реальная серверная крипто-проверка WebAuthn и `HttpOnly` сессии (`src/server/webAuthnServerVerifier.ts`, `src/server/sessionService.ts`, `src/server/apiRouter.ts`):**
   - **`POST /api/auth/webauthn/register`**: проверяет `clientDataJSON.type === 'webauthn.create'`, одноразовый challenge, `origin`, `rpIdHash`, биты `UP`/`UV`, валидирует SPKI DER (`node:crypto.createPublicKey`) для ES256 (`-7`) и RS256 (`-257`), сохраняет ключ на сервере и ставит подписанный HMAC-SHA256 `HttpOnly; SameSite=Lax` cookie `nailix_sid`.
   - **`POST /api/auth/webauthn/verify`**: проверяет одноразовый challenge, `rpIdHash`, `UP`, обязательный `UV` для роли `'master'`, монотонный `signCount` (с предупреждением для синхронизируемых ключей `BE=1`), криптографическую подпись над `authData \|\| SHA-256(clientDataJSON)` через `node:crypto.verify` -> только после успешной проверки возвращает `verificationTier: 'server_spki_verified'`, `cryptographicServerVerified: true` и обновляет `HttpOnly` cookie. При отсутствии ключа на сервере честно остаётся `challenge_stub_only` (`cryptographicServerVerified: false`).
   - **`GET /api/auth/session` и `POST /api/auth/logout`**: проверяют подпись HMAC (`timingSafeEqual`) + TTL в хранилище; выход немедленно отзывает серверную сессию и обнуляет cookie (`Max-Age=0`).

3. **Env-driven Stripe Hosted Checkout (SAQ-A) и HMAC-вебхуки (`src/server/stripeProvider.ts`, `src/infrastructure/payments/hostedCheckoutProvider.ts`, `src/components/CheckoutModal.tsx`):**
   - При наличии `STRIPE_SECRET_KEY` сервер переводит `/api/payments/provider` в режим `'hosted_psp'` (`stripe_hosted`), создаёт Checkout Session через Stripe REST API (`POST /api/payments/checkout-session`) в целых центах (`amountMinor`) и перенаправляет клиента на `https://checkout.stripe.com/...` без касания карточных данных в React DOM.
   - **`POST /api/payments/webhooks/stripe`** смонтирован с `express.raw` до JSON-парсера и проверяет заголовок `Stripe-Signature` (`t=...,v1=...`) по HMAC-SHA256 с допуском окна воспроизведения 300 с и `timingSafeEqual`, обновляя `DepositIntent` идемпотентно.
   - Без `STRIPE_SECRET_KEY` сервер и UI честно остаются в `[SIM]`-режиме (`mock_sim`, Zero-PCI DOM).

4. **HTTP Security Headers Middleware (`src/server/securityHeaders.ts`):**
   - Каждый HTTP-ответ Express содержит `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` и HTTP-заголовок `Content-Security-Policy` с настраиваемой директивой `frame-ancestors` (`NAILIX_FRAME_ANCESTORS`).

---

## 🛡️ 15. Спринт 4.3 «Закалка брони перед аудитом Коляна + Закрытие N-10 и строгий CSP»

1. **Авторитетная политика `origin` / `rpId` и защита редиректа Stripe (`src/server/originPolicy.ts`, `src/server/apiRouter.ts`):**
   - Эндпоинты `/api/auth/webauthn/register`, `/verify` и `/api/payments/checkout-session` больше не принимают на веру переданные клиентом `body.expectedOrigin`, произвольный `rpId` или произвольный `body.originUrl`: допустимые origin выводятся сервером из HTTP `Host`/`Origin` + `NAILIX_ALLOWED_ORIGINS` (и валидного `APP_URL`), `rpId` проверяется на совпадение с эффективным доменом разрешённого origin, а URL возврата Stripe защищён от open-redirect.
2. **Анти-даунгрейд WebAuthn и усиление границ (`src/server/apiRouter.ts`, `src/server/webAuthnServerVerifier.ts`, `src/server/serverStore.ts`, `src/server/stripeProvider.ts`):**
   - Если `credentialId` уже зарегистрирован на сервере (`stateStore.getPasskey`), `/verify` **запрещает** откат в `challenge_stub_only` без `signatureBase64Url` / `authenticatorDataBase64Url` (отказ HTTP `401`) и отклоняет `registration`-challenge на `/verify` (`HTTP 400`).
   - `verifyAssertionSignatureOnServer` принудительно требует `clientDataJSON.type === 'webauthn.get'`; `ServerStateStore` отсекает prototype-pollution ключи и некорректные `expiresAt`; `StripeHostedCheckoutService` защищает терминальный статус `captured` от отката задержанными/непоследовательными вебхуками; все маршруты `/api/*` отдают `Cache-Control: no-store, private`.
3. **Безопасный аудит-лог без ПДн (`src/server/auditLog.ts`):**
   - `ServerSecurityAuditLog` фиксирует ограниченный по размеру (200 записей) поток событий аутентификации и платежей без email, телефонов, кук, подписей и ключей; сводка публикуется в `/api/health`.
4. **Закрытие `N-10`: 100% локальный QR и вычищение `api.qrserver.com` (`src/utils/qrGenerator.ts`, `src/components/AndroidExperienceView.tsx`, `src/infrastructure/security/csp.ts`):**
   - Pairing QR-код генерируется оффлайн пакетом `qrcode` локально без отправки URL на внешний сервис; домен `https://api.qrserver.com` полностью удалён из `img-src` build-time и HTTP CSP (`img-src 'self' data: blob:`). Заодно в `CalendarSyncButtons.tsx` вызовы `window.open` заменены на безопасные `<a target="_blank" rel="noopener noreferrer">`.

---

## 🔒 16. Этап 4 · Спринт 4.4 «Закалка серверной идентичности и оплаты» (`Q-01 … Q-09`)

1. **Единый изоморфный CBOR/COSE парсер и привязка регистрации (`src/domain/webauthnCbor.ts`, `src/server/webAuthnServerVerifier.ts`, `src/server/apiRouter.ts` · `Q-01`, `Q-08`):**
   - Из `webAuthnService.ts` выделен изоморфный `webauthnCbor.ts`, используемый и клиентом, и сервером.
   - `POST /api/auth/webauthn/register` больше не принимает голый `SPKI` без аттестационных данных аутентификатора: требуются `authenticatorDataBase64Url` или `attestationObjectBase64Url` с флагом `AT (0x40)` и COSE-ключом, совпадение извлечённых `credentialId` / DER `SPKI` / `algorithm`, а также безусловный `UV` для роли `master`.
   - Повторная регистрация существующего `credentialId` или `rawId` от другого/анонимного источника отклоняется с **`HTTP 409 Conflict`**; перепривязка допускается только при действующей `server_spki_verified` cookie-сессии этого ключа.
   - В `validateSpkiKeyForRegistration` кривая для `ES256 (-7)` сужена строго до `prime256v1` (`P-256`), а для `RS256 (-257)` отсекаются ключи `rsa-pss`.
   - `ServerSessionService.extractCookieToken` обёрнут в `try/catch` (`decodeURIComponent`) и возвращает `null` при битом percent-encoding без генерации HTTP `500` (`URIError`).

2. **Серверное назначение ролей по одноразовым инвайтам (`src/server/apiRouter.ts`, `src/hooks/useIdentitySession.ts`, `src/components/PasskeyAuthModal.tsx` · `Q-02`):**
   - Клиентские поля `body.role` на `/challenge` и `/register` больше не повышают привилегии: базовой ролью всегда назначается `'client'`.
   - Повышение до `'master'` выполняет строго сервер при предъявлении неиспользованного одноразового кода из `NAILIX_MASTER_INVITE_CODES` (при регистрации или через `POST /api/auth/webauthn/promote-master`); неверный/повторный код отклоняется `HTTP 403`.

3. **Серверный каталог цен, идемпотентность и замкнутый цикл Hosted Checkout (`src/domain/serviceCatalog.ts`, `src/server/stripeProvider.ts`, `src/hooks/useBookingFlow.ts`, `src/App.tsx` · `Q-03`, `Q-04`, `Q-09`):**
   - `/api/payments/checkout-session` игнорирует присланные клиентом `amountUsd`, `artistName` и `serviceName`, рассчитывая сумму строго из `CANONICAL_SERVICE_CATALOG` + разрешённых чаевых `[0, 15, 18, 22]%`.
   - `StripeHostedCheckoutService` ограничивает верхний предел (`$10 000`), дедуплицирует открытый интент по `bookingReferenceId` с детерминированным `Idempotency-Key`, устанавливает `AbortSignal.timeout(10_000)` и пробрасывает `payment_intent_data[metadata][intentId]`.
   - Вебхуки `checkout.session.*`, `payment_intent.succeeded` и `charge.refunded` / `charge.dispute.created` строго сверяют `amount_total`/`amount_received`/`amount` с `intent.amountMinor` и валюту `'usd'` перед переводом в `'captured'`, а при ошибке подписи отдают клиенту санитизированное `'Invalid Stripe webhook.'`.
   - До редиректа `CheckoutModal` сохраняет локальную бронь со статусом `'pending'`, а при возврате по `?intent_id=...` приложение в `App.tsx` + `useBookingFlow.reconcileHostedCheckoutReturn` запрашивает фактический статус в `GET /api/payments/intents/:id` (не доверяя `?checkout_status=success`).

4. **Прод-гигиена сервера, Rate Limiting и Quota Isolation (`server.ts`, `src/server/originPolicy.ts`, `src/server/securityHeaders.ts`, `src/server/challengeService.ts`, `src/server/rateLimiter.ts`, `src/server/serverStore.ts` · `Q-05`, `Q-06`, `Q-07`):**
   - `originPolicy.ts` в production (`isProduction: true`) не добавляет `Host` / `X-Forwarded-Host` в доверенный список и блокирует кросс-сайтовые мутации (`validateMutationOriginHeader` → `403`).
   - `server.ts` отказывается стартовать в production без `NAILIX_SESSION_SECRET` (`>= 16` символов), если включены реальные внешние секреты/роли (`STRIPE_SECRET_KEY`, `NAILIX_MASTER_INVITE_CODES`) или `NAILIX_STRICT_SECRETS=1`; для showcase-деплоя в Cloud Run без этих секретов сервер поднимается с эфемерным 32-байтовым CSPRNG-ключом сессий, включает `trust proxy` только при `TRUST_PROXY=1|true` и отдаёт JSON `404` для неизвестных `/api/*`.
   - В `securityHeaders.ts` default `NAILIX_FRAME_ANCESTORS` в production сужен до `'self'`, добавлен `Strict-Transport-Security`.
   - Введён скользящий rate-limiter (`429 + Retry-After`), квота pending challenges на IP в `challengeService.ts` (исключая вытеснение чужих challenge), ограничены размеры коллекций в `ServerStateStore` (очистка истёкших интентов/сессий), а публичный `/api/health` свёрнут до `{ ok: true }`.

---

## ☁️ 17. Этап 4 · Спринт 4.5 «Деплой, возврат Stripe и атомарность без сюрпризов» (`V-01 … V-08`)

1. **Чек-лист продакшен-деплоя в Cloud Run (`V-01`):**
   - `APP_URL` (`https://...`) или `NAILIX_ALLOWED_ORIGINS` обязателен: при их отсутствии в `production` сервер теперь громко предупреждает в консоль при старте (`console.warn`), т.к. браузерные POST-запросы с `Origin` получат `HTTP 403`.
   - `TRUST_PROXY=1` (или точное число доверенных прокси-хопов) обязателен за балансировщиком Cloud Run, чтобы `req.ip` корректно разделял бакеты `rateLimiter` и квоты `challengeService` между реальными клиентами.
   - Инстанс должен работать в 1 экземпляре (`min=1, max=1`): состояние `.data/nailix-server.json` эфемерно в файловой системе контейнера, а в showcase-режиме без `NAILIX_SESSION_SECRET` ключ HMAC cookie генерируется на старт процесса.
2. **Строгая привязка возврата Stripe и минимальный ответ инспекции (`V-02`, `V-05`):**
   - Из `useBookingFlow.ts` удалена привязка по URL-параметру `booking_ref`; логика вынесена в чистую функцию `matchIntentToAppointment(intent, appointments)` в `src/domain/payments.ts` (`app.id === intent.bookingReferenceId && app.artistId === intent.artistId && app.serviceId === intent.serviceId && (!app.escrowTxHash || app.escrowTxHash === intent.id)`).
   - При отсутствии локальной брони в `IndexedDB` приложение больше не синтезирует фиктивную запись на `'14:00'` / сегодня — честно показывает тост подтверждения с суммой, ID и сохранёнными `appointmentDate`/`appointmentTimeSlot`.
   - Добавлен `GET /api/payments/quote` (`V-05`), на который опирается `CheckoutModal` в Stripe-ветке, а публичный `GET /api/payments/intents/:id` возвращает суженную проекцию `PublicDepositIntentView` без `hostedCheckoutUrl` и `providerId`.
3. **Частичные возвраты, споры и корреляция вебхуков (`V-03`, `V-06`):**
   - Статусы расширены значениями `'partially_refunded'` и `'disputed'` + полем `amountRefundedMinor`. Частичный `charge.refunded` больше не переводит intent в терминальный `'released'`, а `charge.dispute.created` фиксируется как `'disputed'`.
   - Добавлена запасная корреляция вебхуков по `stripePaymentIntentId` (`getDepositIntentByPaymentIntentId`); события без найденного intent честно возвращают `{ received: true, duplicate: false, unmatched: true }`.
   - На `/checkout-session` проверяются формат `appointmentDate`/`appointmentTimeSlot`, enum `displayCurrency` и составной `Idempotency-Key` от `(bookingReferenceId, artistId, serviceId, amountMinor)` с `409 Conflict` при конфликте активной брони. На `/register` введена проверка `credentialId === rawIdBase64Url`.
4. **Долговечные атомарные хэшированные инвайты мастера (`V-04`):**
   - `NAILIX_MASTER_INVITE_CODES` требует длины не менее **16 символов**, при загрузке коды сразу хэшируются через `SHA-256`, а одноразовое потребление (`consumeMasterInviteHash`) выполняется атомарно через сериализованную очередь записи `ServerStateStore` (`consumedInviteHashes` в `.data/nailix-server.json`), защищая и от рестарта сервера, и от конкурентных запросов `/promote-master`.
