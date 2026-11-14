# Текущее задание

**Этап 0 / Этап 1:** закрыты как фундамент  
**Спринт 1.5 — Честный ремонт:** 🟢 ВЫПОЛНЕН (готов к приёмке Гриши и Коляна перед стартом Этапа 2)

**Выполнено по приоритетам:**
- **K-01:** Убраны бинарный keystore, пароли и `.apk` из `public/` и рабочего индекса Git; `scripts/build-apk.sh` переведён на env-переменные и `dist-apk/`; подготовлен [`docs/KEY_ROTATION_RUNBOOK.md`](./KEY_ROTATION_RUNBOOK.md) для локальной ротации и `git filter-repo` владельцем.
- **K-02, K-04:** Вычищены формулировки во всех 10 языках, UI, `.ics`, PWA-манифесте, `index.html`, `metadata.json` и `ErrorBoundary`; добавлен тест-сторож `src/__tests__/honestyWatchdog.test.ts`.
- **K-03, K-05, K-06, K-07, K-08.1–3, K-09…K-12, K-15, K-19:** Подключён строгий ESLint (`typescript-eslint`, `react-hooks`, `jsx-a11y`), 0 `any`, 0 warnings, починены хуки в 4 модалках, `openChat`, взвешенный рейтинг, динамические даты, `LOCAL_ONLY` и `README.md` / `REALITY_MAP.md` / `ARCHITECTURE_NOTES.md`.

Полный построчный отчёт Жени (`K-01…K-20`) добавлен в [`docs/DEVELOPMENT_JOURNAL.md`](./DEVELOPMENT_JOURNAL.md).  
Исходное ревью Коляна: [`docs/KOLYAN_REVIEW_STAGE1.md`](./KOLYAN_REVIEW_STAGE1.md)

**Библия:** [`MANIFEST_CANONICAL_AI_DEVELOPER.md`](../MANIFEST_CANONICAL_AI_DEVELOPER.md)  
**План:** [`EVOLUTION_PLAN.md`](../EVOLUTION_PLAN.md)  
**Следующий шаг после приёмки:** Этап 2 — Local-First / IndexedDB Persistence
