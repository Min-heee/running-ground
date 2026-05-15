# Backend Server Refactor Plan

기준 문서: `docs/code-quality-audit.md`

대상 파일: `backend/src/server.mjs`

현재 상태: `server.mjs`는 약 6,391줄이며 HTTP 서버 부트스트랩, CORS/응답 처리, repository 생성, 인증, request validation, response builder, running match business flow, admin/market/race/social handler가 한 파일에 모여 있다.

이번 문서는 코드 변경 없이, 기존 `backend:smoke`, backend route/contract test, release gate를 유지하면서 안전하게 분리하는 순서를 정리한다.

## 1. 현재 `server.mjs` 책임 분석

`server.mjs`는 현재 아래 책임을 동시에 가진다.

| 책임 | 현재 위치/예시 | 문제 |
| --- | --- | --- |
| HTTP bootstrap | `createServer`, timeout 설정, graceful shutdown | 서버 실행 코드와 도메인 코드가 결합되어 테스트/분리 난이도가 높음 |
| CORS/응답 처리 | `buildCorsHeaders`, `sendJson`, `sendError`, `parseJsonBody` | 모든 route handler가 공통 HTTP 유틸에 직접 의존 |
| repository wiring | `getAuthRepository`, `getRunsRepository`, `getMarketRepository` 등 | JSON/Postgres fallback 구성이 라우트/서비스 로직과 섞임 |
| auth/session | `getAccessToken`, `findUserByToken`, `requireUser`, `loadCurrentUserReadContext` | route/controller/service 어디에도 명확히 속하지 않음 |
| validation | `validateRequiredString`, `validateDistanceKm`, `validatePhoneNumber` 등 | request parsing과 도메인 검증이 한 파일에서 증가 |
| response builder | `buildProfile`, `buildHomeSummary`, `buildRunDetail`, `buildAdmin*` | 순수 변환 로직인데 server 파일을 크게 만듦 |
| running match domain | queue/session/room/progress/live share/stale cleanup | 가장 위험한 도메인 흐름이 2,000줄 이상 집중 |
| route controllers | `handleCreateTrackedRun`, `handleRequestDuelMatch`, `handleCreateRunningMatchRoom` 등 | HTTP와 business flow가 결합 |
| route dispatch dependency bag | `createApiRouteHandler({...})`에 수십 개 함수 주입 | 이미 routes는 분리됐지만 `server.mjs`가 모든 구현을 계속 소유 |

## 2. 권장 분리 구조

최종 목표 구조는 아래처럼 잡는다.

```text
backend/src/
  http/
    createHttpServer.mjs
    cors.mjs
    response.mjs
    requestBody.mjs
    errors.mjs
  app/
    createAppContext.mjs
    repositories.mjs
    authContext.mjs
  validators/
    commonValidators.mjs
    authValidators.mjs
    runValidators.mjs
    matchValidators.mjs
  controllers/
    authController.mjs
    runController.mjs
    runningMatchController.mjs
    profileController.mjs
    adminController.mjs
  services/
    authService.mjs
    runService.mjs
    runningMatch/
      matchQueueService.mjs
      matchSessionService.mjs
      matchRoomService.mjs
      matchProgressService.mjs
      staleMatchCleanupService.mjs
      liveRunShareService.mjs
  responseBuilders/
    profileResponse.mjs
    homeResponse.mjs
    runResponse.mjs
    adminResponse.mjs
    integrationResponse.mjs
    runningMatchResponse.mjs
  routes/
    index.mjs
    authRoutes.mjs
    runRoutes.mjs
    runningMatchRoutes.mjs
    ...
```

역할 기준은 다음과 같다.

