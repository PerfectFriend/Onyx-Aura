// =============================================================================
// Stage 5 · Sprint 5.1 — Hook, Storage & Server-Code Localization (V-07)
// - Eliminates hardcoded Cyrillic strings from hooks and storage/identity
//   infrastructure layers while keeping explicit EN/RU translations cleanly typed.
// =============================================================================

import { detectUserLanguage, SupportedLanguage } from './translations';

export type ServerErrorCode =
  | 'origin_untrusted'
  | 'rate_limited'
  | 'invalid_request'
  | 'challenge_invalid'
  | 'challenge_expired'
  | 'credential_conflict'
  | 'invite_invalid'
  | 'session_required'
  | 'credential_not_found'
  | 'signature_invalid'
  | 'quote_invalid'
  | 'checkout_conflict'
  | 'intent_not_found'
  | 'webhook_invalid'
  | 'stripe_unavailable'
  | 'booking_not_eligible'
  | 'review_artist_mismatch'
  | 'review_duplicate';

export type MessageLocale = 'en' | 'ru';

export type AppMessageKey =
  | 'booking.artist_missing.title'
  | 'booking.artist_missing.message'
  | 'booking.saved_local.title'
  | 'booking.saved_local.message'
  | 'booking.hosted_pending.title'
  | 'booking.hosted_pending.message'
  | 'booking.intent_missing.title'
  | 'booking.intent_missing.message'
  | 'booking.unmatched_capture.title'
  | 'booking.unmatched_capture.message'
  | 'booking.captured.title'
  | 'booking.captured.message'
  | 'booking.disputed.title'
  | 'booking.disputed.message'
  | 'booking.partially_refunded.title'
  | 'booking.partially_refunded.message'
  | 'booking.released.title'
  | 'booking.released.message'
  | 'booking.incomplete.title'
  | 'booking.incomplete.message'
  | 'booking.awaiting.title'
  | 'booking.awaiting.message'
  | 'identity.register_server_title'
  | 'identity.register_local_title'
  | 'identity.register_server_msg'
  | 'identity.register_local_msg'
  | 'identity.register_error'
  | 'identity.signin_server_title'
  | 'identity.signin_local_sig_title'
  | 'identity.signin_local_presence_title'
  | 'identity.signin_server_msg'
  | 'identity.signin_local_msg'
  | 'identity.signin_sig_verified'
  | 'identity.signin_presence_only'
  | 'identity.signin_error'
  | 'identity.sim_create_title'
  | 'identity.sim_create_msg'
  | 'identity.sim_create_error'
  | 'identity.sim_signin_title'
  | 'identity.sim_signin_msg'
  | 'identity.sim_signin_error'
  | 'identity.sim_missing_error'
  | 'identity.signout_title'
  | 'identity.signout_msg'
  | 'identity.signout_error'
  | 'identity.revoke_error'
  | 'identity.server_rejected_status'
  | 'storage.idb_unavailable'
  | 'storage.rw_degraded'
  | 'storage.unreadable_collection'
  | 'storage.corrupt_collection'
  | 'storage.quarantined_records'
  | 'storage.unreadable_record'
  | 'storage.corrupt_record'
  | 'storage.meta_unreadable'
  | 'storage.future_schema'
  | 'storage.outbox_threshold'
  | 'storage.readonly_future_error'
  | 'storage.unreadable_write_blocked'
  | 'app.calendar_toast_title'
  | 'app.reset_toast_title'
  | 'app.reset_keep_identity'
  | 'app.reset_clear_all'
  | 'app.review_save_error'
  | 'app.anchor_save_error'
  | 'app.salon_save_error'
  | 'app.reset_error'
  | 'reviews.badge_confirmed_booking'
  | 'reviews.server_banner_title'
  | 'reviews.server_banner_desc'
  | 'reviews.gate_signin_required'
  | 'reviews.gate_no_booking'
  | 'reviews.submit_error';

type MessageDictionary = Record<AppMessageKey, string>;

