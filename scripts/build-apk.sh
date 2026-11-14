#!/usr/bin/env bash
set -e

echo "=== Nailix Android APK Builder ==="
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "1. Building web production distribution..."
npm run build

echo "2. Preparing Android project..."
BUILD_DIR="$ROOT_DIR/android-build"
mkdir -p "$BUILD_DIR/src/app/nailix/art"
mkdir -p "$BUILD_DIR/res/values"
mkdir -p "$BUILD_DIR/res/drawable"
mkdir -p "$BUILD_DIR/res/layout"
mkdir -p "$BUILD_DIR/bin"
mkdir -p "$BUILD_DIR/obj"
mkdir -p "$BUILD_DIR/assets/www"

# Convert/copy icon
if [ -f "$ROOT_DIR/public/pwa-192x192.png" ]; then
    convert "$ROOT_DIR/public/pwa-192x192.png" -resize 192x192 "$BUILD_DIR/res/drawable/ic_launcher.png"
fi

# Copy dist files to assets/www
rm -rf "$BUILD_DIR/assets/www/"*
cp -r "$ROOT_DIR/dist/"* "$BUILD_DIR/assets/www/"
# Fix leading slashes in index.html for Android asset loading
sed -i 's|src="/|src="|g' "$BUILD_DIR/assets/www/index.html"
sed -i 's|href="/|href="|g' "$BUILD_DIR/assets/www/index.html"
sed -i 's|"/assets/|"assets/|g' "$BUILD_DIR/assets/www/assets/"*.js 2>/dev/null || true

echo "3. Generating R.java..."
aapt package -f -m -J "$BUILD_DIR/src" -M "$BUILD_DIR/AndroidManifest.xml" -S "$BUILD_DIR/res" -I /usr/lib/android-sdk/platforms/android-23/android.jar

echo "4. Compiling Java sources..."
rm -rf "$BUILD_DIR/obj/"*
javac -encoding UTF-8 -source 1.8 -target 1.8 -bootclasspath /usr/lib/android-sdk/platforms/android-23/android.jar -d "$BUILD_DIR/obj" "$BUILD_DIR/src/app/nailix/art/"*.java

echo "5. Converting bytecode to Dalvik dex..."
/usr/bin/dx --dex --output="$BUILD_DIR/bin/classes.dex" "$BUILD_DIR/obj"

echo "6. Packaging raw APK..."
rm -f "$BUILD_DIR/bin/"*.apk
aapt package -f -M "$BUILD_DIR/AndroidManifest.xml" -S "$BUILD_DIR/res" -A "$BUILD_DIR/assets" -I /usr/lib/android-sdk/platforms/android-23/android.jar -F "$BUILD_DIR/bin/nailix-unaligned.apk"

cd "$BUILD_DIR/bin"
aapt add nailix-unaligned.apk classes.dex

echo "7. Running zipalign..."
zipalign -f -v 4 nailix-unaligned.apk nailix-aligned.apk > /dev/null

echo "8. Signing APK with release keystore..."
KEYSTORE_PATH="${NAILIX_KEYSTORE_PATH:-$HOME/.android/nailix-release.keystore}"
KS_PASS="${NAILIX_KEYSTORE_PASS:?Error: set NAILIX_KEYSTORE_PASS in your environment before signing}"
KEY_PASS="${NAILIX_KEY_PASS:-$KS_PASS}"
KEY_ALIAS="${NAILIX_KEY_ALIAS:-nailix}"

if [ ! -f "$KEYSTORE_PATH" ]; then
    mkdir -p "$(dirname "$KEYSTORE_PATH")"
    keytool -genkey -v -keystore "$KEYSTORE_PATH" -alias "$KEY_ALIAS" -keyalg RSA -keysize 2048 -validity 10000 -storepass "$KS_PASS" -keypass "$KEY_PASS" -dname "CN=Nailix, OU=Mobile, O=NailixArt, L=Barcelona, ST=Catalonia, C=ES"
fi

APK_OUT_DIR="$ROOT_DIR/dist-apk"
mkdir -p "$APK_OUT_DIR"
apksigner sign --ks "$KEYSTORE_PATH" --ks-pass "pass:$KS_PASS" --key-pass "pass:$KEY_PASS" --out "$APK_OUT_DIR/nailix.apk" nailix-aligned.apk

echo "9. Verifying APK signature..."
apksigner verify --verbose "$APK_OUT_DIR/nailix.apk"

echo "=== SUCCESS: APK created at dist-apk/nailix.apk (outside public/ and gitignored) ==="
ls -lh "$APK_OUT_DIR/nailix.apk"
