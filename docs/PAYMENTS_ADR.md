# ✦ ADR-001 · Payments & Server Identity Foundation (Этап 4 · Спринт 4.1)

> **Статус:** Принят (Foundation Only · Спринт 4.1)  
> **Дата:** 17 ноября 2026 г.  
> **Авторы:** Гриша (Архитектор) & Женя (Сеньор-разработчик)  
> **Аудитор:** Колян (Cross-Model Auditor, Claude Sonnet 5.5)

---

## ⚡ За 30 секунд: два главных вопроса

| Вопрос | В Спринте 4.1 (сейчас) | Целевая архитектура Этапа 4.2+ |
| :--- | :--- | :--- |
| **Куда уходят деньги?** | **Никуда (`[SIM]`)**: в `CheckoutModal` удалены все `<input>` поля карты (`PAN / MM/YY / CVC`), а расчёт депозита идёт через порт `PaymentProvider` → `[SIM] MockPaymentProvider` без реального списания. | **Stripe Hosted Checkout / Stripe Elements (PCI DSS SAQ-A)**: браузер уходит на hosted-страницу PSP или рендерит изолированный `iframe` PSP. Сервер Nailix получает только `intentId`, `hostedCheckoutUrl` и подписанные Stripe Webhooks. |
| **Кто верифицирует Passkey?** | **Сервер + Браузер (разделённые роли)**: серверный stub (`POST /api/auth/webauthn/challenge` и `/verify`) генерирует **одноразовый challenge с TTL 120 с**, проверяет привязку `clientDataJSON` + флаг `UP`, но честно отдаёт `verificationTier: 'challenge_stub_only'`, `cryptographicServerVerified: false`. Подпись по SPKI сейчас проверяется на клиенте (`crypto.subtle.verify`). | **Серверная БД + COSE/SPKI Engine (Этап 4.2)**: backend хранит `publicKeySpki`, `signCount` и роли пользователей, проверяет ECDSA/RSASSA подпись над `authData \|\| SHA-256(clientDataJSON)` на сервере и выдаёт `HttpOnly; SameSite=Strict` сессионную cookie. |

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

## 4. Жёсткие запреты Спринта 4.1 (Guardrails)

1. **Zero-PCI DOM:** В `src/components/` и `src/App.tsx` запрещены любые `<input>` для номера карты (PAN), `MM/YY`, `CVV/CVC` — контролируется автоматическим тестом в `src/__tests__/paymentFoundation.test.ts`.
2. **Никаких боевых секретов в репозитории:** Ни `STRIPE_SECRET_KEY`, ни webhook signing secrets не хранятся в коде; `GET /api/payments/provider` возвращает `hostedCheckoutConfigured: false`.
3. **Честная маркировка UI/API:** UI Passkey и `/api/auth/webauthn/verify` никогда не утверждают `"server verified"` — в ответе и интерфейсе явно указано `challenge_stub_only` / `LOCAL_ONLY`.
