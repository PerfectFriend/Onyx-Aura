# ✦ ADR-001 · Payments & Server Identity Foundation (Этап 4 · Спринт 4.1)

> **Статус:** Принят (Foundation Only · Спринт 4.1)  
> **Дата:** 17 ноября 2026 г.  
> **Авторы:** Гриша (Архитектор) & Женя (Сеньор-разработчик)  
> **Аудитор:** Колян (Cross-Model Auditor, Claude Sonnet 5.5)

---

## ⚡ За 30 секунд: два главных вопроса

| Вопрос | В Спринте 4.1 (база) | В Спринте 4.4 (закалка) |
| :--- | :--- | :--- |
| **Куда уходят деньги?** | **Никуда (`[SIM]`)**: в `CheckoutModal` удалены все `<input>` поля карты (`PAN / MM/YY / CVC`), а расчёт депозита идёт через порт `PaymentProvider` → `[SIM] MockPaymentProvider`. | **Stripe Hosted Checkout (PCI DSS SAQ-A)**: клиент передаёт только `{ artistId, serviceId, tipPercentage, bookingReferenceId }`. Сервер сам вычисляет сумму по каталогу (`src/domain/serviceCatalog.ts`), ставит `Idempotency-Key` от `bookingReferenceId`, сохраняет локальную `pending`-бронь до редиректа, а при возврате читает статус строго из `GET /api/payments/intents/:id` (куда пишут подписанные Stripe Webhooks). |
| **Кто верифицирует Passkey?** | **Сервер + Браузер**: серверный challenge (TTL `120 с`), локальная SPKI-проверка. | **Серверная БД + COSE/SPKI Engine**: `/auth/webauthn/register` требует `authData`/`attestationObject` с `AT` + COSE-ключом, блокирует захват чужого `credentialId` статусом `409`, требует `UV` для мастера и выдаёт `HttpOnly; SameSite=Lax` HMAC-сессию `nailix_sid`. |
| **Кто назначает роль?** | Превью-селектор UI (недоверенный). | **Строго сервер**: по умолчанию любой Passkey получает роль `'client'`. Поле `role` в `/challenge` и `/register` игнорируется; повышение до `'master'` возможно только по одноразовому инвайт-коду из `NAILIX_MASTER_INVITE_CODES` (`POST /register` или `POST /promote-master`). |

---

## 1. Контекст и проблема

До Спринта 4.1 в модальном окне `CheckoutModal.tsx` присутствовали декоративные поля ввода номера карты, срока действия `MM/YY` и `CVC` (пусть даже readonly / placeholder), а WebAuthn-аутентификация использовала только клиентский CSPRNG-challenge без серверного одноразового хранилища.

Любая сборка, содержащая поля PAN/CVV в собственном DOM приложения, автоматически повышает область PCI DSS с **SAQ-A** до **SAQ-A EP / SAQ-D**, создавая неприемлемые юридические и технические риски до появления реального провайдера.

---

## 2. Рассмотренные варианты платёжного пути

| Вариант | Суть | Решение | Причина |
| :--- | :--- | :---: | :--- |
| **A. Своя форма карты в React + отправка на наш сервер** | Пользователь вводит PAN/CVC в `<input>` внутри React. | ❌ **ЗАПРЕЩЁН** | Выводит проект в полный аудит PCI DSS, повышает поверхность XSS-утечки. Жёсткий запрет на любые карточные `<input>` в `src/components/`. |
| **B. Crypto-Only Smart-Escrow** | Оплата и блокировка депозита только через Web3-кошельки. | ❌ **Отклонён для основного потока** | Отсекает 90%+ обычных клиентов маникюрных салонов; остаётся только в `[SIM]` превью (`USDC / ETH / SOL / $NAIL`). |
| **C. Hosted PSP Port + `[SIM]` Adapter в 4.1 → Stripe Hosted Checkout в 4.2+** | Единый чистый доменный интерфейс `PaymentProvider` (`src/domain/payments.ts`). В 4.1 подключён `[SIM] MockPaymentProvider` без карточных инпутов в DOM; в 4.2 подключается серверный адаптер `StripeHostedCheckoutProvider` (`redirect -> hostedCheckoutUrl -> webhook`). | ✅ **ВЫБРАН** | Нулевая PCI-поверхность в нашем DOM (SAQ-A), единый контракт `DepositIntent` / `DepositSession`, прозрачная замена адаптера без переписывания UI. |

