# Текущее задание

**Этап 0 / Этап 1 / Спринт 1.5:** закрыты как фундамент честности и архитектуры (приняты Гришей `3f3a966`)  
**Этап 2 (Спринт 2.1 + Offline Outbox) — Данные и Local-First:** 🟢 ВЫПОЛНЕН (готов к приёмке Гриши и Коляна)

**Что реализовано по заданию 2.1 и Этапу 2:**
1. **Чистый слой хранения (`src/domain/storage.ts` + `src/infrastructure/storage/indexedDbAdapter.ts`)**:
   - Контракты `StorageAdapter`, `StorageKey`, `OutboxMutation`, `HydratedSalonData`.
   - Нативный браузерный `IndexedDBAdapter` (`nailix_local_first_v1` / `salon_kv`) с ленивым пулом соединений + `MemoryStorageAdapter` для Node/Vitest и автоматической деградации при `SecurityError` / `QuotaExceededError`.
2. **Репозиторий + Идемпотентный Seed + Offline-First Outbox (`src/infrastructure/storage/salonRepository.ts`)**:
   - Начальные коллекции вынесены из прямых импортов UI/хуков в `SalonRepository.ensureSeededAndLoad()` + `createSeedSnapshot()`.
   - Персистентны `artists`, `reviews`, `appointments`, `anchorPoints`, `portfolio` + `likedIds`/`savedIds`, `chats`, `ads`, плюс очередь оффлайн-мутаций `OutboxMutation` (`getOutbox()`, `flushOutboxLocalDemo()`, `resetToSeed()`).
3. **Хук гидратации и защиты от ранних гонок (`src/hooks/useLocalFirstHydration.ts`)**:
   - Гидратация при старте с `dirtyEntitiesRef` + окончательная очистка `App.tsx` (**0 `useState` и 0 `useEffect`**).
4. **Долги Спринта 1.5 (`K-14`, `K-15`, `K-04`) + Документация и тесты**:
   - Удалены прямые импорты `cryptoCloudSwarm` из `useBookingFlow.ts` и `useChatConcierge.ts` (DIP завершён).
   - Исправлена гонка лайков `handleToggleLike` (`K-14`), обновлены честные тексты в `ErrorBoundary.tsx`, `ClientAppointmentsModal.tsx`, `ReputationLedger.tsx`, `CryptoCloudPanel.tsx`, `docs/REALITY_MAP.md` v2.0, `docs/ARCHITECTURE_NOTES.md`, `README.md`.

Полный отчёт Жени: [`docs/DEVELOPMENT_JOURNAL.md`](./DEVELOPMENT_JOURNAL.md)  
**Владельцу репо (параллельно):** выполнить [`docs/KEY_ROTATION_RUNBOOK.md`](./KEY_ROTATION_RUNBOOK.md) (новый keystore, purge истории, новый fingerprint в `assetlinks.json`).

**Библия:** [`MANIFEST_CANONICAL_AI_DEVELOPER.md`](../MANIFEST_CANONICAL_AI_DEVELOPER.md)  
**План:** [`EVOLUTION_PLAN.md`](../EVOLUTION_PLAN.md)  
**Следующий шаг после приёмки:** Этап 3 — Идентичность и безопасность (WebAuthn / Passkeys)
