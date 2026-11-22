# Текущее задание

**Спринт 4.5 (V-01…V-06, V-08):** 🟢 ПРИНЯТ Гришей  
**Этап 4 (4.1→4.5):** 🟢 ЗАКРЫТ (foundation + deploy/refund/invite hardening)

**Сейчас:** пауза или слово куратора по **Этапу 5**.  
**Бэклог:** V-07 / Q-10 (разрез `salonRepository`, ID вместо `Date.now()`, i18n тостов, `GEMINI_API_KEY`, prod `tsx`→compiled JS).

**Владельцу Cloud Run / prod:**  
`NAILIX_SESSION_SECRET`, `NAILIX_ALLOWED_ORIGINS` / `APP_URL`, `TRUST_PROXY=1`, `min instances = max = 1` (из‑за `.data`), `STRIPE_*`, `NAILIX_MASTER_INVITE_CODES` (коды ≥16, на сервере хранятся хэши).

**Журнал:** [`docs/DEVELOPMENT_JOURNAL.md`](./DEVELOPMENT_JOURNAL.md)