---

## 3. Архитектура потоков (Foundation → Stage 4.2)

### 3.1. Платёжный поток (Zero-PCI Boundary)

```
CheckoutModal (React DOM: валюта превью, чаевые — 0 полей карты!)
   │
   ▼ PaymentProvider port (src/domain/payments.ts)
   ├── Sprint 4.1: MockPaymentProvider [SIM]
   │      ├── acceptsRealMoney: false, collectsCardInDom: false
   │      ├── createDepositIntent() -> status: 'requires_action' (cents int)
   │      └── confirmDeposit()      -> status: 'authorized_hold' + SHA-256 ref
   │
   └── Stage 4.2+: StripeHostedProvider (через /api/payments/checkout-session)
          ├── Сервер создаёт Stripe Checkout Session (SAQ-A redirect)
          ├── Клиент переходит на checkout.stripe.com (PCI-данные у Stripe)
          └── Webhook checkout.session.completed подтверждает бронь в БД
```

### 3.2. Серверный WebAuthn Challenge Flow (Sprint 4.1 Stub)

```
PasskeyAuthModal / webAuthnService.ts
   │
   ├── 1. POST /api/auth/webauthn/challenge { ceremony, role }
   │      └── Express WebAuthnChallengeStubStore (src/server/challengeService.ts)
   │          • 32 байта randomBytes, TTL = 120s, maxPending = 2000
   │          • Offline fallback в static-превью: client CSPRNG (без серверной сессии)
   │
   ├── 2. navigator.credentials.create / .get (браузер + TPM/Enclave)
   │      • Локальная проверка SPKI (ES256/RS256), rpIdHash, UP/UV (N-05)
   │
   └── 3. POST /api/auth/webauthn/verify { challengeId, clientDataJSONBase64Url, ... }
          • Немедленное удаление challengeId (strict single-use anti-replay)
          • Проверка TTL, ceremony.type, challenge, origin и флага UP (0x01)
          • Возвращает строго:
              verificationTier: 'challenge_stub_only'
              cryptographicServerVerified: false
```

---

## 4. Жёсткие запреты Спринтов 4.1 → 4.4 (Guardrails)

1. **Zero-PCI DOM:** В `src/components/` и `src/App.tsx` запрещены любые `<input>` для номера карты (PAN), `MM/YY`, `CVV/CVC` — контролируется автоматическим тестом в `src/__tests__/paymentFoundation.test.ts`.
2. **Никаких боевых секретов в репозитории:** Ни `STRIPE_SECRET_KEY`, ни webhook signing secrets, ни `NAILIX_MASTER_INVITE_CODES` не хранятся в коде; `GET /api/payments/provider` возвращает `hostedCheckoutConfigured: false` без ключей, а `server.ts` отказывается запускаться в `NODE_ENV=production` без `NAILIX_SESSION_SECRET`.
3. **Серверные роли и цены:** Клиент никогда не задаёт `amountUsd` для Stripe и не назначает себе роль `master` (Q-02 / Q-03).
4. **Замкнутый цикл Hosted Checkout (Q-04):** До редиректа в `IndexedDB` сохраняется запись `status: 'pending'` (`origin: 'user'`), а возврат с `?intent_id=...` сверяет статус исключительно с сервером (`GET /api/payments/intents/:id`), никогда по `?checkout_status=success`.
5. **Честная маркировка UI/API:** При отсутствии ключей действует явный режим `[SIM]` / `LOCAL_ONLY`, а при неполной аттестации — `challenge_stub_only`.

