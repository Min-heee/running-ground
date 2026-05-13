# Code Weight Audit

작성일: 2026-05-13

이번 문서는 코드 수정 없이 현재 코드베이스에서 무거운 파일과 병목 가능성이 있는 파일을 정적으로 점검한 결과다. 분석 대상은 `app`, `src`, `backend`, `scripts`, `plugins` 아래의 `.ts`, `.tsx`, `.js`, `.mjs` 파일이며, `node_modules`, `dist`, `.expo`, `.git`, `credentials` 폴더는 하위 경로까지 제외했다.

## 요약

| 기준 | 감지 수 | 핵심 판단 |
| --- | ---: | --- |
| 300줄 이상 파일 | 56개 | 앱 핵심은 `TrackRunExperience`, 러닝 tracking hook, 파티런 lobby/sync 쪽에 집중돼 있다. |
| 500줄 이상 파일 | 21개 | 서버 `server.mjs`, 러닝 경험 화면, 관리자 화면, tracking flow가 가장 크다. |
| `useState` 7개 이상 | 6개 | `useMatchLifecycle`, `useSignupForm`, `AccountRecoveryScreen`이 상태 밀도가 높다. |
| `useEffect` 4개 이상 | 5개 | `TrackRunExperience` 21개, 파티런/러닝 tracking hook이 화면 튐 위험과 연결된다. |
| `ScrollView` + `.map()` | 5개 | `AdminScreen`은 실제 긴 리스트 가능성이 있어 High다. |
| 화면 렌더 중 `sort/filter/map` | 5개 화면 | Admin, 대학 인증, 매치 기록 등은 데이터 증가 시 Android 렌더 비용이 커질 수 있다. |
| 위치/지도/센서/알림 직접 사용 | 16개 | `backgroundTracking`, `useRunTrackingFlow`, `RunRouteMap.native`가 핵심 위험축이다. |
| 화면 컴포넌트 직접 API 호출 | 1개 화면 | `AccountRecoveryScreen`이 session API를 직접 호출한다. `TrackRunExperience`도 화면성 컴포넌트에서 service를 직접 많이 가져온다. |
| `console.*` 잔존 | 앱 런타임 0개, 서버/스크립트 41개 | 앱 `src/app`에는 없음. 서버/운영 스크립트는 의도된 로그가 많다. |

## High Priority