| 계층 | 역할 | 규칙 |
| --- | --- | --- |
| `routes/` | URL/method 매칭만 담당 | request body parsing, mutation 로직 최소화 |
| `controllers/` | request 파싱, auth 확인, service 호출, response status 결정 | store 직접 조작 금지 또는 최소화 |
| `services/` | 도메인 business flow | HTTP request/response 객체 의존 금지 |
| `repositories/` | 저장소 접근 | 이미 존재하는 repository 패턴 유지 |
| `responseBuilders/` | API payload 변환 | 부작용 없는 순수 함수 중심 |
| `validators/` | request value 검증/정규화 | `ApiError` 또는 validation error를 명확히 사용 |
| `http/` | CORS, JSON, 에러, body parser, 서버 bootstrap | 도메인 import 금지 |
| `app/` | config/repository/context wiring | bootstrapping과 business flow 사이 완충 |

## 3. 가장 먼저 분리할 안전한 route 후보

1차는 mutation이 적고 smoke 영향이 작거나 기존 테스트로 확인하기 쉬운 영역부터 분리한다.

| 우선순위 | 후보 | 이유 | 위험도 |
| --- | --- | --- | --- |
| 1 | HTTP 유틸: `ApiError`, `sendJson`, `sendError`, `parseJsonBody`, CORS | 도메인 동작 변경 없이 파일 크기를 줄일 수 있음 | Low |
| 2 | Health/Admin status builder: `buildHealthStatus`, `buildAdminStatus`, `buildStoreCounts` | read-only이며 `backend:smoke`가 즉시 검증 | Low |
| 3 | Catalog/Profile/Notification response builders | 대부분 순수 payload 변환 | Low |
| 4 | Market/Admin response builders | repository 메서드가 이미 있어 controller 분리 난이도 낮음 | Medium |
| 5 | Offline race response builders | 독립 도메인이고 running match보다 영향이 작음 | Medium |

가장 먼저 route handler 자체를 크게 옮기기보다, `responseBuilders/`와 `http/`부터 빼는 것이 안전하다. 현재 `routes/`는 이미 분리되어 있어 URL 매칭은 유지하고, `server.mjs`의 주입 함수만 작은 모듈에서 가져오는 방식으로 진행한다.

## 4. Response Builder 분리 후보

아래 함수들은 request/response 객체 없이 payload를 만드는 역할이므로 우선 분리하기 좋다.

| 분리 위치 | 대상 함수 |
| --- | --- |
| `responseBuilders/profileResponse.mjs` | `buildProfile`, `buildProfileWithMetrics`, `buildNotificationSettings` |
| `responseBuilders/homeResponse.mjs` | `buildHomeSummary`, `buildHomeSummaryWithMetrics`, `buildMyActivity`, `buildMyActivityWithRunsAndMetrics` |
| `responseBuilders/runResponse.mjs` | `buildRunDetail`, `getRunFromList` |
| `responseBuilders/integrationResponse.mjs` | `buildIntegrationSources`, `decorateIntegrationSource`, `buildIntegrationSourceActionResult` |
| `responseBuilders/marketResponse.mjs` | `buildMarketOverview`, `buildMarketOverviewWithMetrics`, `buildMarketItemRemainingStock` |
| `responseBuilders/adminResponse.mjs` | `buildAdminOverview`, `buildAdminUsers`, `buildAdminMarketCatalog`, `buildAdminNotices`, `buildAdminRewardRedemptions` |
| `responseBuilders/raceResponse.mjs` | `decorateOfflineRaceEvent`, `buildOfflineRacePastEvent`, `buildAdminOfflineRaceEvent` |
| `responseBuilders/runningMatchResponse.mjs` | `buildRunningMatchRoomResponse`, `buildRunningMatchStatusResponse`, `buildDuelMatchResponse`, `buildGroupMatchResponse` |

주의: running match response builder는 session/room state mutation helper와 얽혀 있으므로 마지막 단계에서 분리한다.

## 5. Running Match Backend Flow 분리 후보

running match 관련 코드는 가장 위험도가 높다. 분리 순서는 “순수 helper → state mutation service → controller” 순서가 안전하다.

