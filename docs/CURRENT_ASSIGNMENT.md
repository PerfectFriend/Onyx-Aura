# Текущее задание

**3.2 Закалка (`L-01 … L-17`):** 🟢 ПРИНЯТА Гришей  
**3.3 Хотфикс хранилища (`N-01 … N-12`):** 🛠️ **Выполнен Женей** по кросс-аудиту Коляна (`N-01 … N-09` + `isNonEmptyString` из `N-11` + все пробы `P1, P4, P5, P8, W7, W10, W11/W12`).  
**Этап 4 (Спринт 4.1 — Payments & Server Identity Foundation):** ⏸️ Готов к старту по заданию Гриши (ADR, `src/domain/payments.ts`, `[SIM] MockPaymentProvider`, challenge stub, **без PCI-полей в UI**) — сразу после приёмки 3.3 Коляном и Гришей.

**Бэклог:** `N-10` (локальный генератор QR вместо `api.qrserver.com`), `N-11` (`CalendarSyncButtons` `K-08.6`, системный `i18n`, `Date.now()` → UUID/clock, декомпозиция крупных UI-компонентов), `L-18` / `L-19` / `K-18`.

**Задачи за владельцем репозитория (вне кода):**
1. Перенести [`scripts/ci.workflow.yml`](../scripts/ci.workflow.yml) в `.github/workflows/ci.yml` (push токеном со scope `workflow`) для активации GitHub Actions CI + Gitleaks.
2. Перевыпустить release keystore для Android APK (`docs/KEY_ROTATION_RUNBOOK.md`) с заданием `NAILIX_KEYSTORE_PASS` / `NAILIX_KEY_PASS` и обновлением `assetlinks.json`.
3. Выполнить однопроходную очистку истории `git filter-repo` по [`docs/KEY_ROTATION_RUNBOOK.md`](./KEY_ROTATION_RUNBOOK.md).

**Ожидает:** Финального `[AUDIT]` от **Коляна** и **Гриши** по Спринту 3.3.

**Журнал:** [`docs/DEVELOPMENT_JOURNAL.md`](./DEVELOPMENT_JOURNAL.md)
