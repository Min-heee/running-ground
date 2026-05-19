# 코드 품질 Audit 보고서 (2026-05-20)

기준 브랜치: `feature/ios-oauth-flow`
기준 커밋: `7c1d397b254a6b3dd8690eea8b68f8eefc10c473`
작성 목적: 코드 수정 없이 다음 PR 사이클의 모듈화, 최적화, 컴포넌트 분리, 하드코딩 정리, 경량화 후보를 정리한다.

## 1. 현재 상태 요약

### 자동 점검 결과

| 점검 | 결과 | 해석 |
| --- | --- | --- |
| `npm run perf:smells` | High 0 / Medium 0 / Low 1 | Android 성능 회귀 후보는 안정권. Low는 `RunRouteMap.native.tsx`의 `react-native-maps` 관찰 항목이다. |
| `npm run code:quality` | 844 files / 787 code files | 대형 파일과 정적 휴리스틱 후보는 남아 있지만 High runtime smell은 없다. 새 audit 문서가 300줄 이상 문서로 포함된다. |
| React inline prop 후보 | 66, High 0 | 대부분 UI/폼/탭/랭킹 컴포넌트의 style array 또는 inline handler다. hot path부터만 정리하면 된다. |
| render 중 sort/filter/map 후보 | 0 | PR-19~24 이후 렌더 계산 회귀는 없다. |
| useEffect 많은 파일 | 0 | effect 개수 기준의 구조 위험은 안정화됐다. |
| utils/domain 밖 계산 로직 | 57, High 9 | 일부는 진짜 분리 후보, 일부는 PR-19로 분리된 계산 모듈이 false positive로 잡힌 것이다. |
| types 밖 타입 선언 | 61, High 1 | High는 `roomInviteInbox.types.ts`로, 실제로는 types 파일이라 휴리스틱 보정 대상에 가깝다. |
| cleanup 의심 | 15, High 0 | 대부분 test/script 또는 debounce성 timeout. 런타임 파일만 선별 확인하면 된다. |
| Location/watchPosition/background task | 18, High 5 | scripts false positive 포함. 실제 위험은 `useRunTracking.ts`, tracking/background 계열이다. |

### 큰 파일 목록

| 영역 | 파일 | 줄 | 현재 문제 | 위험도 |
| --- | --- | ---: | --- | --- |
| backend | `backend/src/lib/runningMatchStoreHelpers.mjs` | 2574 | PR-23 이후 server에서 빠져나온 핵심 매칭 store/service가 한 파일에 집중됨 | P1 |
| client | `src/features/runs/runtime/TrackRunExperienceRuntimeModel.tsx` | 1864 | hook 조립 facade지만 아직 상태/refs/action wiring이 매우 큼 | P0/P1 |
| backend | `backend/src/smoke.mjs` | 1014 | smoke scenario가 길고 중복 setup이 많음 | P3 |
| backend | `backend/src/runningMatchContract.test.mjs` | 899 | contract scenario가 길지만 회귀 가드로 가치 높음 | P3 |
| backend | `backend/src/server.mjs` | 866 | 6195줄에서 크게 축소. 이제 core DI/startup 파일로 유지 가능 | P2 |
| backend | `backend/src/routes/runningMatchRoutes.mjs` | 755 | route dispatcher + handlers가 한 파일에 남음 | P1 |
| backend | `backend/src/repositories/postgresFriendsRepository.mjs` | 715 | row mapper, access check, live share, leaderboard가 섞임 | P2 |
| backend | `backend/src/routes/authRoutes.mjs` | 673 | auth/phone/register/profile patch가 한 route 파일에 집중됨 | P2 |
| client | `src/data/mock.ts` | 647 | profile, market, runs, offline race, league mock 데이터가 한 파일 | P2 |
| client | `src/lib/session.ts` | 561 | mock session + backend session + signup/recovery/delete flows가 한 facade에 집중 | P1 |
| client | `src/features/runs/runtime/useTrackRunRuntimeRecipientInviteInbox.ts` | 491 | PR-21로 줄었지만 callback, focus effect, commit wiring이 남음 | P1 |
| client | `src/features/runs/viewModels/liveMatchRaceBoardViewModel.ts` | 465 | duel/group row build, trace, placeholder/progress merge가 한 파일 | P2 |