| 파일 경로 | 문제 유형 | 왜 무거운지 | 성능 위험도 | 추천 분리 위치 | 수정 우선순위 |
| --- | --- | --- | --- | --- | --- |
| `src/features/runs/TrackRunExperience.tsx` | 2814줄, `useEffect` 21개, 화면 전환/대결/파티런 orchestration 집중 | 상태는 hook으로 많이 빠졌지만 카운트다운, 20초 대결화면 이동, stale match cleanup, 알림 sync, polling 시작 조건이 아직 한 컴포넌트에서 연결된다. 화면 튐/Android 렉 원인 추적이 어렵다. | High | `src/features/runs/containers/TrackRunExperienceContainer.tsx`, `src/features/runs/hooks/navigationEffects/**`, `src/features/runs/hooks/matchPolling/**` | 1 |
| `src/features/runs/hooks/useRunTrackingFlow.ts` | 831줄, `useEffect` 4개, 위치/센서 15회 감지 | 위치 권한, 백그라운드 snapshot, pedometer, elapsed ticker, match progress heartbeat, AppState 처리가 한 hook에 있다. Android에서 watcher/timer 중복 또는 cleanup 누락이 생기면 바로 렉으로 이어진다. | High | `src/features/runs/tracking/useLocationTracking.ts`, `usePedometerTracking.ts`, `useTrackingAppStateSync.ts`, `useMatchProgressHeartbeat.ts` | 2 |
| `src/features/runs/backgroundTracking.ts` | 652줄, 위치/센서 21회 감지 | background task, foreground watcher, route append, 거리/고도 계산, snapshot store가 함께 있다. 위치 업데이트마다 많은 계산이 발생할 수 있다. | High | `src/features/runs/tracking/background/task.ts`, `snapshotStore.ts`, `routeAccumulator.ts`, `locationWatcher.ts` | 3 |
| `src/features/runs/hooks/useMatchLifecycle.ts` | 331줄, `useState` 22개 | 1대1/그룹 매칭 상태, 요청 상태, 취소/나가기 상태, demand summary가 한 hook에 몰려 있다. 작은 상태 변경도 큰 화면 재계산으로 번질 수 있다. | High | `useDuelMatchLifecycle.ts`, `useGroupMatchLifecycle.ts`, `useMatchDemandSummary.ts`, `useMatchQueueActions.ts` | 4 |
| `src/features/runs/hooks/useMatchRoomLobby.ts` | 604줄, `useEffect` 4개, service 호출 3회 | 방 조회, 방 설정, 친구 초대, 준비/시작, 예약 시작, 입장/나가기 로직이 한 hook에 있다. 파티런 실기기 문제와 직접 연결되는 상태 흐름이다. | High | `src/features/match/hooks/lobby/useRoomSnapshot.ts`, `useRoomSettings.ts`, `useRoomInviteActions.ts`, `useRoomStartActions.ts` | 5 |
| `src/features/runs/hooks/usePartyRunSync.ts` | 315줄, `useEffect` 5개, polling/service 호출 | room polling, countdown ready ack, linked match open, active 전환이 섞여 있다. iOS/Android 카운트다운 오차와 화면 전환 꼬임의 핵심 후보이다. | High | `src/features/runs/hooks/partyRunSync/useRoomPolling.ts`, `useCountdownReadyAck.ts`, `useLinkedMatchSync.ts` | 6 |
| `backend/src/server.mjs` | 5981줄, `.map` 71회, `.sort` 23회, `.filter` 58회 | 서버 route, presenter, match session, room, auth, market, admin 처리 일부가 아직 남아 있다. 프론트 성능보다는 변경 안정성/배포 리스크가 크다. | High | `backend/src/routes/**`, `backend/src/services/**`, `backend/src/presenters/**` | 7 |
| `src/features/settings/screens/AdminScreen.tsx` | 980줄, `ScrollView` + `.map()` 5회 | 회원/공지/마켓/교환/레이스 목록을 `ScrollView` 안에서 직접 map 렌더링한다. 운영 데이터가 늘면 web/Android 모두 느려질 수 있다. | High | `src/features/settings/admin/components/**`, 각 목록은 `FlatList` 또는 web table 전용 컴포넌트 | 8 |
| `src/features/runs/hooks/useLiveMatchNavigationEffects.ts` | `useEffect` 6개 | 대결 화면 자동 이동, 20초 handoff, force-open guard 같은 화면 전환 로직이 모여 있다. 파티런 화면이 왔다갔다 하던 이슈와 직접 연결된다. | High | `src/features/runs/hooks/navigationEffects/useCountdownHandoffEffect.ts`, `useActiveArenaPinEffect.ts` | 9 |
| `src/features/runs/hooks/useRunSaveFlow.ts` | 445줄 | 저장, 기권, 상대 기권 후 결과 보기, run detail 이동이 한 hook에 있다. 기권 버튼 버벅임/결과 저장 누락 같은 UX 리스크가 있다. | High | `src/features/runs/hooks/saveFlow/useRunSaveAction.ts`, `useForfeitSaveAction.ts`, `useResultNavigation.ts` | 10 |

## 500줄 이상 파일

