# Code Quality Gate

출시 전에는 아래 게이트를 같은 순서로 통과한 뒤 Android preview, iOS TestFlight 빌드로 넘어간다. 목적은 기능 추가가 아니라 “지금 코드가 타입, 린트, 핵심 로직, 백엔드 기본 동작, preview 환경까지 안전한지” 확인하는 것이다.

## 반드시 실행하는 순서

```bash
npm run typecheck
npm run lint
npm run test
npm run backend:smoke
npm run release:gate:preview
```

1. `npm run typecheck`
   - 목적: TypeScript 타입, import 경로, Expo Router 화면 export가 깨졌는지 확인한다.
   - 실패 시 먼저 볼 파일: 최근 수정한 `src/**`, `app/**`, `src/domain/**`, `src/services/**`, `tsconfig.json`.

2. `npm run lint`
   - 목적: 사용하지 않는 import/변수, React hook dependency, 위험한 코드 패턴을 잡는다.
   - 실패 시 먼저 볼 파일: 린트가 출력한 파일, 특히 `src/features/runs/**`, `src/components/**`, `app/**`.
   - 참고: 기존 warning은 남아 있을 수 있지만, 새로 만든 warning은 되도록 바로 없앤다.

3. `npm run test`
   - 목적: UI가 아닌 순수 로직 테스트를 확인한다.
   - 중점 검증: 포맷팅, 러닝 거리/페이스 계산, 대결 승패, 그룹 랭킹 정렬, 포인트/리그 점수, 파티런 상태 흐름.
   - 실패 시 먼저 볼 파일: `src/**/*.test.ts`, 테스트 대상 utils/hook/state machine 파일.

4. `npm run backend:smoke`
   - 목적: 로컬 백엔드가 시작 가능한지, 기본 API 흐름이 망가지지 않았는지 빠르게 확인한다.
   - 실패 시 먼저 볼 파일: `backend/src/server.mjs`, `backend/src/routes/**`, `backend/src/repositories/**`, `backend/src/storage/**`, `backend/.env*`.

5. `npm run release:gate:preview`
   - 목적: preview 출시 환경 점검을 한 번에 실행한다.
   - 내부 확인: frontend preview env, backend preview env, preview public smoke.
   - 실패 시 먼저 볼 파일: `package.json`, `eas.json`, `.env`, `.env.preview.example`, `backend/.env.preview`, `scripts/run-release-gate.mjs`, `scripts/check-preview-public-api.mjs`.

## 실패했을 때 보는 기준

- 타입 에러: 에러가 난 파일만 보지 말고, 해당 타입이 정의된 `src/domain/**` 또는 API 응답 타입이 있는 `src/lib/api/types/**`, `src/services/**`를 같이 본다.
- import 에러: 화면 이동 파일이면 `app/**`의 thin route export와 `src/features/*/screens/**` 실제 파일명이 맞는지 확인한다.
- lint hook 경고: 무작정 dependency를 추가하지 말고, effect 안 로직을 hook/util로 빼야 하는지 먼저 본다.
- 테스트 실패: 테스트를 수정하기 전에 실제 동작이 바뀐 것인지, 테스트 fixture만 오래된 것인지 구분한다.
- backend smoke 실패: 서버 route 분리 후 handler 등록이 빠졌는지, store migration이 깨졌는지 확인한다.
- release gate 실패: Preview API 주소가 `https://preview-api.running-ground.com/api`인지 먼저 확인한다. 최근 파티런 초대 문제처럼 iOS/Android가 서로 다른 API를 보면 초대코드가 안 맞는다.

## Android preview 빌드 전 체크

```bash
npm run release:gate:preview
npm run build:android:preview
```

- `eas.json`의 `preview` profile이 `channel: preview`인지 확인한다.
- `EXPO_PUBLIC_API_BASE_URL`이 `https://preview-api.running-ground.com/api`인지 확인한다.
- `EXPO_PUBLIC_USE_MOCK_API=false`인지 확인한다.
- Preview 서버 health가 정상인지 확인한다.

```bash
curl -fsS https://preview-api.running-ground.com/api/health
```

- Android 실기기 QA 전에는 남은 대결방/세션이 없는지 확인한다.
- 파티런 QA는 Android + iOS 둘 다 앱 완전 종료 후 재실행하고 새 방/새 초대코드로 시작한다.
- Android 렉 이슈가 재현되면 `docs/android-performance-report.md`와 `docs/android-live-match-performance-qa.md` 기준으로 FPS/렌더 로그를 같이 기록한다.

## iOS TestFlight 빌드 전 체크

```bash
npm run release:gate:testflight -- --admin-token PREVIEW_ADMIN_TOKEN
npm run build:ios:testflight
```

- TestFlight profile은 store 배포용이지만 `channel: preview`를 사용한다.
- TestFlight도 실기기 QA 단계에서는 Production API가 아니라 Preview API를 봐야 한다.
- `eas.json`의 `testflight.env.EXPO_PUBLIC_API_BASE_URL`이 `https://preview-api.running-ground.com/api`인지 확인한다.
- EAS preview 환경변수도 같은 주소로 맞춘다.

```bash
npm run preview:sync-eas-env -- --api-base-url https://preview-api.running-ground.com/api
```

- TestFlight 업로드 후에는 앱을 완전히 종료했다가 다시 켜서 OTA/환경 반영을 확인한다.
- 로그인 화면 또는 관리자 화면에서 현재 API 주소가 Preview인지 확인할 수 있다.

## 빌드 이후 실기기 QA

- Android 설치/첫 동기화: `docs/android-install-and-first-sync.md`
- TestFlight 실기기 QA: `docs/testflight-real-device-qa.md`
- 파티런/대결 QA: `docs/match-real-device-qa.md`
- Android 성능 점검: `docs/android-performance-report.md`
- 기기 연동 QA: `docs/device-integration-qa-matrix.md`

## 커밋 기준

- 위 5개 게이트가 모두 통과하면 커밋한다.
- 문서만 수정한 경우에도 최소 `git diff --check`는 실행한다.
- 코드 변경이 포함되면 `npm run typecheck`, `npm run lint`, `npm run test`는 기본으로 실행한다.
- 백엔드 route, storage, repository가 바뀌면 `npm run backend:smoke`까지 실행한다.
- Preview/빌드 환경이 바뀌면 `npm run release:gate:preview`까지 실행한다.