### 이전 사이클 대비 변화

| 작업 | 변화 |
| --- | --- |
| PR-19~22c | dead code 삭제, 디자인 토큰화, `useTrackRunRuntimeRecipientInviteInbox` 분할, RuntimeModel 안전 분할 3단계 완료 |
| PR-23a~e | `backend/src/server.mjs` 6195줄에서 866줄로 축소, route/service/lib 모듈화 진전 |
| PR-24a~e | 대결 결과 점진 표시 helper, arena label, raceBoard visibility, result page 진입/placeholder 구현 |
| 남은 핵심 | RuntimeModel wiring, backend running match store helper, session facade, PR-24 주변 계산/타입 정리 |

## 2. 우선순위 1: 즉시 개선 가능 (낮은 위험, 효과 명확)

### PR-25: PR-24 결과 표시 타입/계산 모듈 정리

| 항목 | 내용 |
| --- | --- |
| 대상 | `src/features/runs/viewModels/matchResultModel.ts`, `src/features/runs/viewModels/matchResultProgressive.ts`, `src/features/runs/components/MatchResultRows.tsx` |
| 현재 문제 | PR-24로 새 기능은 들어갔지만 결과 row 타입과 placeholder label 계산이 view model/component에 같이 남아 있다. `matchResultProgressive.ts`는 타입 선언 후보 Medium, `matchResultModel.ts`는 계산 로직 Medium이다. |
| 권장 변경 | `src/features/runs/types/matchResult.ts`에 row/model 타입을 이동하고, `matchResultRowsPolicy.ts` 같은 순수 helper로 `ING`, placeholder summary, rank label 계산을 분리한다. |
| 예상 효과 | PR-24 후속 안정화, 타입 후보 감소, result page UI 변경 없이 테스트 가능한 계산 경계 확보 |
| 위험도 | P2 |
| 테스트 | `matchResultModel.test.ts`, `matchResultProgressiveRows.test.ts` 유지/보강 |
| 금지 | 결과 페이지 진입 조건, polling, save/forfeit 정책 변경 금지 |

### PR-26: Result/LiveMatch row style token cleanup

| 항목 | 내용 |
| --- | --- |
| 대상 | `src/features/runs/components/MatchResultRows.tsx`, `src/features/runs/components/MatchResultPanel.tsx`, `src/components/matches/liveMatchRaceBoard/styles.ts` |
| 현재 문제 | PR-20a/b 이후에도 `rgba(...)`, `fontSize: 15`, `borderRadius: 30` 같은 잔여 하드코딩이 있다. PR-24의 `MatchResultRows.tsx`에도 rgba 스타일이 새로 추가됐다. |
| 권장 변경 | `src/theme/tokens.ts` 또는 별도 `src/theme/overlays.ts`에 alpha color token을 만들고, result/race board tone을 의미 기반 token으로 치환한다. |
| 예상 효과 | 하드코딩 잔여 감소, future design QA 비용 감소 |
| 위험도 | P3 |
| 테스트 | type/lint 중심. UI 변경이 아니므로 숫자/색상 값 동일 유지 |
| 금지 | RoadMotion, layout, page structure 변경 금지 |

### PR-27: inline prop Medium 후보 중 auth/league/settings 저위험 정리

| 항목 | 내용 |
| --- | --- |
| 대상 | `SignupCredentialsSection.tsx`, `NotificationSettingsScreen.tsx`, `LeagueModeSwitch.tsx`, `LeagueScreen.tsx` |
| 현재 문제 | inline prop Medium 15개 중 대부분은 style array나 inline handler다. running/live match보다 회귀 위험이 낮다. |
| 권장 변경 | small memoized child, stable handler, style array helper를 적용한다. `LeagueModeSwitch`는 `ModeButton` child로, `NotificationSettingsScreen`은 toggle handlers를 stable map으로 분리한다. |
| 예상 효과 | inline 후보 66 감소, UI props 안정성 개선 |
| 위험도 | P3 |
| 테스트 | 기존 test + `npm run code:quality`에서 inline 후보 감소 확인 |
| 금지 | 문구/디자인/설정 저장 동작 변경 금지 |