| 분리 위치 | 대상 책임 | 예시 함수 |
| --- | --- | --- |
| `services/runningMatch/matchQueueService.mjs` | 매칭 큐 생성/정리/조회 | `ensureMatchQueues`, `pruneMatchQueues`, `upsertMatchQueueEntry`, `removeUsersFromMatchQueue`, `findAnyQueuedMatchEntryForUser` |
| `services/runningMatch/matchSessionService.mjs` | match session 생성/상태 계산/조회 | `ensureMatchSessions`, `hydrateMatchSessionState`, `pruneMatchSessions`, `createMatchSession`, `findMatchSessionForUser`, `findMatchSessionById` |
| `services/runningMatch/matchRoomService.mjs` | party room 생성/입장/시작/준비/나가기 | `createRunningMatchRoom`, `joinRunningMatchRoom`, `startRunningMatchRoom`, `updateRunningMatchRoom`, `leaveRunningMatchRoom` |
| `services/runningMatch/staleMatchCleanupService.mjs` | stale blocker cleanup | `cleanupStaleRunningMatchRoomState`, `clearUserStaleReferenceFields`, `clearUserLiveRunShare` |
| `services/runningMatch/matchProgressService.mjs` | live progress/official standings | `normalizeRunningMatchProgress`, `updateRunningMatchProgress`, `buildOfficialSessionStandings` |
| `services/runningMatch/matchBlockerService.mjs` | active blocker 판정 | `buildRunningMatchRequestBlocker`, `buildRunningMatchBlockerApiDetails`, `assertUserCanRequestAnotherMatch` |
| `controllers/runningMatchController.mjs` | HTTP body validation + service 호출 | `handleRequestDuelMatch`, `handleCreateRunningMatchRoom`, `handleUpdateRunningMatchProgress` |

특히 `room create`, `room join`, `cleanup-stale`, `start room`, `progress heartbeat`는 최근 Android 대결 안정화와 직접 연결되어 있으므로 P0로 바로 옮기지 않는다. 먼저 contract test를 늘린 뒤 분리한다.

## 6. Smoke Test 영향 범위

기존 검증 기준은 아래 명령어를 기본으로 둔다.

```bash
npm run typecheck
npm run lint
npm run test
npm run backend:smoke
npm run release:gate:preview
```

backend 내부만 수정하는 단계에서는 추가로 아래를 실행한다.

```bash
cd backend && npm run test
cd backend && npm run smoke
npm run preview:smoke
```

영향 범위:

| 검증 | 확인하는 것 |
| --- | --- |
| `backend/src/routes/index.test.mjs` | route dispatch, health, OPTIONS, unknown API |
| `backend/src/smoke.mjs` | health, auth, profile, region, run save, friends, market, running match 주요 플로우 |
| `backend/src/runningMatchContract.test.mjs` | running match room/session/progress 계약 |
| `npm run backend:smoke` | 루트 script 기준 backend smoke |
| `npm run release:gate:preview` | preview 배포 전 env/API/public backend gate |
| `npm run preview:smoke` | preview public API 실제 응답 확인 |

## 7. 단계별 리팩토링 순서

| 단계 | 작업 | 위험도 | 검증 |
| --- | --- | --- | --- |
| 1 | `http/errors.mjs`, `http/response.mjs`, `http/requestBody.mjs`, `http/cors.mjs` 분리 | Low | `backend test:routes`, `backend:smoke` |
| 2 | repository/context wiring을 `app/createAppContext.mjs`와 `app/repositories.mjs`로 분리 | Medium | `backend:smoke`, `backend test:repositories` |
| 3 | health/admin status/read-only response builders 분리 | Low | `backend:smoke`, `routes/index.test.mjs` |
| 4 | profile/home/run/integration response builders 분리 | Medium | `backend:smoke`, frontend `npm run test` |
| 5 | market/race/admin response builders와 controllers 분리 | Medium | `backend test:market`, `backend test:race`, `backend:smoke` |
| 6 | running match pure helpers 분리: queue/session/room constants + validators | Medium | `runningMatchContract.test.mjs` |
| 7 | running match services 분리: queue/session/room/progress/stale cleanup | High | `backend test:contracts`, Android 2대 QA |
| 8 | running match controllers 분리 후 route dependency bag 축소 | High | `backend:smoke`, `preview:smoke`, release gate |
| 9 | `server.mjs`를 bootstrap-only로 축소 | Medium | 전체 backend test + smoke + preview gate |

