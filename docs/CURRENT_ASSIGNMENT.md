# Текущее задание

**Спринт 4.3:** 🟢 ПРОВЕРЕН Коляном (аудит `Q-01 … Q-12`)  
**Спринт 4.4 (Закалка серверной идентичности и оплаты, ответ на `Q-01 … Q-09`):** 🛠️ **Выполнен Женей**:
- `src/domain/webauthnCbor.ts` + `webAuthnServerVerifier.ts` + `apiRouter.ts` (`Q-01`, `Q-08`): обязательный `authenticatorData`/`attestationObject` + сверка COSE-ключа и `credentialId`, `409 Conflict` при попытке перезаписи чужого `credentialId`, безусловный `UV` для `master`, строгие `P-256`/`rsa`, `try/catch` в `extractCookieToken`
- `src/server/apiRouter.ts` + `PasskeyAuthModal.tsx` (`Q-02`): роли назначаются строго сервером (`client` по умолчанию; `master` только по одноразовому инвайт-коду `NAILIX_MASTER_INVITE_CODES` на `/register` или `/promote-master`)
- `src/domain/serviceCatalog.ts` + `stripeProvider.ts` + `useBookingFlow.ts` + `App.tsx` (`Q-03`, `Q-04`, `Q-09`): серверный расчёт цены депозита по каталогу, идемпотентность по `bookingReferenceId`, сохранение `pending`-брони до редиректа + возвратная сверка по `GET /api/payments/intents/:id`, проверка суммы/валюты в вебхуке, обработка `payment_intent.succeeded` и возвратов (`charge.refunded` -> `released`)
- `server.ts` + `originPolicy.ts` + `securityHeaders.ts` + `challengeService.ts` + `rateLimiter.ts` (`Q-05`, `Q-06`, `Q-07`): прод-запрет старта без `NAILIX_SESSION_SECRET`, `trust proxy` только по `TRUST_PROXY=1`, prod origin policy без заголовков запроса, `frame-ancestors 'self'` + `HSTS`, rate limiting (`429`), квота challenge по IP, минимальный `/api/health` и JSON `404` для `/api/*`
- Добавлен `src/__tests__/serverHardening.test.ts` (активированы все пробы `S1–S9` и `Q-01…Q-09`, без `.todo`) + обновлена [`docs/REALITY_MAP.md`](./REALITY_MAP.md) **v3.6** (`Q-11`)

**Ожидает:** Повторной приёмки **Коляна** и **Гриши** по Спринту 4.4.  
**В бэклоге (вне блокеров 4.4):** `Q-10` (декомпозиция `salonRepository.ts`), `Q-12` (единый генератор ID / i18n слоёв / очистка `GEMINI_API_KEY`).

**Владельцу репо:** CI → `.github/workflows/`; key rotation runbook перед публичным APK; `NAILIX_SESSION_SECRET`, `NAILIX_MASTER_INVITE_CODES`, `NAILIX_ALLOWED_ORIGINS`, `STRIPE_*` в окружении при включении боя.

**Журнал:** [`docs/DEVELOPMENT_JOURNAL.md`](./DEVELOPMENT_JOURNAL.md)  
**ADR платежей:** [`docs/PAYMENTS_ADR.md`](./PAYMENTS_ADR.md)