### PR-28: generated report false-positive 보정

| 항목 | 내용 |
| --- | --- |
| 대상 | `scripts/analyze-code-quality.mjs` |
| 현재 문제 | `roomInviteInbox.types.ts`가 types 파일인데 “types 밖 타입 선언 High”로 잡히고, `sourceCatalogQueries.ts` 같은 이미 분리된 query/helper 파일도 계산 로직 High로 잡힌다. |
| 권장 변경 | `*.types.ts`, `*Types.ts`, `*Queries.ts`, `*Policy.ts`, `*Helpers.ts`는 다른 기준으로 분류한다. High가 진짜 위험 후보만 남게 한다. |
| 예상 효과 | 다음 사이클 우선순위 노이즈 감소 |
| 위험도 | P3 |
| 테스트 | analyzer unit 또는 snapshot성 test 추가 |
| 금지 | 실제 앱 코드 변경 금지 |

## 3. 우선순위 2: 중간 영역 (효과 큼, 위험 중간)

### PR-29: `src/lib/session.ts` facade 분리

| 항목 | 내용 |
| --- | --- |
| 대상 | `src/lib/session.ts`, `src/lib/session/backendSession.ts`, `src/lib/session/phoneVerification.ts`, `src/lib/session/storage.ts`, `src/lib/session/validation.ts` |
| 현재 문제 | 561줄 파일에 hydration, mock session, backend login, provider login, username check, phone verification, register, recovery, signOut/deleteAccount가 같이 있다. |
| 권장 변경 | `authSessionFacade.ts`, `signupSessionActions.ts`, `accountRecoveryActions.ts`, `sessionState.ts`로 나눈다. 기존 `src/lib/session.ts`는 re-export/facade로 유지한다. |
| 예상 효과 | auth crash/debug 비용 감소, TestFlight startup/session 문제 대응 쉬워짐 |
| 위험도 | P1 |
| 테스트 | login/register/recovery 함수별 unit, 기존 auth flow test |
| 금지 | public import path 깨기 금지. `getCurrentUserProfile`, `getAccessToken` 시그니처 유지 |

### PR-30: `useTrackRunRuntimeRecipientInviteInbox.ts` 2차 분리

| 항목 | 내용 |
| --- | --- |
| 대상 | `src/features/runs/runtime/useTrackRunRuntimeRecipientInviteInbox.ts`, `src/features/runs/sync/recipientInviteInbox/*` |
| 현재 문제 | PR-21 이후 491줄로 줄었지만 hook 본체 433줄, callback 285줄이 남아 있다. API timeout/retry/commit/focus-effect wiring이 hook 안에 남음. |
| 권장 변경 | focus effect owner, commit side-effect adapter, retry scheduler를 별도 hook/helper로 분리한다. sync 폴더의 순수 helper는 유지하고 runtime hook은 wiring만 담당하게 한다. |
| 예상 효과 | invite 수신 회귀 대응 쉬움, 500줄 후보 제거 가능 |
| 위험도 | P1 |
| 테스트 | timeout retry, joined/live pause, duplicate card, no-room key 차단 |
| 금지 | manual invite code join, invite response shape, joined/live pause 정책 변경 금지 |

### PR-31: `src/data/mock.ts` 도메인별 mock fixture 분리