| 파일 경로 | 줄 수 | 문제 유형 | 왜 무거운지 | 위험도 | 추천 분리 위치 | 우선순위 |
| --- | ---: | --- | --- | --- | --- | --- |
| `backend/src/server.mjs` | 5981 | 대형 서버 엔트리 | route/presenter/service가 아직 섞여 변경 영향 범위가 크다. | High | `backend/src/routes/**`, `services/**`, `presenters/**` | 1 |
| `src/features/runs/TrackRunExperience.tsx` | 2814 | 대형 화면성 컴포넌트 | 러닝/대결/파티런 화면 전환 orchestration이 집중되어 있다. | High | `src/features/runs/containers/**`, `hooks/**` | 2 |
| `backend/db/migrate-json-to-postgres.mjs` | 1057 | 대형 마이그레이션 스크립트 | row 변환, 검증, SQL 생성이 한 파일에 있다. | Medium | `backend/db/migrations/**`, `row-builders/**` | 18 |
| `backend/src/smoke.mjs` | 1014 | 대형 smoke 테스트 | 긴 scenario가 하나의 흐름으로 이어져 실패 원인 추적이 느리다. | Medium | `backend/src/smoke/scenarios/**` | 17 |
| `src/features/settings/screens/AdminScreen.tsx` | 980 | 대형 관리자 화면 | 폼과 긴 목록 렌더링이 한 화면에 있다. | High | `src/features/settings/admin/components/**` | 8 |
| `src/features/runs/hooks/useRunTrackingFlow.ts` | 831 | tracking flow 집중 | 위치/센서/timer/AppState/server sync가 섞여 있다. | High | `src/features/runs/tracking/**` | 3 |
| `src/features/integrations/NrcBridgeGuideCard.tsx` | 775 | 안내 카드 과밀 | iOS/Android guide section과 action branch가 길다. | Medium | `src/features/integrations/components/nrcGuide/**` | 19 |
| `backend/src/repositories/postgresFriendsRepository.mjs` | 716 | repository 과밀 | query와 response mapping이 길다. | Medium | `backend/src/repositories/postgres/friends/**` | 26 |
| `src/features/auth/screens/SignupFormScreen.tsx` | 709 | 인증 화면 과밀 | 회원가입 layout과 section 조립이 크다. | Medium | `src/features/auth/components/signup/**` | 14 |
| `src/features/runs/backgroundTracking.ts` | 652 | 위치 추적 집중 | background task, watcher, route 계산이 한 파일에 있다. | High | `src/features/runs/tracking/background/**` | 4 |
| `src/data/mock.ts` | 648 | mock 데이터 집중 | 여러 도메인 mock이 한 파일에 있다. | Low | `src/data/mock/**` | 35 |
| `backend/src/repositories/postgresRunsRepository.mjs` | 640 | repository 과밀 | runs query와 import sync가 길다. | Medium | `backend/src/repositories/postgres/runs/**` | 27 |
| `backend/src/repositories/postgresAuthRepository.test.mjs` | 617 | 테스트 과밀 | 테스트 harness가 길다. 런타임 위험은 낮다. | Low | `backend/src/repositories/testUtils/**` | 45 |
| `src/features/runs/hooks/useMatchRoomLobby.ts` | 604 | 파티런 lobby flow 집중 | 방 상태/초대/시작/예약이 한 hook에 있다. | High | `src/features/match/hooks/lobby/**` | 5 |
| `src/lib/session.ts` | 562 | 세션/인증 로직 집중 | storage, legacy migration, auth API wrapper가 한 파일에 있다. | Medium | `src/lib/session/**`, `src/services/authService.ts` | 20 |
| `src/features/runs/components/LiveMatchTrackingPage.tsx` | 561 | 기록 화면 컴포넌트 과밀 | 기록 보기 카드와 대결 종료 액션 UI가 길다. | Medium | `src/features/runs/components/liveTracking/**` | 21 |
| `scripts/run-release-gate.mjs` | 553 | release script 과밀 | gate 실행/출력/요약이 한 파일이다. | Low | `scripts/releaseGate/**` | 50 |
| `backend/src/seed.mjs` | 528 | seed 생성 집중 | region/user/run/market seed 생성이 섞여 있다. | Medium | `backend/src/seed/**` | 31 |
| `backend/src/repositories/postgresRunsRepository.test.mjs` | 515 | 테스트 과밀 | 테스트 harness가 길다. | Low | `backend/src/repositories/testUtils/**` | 46 |
| `backend/src/runningMatchContract.test.mjs` | 510 | 계약 테스트 과밀 | scenario가 길다. | Low | `backend/src/tests/runningMatch/**` | 47 |
| `backend/src/repositories/postgresAuthRepository.mjs` | 504 | repository 과밀 | auth query/register flow가 길다. | Medium | `backend/src/repositories/postgres/auth/**` | 28 |

## 300줄 이상 파일

