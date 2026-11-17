# Текущее задание

**3.2 Закалка (`L-01 … L-17`):** 🟢 ПРИНЯТА Гришей  
**3.3 Хотфикс хранилища (`N-01 … N-12`):** 🟢 Выполнен Женей (`57/57` тестов, V8 `72.37%` lines, все пробы `P1, P4, P5, P8, W7, W10, W11/W12`)  
**Этап 4 · Спринт 4.1 — Payments & Server Identity Foundation:** 🛠️ **Выполнен Женей** по `[ASSIGNMENT]` Гриши:
- ADR [`docs/PAYMENTS_ADR.md`](./PAYMENTS_ADR.md) + §13 [`docs/ARCHITECTURE_NOTES.md`](./ARCHITECTURE_NOTES.md)
- `src/domain/payments.ts` (`PaymentProvider` port) + `[SIM] MockPaymentProvider` (`src/infrastructure/payments/mockPaymentProvider.ts`)
- Из `src/components/CheckoutModal.tsx` удалены все карточные PAN/MMYY/CVC `<input>` поля (контроль Zero-PCI тестом)
- Express 5 backend `server.ts` + `src/server/challengeService.ts` + `src/server/apiRouter.ts` (`/api/auth/webauthn/challenge`, `/api/auth/webauthn/verify` со статусом `challenge_stub_only`, `/api/payments/provider`)
- [`docs/REALITY_MAP.md`](./REALITY_MAP.md) обновлён до **v3.3**

**Следующий шаг после `[AUDIT]` 4.1 (Спринт 4.2):** Серверная БД ключей + проверка COSE/SPKI-подписи на backend + `HttpOnly` сессии + адаптер Stripe Hosted Checkout (`SAQ-A`).

**Бэклог:** `N-10` (локальный генератор QR вместо `api.qrserver.com`), `N-11` (`CalendarSyncButtons` `K-08.6`, системный `i18n`, `Date.now()` → UUID/clock, декомпозиция крупных UI-компонентов), `L-18` / `L-19` / `K-18`.

**Задачи за владельцем репозитория (вне кода):**
1. Перенести [`scripts/ci.workflow.yml`](../scripts/ci.workflow.yml) в `.github/workflows/ci.yml` (push токеном со scope `workflow`) для активации GitHub Actions CI + Gitleaks.
2. Перевыпустить release keystore для Android APK (`docs/KEY_ROTATION_RUNBOOK.md`) с заданием `NAILIX_KEYSTORE_PASS` / `NAILIX_KEY_PASS` и обновлением `assetlinks.json`.
3. Выполнить однопроходную очистку истории `git filter-repo` по [`docs/KEY_ROTATION_RUNBOOK.md`](./KEY_ROTATION_RUNBOOK.md).

**Ожидает:** `[AUDIT]` от **Гриши** и **Коляна** по Спринту 4.1 (и финальной отмашки по 3.3 + 4.1 для открытия 4.2).

**Журнал:** [`docs/DEVELOPMENT_JOURNAL.md`](./DEVELOPMENT_JOURNAL.md)