| 항목 | 내용 |
| --- | --- |
| 대상 | `src/data/mock.ts` |
| 현재 문제 | profile, notification, market, weekly, run records, friend, university, offline race, region tree, connected source가 한 파일에 있다. |
| 권장 변경 | `src/data/mock/profile.ts`, `market.ts`, `runs.ts`, `friends.ts`, `offlineRace.ts`, `league.ts`, `integrations.ts`로 분리하고 `mock.ts`는 re-export만 한다. |
| 예상 효과 | 500줄 파일 제거, mock 변경 conflict 감소 |
| 위험도 | P3 |
| 테스트 | import compatibility 확인, existing tests |
| 금지 | mock 데이터 shape 변경 금지 |

### PR-32: `liveMatchRaceBoardViewModel.ts` duel/group builder 분리

| 항목 | 내용 |
| --- | --- |
| 대상 | `src/features/runs/viewModels/liveMatchRaceBoardViewModel.ts` |
| 현재 문제 | duel participant-first seed, progress merge, group row build, trace가 한 파일에 있다. PR-24c 이후 progressive visibility도 얹혀 있어 변경 이유가 늘었다. |
| 권장 변경 | `duelRaceBoardRows.ts`, `groupRaceBoardRows.ts`, `raceBoardTrace.ts`로 분리한다. public `buildLiveMatchRaceBoardViewModel`은 유지한다. |
| 예상 효과 | result/raceBoard 회귀 테스트 작성이 쉬워지고 300줄 이하 목표 가능 |
| 위험도 | P2 |
| 테스트 | 기존 race board tests + current user/opponent/progress missing cases |
| 금지 | ranking 계산, 승패/저장 정책 변경 금지 |

### PR-33: backend `runningMatchRoutes.mjs` route table 분리

| 항목 | 내용 |
| --- | --- |
| 대상 | `backend/src/routes/runningMatchRoutes.mjs` |
| 현재 문제 | 755줄 route dispatcher가 running match request, status, room create/join/start/update/ready/leave/cleanup을 모두 가진다. |
| 권장 변경 | `runningMatchRequestRoutes.mjs`, `runningMatchRoomRoutes.mjs`, `runningMatchProgressRoutes.mjs`로 handler grouping만 분리한다. |
| 예상 효과 | backend route diff 작아짐, room write route 변경 추적 쉬움 |
| 위험도 | P1 |
| 테스트 | `cd backend && npm test`, `npm run backend:smoke` |
| 금지 | API path/response shape/storage format 변경 금지 |

## 4. 우선순위 3: 큰 작업 (큰 효과, 큰 위험)

### TrackRunExperienceRuntimeModel 추가 분할

| 항목 | 내용 |
| --- | --- |
| 대상 | `src/features/runs/runtime/TrackRunExperienceRuntimeModel.tsx` |
| 현재 상태 | 1864줄, imports 53, `TrackRunExperienceRuntime` 1744줄 |
| 문제 | facade 역할로 많이 줄었지만 여전히 refs, route hydration, party room, live match, result page, active room check, action handler, props composer wiring이 한 함수에 있다. |
| 권장 방향 | 더 이상 effect/polling을 직접 건드리는 큰 분할은 피하고, `useTrackRunStatusLoaders`, `useTrackRunRuntimeActionBindings`, `useTrackRunRuntimeLiveIdentity`, `useTrackRunReadyScreenBindings`처럼 wiring-only hook을 작은 PR로 추출한다. |
| 위험도 | P0/P1 |
| 테스트 | 전체 test + Android two-phone smoke + live match navigation trace |
| 보류 조건 | live match shell gate, result page, room tombstone 관련 회귀가 다시 나오면 즉시 중단 |

### Location/GPS 관련 5 High 확인

| 항목 | 내용 |
| --- | --- |
| 대상 | `src/features/runs/hooks/useRunTracking.ts`, `src/features/runs/tracking/background/*`, `src/features/runs/tracking/useLocationTracking.ts`, `useTrackingAppStateSync.ts` |
| 현재 문제 | code-quality High 5 중 scripts false positive가 섞여 있지만, 실제 위치/task lifecycle은 Android 체감 성능과 배터리/권한 문제에 직결된다. |
| 권장 방향 | 구조 변경보다 “현재 cleanup 보장 문서화 + targeted tests” 우선. `watchPositionAsync`, background task start/stop, app state transition single-flight 테스트를 추가한다. |
| 위험도 | P0 |
| 테스트 | Android 실기기 GPS, background/foreground, solo warmup countdown, match active GPS |
| 보류 조건 | 측정 로그 없이 interval/task 정책 변경 금지 |