| 파일 경로 | 줄 수 | 문제 유형 | 위험도 | 추천 분리 위치 | 우선순위 |
| --- | ---: | --- | --- | --- | --- |
| `backend/src/server.mjs` | 5981 | 서버 엔트리 과밀 | High | `backend/src/routes/**`, `services/**`, `presenters/**` | 1 |
| `src/features/runs/TrackRunExperience.tsx` | 2814 | 러닝/대결 화면 orchestration 과밀 | High | `src/features/runs/containers/**`, `hooks/**` | 2 |
| `backend/db/migrate-json-to-postgres.mjs` | 1057 | 마이그레이션 스크립트 과밀 | Medium | `backend/db/migrations/**` | 18 |
| `backend/src/smoke.mjs` | 1014 | smoke 시나리오 과밀 | Medium | `backend/src/smoke/**` | 17 |
| `src/features/settings/screens/AdminScreen.tsx` | 980 | 관리자 화면/긴 목록 과밀 | High | `src/features/settings/admin/components/**` | 8 |
| `src/features/runs/hooks/useRunTrackingFlow.ts` | 831 | 위치/센서/timer flow 과밀 | High | `src/features/runs/tracking/**` | 3 |
| `src/features/integrations/NrcBridgeGuideCard.tsx` | 775 | 안내 카드 JSX/분기 과밀 | Medium | `components/nrcGuide/**` | 19 |
| `backend/src/repositories/postgresFriendsRepository.mjs` | 716 | repository query 과밀 | Medium | `repositories/postgres/friends/**` | 26 |
| `src/features/auth/screens/SignupFormScreen.tsx` | 709 | 회원가입 화면 과밀 | Medium | `auth/components/signup/**` | 14 |
| `src/features/runs/backgroundTracking.ts` | 652 | background tracking 과밀 | High | `runs/tracking/background/**` | 4 |
| `src/data/mock.ts` | 648 | mock 데이터 집중 | Low | `src/data/mock/**` | 35 |
| `backend/src/repositories/postgresRunsRepository.mjs` | 640 | repository query 과밀 | Medium | `repositories/postgres/runs/**` | 27 |
| `backend/src/repositories/postgresAuthRepository.test.mjs` | 617 | 테스트 harness 과밀 | Low | `repositories/testUtils/**` | 45 |
| `src/features/runs/hooks/useMatchRoomLobby.ts` | 604 | 파티런 lobby flow 과밀 | High | `match/hooks/lobby/**` | 5 |
| `src/lib/session.ts` | 562 | 세션/인증/storage 집중 | Medium | `src/lib/session/**` | 20 |
| `src/features/runs/components/LiveMatchTrackingPage.tsx` | 561 | 기록 보기 UI 과밀 | Medium | `runs/components/liveTracking/**` | 21 |
| `scripts/run-release-gate.mjs` | 553 | release script 과밀 | Low | `scripts/releaseGate/**` | 50 |
| `backend/src/seed.mjs` | 528 | seed 생성기 집중 | Medium | `backend/src/seed/**` | 31 |
| `backend/src/repositories/postgresRunsRepository.test.mjs` | 515 | 테스트 harness 과밀 | Low | `repositories/testUtils/**` | 46 |
| `backend/src/runningMatchContract.test.mjs` | 510 | 계약 테스트 과밀 | Low | `backend/src/tests/runningMatch/**` | 47 |
| `backend/src/repositories/postgresAuthRepository.mjs` | 504 | repository query 과밀 | Medium | `repositories/postgres/auth/**` | 28 |
| `backend/src/store.mjs` | 484 | store/backup/migration 집중 | Medium | `backend/src/store/**` | 30 |
| `scripts/check-preview-public-api.mjs` | 482 | preview smoke script 과밀 | Low | `scripts/previewSmoke/**` | 51 |
| `scripts/check-performance-smells.mjs` | 477 | 성능 점검 script 과밀 | Low | `scripts/performanceSmells/**` | 52 |
| `src/features/runs/matchProgress.ts` | 468 | 대결 progress 계산 집중 | Medium | `runs/matchProgress/**` | 15 |
| `backend/src/repositories/postgresFriendsRepository.test.mjs` | 456 | 테스트 harness 과밀 | Low | `repositories/testUtils/**` | 48 |
| `src/features/settings/admin/hooks/useAdminDashboard.ts` | 451 | admin 상태/API hook 과밀 | Medium | `settings/admin/hooks/dashboard/**` | 24 |
| `src/lib/api/services/mock/matchSessions.ts` | 451 | mock session 생성 과밀 | Medium | `services/mock/matches/**` | 36 |
| `src/features/runs/hooks/useRunSaveFlow.ts` | 445 | 저장/기권 flow 과밀 | High | `runs/hooks/saveFlow/**` | 10 |
| `backend/src/repositories/runsRepository.mjs` | 443 | JSON repository 과밀 | Medium | `repositories/json/runs/**` | 29 |
| `backend/src/repositories/postgresLeagueRepository.mjs` | 441 | league query 과밀 | Medium | `repositories/postgres/league/**` | 32 |
| `src/features/auth/screens/UniversityVerificationScreen.tsx` | 438 | 대학 인증 화면 과밀 | Medium | `auth/components/universityVerification/**` | 16 |
| `src/features/runs/matchStateMachine.ts` | 437 | 상태 머신/helper 집중 | Medium | `runs/stateMachine/**` | 22 |
| `scripts/deploy-public-backend.mjs` | 432 | deploy script 과밀 | Low | `scripts/deployPublicBackend/**` | 53 |
| `backend/src/repositories/authRepository.test.mjs` | 414 | 테스트 harness 과밀 | Low | `repositories/testUtils/**` | 49 |
| `src/features/runs/matchRoomFlow.ts` | 401 | 방 UX 상태 모델 집중 | Medium | `match/utils/roomFlow/**` | 23 |
| `src/integrations/nativeHealth.ts` | 379 | native health helper 과밀 | Medium | `src/integrations/nativeHealth/**` | 37 |
| `backend/src/repositories/friendsRepository.mjs` | 373 | JSON repository 과밀 | Medium | `repositories/json/friends/**` | 33 |
| `src/features/friends/FriendsRanking.tsx` | 371 | 친구 랭킹 UI/model 과밀 | Medium | `friends/components/ranking/**` | 25 |
| `src/lib/api/services/matches.ts` | 365 | match service/mock 변환 과밀 | Medium | `services/match/**` | 38 |
| `src/lib/api/services/mock/matchScheduling.ts` | 358 | mock scheduling 과밀 | Medium | `services/mock/matchScheduling/**` | 39 |
| `scripts/generate-testflight-qa-report.mjs` | 349 | QA report script 과밀 | Low | `scripts/testflightQaReport/**` | 54 |
| `src/lib/api/services/rooms.ts` | 332 | room service 과밀 | Medium | `services/rooms/**` | 40 |
| `src/features/runs/hooks/useMatchLifecycle.ts` | 331 | 매칭 lifecycle 상태 과밀 | High | `runs/hooks/matchLifecycle/**` | 6 |
| `src/components/matches/liveMatchArena/styles.ts` | 325 | live arena style 상수 집중 | Low | `components/matches/liveMatchArena/styles/**` | 55 |
| `backend/src/repositories/runsRepository.test.mjs` | 320 | 테스트 harness 과밀 | Low | `repositories/testUtils/**` | 56 |
| `src/features/auth/hooks/useSignupForm.ts` | 320 | 회원가입 상태 hook 과밀 | Medium | `auth/hooks/signup/**` | 13 |
| `backend/src/repositories/authRepository.mjs` | 318 | JSON auth repository 과밀 | Medium | `repositories/json/auth/**` | 34 |
| `backend/src/points.mjs` | 316 | 포인트 계산 집중 | Medium | `backend/src/points/**` | 41 |
| `src/features/runs/hooks/usePartyRunSync.ts` | 315 | 파티런 sync effect 집중 | High | `runs/hooks/partyRunSync/**` | 7 |
| `backend/src/repositories/friendsRepository.test.mjs` | 314 | 테스트 harness 과밀 | Low | `repositories/testUtils/**` | 57 |
| `src/components/matches/LiveMatchRaceBoard.tsx` | 309 | 순위 보드 UI 과밀 | Medium | `components/matches/raceBoard/**` | 42 |
| `backend/src/bridges/sessionRunsBridge.mjs` | 305 | session run bridge 과밀 | Medium | `backend/src/bridges/sessionRuns/**` | 43 |
| `src/features/runs/components/matchSetupCards/styles.ts` | 303 | match setup style 집중 | Low | `matchSetupCards/styles/**` | 58 |
| `plugins/withHealthAccess.js` | 300 | native plugin config 집중 | Low | `plugins/healthAccess/**` | 59 |
| `src/features/league/components/LeagueRegionSelectorCard.tsx` | 300 | 지역 선택 카드 JSX 과밀 | Medium | `league/components/regionSelector/**` | 44 |