const MESSAGE_BUNDLES: Record<MessageLocale, MessageDictionary> = {
  en: {
    'booking.artist_missing.title': '[SIM] Master Profile Not Matched',
    'booking.artist_missing.message': 'Please pick a master artist manually for "{lookTitle}".',
    'booking.saved_local.title': 'Booking Saved Locally',
    'booking.saved_local.message': '{artistName} · {date} {timeSlot} ([SIM] deposit).',
    'booking.hosted_pending.title': 'Booking Awaiting Stripe Checkout',
    'booking.hosted_pending.message': '{artistName} · {date} {timeSlot}',
    'booking.intent_missing.title': 'Payment Status Unavailable',
    'booking.intent_missing.message':
      'Server did not return confirmation for payment {intentId}. Please check "My Bookings".',
    'booking.unmatched_capture.title': 'Payment Received — Confirm Studio Slot',
    'booking.unmatched_capture.message':
      'Deposit ${amount} USD confirmed ({intentShort}...){slotInfo}, but no local booking was found on this device.',
    'booking.captured.title': 'Stripe Deposit Confirmed',
    'booking.captured.message': '{artistName} · ${amount} USD ({intentShort}...)',
    'booking.disputed.title': 'Payment Dispute Opened',
    'booking.disputed.message': 'Booking {bookingRef} is awaiting Stripe dispute review.',
    'booking.partially_refunded.title': 'Partial Refund Issued',
    'booking.partially_refunded.message':
      'Refunded ${amount} USD for booking {bookingRef}; remaining deposit stays active.',
    'booking.released.title': 'Payment Refunded',
    'booking.released.message': 'Booking {bookingRef} closed with status {status}.',
    'booking.incomplete.title': 'Payment Not Completed',
    'booking.incomplete.message': 'Server status for {bookingRef}: {status}.',
    'booking.awaiting.title': 'Awaiting Stripe Confirmation',
    'booking.awaiting.message': 'Booking {bookingRef} saved as pending ({status}).',

    'identity.register_server_title': 'Passkey Server SPKI Active',
    'identity.register_local_title': 'Passkey (WebAuthn) [LOCAL_ONLY]',
    'identity.register_server_msg':
      'Key "{displayName}" registered ({role}) and bound to an HttpOnly cookie.',
    'identity.register_local_msg': 'Key "{displayName}" saved locally on this device.',
    'identity.register_error': 'Failed to create Passkey.',
    'identity.signin_server_title': 'Passkey Server SPKI + HttpOnly Session',
    'identity.signin_local_sig_title': 'Passkey Signature Confirmed [LOCAL_ONLY]',
    'identity.signin_local_presence_title': 'Passkey Presence Only [LOCAL_ONLY]',
    'identity.signin_server_msg':
      '{displayName}: SPKI signature confirmed on server + HttpOnly session (TTL 8h).',
    'identity.signin_local_msg': '{displayName}: {detail} (TTL 8h).',
    'identity.signin_sig_verified': 'SPKI cryptographic signature checked locally',
    'identity.signin_presence_only': 'presence confirmed only (without SPKI key)',
    'identity.signin_error': 'Failed to sign in with Passkey.',
    'identity.sim_create_title': '[SIM] Demo Passkey Preview',
    'identity.sim_create_msg':
      '[SIM] Profile "{displayName}" activated locally (without WebAuthn).',
    'identity.sim_create_error': 'Failed to create [SIM] key.',
    'identity.sim_signin_title': '[SIM] Demo Passkey Sign-In',
    'identity.sim_signin_msg': '[SIM] Signed in with stored key "{displayName}".',
    'identity.sim_signin_error': 'Failed to sign in with [SIM] key.',
    'identity.sim_missing_error': 'No saved [SIM] demo key found. Create one [SIM] Passkey first.',
    'identity.signout_title': 'Passkey Session Ended',
    'identity.signout_msg': 'Session ended (client state and HttpOnly cookie cleared).',
    'identity.signout_error': 'Failed to end session in storage.',
    'identity.revoke_error': 'Failed to remove key from storage.',
    'identity.server_rejected_status': 'Server rejected Passkey registration ({status}).',

    'storage.idb_unavailable':
      'IndexedDB is unavailable ({reason}). Temporary in-memory mode enabled for this session.',
    'storage.rw_degraded':
      'Read/write fault ({key}): {reason}. Stored records on disk are protected from overwrite.',
    'storage.unreadable_collection':
      'Could not read "{key}" ({error}) — stored data left untouched, safe mode active.',
    'storage.corrupt_collection':
      'Collection "{key}" had invalid structure and was moved to quarantine ({qKey}).',
    'storage.quarantined_records':
      'Quarantined {count} invalid record(s) from "{key}" (reason: {reasons}). Preserved {validCount} valid record(s).',
    'storage.unreadable_record':
      'Could not read "{key}" ({error}) — stored data left untouched.',
    'storage.corrupt_record':
      'Record "{key}" ({reason}) was moved to quarantine ({qKey}).',
    'storage.meta_unreadable':
      'Could not read schema metadata ({error}) — schema overwrite disabled.',
    'storage.future_schema':
      'Database was created by a newer version (schema v{storedVersion} > current v{currentVersion}). Read-only mode enabled.',
    'storage.outbox_threshold':
      '{count} unsynced changes accumulated in the local Outbox queue.',
    'storage.readonly_future_error':
      'Storage is open in read-only mode (newer schema version detected).',
    'storage.unreadable_write_blocked':
      'Collection "{key}" failed to read on startup; writes are blocked to prevent data loss.',

    'app.calendar_toast_title': 'Calendar',
    'app.reset_toast_title': 'Local Database Reset',
    'app.reset_keep_identity': 'Demo data restored to defaults. Passkey credentials preserved.',
    'app.reset_clear_all': 'Demo data and local Passkey credentials cleared to defaults.',
    'app.review_save_error': 'Failed to save review locally.',
    'app.anchor_save_error': 'Failed to save map anchor.',
    'app.salon_save_error': 'Failed to update salon address.',
    'app.reset_error': 'Failed to reset local database.',
    'reviews.badge_confirmed_booking': 'Confirmed after completed booking',
    'reviews.server_banner_title': 'Server-Confirmed Reviews',
    'reviews.server_banner_desc':
      'Every server review requires an active Passkey session and a captured booking deposit owned by that session.',
    'reviews.gate_signin_required':
      'Sign in with a Server Passkey and complete a studio booking deposit to post a review.',
    'reviews.gate_no_booking':
      'No captured studio bookings without a review were found for your active Passkey session.',
    'reviews.submit_error': 'Unable to submit booking review.',
  },
  ru: {
    'booking.artist_missing.title': '[SIM] Профиль мастера не выбран',
    'booking.artist_missing.message': 'Выберите мастера вручную для дизайна «{lookTitle}».',
    'booking.saved_local.title': 'Запись сохранена локально',
    'booking.saved_local.message': '{artistName} · {date} {timeSlot} (депозит [SIM]).',
    'booking.hosted_pending.title': 'Бронь ожидает оплаты Stripe',
    'booking.hosted_pending.message': '{artistName} · {date} {timeSlot}',
    'booking.intent_missing.title': 'Статус оплаты недоступен',
    'booking.intent_missing.message':
      'Сервер не вернул подтверждение для платежа {intentId}. Проверьте вкладку «Мои записи».',
    'booking.unmatched_capture.title': 'Платёж получен — подтвердите время в салоне',
    'booking.unmatched_capture.message':
      'Депозит ${amount} USD подтверждён ({intentShort}...){slotInfo}, но локальная бронь на этом устройстве не найдена.',
    'booking.captured.title': 'Депозит Stripe подтверждён',
    'booking.captured.message': '{artistName} · ${amount} USD ({intentShort}...)',
    'booking.disputed.title': 'По платежу открыт спор (Dispute)',
    'booking.disputed.message': 'Бронь {bookingRef} ожидает разбора спора Stripe.',
    'booking.partially_refunded.title': 'Выполнен частичный возврат',
    'booking.partially_refunded.message':
      'Возвращено ${amount} USD по брони {bookingRef}; остаток депозита активен.',
    'booking.released.title': 'Платёж возвращён',
    'booking.released.message': 'Статус сервера для {bookingRef}: {status}.',
    'booking.incomplete.title': 'Оплата не завершена',
    'booking.incomplete.message': 'Статус сервера для {bookingRef}: {status}.',
    'booking.awaiting.title': 'Ожидаем подтверждения от Stripe',
    'booking.awaiting.message': 'Бронь {bookingRef} сохранена со статусом pending ({status}).',

    'identity.register_server_title': 'Passkey Server SPKI Active',
    'identity.register_local_title': 'Passkey (WebAuthn) [LOCAL_ONLY]',
    'identity.register_server_msg':
      'Ключ «{displayName}» зарегистрирован ({role}) и закреплён HttpOnly cookie.',
    'identity.register_local_msg': 'Ключ «{displayName}» сохранён в устройстве локально.',
    'identity.register_error': 'Не удалось создать Passkey.',
    'identity.signin_server_title': 'Passkey Server SPKI + HttpOnly Session',
    'identity.signin_local_sig_title': 'Passkey Signature Confirmed [LOCAL_ONLY]',
    'identity.signin_local_presence_title': 'Passkey Presence Only [LOCAL_ONLY]',
    'identity.signin_server_msg':
      '{displayName}: подпись SPKI подтверждена на сервере + HttpOnly сессия (TTL 8ч).',
    'identity.signin_local_msg': '{displayName}: {detail} (TTL 8ч).',
    'identity.signin_sig_verified': 'криптоподпись SPKI проверена локально',
    'identity.signin_presence_only': 'подтверждено только присутствие (без SPKI ключа)',
    'identity.signin_error': 'Не удалось выполнить вход по Passkey.',
    'identity.sim_create_title': '[SIM] Demo Passkey Preview',
    'identity.sim_create_msg':
      '[SIM] Профиль «{displayName}» активирован локально (без WebAuthn).',
    'identity.sim_create_error': 'Не удалось создать [SIM] ключ.',
    'identity.sim_signin_title': '[SIM] Demo Passkey Sign-In',
    'identity.sim_signin_msg': '[SIM] Вход выполнен с сохранённым ключом «{displayName}».',
    'identity.sim_signin_error': 'Не удалось войти с [SIM] ключом.',
    'identity.sim_missing_error': 'Нет сохранённого [SIM] демо-ключа. Создайте [SIM] Passkey один раз.',
    'identity.signout_title': 'Passkey Session Ended',
    'identity.signout_msg': 'Сеанс завершён (клиент и HttpOnly cookie).',
    'identity.signout_error': 'Не удалось завершить сеанс в хранилище.',
    'identity.revoke_error': 'Не удалось удалить ключ из хранилища.',
    'identity.server_rejected_status': 'Сервер отклонил регистрацию Passkey ({status}).',

    'storage.idb_unavailable':
      'IndexedDB недоступна ({reason}). Включён временный режим памяти до конца сеанса.',
    'storage.rw_degraded':
      'Сбой чтения/записи ({key}): {reason}. Данные на диске защищены от перезаписи.',
    'storage.unreadable_collection':
      'Не удалось прочитать «{key}» ({error}) — данные на диске не затронуты, активен безопасный режим.',
    'storage.corrupt_collection':
      'Коллекция «{key}» имела некорректный формат и перенесена в карантин ({qKey}).',
    'storage.quarantined_records':
      'Из «{key}» отфильтровано записей в карантин ({count} шт., причина: {reasons}). Остальные {validCount} сохранены.',
    'storage.unreadable_record':
      'Не удалось прочитать «{key}» ({error}) — данные на диске не затронуты.',
    'storage.corrupt_record':
      'Запись «{key}» ({reason}) перемещена в карантин ({qKey}).',
    'storage.meta_unreadable':
      'Не удалось прочитать метаданные схемы ({error}) — перезапись схемы отключена.',
    'storage.future_schema':
      'База создана более новой версией (схема v{storedVersion} > текущей v{currentVersion}). Включён режим только для чтения без перезаписи.',
    'storage.outbox_threshold':
      'В локальной очереди Outbox накопилось {count} несинхронизированных изменений.',
    'storage.readonly_future_error':
      'Хранилище открыто в режиме только для чтения (обнаружена более новая схема данных).',
    'storage.unreadable_write_blocked':
      'Коллекция «{key}» не была прочитана при загрузке; запись заблокирована, чтобы не потерять данные на диске.',

    'app.calendar_toast_title': 'Календарь',
    'app.reset_toast_title': 'Локальная база сброшена',
    'app.reset_keep_identity': 'Демо-данные восстановлены до исходных значений. Ключи Passkey сохранены.',
    'app.reset_clear_all': 'Демо-данные и локальные ключи Passkey очищены до исходного состояния.',
    'app.review_save_error': 'Не удалось сохранить отзыв локально.',
    'app.anchor_save_error': 'Не удалось сохранить точку карты.',
    'app.salon_save_error': 'Не удалось обновить адрес салона.',
    'app.reset_error': 'Ошибка сброса локальной базы.',
    'reviews.badge_confirmed_booking': 'Подтверждено после завершённой брони',
    'reviews.server_banner_title': 'Отзывы с серверной привязкой к брони',
    'reviews.server_banner_desc':
      'Сервер принимает отзыв только при активной Passkey-сессии и оплаченном/завершённом депозите владельца.',
    'reviews.gate_signin_required':
      'Войдите через серверный Passkey и завершите оплату брони, чтобы оставить отзыв мастеру.',
    'reviews.gate_no_booking':
      'Для вашей Passkey-сессии пока нет оплаченных броней без оставленного отзыва.',
    'reviews.submit_error': 'Не удалось отправить отзыв на сервер.',
  },
};