### backend running match store helper 도메인 분해

| 항목 | 내용 |
| --- | --- |
| 대상 | `backend/src/lib/runningMatchStoreHelpers.mjs` |
| 현재 상태 | 2574줄, sort/filter/map 85, running match 핵심 store/service가 집중됨 |
| 권장 방향 | `matchRoomStoreHelpers`, `matchSessionStoreHelpers`, `matchQueueStoreHelpers`, `matchProgressStoreHelpers`, `matchResponseBuilders`로 단계 분해한다. |
| 위험도 | P1 |
| 테스트 | backend contract/smoke 필수 |
| 보류 조건 | 방 생성/입장/시작/정산 response shape 변경 위험이 크면 순수 helper부터만 진행 |

## 5. 보류 권장 영역

| 영역 | 보류 이유 | 다음 조건 |
| --- | --- | --- |
| live match navigation/recovery policy | PR-06~14에서 race condition이 반복됐던 영역이다. code-quality상 즉시 문제는 없고 기능 회귀 비용이 크다. | 새 two-phone 로그에서 `routeStateOnly`, shell gate, recovery polling 문제가 재현될 때만 건드린다. |
| polling interval 변경 | 현재 `perf:smells` High/Medium 0이며, interval은 제품 체감과 서버 부하가 같이 걸린다. | trace 기반 slow finding 또는 반복 로그가 있을 때만 변경한다. |
| GPS/background tracking policy | 권한, background task, warmup baseline과 얽혀 있다. | 실기기 로그 + targeted test를 먼저 추가한다. |
| backend auth/register response | `authRoutes.mjs`는 크지만 user-facing high risk다. | phone verification과 register helper부터 분리하고 route path는 유지한다. |
| `server.mjs` 866줄 추가 축소 | 이미 core DI/startup으로 충분히 작아졌다. | 다른 backend 분해가 끝난 뒤 마지막 cleanup으로 진행한다. |

## 6. 모듈화 권장

### 매치 lifecycle 모듈

현재 lifecycle 관련 파일은 많이 분리됐지만 RuntimeModel에서 조립 비용이 크다. 추천 경계:

| 모듈 | 포함 | 제외 |
| --- | --- | --- |
| `runs/lifecycle/identity` | focused/hydrated/linked/mounted match identity 계산 | navigation 실행 |
| `runs/lifecycle/shellGate` | shellKind, ready screen, force arena decision | polling/effect |
| `runs/lifecycle/resultVisibility` | current user finished, result page gate | save/forfeit |
| `runs/lifecycle/pollingPolicy` | direct/linked/upcoming polling enable policy | interval 값 변경 |

### GPS 추적 모듈

추천 경계:

| 모듈 | 포함 |
| --- | --- |
| `tracking/background` | task start/stop, foreground/background subscription |
| `tracking/baseline` | solo warmup baseline, official start baseline |
| `tracking/session` | elapsed/distance/cadence snapshot |
| `tracking/appState` | AppState transition and cleanup |

정책 변경 없이 test coverage를 먼저 늘리는 쪽이 안전하다.

### 디자인 시스템 모듈

PR-20a/b로 hex/숫자는 많이 줄었지만 alpha overlay와 live match tone은 남아 있다.

| 추천 토큰 | 대상 |
| --- | --- |
| `overlayColors` | `rgba(15, 23, 42, 0.52)` 같은 dark overlay |
| `matchResultColors` | WIN/LOSE/DRAW/ING row tone |
| `liveMatchColors` | arena/raceBoard panel, lane, token tone |
| `layoutTokens` | 큰 radius 28/30/34, hero font 96/120 |

## 7. 컴포넌트 분리 권장

