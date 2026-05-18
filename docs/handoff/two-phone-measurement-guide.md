# Two-Phone Measurement Guide

> 1대1 매치 sync, 카운트다운 정확도, 매치 시작 지연 같은 두 폰 시나리오를 안드로이드 실기기에서 측정하는 절차. PR 머지 후 회귀 검증 / 새 PR 효과 측정 / 베이스라인 확보에 사용.

## 0. 사전 준비

### 필요한 것
- Android 폰 2대 (USB 디버깅 활성화)
- USB-C 케이블 (또는 폰에 맞는 케이블) 2개
- Mac (Apple Silicon 또는 Intel)
- Android SDK + adb
- Java JDK (Expo SDK 54 + RN 0.81은 17 권장, 21도 작동)
- 같은 Wi-Fi (백엔드 응답 latency 변수 제거)

### 환경 변수 (zsh)
```sh
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator"
```
영구로 잡으려면 `~/.zshrc`에 추가.

### 폰 USB 디버깅 활성화
1. 설정 → 휴대전화 정보 → 빌드번호 7번 탭 → 개발자 모드 ON
2. 설정 → 개발자 옵션 → USB 디버깅 ON
3. USB 연결 후 폰에서 "USB 디버깅 허용?" 다이얼로그 → "항상 허용" 체크 + 허용

### 디바이스 인식 확인
```sh
adb devices
```
출력에 두 폰 모두 `device` 상태로 나오면 OK. `unauthorized`면 폰에서 허용 다이얼로그 다시 확인.

### 폰 모델 확인 (어느 게 누구인지)
```sh
for SERIAL in $(adb devices | awk 'NR>1 && $2=="device" {print $1}'); do
  MODEL=$(adb -s $SERIAL shell getprop ro.product.model | tr -d '\r')
  SDK=$(adb -s $SERIAL shell getprop ro.build.version.sdk | tr -d '\r')
  echo "$SERIAL: $MODEL (SDK $SDK)"
done
```

---

## 1. Release 빌드 (의미 있는 측정의 전제)

**Dev 빌드는 측정 의미 없음** — 디버거/리로드 비용 때문에 실 release보다 항상 끊김 큼.

```sh
cd <repo>/android
./gradlew :app:assembleRelease
```

- 첫 빌드: 2-5분 (gradle 의존성 다운로드)
- 캐시 이후: 20-60초
- 결과 APK: `android/app/build/outputs/apk/release/app-release.apk` (~90MB)

빌드 실패 시 흔한 원인:
- `ANDROID_HOME` 미설정
- JDK 버전 불일치 (17 → 21 또는 그 반대로 시도)
- `prebuild` 필요: `npx expo prebuild --platform android --clean`

---

## 2. 두 폰에 같은 APK 설치

```sh
APK=android/app/build/outputs/apk/release/app-release.apk
PKG=com.minheee.runnigapp.development

for SERIAL in $(adb devices | awk 'NR>1 && $2=="device" {print $1}'); do
  echo "=== $SERIAL ==="
  adb -s $SERIAL shell am force-stop $PKG
  adb -s $SERIAL install -r -d "$APK" | tail -2
done
```

`-r` reinstall, `-d` downgrade 허용. 둘 다 `Success` 나오면 OK.

설치 실패 시:
- 패키지 시그니처 불일치 → 한 번 uninstall 후 다시 install (`adb -s $SERIAL uninstall $PKG`)
- 폰이 sleep → 폰 화면 켜고 다시
- 일시적 연결 끊김 → 다시 한 번 시도

---

## 3. Logcat 모니터 (백그라운드)

```sh
# 폰별로 별도 터미널 또는 별도 monitor task로 띄움
adb -s <SERIAL> logcat -T 1 \
  | grep --line-buffered -E "FATAL EXCEPTION|AndroidRuntime: (E|F)|^E ReactNativeJS|ReactNativeJS: (Error|Warning)|Choreographer.*Skipped [0-9]{2,}|ANR in com.minheee|Displayed com.minheee"
```

**필터 의미**:
- `FATAL EXCEPTION`, `AndroidRuntime: E|F` — JVM 크래시
- `ReactNativeJS: Error|Warning` — JS 예외/경고
- `Choreographer.*Skipped [0-9]{2,}` — **frame skip ≥10** (실제 끊김 지표)
- `ANR in com.minheee` — Application Not Responding (입력 5초 무응답)
- `Displayed com.minheee` — Activity 첫 표시 시간 (콜드/웜 스타트 측정)

**해석 기준**:
- Displayed +200ms 이하: 매우 빠름 (warm/hot start)
- Displayed +300-500ms: 정상 콜드 스타트
- Displayed +800ms+: 무거움
- Skipped 10-30 frames: 일반 끊김 (~500ms 이하)
- Skipped 60+ frames: 명백한 끊김 (~1초 이상)
- Skipped 120+ frames: 큰 끊김 (2초+, UX 치명적)

---

## 4. 앱 실행

```sh
for SERIAL in $(adb devices | awk 'NR>1 && $2=="device" {print $1}'); do
  adb -s $SERIAL shell monkey -p com.minheee.runnigapp.development -c android.intent.category.LAUNCHER 1
done
```

`monkey -p ... -c LAUNCHER 1` 한 번 LAUNCHER intent로 앱 시작. PID 확인:
```sh
adb -s <SERIAL> shell pidof com.minheee.runnigapp.development
```

---

## 5. 1대1 매치 측정 시나리오