const SERVER_ERROR_TRANSLATIONS: Record<MessageLocale, Record<ServerErrorCode, string>> = {
  en: {
    origin_untrusted: 'Request origin is not trusted by server policy.',
    rate_limited: 'Too many requests. Please wait before trying again.',
    invalid_request: 'Invalid request payload.',
    challenge_invalid: 'WebAuthn challenge is missing or already consumed.',
    challenge_expired: 'WebAuthn challenge expired. Please try again.',
    credential_conflict: 'This Passkey credential is already registered.',
    invite_invalid: 'Master invite code is invalid or already used.',
    session_required: 'An active server-confirmed Passkey session is required.',
    credential_not_found: 'Registered Passkey credential was not found on server.',
    signature_invalid: 'WebAuthn cryptographic signature check failed.',
    quote_invalid: 'Selected artist, service, or tip configuration is invalid.',
    checkout_conflict: 'This booking reference already has an active Stripe checkout with different parameters.',
    intent_not_found: 'Deposit payment intent was not found.',
    webhook_invalid: 'Invalid Stripe webhook signature or payload.',
    stripe_unavailable: 'Stripe Hosted Checkout is currently unavailable on the server.',
    booking_not_eligible:
      'No captured or completed booking owned by your active Passkey session was found.',
    review_artist_mismatch: 'Selected artist does not match the booked appointment.',
    review_duplicate: 'A review has already been recorded for this booking reference.',
  },
  ru: {
    origin_untrusted: 'Источник запроса не разрешён политикой безопасности сервера.',
    rate_limited: 'Слишком много запросов. Повторите попытку позже.',
    invalid_request: 'Некорректные параметры запроса.',
    challenge_invalid: 'Одноразовый WebAuthn challenge не найден или уже использован.',
    challenge_expired: 'Срок действия WebAuthn challenge истёк. Повторите попытку.',
    credential_conflict: 'Этот Passkey уже зарегистрирован за другим владельцем.',
    invite_invalid: 'Инвайт-код мастера неверен или уже был использован.',
    session_required: 'Требуется активная серверная Passkey-сессия.',
    credential_not_found: 'Учётная запись Passkey не найдена на сервере.',
    signature_invalid: 'Проверка криптографической подписи Passkey не пройдена.',
    quote_invalid: 'Выбрана недопустимая пара мастер/услуга или размер чаевых.',
    checkout_conflict: 'Для этой брони уже открыта активная сессия оплаты Stripe с другими параметрами.',
    intent_not_found: 'Платёжный intent депозита не найден.',
    webhook_invalid: 'Неверная подпись или формат webhook Stripe.',
    stripe_unavailable: 'Серверная оплата Stripe Hosted Checkout сейчас недоступна.',
    booking_not_eligible:
      'Для текущей Passkey-сессии не найдена оплаченная или завершённая бронь.',
    review_artist_mismatch: 'Выбранный мастер не совпадает с указанной бронью.',
    review_duplicate: 'Отзыв для этой брони уже был опубликован ранее.',
  },
};

export function resolveMessageLocale(language?: SupportedLanguage): MessageLocale {
  const effective = language ?? detectUserLanguage();
  return effective === 'ru' ? 'ru' : 'en';
}

export function formatAppMessage(
  key: AppMessageKey,
  params: Record<string, string | number> = {},
  language?: SupportedLanguage
): string {
  const locale = resolveMessageLocale(language);
  const template = MESSAGE_BUNDLES[locale][key] ?? MESSAGE_BUNDLES.en[key];
  return template.replace(/\{(\w+)\}/g, (_match, token: string) =>
    token in params ? String(params[token]) : ''
  );
}

export function translateServerErrorCode(
  code: unknown,
  fallbackMessage?: string,
  language?: SupportedLanguage
): string {
  const locale = resolveMessageLocale(language);
  if (typeof code === 'string' && code in SERVER_ERROR_TRANSLATIONS[locale]) {
    return SERVER_ERROR_TRANSLATIONS[locale][code as ServerErrorCode];
  }
  return fallbackMessage || SERVER_ERROR_TRANSLATIONS[locale].invalid_request;
}