| 우선순위 | 파일 | 권장 분리 | 이유 |
| --- | --- | --- | --- |
| P1 | `src/features/settings/admin/hooks/useAdminDashboard.ts` | read model, mutation actions, table filters | 400줄 hook. admin은 기능 복잡하지만 live match보다 안전하다. |
| P1 | `src/features/runs/runtime/useTrackRunRuntimeRecipientInviteInbox.ts` | focus owner, retry scheduler, commit adapter | invite inbox 안정성에 직접 영향. 이미 helper 기반이 있어 2차 분리 가능하다. |
| P2 | `src/features/runs/viewModels/useLiveMatchViewModel.ts` | pager props, arena props, result props | 285줄 hook. LiveMatch render boundary와 연결된다. |
| P2 | `src/features/match/hooks/lobby/useRoomStartActions.ts` | start/delete/invite host action 분리 | 335줄. room start/delete는 실측 이슈가 많았으므로 테스트 우선. |
| P2 | `src/features/runs/components/matchSetupCards/MatchSetupCommon.tsx` | option chip row, date/time section | inline 후보와 333줄 파일. UI 변경 없이 분리 가능. |
| P3 | `src/features/auth/screens/AccountRecoveryScreen.tsx` | phone input, verification code, reset form | inline props와 168줄 component. 낮은 위험. |
| P3 | `src/features/league/components/LeagueRegionSelectorCard.tsx` | path chips, child region list | 326줄. ranking 탭 기능과 분리 가능. |

## 8. 하드코딩 잔여

### 디자인 값

| 유형 | 예시 | 권장 |
| --- | --- | --- |
| alpha color | `rgba(...)` in `MatchResultRows.tsx`, `liveMatchArena/styles.ts`, `liveMatchRaceBoard/styles.ts` | alpha token 또는 semantic tone token 추가 |
| 큰 radius | `borderRadius: 28/30/34/99` | `radii.hero`, `radii.cardLarge`, `radii.avatar` 검토 |
| 큰 font size | `fontSize: 96/120`, `29`, `15` | countdown/display용 font token 추가 |
| layout spacing | `paddingHorizontal: 28`, `paddingVertical: 34`, `marginTop: 26` | 자주 쓰는 값만 token 추가. 1~2회 값은 그대로 허용 |

### URL / endpoint / environment

| 위치 | 상태 |
| --- | --- |
| `eas.json`, `package.json` | preview/production API URL과 OTA scripts가 명시돼 있다. 운영상 의도된 하드코딩으로 보이며 중앙화되어 있다. |
| `src/services/apiClient.ts` | dev fallback URL이 platform별로 있다. 유지 가능하지만 release validation과 연결된 주석이 있으면 더 안전하다. |
| backend route files | API path 문자열이 route 파일에 직접 있다. response contract 유지 측면에서는 나쁘지 않지만, route table 방식이면 test coverage가 쉬워진다. |

### 매직 상수 / interval

| 위치 | 상태 | 권장 |
| --- | --- | --- |
| `src/features/runs/sync/liveMatchCadence.ts` | server/UI/poll cadence 중앙화됨 | 유지 |
| `TrackRunExperienceRuntimeModel.tsx` line around blocking polling | `idlePollMs: 5000` 주석 포함 inline 값 | 다음 RuntimeModel 분할 때 cadence constant로 이동 가능. 정책 변경은 금지 |
| `matchCountdown.ts`, `matchStateMachine.ts` | countdown/active inference constants 존재 | 유지, product spec 문서와 연결 권장 |
| backend `matchConstants.mjs` | booking/cancellation/session TTL 중앙화됨 | 유지 |

## 9. 경량화 (bundle size / perf)