## 8. 단계별 위험도 상세

| 위험도 | 기준 | 해당 단계 |
| --- | --- | --- |
| Low | 순수 HTTP 유틸 또는 read-only payload builder, store mutation 없음 | 1, 3 |
| Medium | repository/context wiring 또는 read/write controller 이동, 기존 route dependency 변화 | 2, 4, 5, 9 |
| High | running match session/room/progress/stale cleanup 상태 전환 변경 가능성 | 6, 7, 8 |

High 단계에서는 한 PR/커밋에 한 도메인만 옮긴다. 예를 들어 `matchRoomService`와 `matchProgressService`를 같은 작업에서 동시에 옮기지 않는다.

## 9. 검증 명령어

일반 단계:

```bash
npm run typecheck
npm run lint
npm run test
cd backend && npm run test
npm run backend:smoke
git diff --check
```

running match 관련 단계:

```bash
npm run typecheck
npm run lint
npm run test
cd backend && npm run test:contracts
cd backend && npm run smoke
npm run backend:smoke
npm run preview:smoke
git diff --check
```

Preview 배포 전:

```bash
npm run backend:release:check:preview
npm run release:gate:preview
npm run preview:smoke
```

## 10. 바로 실행 가능한 코덱스 프롬프트 3개

### Prompt 1: HTTP 유틸 분리

```text
backend/src/server.mjs에서 HTTP 공통 유틸만 안전하게 분리해줘.

대상:
- ApiError
- sendJson
- sendError
- parseJsonBody
- CORS helper

목표 구조:
backend/src/http/errors.mjs
backend/src/http/response.mjs
backend/src/http/requestBody.mjs
backend/src/http/cors.mjs

주의:
- route 동작 변경 금지
- backend business logic 변경 금지
- 기존 export/import만 정리
- npm run backend:smoke, cd backend && npm run test, git diff --check 통과
```

### Prompt 2: Read-only response builder 분리

```text
backend/src/server.mjs에서 read-only response builder를 분리해줘.

대상:
- buildProfile/buildProfileWithMetrics
- buildNotificationSettings
- buildHomeSummary/buildHomeSummaryWithMetrics
- buildMyActivity/buildMyActivityWithRunsAndMetrics
- buildRunDetail/getRunFromList

목표 구조:
backend/src/responseBuilders/profileResponse.mjs
backend/src/responseBuilders/homeResponse.mjs
backend/src/responseBuilders/runResponse.mjs

주의:
- payload shape 변경 금지
- auth/session/repository 로직 변경 금지
- smoke test 기준 통과
- npm run backend:smoke, cd backend && npm run test, git diff --check 통과
```

### Prompt 3: Running match helper 1차 분리

```text
backend/src/server.mjs에서 running match 순수 helper만 1차 분리해줘.

대상:
- match queue helper
- match session helper
- room response builder
- blocker detail builder

목표 구조:
backend/src/services/runningMatch/matchQueueService.mjs
backend/src/services/runningMatch/matchSessionService.mjs
backend/src/responseBuilders/runningMatchResponse.mjs
backend/src/services/runningMatch/matchBlockerService.mjs

주의:
- room create/join/start/progress API 동작 변경 금지
- mutation 순서 변경 금지
- 정상 대결방 삭제/cleanup 정책 변경 금지
- cd backend && npm run test:contracts, npm run backend:smoke, npm run preview:smoke 통과
```
