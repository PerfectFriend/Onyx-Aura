# Текущее задание

**Спринт 4.4:** 🟢 ПРОВЕРЕН и ПРИНЯТ Коляном (аудит `Q-01 … Q-12` + `R1…R10`)  
**Спринт 4.5 («Деплой, возврат Stripe и атомарность без сюрпризов», ответ на `V-01 … V-08`):** 🛠️ **Выполнен Женей**:
- `server.ts` + `README.md` + `docs/ARCHITECTURE_NOTES.md` (`V-01`): поддержка числовых хопов `TRUST_PROXY`, громкое `console.warn` при старте `production` без `APP_URL`/`NAILIX_ALLOWED_ORIGINS`, явный `[DECISION]` по showcase-секрету и чек-лист деплоя Cloud Run
- `src/domain/payments.ts` + `src/hooks/useBookingFlow.ts` + `src/components/CheckoutModal.tsx` + `src/App.tsx` (`V-02`): строгий матчер `matchIntentToAppointment` (без `booking_ref` из URL и без выдуманной записи `'14:00'`), валидация и хранение `appointmentDate`/`appointmentTimeSlot`, минимальный `GET /api/payments/intents/:id` (`PublicDepositIntentView`)
- `src/server/stripeProvider.ts` + `src/server/serverStore.ts` (`V-03`, `V-06`): статусы `'partially_refunded'` и `'disputed'` + `amountRefundedMinor`, корреляция по `stripePaymentIntentId`, ответ `unmatched: true`, составной `Idempotency-Key` и `409 Conflict` при несовпадении параметров брони, валидация `displayCurrency`
- `src/server/apiRouter.ts` + `src/server/serverStore.ts` (`V-04`, `V-05`, `V-06`): долговечное атомарное списание SHA-256 инвайтов мастера (`>= 16` символов), эндпоинт `GET /api/payments/quote` в `CheckoutModal`, проверка `credentialId === rawIdBase64Url`
- Добавлен `src/__tests__/stage45.test.ts` (активированы все пробы `V-01…V-06`, 0 `.todo`) + [`docs/REALITY_MAP.md`](./REALITY_MAP.md) **v3.7** (`V-08`)

**Ожидает:** Приёмки **Гриши** (и **Коляна**) по Спринту 4.5 перед стартом **Этапа 5**.  
**В бэклоге (вне блокеров 4.5):** `Q-10` (декомпозиция `salonRepository.ts`), `V-07` (генератор ID вместо `Date.now()`, i18n серверных/хуковых тостов, очистка `GEMINI_API_KEY` из `.env.example`, сборка `server.ts` в JS).

**Журнал:** [`docs/DEVELOPMENT_JOURNAL.md`](./DEVELOPMENT_JOURNAL.md)  
**ADR платежей:** [`docs/PAYMENTS_ADR.md`](./PAYMENTS_ADR.md)


