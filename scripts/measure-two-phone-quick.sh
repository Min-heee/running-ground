#!/usr/bin/env bash
#
# measure-two-phone-quick.sh — Build a release APK and install it on every
# connected adb device, then print logcat filter commands ready to paste.
#
# Usage:
#   ./scripts/measure-two-phone-quick.sh                  # build + install + print monitors
#   ./scripts/measure-two-phone-quick.sh --no-build       # skip gradle, just install latest APK
#   ./scripts/measure-two-phone-quick.sh --launch         # also auto-launch the app on each device
#   ./scripts/measure-two-phone-quick.sh --watch <SERIAL> # stream a one-device logcat after install
#
# Reads ANDROID_HOME from the environment, falls back to ~/Library/Android/sdk.
#
# See docs/handoff/two-phone-measurement-guide.md for the measurement scenarios.

set -euo pipefail

PKG="com.minheee.runnigapp.development"
APK_REL_PATH="android/app/build/outputs/apk/release/app-release.apk"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Locate the SDK
if [[ -z "${ANDROID_HOME:-}" ]]; then
  if [[ -d "$HOME/Library/Android/sdk" ]]; then
    export ANDROID_HOME="$HOME/Library/Android/sdk"
  else
    echo "❌ ANDROID_HOME 미설정 + ~/Library/Android/sdk 도 없음."
    echo "   먼저 ANDROID_HOME 환경변수를 잡거나 Android Studio로 SDK 설치하세요."
    exit 1
  fi
fi

ADB="$ANDROID_HOME/platform-tools/adb"
if [[ ! -x "$ADB" ]]; then
  echo "❌ adb를 찾을 수 없음: $ADB"
  exit 1
fi

# Parse flags
DO_BUILD=1
DO_LAUNCH=0
WATCH_SERIAL=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-build) DO_BUILD=0; shift ;;
    --launch) DO_LAUNCH=1; shift ;;
    --watch) WATCH_SERIAL="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,/^$/p' "${BASH_SOURCE[0]}" | sed 's/^# //'
      exit 0
      ;;
    *)
      echo "❌ 알 수 없는 옵션: $1"
      echo "   --help 로 사용법 확인"
      exit 1
      ;;
  esac
done

# Confirm devices
DEVICES=$("$ADB" devices | awk 'NR>1 && $2=="device" {print $1}')
if [[ -z "$DEVICES" ]]; then
  echo "❌ 연결된 device가 없음."
  echo "   adb devices 출력 확인 — unauthorized면 폰 화면에서 USB 디버깅 허용."
  echo ""
  "$ADB" devices
  exit 1
fi

DEVICE_COUNT=$(echo "$DEVICES" | wc -l | tr -d ' ')
echo "📱 연결된 device: $DEVICE_COUNT대"
for SERIAL in $DEVICES; do
  MODEL=$("$ADB" -s "$SERIAL" shell getprop ro.product.model | tr -d '\r')
  SDK=$("$ADB" -s "$SERIAL" shell getprop ro.build.version.sdk | tr -d '\r')
  echo "   $SERIAL: $MODEL (Android SDK $SDK)"
done
echo ""

# Build
if [[ "$DO_BUILD" -eq 1 ]]; then
  echo "🔨 gradle release 빌드 시작..."
  pushd android >/dev/null
  ./gradlew :app:assembleRelease -q
  popd >/dev/null
  echo "✅ 빌드 완료"
  echo ""
fi

# Verify APK exists
if [[ ! -f "$APK_REL_PATH" ]]; then
  echo "❌ APK가 없음: $APK_REL_PATH"
  echo "   --no-build 빼고 다시 실행하거나 직접 빌드하세요."
  exit 1
fi

APK_SIZE=$(du -h "$APK_REL_PATH" | cut -f1)
echo "📦 APK: $APK_REL_PATH ($APK_SIZE)"
echo ""

# Install on each device
for SERIAL in $DEVICES; do
  MODEL=$("$ADB" -s "$SERIAL" shell getprop ro.product.model | tr -d '\r')
  echo "📲 install on $MODEL ($SERIAL)"
  "$ADB" -s "$SERIAL" shell am force-stop "$PKG" || true
  "$ADB" -s "$SERIAL" install -r -d "$APK_REL_PATH" 2>&1 | tail -1
  "$ADB" -s "$SERIAL" logcat -c
done
echo ""

# Optional: launch
if [[ "$DO_LAUNCH" -eq 1 ]]; then
  for SERIAL in $DEVICES; do
    echo "▶️  launch $SERIAL"
    "$ADB" -s "$SERIAL" shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || true
  done
  echo ""
fi

# Logcat monitor commands
FILTER_REGEX='FATAL EXCEPTION|AndroidRuntime: (E|F)|^E ReactNativeJS|ReactNativeJS: (Error|Warning)|Choreographer.*Skipped [0-9]{2,}|ANR in com.minheee|Displayed com.minheee'

if [[ -n "$WATCH_SERIAL" ]]; then
  echo "👀 logcat watch on $WATCH_SERIAL (Ctrl+C로 종료)"
  echo "---"
  "$ADB" -s "$WATCH_SERIAL" logcat -T 1 \
    | grep --line-buffered -E "$FILTER_REGEX"
  exit 0
fi

echo "👀 logcat 모니터 명령 (별도 터미널에서 실행):"
echo ""
for SERIAL in $DEVICES; do
  MODEL=$("$ADB" -s "$SERIAL" shell getprop ro.product.model | tr -d '\r')
  echo "# $MODEL ($SERIAL)"
  echo "$ADB -s $SERIAL logcat -T 1 | grep --line-buffered -E '$FILTER_REGEX'"
  echo ""
done

echo "또는 단일 디바이스 watching:"
echo "  $0 --watch <SERIAL> --no-build"
echo ""
echo "📋 측정 시나리오: docs/handoff/two-phone-measurement-guide.md"