## 상태와 Effect 밀도

| 파일 경로 | 문제 유형 | 왜 무거운지 | 위험도 | 추천 분리 위치 | 우선순위 |
| --- | --- | --- | --- | --- | --- |
| `src/features/runs/hooks/useMatchLifecycle.ts` | `useState` 22개 | 1대1/그룹 매칭 상태와 요청/취소/나가기 상태가 함께 있다. 상태 변경 범위가 넓다. | High | `useDuelMatchLifecycle.ts`, `useGroupMatchLifecycle.ts` | 1 |
| `src/features/auth/hooks/useSignupForm.ts` | `useState` 14개 | 회원가입 입력/지역/중복확인/제출 상태가 한 hook에 있다. | Medium | `auth/hooks/signup/useSignupIdentity.ts`, `useSignupRegion.ts` | 5 |
| `src/features/auth/screens/AccountRecoveryScreen.tsx` | `useState` 11개, 화면 직접 API | 아이디 찾기와 비밀번호 재설정 form이 한 화면에 있다. | Medium | `auth/hooks/useAccountRecovery.ts`, `auth/components/accountRecovery/**` | 6 |
| `src/features/settings/admin/hooks/useAdminDashboard.ts` | `useState` 10개, service 호출 3회 | 관리자 도메인 여러 개의 filter/form 상태가 한 hook에 있다. | Medium | `settings/admin/hooks/useNoticeAdmin.ts`, `useMarketAdmin.ts`, `useRaceAdmin.ts` | 8 |
| `src/features/runs/hooks/usePartyRunRoom.ts` | `useState` 8개 | 파티런 생성/입장/초대 코드 상태가 함께 있다. | Medium | `runs/hooks/partyRoom/usePartyRoomEntry.ts` | 9 |
| `src/features/settings/hooks/useNotificationSettings.ts` | `useState` 7개 | 알림 설정 개별 상태가 많다. | Low | reducer 또는 object state | 12 |
| `src/features/runs/TrackRunExperience.tsx` | `useEffect` 21개 | 화면 전환, polling, 알림, stale cleanup, match sync가 한 컴포넌트에 연결된다. | High | `runs/hooks/navigationEffects/**`, `matchPolling/**` | 2 |
| `src/features/runs/hooks/useLiveMatchNavigationEffects.ts` | `useEffect` 6개 | 화면 이동 effect가 많아 순서가 꼬이면 대결 탭 이탈이 발생할 수 있다. | High | `navigationEffects/useArenaHandoffEffect.ts` | 3 |
| `src/features/runs/hooks/usePartyRunSync.ts` | `useEffect` 5개 | room polling, countdown ready, linked match sync가 함께 있다. | High | `partyRunSync/**` | 4 |
| `src/features/runs/hooks/useRunTrackingFlow.ts` | `useEffect` 4개 | AppState, pedometer, auto start, background sync가 함께 있다. | High | `tracking/useTrackingLifecycleEffects.ts` | 7 |
| `src/features/runs/hooks/useMatchRoomLobby.ts` | `useEffect` 4개 | 대기실 data loading/settings sync가 한 hook에 있다. | High | `match/hooks/lobby/**` | 10 |

