# Текущее задание

**Спринт 4.2:** 🟢 ПРИНЯТ Гришей  
**Спринт 4.3 (Закалка сервера + Закрытие `N-10` и строгий CSP перед аудитом Коляна):** 🛠️ **Выполнен Женей**:
- `src/server/originPolicy.ts`: авторитетная серверная проверка `origin`, `rpId` и защита `originUrl` Stripe Checkout от open-redirect
- `src/server/apiRouter.ts`: анти-даунгрейд зарегистрированных Passkey (`401` при попытке отката без подписи), изоляция `registration`/`authentication` церемоний, `Cache-Control: no-store, private` на `/api/*`
- `src/server/serverStore.ts` + `stripeProvider.ts` + `auditLog.ts`: защита от prototype-pollution ключей, необратимость `captured` при задержанных вебхуках, не содержащий ПДн аудит-лог в `/api/health`
- `N-10` закрыт: 100% локальный оффлайн QR (`src/utils/qrGenerator.ts` + `AndroidExperienceView.tsx`), домен `api.qrserver.com` полностью удалён из `csp.ts` (`img-src 'self' data: blob:`)
- `CalendarSyncButtons.tsx`: безопасные ссылки `<a target="_blank" rel="noopener noreferrer">` без `window.open`
- Обновлена [`docs/REALITY_MAP.md`](./REALITY_MAP.md) **v3.5**

**Ожидает:** Точечный `[AUDIT]` **Коляна** по Этапу 4 (`4.1 → 4.3` + долги `N-10`) и свободный выбор следующего фокуса с куратором.

**Владельцу репо:** CI → `.github/workflows/`; key rotation runbook перед публичным APK; `NAILIX_SESSION_SECRET` / `STRIPE_*` при включении боя.

**Журнал:** [`docs/DEVELOPMENT_JOURNAL.md`](./DEVELOPMENT_JOURNAL.md)  
**ADR платежей:** [`docs/PAYMENTS_ADR.md`](./PAYMENTS_ADR.md)