### 시나리오 A: 카운트다운 sync
1. 폰 A를 호스트로, 폰 B를 게스트로 설정 (또는 둘 다 친구로 미리 등록)
2. **두 폰 화면이 동시에 보이게 나란히 놓음** (한 손으로 두 폰 안 잡고 거치대 사용 권장)
3. 폰 A에서 1대1 대결 만들기 → 친구 초대 → 폰 B 수락 → 시작 버튼
4. **두 폰 카운트다운 숫자 비교** — 각 초마다 1씩 줄어드는지 + 두 폰이 같은 시점에 같은 숫자인지
5. 카운트다운 0 도달 시 두 폰 모두 매치 보드 화면으로 전환되는지 (메인 탭으로 떨어지지 않는지)

**기록**:
- 두 폰 카운트다운 차이 (초 단위) — 0이면 perfect, 1-2초면 양호, 5초+면 문제
- 매치 보드 진입 시점 차이
- 한 폰이 메인 탭으로 떨어졌다면 어떤 시점에 (카운트 N에서)

### 시나리오 B: 초대 카드 도착
1. 두 폰 모두 idle 상태 (러닝 탭)
2. 폰 A에서 폰 B를 초대 (친구 태그로)
3. **폰 B에 초대 카드가 뜨기까지 초 단위 측정**

**기록**:
- 0-2초: 양호 (PR #3의 polling 5s 적용 효과)
- 5-10초: idle polling 주기에 따라 정상
- 30초+: 문제 (push 또는 폴링 누락)

### 시나리오 C: 매치 진행 중 화면 안정성
1. 카운트다운 끝나고 매치 보드 진입 후 5-10초 대기
2. **매치 화면이 사라지거나 다른 화면으로 점프하는지 관찰**
3. 시간/거리/페이스 표시가 안정적으로 갱신되는지

**기록**:
- 화면 사라짐 → 어떤 시점에, 어디로
- 데이터 갱신 멈춤 → 몇 초 동안

### 시나리오 D: 탭 전환 (lazy/freezeOnBlur 효과)
1. 홈 탭 → 친구 탭 → 마이 → 홈 빠르게 누름
2. **첫 진입과 두 번째 진입 차이** 관찰

**기록**:
- 첫 진입 끊김 정도
- 두 번째부터는 즉시 표시되는지 (freezeOnBlur 효과)

---

## 6. 측정 결과 기록 형식

PR마다 다음 형식으로 기록 (`docs/perf/<pr-name>-results.md` 같은 곳):

```markdown
## PR-XX 측정 결과

### 환경
- 호스트: <폰 모델> (Android <버전>)
- 게스트: <폰 모델> (Android <버전>)
- 빌드: <커밋 SHA>

### 시나리오 A — 카운트다운 sync
- 두 폰 카운트다운 최대 차이: <N초>
- 매치 보드 진입 차이: <N초>
- 메인 탭으로 떨어진 경우: <있음/없음>

### 시나리오 B — 초대 카드 도착
- 평균 도착 시간: <N초>
- 최대 도착 시간: <N초>

### 시나리오 C — 매치 진행 중 화면
- 화면 안정: <Yes/No>
- 이상 동작: <설명>

### 시나리오 D — 탭 전환
- 첫 진입 끊김: <체감>
- 두 번째 진입: <체감>

### logcat
- Displayed: 호스트 +<N>ms, 게스트 +<N>ms
- Choreographer Skipped worst: <N frames>
- FATAL/ANR: <개수>
```

---

## 7. 자주 발생하는 문제

### "이미 참여 중인 방"
백엔드에 stale room이 남아있음. PR-01 머지 전엔 해결 어려움. 임시 우회:
```sh
adb shell pm clear com.minheee.runnigapp.development
```
다만 백엔드 데이터는 그대로. PR-01이 진짜 fix.

### 디바이스가 sleep으로 빠지면서 측정 멈춤
- 폰 화면 켜둠 (개발자 옵션 → "충전 중에는 화면 꺼지지 않음")
- 또는 `adb shell svc power stayon usb`

### 두 폰 시계가 NTP로 동기화 안 됨
- 폰 설정 → 일반 → 날짜·시간 → 자동 설정 ON
- 두 폰 모두 같은 시간 표시되는지 육안 확인

### 와이파이 latency 변수
- 두 폰 같은 AP에 연결
- 백엔드 ping 측정: `ping api.running-ground.com`

---

## 8. 빠른 측정 한 줄 스크립트 (참고)

`scripts/measure-two-phone-quick.sh`로 저장하면 편리:
```sh
#!/bin/bash
set -e
export ANDROID_HOME="$HOME/Library/Android/sdk"
PATH="$PATH:$ANDROID_HOME/platform-tools"
PKG=com.minheee.runnigapp.development
APK=android/app/build/outputs/apk/release/app-release.apk

echo "=== build ==="
(cd android && ./gradlew :app:assembleRelease -q)

for SERIAL in $(adb devices | awk 'NR>1 && $2=="device" {print $1}'); do
  MODEL=$(adb -s $SERIAL shell getprop ro.product.model | tr -d '\r')
  echo "=== install on $MODEL ($SERIAL) ==="
  adb -s $SERIAL shell am force-stop $PKG
  adb -s $SERIAL install -r -d "$APK" | tail -1
  adb -s $SERIAL logcat -c
done

echo ""
echo "Devices ready. Logcat monitors:"
for SERIAL in $(adb devices | awk 'NR>1 && $2=="device" {print $1}'); do
  echo "  adb -s $SERIAL logcat -T 1 | grep -E 'FATAL EXCEPTION|^E ReactNativeJS|Choreographer.*Skipped [0-9]{2,}|Displayed com.minheee'"
done
```

PR마다 빌드 + 설치 + 측정 흐름을 같은 명령으로 재현 가능.
