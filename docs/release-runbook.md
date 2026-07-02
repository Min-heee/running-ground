# 릴리즈 런북 (Release Runbook)

스토어 제출·OTA 발행 시 반드시 지켜야 하는 규칙 모음. 실수 한 번이 전체 설치 기기의 업데이트 단절로 이어질 수 있으므로, 발행 전에 이 문서를 다시 읽는다.

## 1. Runtime Version 불변식 + 듀얼 퍼블리시 규칙

**runtimeVersion은 OTA 호환성 계약이지, 마케팅 버전이 아니다.**

- 현재 production 설치 기기의 런타임: **`0.1.0`** (`app.config.ts`의 `RUNTIME_VERSION` 상수에 고정, TestFlight 트랙은 `0.1.0-testflight`).
- `eas update`는 설치된 바이너리의 runtimeVersion과 **정확히 일치하는** 번들만 배달한다. 값이 어긋나면 에러 없이 조용히 아무 기기도 업데이트를 못 받게 된다.

규칙:

1. **runtimeVersion은 네이티브 코드가 바뀔 때만 올린다.** 네이티브 모듈 추가, 네이티브 플러그인/설정 변경, Expo SDK 업그레이드 등. **스토어(마케팅) 버전 올릴 때는 절대 같이 올리지 않는다.** (`package.json version` / `APP_VERSION` / 스토어 버전과 무관.)
2. runtimeVersion을 올려야 한다면 `app.config.ts`의 `RUNTIME_VERSION` 상수 + `package.json`의 `ota:*` 스크립트 + `eas.json` 각 프로필 env를 **한 커밋에서 함께** 바꾼다.
3. **듀얼 퍼블리시:** 런타임이 바뀐 네이티브 빌드를 배포한 뒤에도, 기존 런타임(`0.1.0`) 기기들이 전부 업데이트하기 전까지 **N주간(기본 4주) 이전 런타임 브랜치에도 같은 OTA를 함께 발행**한다. 아직 새 빌드를 설치하지 않은 기기가 수정사항을 계속 받게 하기 위함이다.

## 2. 스토어 제출 — 프로필 규칙 (절대 어기지 말 것)

- **`testflight` 프로필 빌드를 App Store에 제출하면 절대 안 된다.** 이 프로필은 production 번들 ID(`com.minheee.runnigapp`)를 쓰지만 **preview-api**(`https://preview-api.running-ground.com/api`)를 바라본다. 스토어에 올라가면 실제 유저가 preview 백엔드에 붙는다.
- **production 제출은 `production` 프로필만 사용한다:**
  - 빌드: `npm run build:ios:production` (release:check:production 게이트 포함)
  - 제출: `npm run submit:ios:production`
- TestFlight 내부 테스트 트랙: `npm run build:ios:testflight` → `npm run submit:ios:testflight` (별도 런타임 `0.1.0-testflight`, preview 채널).

## 3. 스토어 콘솔 URL

| 항목 | URL |
| --- | --- |
| 개인정보 처리방침 (스토어 콘솔에 입력) | https://api.running-ground.com/privacy-policy |
| App Store Connect (ascAppId 6762328694) | https://appstoreconnect.apple.com/apps/6762328694 |
| Google Play Console | https://play.google.com/console |
| EAS 프로젝트 대시보드 | https://expo.dev/accounts/[account]/projects/runningground |

## 4. OTA 발행 플로우

**상시 원칙: 클라이언트 변경은 기기 스모크 테스트를 통과한 뒤 OTA 배치로 묶어서 나간다.** 커밋했다고 바로 발행하지 않는다.

1. 배치에 포함될 변경이 main에 모두 머지됐는지 확인.
2. 검증: `npx tsc --noEmit` + `npm run lint` + 클라이언트 테스트 전체 통과.
3. **기기 스모크:** 실제 기기(iOS + Android 최소 1대씩)에서 핵심 플로우(로그인 → 매칭 → 측정 → 결과) 확인.
4. 발행:
   - preview 채널: `npm run ota:preview`
   - production 채널: `npm run ota:production`
   - (TestFlight 트랙: `npm run ota:testflight`)
5. 발행 후 기기에서 앱 재시작 2회(다운로드 → 적용) 후 업데이트 반영 확인.

`ota:*` 스크립트는 모두 `EXPO_RUNTIME_VERSION`을 명시적으로 고정하고 있다 (production/preview는 `0.1.0`, testflight는 `0.1.0-testflight`). **스크립트를 우회해서 `eas update`를 직접 치지 않는다** — 런타임 고정이 빠지면 아무도 안 쓰는 런타임에 발행될 수 있다.