## 반복 JSX와 긴 리스트 렌더링

| 파일 경로 | 문제 유형 | 왜 무거운지 | 위험도 | 추천 분리 위치 | 우선순위 |
| --- | --- | --- | --- | --- | --- |
| `src/features/settings/screens/AdminScreen.tsx` | 긴 JSX, `ScrollView` + `.map()` 5회 | 회원/공지/마켓/교환/레이스 목록이 모두 한 ScrollView 안에서 렌더링된다. 데이터가 늘면 Android/web 모두 렌더 비용이 커진다. | High | `settings/admin/components/NoticeAdminSection.tsx`, `UserAdminSection.tsx`, `MarketAdminSection.tsx`, list는 `FlatList` | 1 |
| `src/features/auth/screens/UniversityVerificationScreen.tsx` | JSX 반복, `.map()` 4회 | 대학 목록/선택 UI가 화면에 직접 있다. 대학 데이터 증가 시 렌더 비용이 커진다. | Medium | `auth/components/universityVerification/UniversityList.tsx` | 4 |
| `src/features/runs/components/matchSetupCards/MatchSetupCommon.tsx` | `ScrollView` + `.map()` 4회 | 날짜/시간 슬롯 선택이 ScrollView map 기반이다. 항목 수는 제한적이지만 반복 렌더 후보다. | Medium | `matchSetupCards/DateSlotList.tsx`, `TimeSlotList.tsx` | 8 |
| `src/features/runs/components/LiveMatchPager.tsx` | horizontal `ScrollView` + `.map()` | 대결/순위/기록 페이지를 pager로 렌더링한다. 페이지 수는 작지만 Android gesture/scroll 병목과 연결될 수 있다. | Medium | `LiveMatchPagerItem.tsx`, memoized page array | 6 |
| `src/features/runs/components/matchRoom/MatchRoomWheelColumn.tsx` | wheel `ScrollView` + `.map()` | 예약 시간 wheel 특성상 intentional이지만 Android에서 스크롤 이벤트가 잦다. | Medium | `FlatList` wheel 또는 memoized item | 9 |
| `src/features/runs/components/LiveMatchTrackingPage.tsx` | 561줄, 기록 카드 반복 | 기록 보기 UI가 길고 조건부 렌더가 많다. | Medium | `TrackingMetricsCard.tsx`, `MatchExitSection.tsx` | 10 |
| `src/components/matches/LiveMatchRaceBoard.tsx` | 309줄, 순위 보드 UI 집중 | 순위 row/list 표시가 한 파일에 있다. | Medium | `raceBoard/RaceBoardRow.tsx`, `RaceBoardProgressBar.tsx` | 11 |
| `src/features/friends/FriendsRanking.tsx` | 371줄, 랭킹 UI/model 혼재 | 친구 랭킹 row, summary, sort/display logic이 함께 있다. | Medium | `friends/components/ranking/FriendRankingList.tsx` | 12 |
| `src/features/league/components/LeagueRegionSelectorCard.tsx` | 300줄, 지역 선택 카드 | 지역 node 렌더링과 breadcrumb/action UI가 커졌다. | Medium | `league/components/regionSelector/**` | 13 |

## 렌더링 중 계산 후보