| 후보 | 현재 상태 | 권장 |
| --- | --- | --- |
| Running 탭 cold path | PR 이전에 lazy/defer 적용됨. RuntimeModel은 여전히 큰 dynamic chunk다. | 기능 변경 없이 import graph를 더 나누려면 RuntimeModel props/action bindings부터 작은 hook으로 분리 |
| LiveMatch result/raceBoard row | PR-24 후 `MatchResultRows.tsx`가 분리되고 row components memoized됨 | 좋음. 다음은 rgba token과 model 타입 정리 |
| inline handlers | High 0, Medium 15 | auth/settings/league부터 정리. live match hot path는 측정 없으면 보류 |
| mock/service bundle | `src/data/mock.ts`, `src/lib/api/services/mock/*`가 큼 | production bundle에 mock이 포함되는지 metro tree-shaking 확인. 필요 시 mock service lazy import |
| unused imports/dead code | PR-19로 주요 dead code 제거 | `code:quality` duplicate 후보를 기준으로 다음 dead code PR 가능 |
| backend smoke/contract test | 큰 파일이지만 런타임 bundle 영향 없음 | 경량화 우선순위 낮음 |

## 10. 다음 PR 후보 (우선순위 순)

| PR | 제목 | 대상 | 크기 | 위험도 | 효과 | 검증 |
| --- | --- | --- | --- | --- | --- | --- |
| PR-25 | Result progressive model type/helper cleanup | `matchResultModel`, `matchResultProgressive`, `MatchResultRows` | S | P2 | PR-24 후속 안정화, type/calculation 후보 감소 | typecheck/lint/test/code:quality |
| PR-26 | Result/LiveMatch rgba and display token cleanup | result/raceBoard/arena styles | S | P3 | 하드코딩 잔여 감소 | typecheck/lint/test |
| PR-27 | Low-risk inline prop cleanup batch | auth/settings/league screens | S-M | P3 | inline 후보 66 감소 | code:quality |
| PR-28 | code-quality analyzer false-positive tuning | `scripts/analyze-code-quality.mjs` | S | P3 | High 노이즈 제거 | test/code:quality |
| PR-29 | session facade split | `src/lib/session.ts` | M | P1 | auth/session 유지보수성 개선 | auth tests/typecheck |
| PR-30 | recipient invite inbox hook split 2 | recipient inbox runtime/sync | M | P1 | invite 수신 안정화/500줄 탈출 | invite tests/perf:smells |
| PR-31 | mock data fixture split | `src/data/mock.ts` | S-M | P3 | 500줄 파일 제거, conflict 감소 | test/typecheck |
| PR-32 | raceBoard view model split | `liveMatchRaceBoardViewModel.ts` | M | P2 | PR-24c 주변 회귀 가드 강화 | raceBoard tests |
| PR-33 | backend running match route split | `runningMatchRoutes.mjs` | M-L | P1 | route 책임 분리 | backend test/smoke |
| PR-34 | backend running match store helper split 1 | `runningMatchStoreHelpers.mjs` | L | P1 | 2574줄 핵심 파일 단계 축소 | backend contract/smoke |
| PR-35 | GPS/task cleanup test audit | tracking background/appState files | M | P0 | 위치 lifecycle 안정성 명문화 | device QA + tests |
| PR-36 | RuntimeModel wiring-only split 4 | RuntimeModel identity/action bindings | M-L | P0/P1 | 1864줄 축소 | full test + two-phone QA |

### 추천 시작 순서

1. PR-25: PR-24 직후라 문맥이 가장 뜨겁고, 순수 타입/계산 정리라 위험이 낮다.
2. PR-28: analyzer false positive를 먼저 줄이면 이후 우선순위 판단이 깨끗해진다.
3. PR-30: invite inbox는 사용자 체감 이슈가 많았고 이미 PR-21 기반 helper가 있어 2차 분리가 자연스럽다.

## 결론

현재 성능 회귀 위험은 안정권이다. 다음 사이클은 “큰 시스템을 더 쪼개기”보다 PR-24 후속 정리, analyzer 노이즈 제거, session/invite 같은 중간 크기 facade 정리를 먼저 하는 편이 좋다. RuntimeModel, GPS, live match navigation은 여전히 큰 효과가 있지만 실측 회귀 비용이 크므로 측정 로그나 명확한 failing test가 있을 때만 건드리는 것을 권장한다.
