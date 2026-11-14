# Nailix Key Rotation & Git History Purge Runbook (K-01)

> **Причина:** В истории Git до Спринта 1.5 присутствовали демонстрационный `android-build/nailix-release.keystore`, публичный пароль в `scripts/build-apk.sh`, связанный SHA-256 отпечаток в `public/.well-known/assetlinks.json` и бинарные `.apk` в `public/` и `android-build/assets/www/`.  
> **Статус в рабочей ветке:** Все скомпрометированные артефакты удалены из индекса Git (`git rm -f`), добавлены в `.gitignore`, `scripts/build-apk.sh` переведён на переменные окружения и вывод в `dist-apk/`, а `assetlinks.json` переведён в безопасный placeholder.  
> **Ограничение среды:** В Linux-контейнере CI/Sandbox отсутствуют JDK `keytool` и `git-filter-repo`. Финальные шаги ротации выполняются владельцем репозитория локально.

---

## 1. Выпуск нового release keystore (выполнить локально)

Храните файл ключа и пароли **вне репозитория** (например, в `~/.android-keys/` и менеджере паролей).

```bash
mkdir -p ~/.android-keys

keytool -genkeypair -v \
  -keystore ~/.android-keys/nailix-release-v2.jks \
  -alias nailix_upload_key \
  -keyalg RSA \
  -keysize 4096 \
  -validity 10000
```

Извлеките новый SHA-256 отпечаток сертификата (без двоеточий или в формате `AA:BB:...` для Android AssetLinks):

```bash
keytool -list -v \
  -keystore ~/.android-keys/nailix-release-v2.jks \
  -alias nailix_upload_key | grep "SHA256:"
```

Подставьте полученный SHA-256 в `public/.well-known/assetlinks.json` вместо строки `"ROTATE_KEYSTORE_AND_SET_NEW_SHA256_CERT_FINGERPRINT"`.

---

## 2. Локальная сборка APK через env-переменные

```bash
export NAILIX_KEYSTORE_PATH="$HOME/.android-keys/nailix-release-v2.jks"
export NAILIX_KEYSTORE_PASS="<your-strong-keystore-password>"
export NAILIX_KEY_PASS="<your-strong-key-password>"
export NAILIX_KEY_ALIAS="nailix_upload_key"

npm run build
bash scripts/build-apk.sh
```

Итоговый пакет записывается в `dist-apk/nailix.apk` (директория `dist-apk/` добавлена в `.gitignore` и не попадает в `public/` или Git).

---

## 3. Очистка истории Git от старого ключа и APK (владельцу репозитория)

Сделайте резервную копию клона перед переписыванием истории (`force-push` требует координации команды и повторного клонирования).

```bash
# Установка git-filter-repo (если не установлен)
pipx install git-filter-repo   # или brew install git-filter-repo

# Клонируйте свежий mirror репозитория
git clone --mirror https://github.com/PerfectFriend/Onyx-Aura.git onyx-aura-clean.git
cd onyx-aura-clean.git

# Полное удаление скомпрометированного keystore, пароля в старых ревизиях и старых APK
git filter-repo --invert-paths \
  --path android-build/nailix-release.keystore \
  --path public/nailix.apk \
  --path public/nailix.apk.idsig \
  --path android-build/assets/www/nailix.apk \
  --path android-build/assets/www/nailix.apk.idsig

# Дополнительно замените утекший литерал старого пароля в старых коммитах scripts/build-apk.sh
printf '%s\n' 'nailix123==>REMOVED_COMPROMISED_PASSWORD' > /tmp/nailix-secrets.txt
git filter-repo --replace-text /tmp/nailix-secrets.txt
rm -f /tmp/nailix-secrets.txt

# Отправка очищенной истории
git push origin --force --all
git push origin --force --tags
```

После `force-push` старый SHA-256 сертификат более никогда не должен использоваться для подписи сборок Nailix.