| 파일 경로 | 문제 유형 | 왜 무거운지 | 위험도 | 추천 분리 위치 | 우선순위 |
| --- | --- | --- | --- | --- | --- |
| `src/features/settings/screens/AdminScreen.tsx` | render 경로 `.map()` 5회 | 각 목록이 화면 렌더 때 바로 JSX로 변환된다. filtered 데이터는 hook에서 오지만 row rendering은 크다. | High | section/list 컴포넌트 + memoized row | 1 |
| `src/features/auth/screens/UniversityVerificationScreen.tsx` | render 경로 `.map()` 4회 | 대학 선택 목록이 화면 렌더링과 결합되어 있다. | Medium | `UniversityList` + `useMemo` | 4 |
| `src/features/match/screens/MatchRecordScreen.tsx` | render 경로 `.filter()` | match record filter가 화면에 남아 있다. | Medium | `match/hooks/useMatchRecords.ts` | 5 |
| `src/features/integrations/screens/ConnectSourcesScreen.tsx` | render 경로 `.filter()`/`.map()` | connected source 선택 계산이 화면 가까이에 있다. | Medium | `integrations/hooks/useConnectSourcesModel.ts` | 6 |
| `src/features/home/screens/HomeScreen.tsx` | render 경로 `.map()` | upcoming match card action list 등 작은 map이 있다. 위험은 낮다. | Low | 유지 또는 `HomeActionList` | 15 |
| `src/features/runs/matchProgress.ts` | `.sort()` 2회, `.map()` 3회 | 순수 계산 파일이라 UI 렌더 직접 문제는 아니지만, live match 중 자주 호출되면 비용이 누적될 수 있다. | Medium | `matchProgress/groupStandings.ts`, memoized caller | 7 |
| `src/lib/matchCountdown.ts` | `.filter().map().sort()` | countdown 후보 계산이 자주 호출될 가능성이 있다. | Medium | precomputed upcoming entry model 또는 memoized selector | 8 |
| `src/features/runs/matchRoomFlow.ts` | `.map()` 5회, `.filter()` 3회 | 방 참가자 UX model 계산이 polling과 함께 자주 돌 수 있다. | Medium | selector 함수 memoization, participant row model 분리 | 9 |
| `src/features/runs/matchViewModels.ts` | view model 계산 후보 | 대결 화면 참가자 위치/표시 모델 생성이 live update마다 호출된다. | High | Android 1초 throttle + memoized participant model | 3 |

## 위치/지도/센서/알림 로직 후보

| 파일 경로 | 문제 유형 | 왜 무거운지 | 위험도 | 추천 분리 위치 | 우선순위 |
| --- | --- | --- | --- | --- | --- |
| `src/features/runs/backgroundTracking.ts` | expo-location/task-manager 집중 | 위치 watcher와 background task가 핵심 파일에 집중되어 있다. 중복 등록/cleanup 누락 시 Android 렉 위험이 크다. | High | `tracking/background/locationTask.ts`, `tracking/background/subscriptions.ts` | 1 |
| `src/features/runs/hooks/useRunTrackingFlow.ts` | pedometer/AppState/background sync 직접 연결 | 화면 상태와 센서 sync를 연결한다. focus 상태와 status 조건이 꼬이면 불필요한 subscription이 살아남을 수 있다. | High | `usePedometerTracking.ts`, `useTrackingAppStateSync.ts` | 2 |
| `src/features/runs/RunRouteMap.native.tsx` | react-native-maps | 지도 region, polyline, marker props가 route update마다 새로 만들어질 수 있다. 현재 지도는 기록보기에서 빠졌지만 남은 사용처는 주의 필요. | Medium | `RunRouteMapMemo.tsx`, `useMemo` coordinates/region | 7 |
| `src/lib/matchNotifications.ts` | expo-notifications | 예약 알림 동기화는 화면 밖 lib로 분리되어 있어 구조는 좋지만, upcoming match 변경마다 호출된다. | Medium | scheduled notification diff selector | 8 |
| `src/navigation/notificationHandler.ts` | notification handler effect | root navigation에 걸리는 전역 side effect다. 현재는 작지만 startup path라 유지 관찰 필요. | Low | 유지 | 16 |
| `src/features/integrations/IntegrationJourneyCard.tsx` | integration provider 상태 계산 | 실제 센서 watcher는 아니지만 native health/provider 상태 표시에 플랫폼 분기가 많다. | Low | `integrations/components/journey/**` | 20 |
| `src/features/integrations/NrcBridgeGuideCard.tsx` | 플랫폼 guide/health 관련 분기 | 직접 센서 watcher는 아니지만 native 연동 안내 로직이 크다. | Low | `components/nrcGuide/**` | 21 |

## API 호출 위치

