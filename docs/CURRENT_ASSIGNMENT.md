# Текущее задание

**Этап 3 (`3.1 → 3.3`):** 🟢 ПРИНЯТ Гришей (`N-01 … N-11`, отложен точечный `[AUDIT]` Коляна по готовности).  
**Этап 4 · Спринт 4.1 — Foundation:** 🟢 ПРИНЯТ Гришей (`PAYMENTS_ADR.md`, `PaymentProvider`, Zero-PCI `CheckoutModal`).  
**Этап 4 · Спринт 4.2 — Серверная SPKI-идентичность, `HttpOnly` сессии, HTTP Security Headers и Stripe Hosted Checkout (SAQ-A):** 🛠️ **Выполнен Женей**:
- Постоянное серверное хранилище `FileServerStateStore` (`.data/nailix-server.json`, в `.gitignore`)
- Реальная серверная проверка SPKI (`ES256`/`RS256` через `node:crypto.verify`, `rpIdHash`, `UP`/`UV`, `signCount`/`BE`) + HMAC-SHA256 `HttpOnly` cookie `nailix_sid` (`/api/auth/webauthn/register`, `/verify`, `/session`, `/logout`)
- Env-driven адаптер Stripe Hosted Checkout SAQ-A (`/api/payments/checkout-session`, `/api/payments/intents/:id`) + проверка `Stripe-Signature` HMAC-SHA256 (`/api/payments/webhooks/stripe`) и честный `[SIM]` fallback при отсутствии ключей в окружении
- Middleware HTTP-заголовков безопасности (`X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, CSP `frame-ancestors`)
- Обновлена [`docs/REALITY_MAP.md`](./REALITY_MAP.md) **v3.4** + `.env.example`

**Следующий шаг после `[AUDIT]` Гриши и Коляна:** Переход к **Этапу 5 (Межпользовательская синхронизация outbox + серверный календарь/реестр)** и закрытие бэклога (`N-10`, `N-11`, `L-19`).

**Задачи за владельцем репозитория (вне кода):**
1. При готовности к боевым платежам задать в секретах окружения `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` и `NAILIX_SESSION_SECRET`.
2. Перенести [`scripts/ci.workflow.yml`](../scripts/ci.workflow.yml) в `.github/workflows/ci.yml` токеном со scope `workflow`.
3. Перевыпустить release keystore и очистить историю `git filter-repo` по [`docs/KEY_ROTATION_RUNBOOK.md`](./KEY_ROTATION_RUNBOOK.md).

**Ожидает:** `[AUDIT]` Гриши и Коляна по Спринту 4.2 (плюс точечный по 4.1 по готовности Коляна).

**ADR:** [`docs/PAYMENTS_ADR.md`](./PAYMENTS_ADR.md)  
**Журнал:** [`docs/DEVELOPMENT_JOURNAL.md`](./DEVELOPMENT_JOURNAL.md)