| 파일 경로 | 문제 유형 | 왜 무거운지 | 위험도 | 추천 분리 위치 | 우선순위 |
| --- | --- | --- | --- | --- | --- |
| `src/features/runs/TrackRunExperience.tsx` | 화면성 컴포넌트에서 services import | `fetchRunningMatchStatus`, `fetchUpcomingRunningMatches`, `requestDuelMatch`, `requestGroupMatch`, room 관련 service가 직접 연결된다. 일부는 hook으로 더 빼면 화면 책임이 얇아진다. | High | `runs/hooks/useTrackRunDataSync.ts`, `useMatchActions.ts` | 1 |
| `src/features/runs/hooks/useMatchRoomLobby.ts` | hook 내부 service 3회 | hook이라 화면보다는 낫지만, lobby API와 state model이 함께 커졌다. | Medium | `match/services/roomLobbyActions.ts`, `useRoomSnapshot.ts` | 3 |
| `src/features/runs/hooks/useRunTrackingFlow.ts` | tracking hook에서 live share/progress service | tracking runtime과 network sync가 함께 있다. 네트워크 지연이 tracking update와 엮이지 않게 분리하는 편이 안전하다. | High | `useMatchProgressHeartbeat.ts`, `useLiveShareHeartbeat.ts` | 2 |
| `src/features/runs/hooks/useRunSaveFlow.ts` | 저장/기권 service | 저장 side effect는 hook으로 들어가 있지만 함수가 길다. | Medium | `saveFlow/runSaveServiceAdapter.ts` | 6 |
| `src/features/auth/screens/AccountRecoveryScreen.tsx` | 화면에서 session API 직접 호출 | 아이디 찾기/비밀번호 재설정 API가 화면 함수 안에 있다. 화면 책임 분리 기준에 걸린다. | Medium | `auth/hooks/useAccountRecovery.ts` | 4 |
| `src/features/auth/hooks/useSignupForm.ts` | signup hook에서 catalog/session API | hook으로 분리되어 구조는 괜찮지만 상태가 많다. | Medium | `auth/hooks/signup/**` | 5 |
| `src/features/settings/admin/hooks/useAdminDashboard.ts` | admin service 호출과 상태 집중 | 관리자 기능상 괜찮지만 hook이 커졌다. | Low | `settings/admin/hooks/**` | 15 |
| `src/lib/session.ts` | apiClient wrapper와 storage 결합 | session API와 storage/migration이 한 파일에 있다. | Medium | `lib/session/storage.ts`, `services/authService.ts` | 7 |

## console 로그

| 파일 경로 | 문제 유형 | 왜 무거운지 | 위험도 | 추천 분리 위치 | 우선순위 |
| --- | --- | --- | --- | --- | --- |
| `app`, `src` 앱 런타임 코드 | `console.*` 0개 | 앱 화면 성능에 직접 영향을 주는 console 로그는 현재 감지되지 않았다. | Low | 없음 | - |
| `backend/src/server.mjs` | `console.*` 11개 | 서버 시작/종료/error logging이다. 운영 로그라 제거보다 structured logger 전환이 맞다. | Low | `backend/src/logger.mjs` | 30 |
| `scripts/check-preview-public-api.mjs` | `console.*` 19개 | CLI 출력용 로그다. 앱 성능과 무관하다. | Low | 유지 또는 script logger | 50 |
| `scripts/deploy-public-backend.mjs` | `console.*` 16개 | 배포 CLI 출력이다. 앱 성능과 무관하다. | Low | 유지 | 51 |
| `backend/db/migrate-json-to-postgres.mjs` | `console.*` 10개 | migration CLI 출력이다. 앱 성능과 무관하다. | Low | 유지 | 52 |

## 추천 작업 순서

1. `TrackRunExperience.tsx`에서 effect orchestration을 더 분리한다.
2. `useRunTrackingFlow.ts`와 `backgroundTracking.ts`의 위치/센서 runtime을 더 작은 hook/service로 나눈다.
3. `usePartyRunSync.ts`, `useMatchRoomLobby.ts`, `useMatchLifecycle.ts`를 파티런 상태 머신 기준으로 다시 자른다.
4. `AdminScreen.tsx`의 긴 목록을 section component와 list component로 분리한다.
5. `AccountRecoveryScreen.tsx`와 `useSignupForm.ts`의 auth form 상태를 hook/section 단위로 정리한다.
6. `matchProgress.ts`, `matchRoomFlow.ts`, `matchViewModels.ts`에 memoized selector 또는 더 작은 순수 함수 단위를 만든다.
7. `backend/src/server.mjs`는 프론트 QA가 안정된 뒤 presenter/service 잔여 분리를 이어간다.

## 해석 주의

- 이 문서는 정적 분석 기반이라 false positive가 있다.
- `scripts/**`, `backend/**.test.mjs`의 console과 큰 파일은 앱 런타임 렉과 직접 연결되지는 않는다.
- Android 성능에 직접 연결되는 최우선 후보는 `TrackRunExperience`, `useRunTrackingFlow`, `backgroundTracking`, `usePartyRunSync`, `matchViewModels`, `LiveMatchPager`다.
- 이번 작업에서는 기능 파일을 수정하지 않았다. 후속 작업은 한 축씩 작게 커밋하는 방식이 안전하다.
