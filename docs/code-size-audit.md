# Code Size Audit

작성일: 2026-05-13

이번 문서는 코드 수정 없이 파일 크기, 함수 길이, 화면 상태 밀도, 중복 코드 후보를 정리한 감사 결과다. 기준은 `app`, `src`, `backend`, `scripts` 아래의 `.ts`, `.tsx`, `.js`, `.mjs` 파일이다.

## 요약

- 300줄 이상 파일: 52개
- 500줄 이상 파일: 23개
- 50줄 이상 함수 후보: 228개
- 가장 먼저 줄일 곳: `TrackRunExperience.tsx`, `useRunTrackingFlow.ts`, `useMatchRoomLobby.ts`, `backend/src/server.mjs`
- 가장 위험한 중복 축: 러닝 측정 ref/state 묶음, integration source 연결 핸들러, match progress 타입 중복, 저장/로딩 패턴

## 500줄 이상 파일

| 우선순위 | 파일 | 줄 수 | 문제 이유 | 분리 추천 위치 |
|---|---:|---:|---|---|
| High | `backend/src/server.mjs` | 5980 | 서버 엔트리, response builder, match/session/phone/auth 처리 로직이 한 파일에 남아 변경 영향 범위가 크다. | `backend/src/routes/**`, `backend/src/services/**`, `backend/src/presenters/**` |
| High | `src/features/runs/TrackRunExperience.tsx` | 2812 | 실시간 러닝 화면, 대결 진입, 파티런, 저장, 기권, 화면 전환 효과가 한 컴포넌트에 집중되어 있다. | `src/features/runs/containers/**`, `src/features/runs/hooks/**`, `src/features/runs/components/live/**` |
| Medium | `src/features/settings/screens/AdminScreen.tsx` | 1550 | 관리자 데이터 조회, 필터링, 폼, 목록 렌더링이 한 화면에 섞여 있다. | `src/features/settings/admin/components/**`, `src/features/settings/admin/hooks/**` |
| Medium | `backend/db/migrate-json-to-postgres.mjs` | 1056 | 마이그레이션 plan 생성, row 변환, 실행 흐름이 길다. | `backend/db/migrations/**`, `backend/db/row-builders/**` |
| Medium | `backend/src/smoke.mjs` | 1013 | smoke 시나리오가 커져 실패 지점 추적이 어렵다. | `backend/src/smoke/**` |
| High | `src/features/auth/screens/SignupFormScreen.tsx` | 933 | 회원가입 입력 상태, 지역 선택, 검증, 제출 UI가 한 화면에 집중되어 있다. | `src/features/auth/components/signup/**`, `src/features/auth/hooks/useSignupForm.ts` |
| High | `src/features/runs/hooks/useRunTrackingFlow.ts` | 829 | 위치, 페도미터, 카운트다운, 백그라운드 tracking, 서버 progress sync 흐름이 한 hook에 집중되어 Android 렉 원인 추적이 어렵다. | `src/features/runs/tracking/**`, `src/features/runs/hooks/useLocationTracking.ts`, `usePedometerTracking.ts` |
| Medium | `src/features/integrations/NrcBridgeGuideCard.tsx` | 774 | iOS/Android 안내 섹션과 action button 렌더링이 커져 문구 변경 비용이 높다. | `src/features/integrations/components/nrcGuide/**` |
| Medium | `backend/src/repositories/postgresFriendsRepository.mjs` | 715 | 친구 repository query와 변환이 길다. | `backend/src/repositories/postgres/friends/**` |
| High | `src/features/runs/backgroundTracking.ts` | 651 | 위치 task, snapshot, abandoned state, route 계산이 한 파일에 있다. | `src/features/runs/tracking/background/**` |
| Medium | `src/data/mock.ts` | 647 | mock 데이터 생성기가 여러 도메인을 함께 갖고 있다. | `src/data/mock/**` |
| Medium | `backend/src/repositories/postgresRunsRepository.mjs` | 639 | 러닝 repository query, import sync, 변환이 길다. | `backend/src/repositories/postgres/runs/**` |
| Low | `backend/src/repositories/postgresAuthRepository.test.mjs` | 616 | 테스트 harness가 길다. 기능 위험은 낮지만 유지보수 비용이 있다. | `backend/src/repositories/testUtils/**` |
| High | `src/features/runs/hooks/useMatchRoomLobby.ts` | 602 | 대기실 조회, 준비, 초대, 예약, 시작, 이동 로직이 한 hook에 섞여 파티런 버그 추적이 어렵다. | `src/features/match/hooks/useMatchRoomLobby/**` |
| High | `src/lib/session.ts` | 561 | 세션 저장, 계정 등록, legacy migration, secure storage 접근이 섞여 있다. | `src/lib/session/**`, `src/services/authSessionService.ts` |
| Medium | `src/features/runs/components/LiveMatchTrackingPage.tsx` | 560 | 기록 보기 화면의 카드/그룹 요약/상태 UI가 많다. | `src/features/runs/components/liveTracking/**` |
| Medium | `src/features/auth/screens/UniversityVerificationScreen.tsx` | 557 | 대학 인증 화면의 선택, 필터, 제출 UI가 크다. | `src/features/auth/components/universityVerification/**` |
| Medium | `scripts/run-release-gate.mjs` | 552 | release gate step 구성과 출력/진단 처리가 한 파일에 있다. | `scripts/releaseGate/**` |
| Medium | `backend/src/seed.mjs` | 527 | region, market, user seed 생성이 섞여 있다. | `backend/src/seed/**` |
| Medium | `src/features/home/HomeOverview.tsx` | 521 | 홈 overview의 포인트, 달력, 요약 카드 조립이 길다. | `src/features/home/components/overview/**` |
| Low | `backend/src/repositories/postgresRunsRepository.test.mjs` | 514 | 테스트 query harness가 길다. | `backend/src/repositories/testUtils/**` |
| Low | `backend/src/runningMatchContract.test.mjs` | 509 | 계약 테스트 시나리오가 길다. | `backend/src/tests/runningMatch/**` |
| Medium | `backend/src/repositories/postgresAuthRepository.mjs` | 503 | auth repository query와 register 흐름이 길다. | `backend/src/repositories/postgres/auth/**` |

## 300줄 이상 파일

| 우선순위 | 파일 | 줄 수 | 문제 이유 | 분리 추천 위치 |
|---|---:|---:|---|---|
| High | `backend/src/server.mjs` | 5980 | 서버 핵심 로직 집중 | `backend/src/routes/**`, `backend/src/services/**` |
| High | `src/features/runs/TrackRunExperience.tsx` | 2812 | 러닝/대결 중심 화면 집중 | `src/features/runs/containers/**` |
| Medium | `src/features/settings/screens/AdminScreen.tsx` | 1550 | 관리자 화면 과밀 | `src/features/settings/admin/**` |
| Medium | `backend/db/migrate-json-to-postgres.mjs` | 1056 | 마이그레이션 과밀 | `backend/db/migrations/**` |
| Medium | `backend/src/smoke.mjs` | 1013 | smoke 시나리오 과밀 | `backend/src/smoke/**` |
| High | `src/features/auth/screens/SignupFormScreen.tsx` | 933 | 회원가입 화면 과밀 | `src/features/auth/components/signup/**` |
| High | `src/features/runs/hooks/useRunTrackingFlow.ts` | 829 | tracking flow 과밀 | `src/features/runs/tracking/**` |
| Medium | `src/features/integrations/NrcBridgeGuideCard.tsx` | 774 | 안내 카드 과밀 | `src/features/integrations/components/nrcGuide/**` |
| Medium | `backend/src/repositories/postgresFriendsRepository.mjs` | 715 | repository query 과밀 | `backend/src/repositories/postgres/friends/**` |
| High | `src/features/runs/backgroundTracking.ts` | 651 | 위치 추적 상태/계산 집중 | `src/features/runs/tracking/background/**` |
| Medium | `src/data/mock.ts` | 647 | mock 생성기 집중 | `src/data/mock/**` |
| Medium | `backend/src/repositories/postgresRunsRepository.mjs` | 639 | repository query 과밀 | `backend/src/repositories/postgres/runs/**` |
| Low | `backend/src/repositories/postgresAuthRepository.test.mjs` | 616 | 테스트 harness 과밀 | `backend/src/repositories/testUtils/**` |
| High | `src/features/runs/hooks/useMatchRoomLobby.ts` | 602 | 파티런 대기실 flow 집중 | `src/features/match/hooks/lobby/**` |
| High | `src/lib/session.ts` | 561 | auth/session/storage/migration 혼재 | `src/lib/session/**` |
| Medium | `src/features/runs/components/LiveMatchTrackingPage.tsx` | 560 | 기록 보기 UI 과밀 | `src/features/runs/components/liveTracking/**` |
| Medium | `src/features/auth/screens/UniversityVerificationScreen.tsx` | 557 | 대학 인증 화면 과밀 | `src/features/auth/components/universityVerification/**` |
| Medium | `scripts/run-release-gate.mjs` | 552 | release gate script 과밀 | `scripts/releaseGate/**` |
| Medium | `backend/src/seed.mjs` | 527 | seed 생성기 집중 | `backend/src/seed/**` |
| Medium | `src/features/home/HomeOverview.tsx` | 521 | 홈 overview 조립 과밀 | `src/features/home/components/overview/**` |
| Low | `backend/src/repositories/postgresRunsRepository.test.mjs` | 514 | 테스트 harness 과밀 | `backend/src/repositories/testUtils/**` |
| Low | `backend/src/runningMatchContract.test.mjs` | 509 | 계약 테스트 시나리오 과밀 | `backend/src/tests/runningMatch/**` |
| Medium | `backend/src/repositories/postgresAuthRepository.mjs` | 503 | auth repository 과밀 | `backend/src/repositories/postgres/auth/**` |
| Medium | `backend/src/store.mjs` | 483 | store migration/cache/diagnostics 혼재 | `backend/src/store/**` |
| Medium | `scripts/check-preview-public-api.mjs` | 481 | preview smoke script 과밀 | `scripts/previewSmoke/**` |
| High | `src/features/runs/matchProgress.ts` | 467 | 대결 progress 계산과 display model 혼재 | `src/features/runs/matchProgress/**` |
| Low | `backend/src/repositories/postgresFriendsRepository.test.mjs` | 455 | 테스트 query harness 과밀 | `backend/src/repositories/testUtils/**` |
| Medium | `src/lib/api/services/mock/matchSessions.ts` | 450 | mock match session 생성 과밀 | `src/lib/api/services/mock/matches/**` |
| High | `src/features/runs/hooks/useRunSaveFlow.ts` | 443 | 저장/기권/결과 이동 flow 집중 | `src/features/runs/hooks/saveFlow/**` |
| Medium | `backend/src/repositories/runsRepository.mjs` | 442 | JSON runs repository 과밀 | `backend/src/repositories/json/runs/**` |
| Medium | `backend/src/repositories/postgresLeagueRepository.mjs` | 440 | league repository query 과밀 | `backend/src/repositories/postgres/league/**` |
| High | `src/features/runs/matchStateMachine.ts` | 436 | 상태 머신 transition과 helper 집중 | `src/features/runs/stateMachine/**` |
| Medium | `scripts/deploy-public-backend.mjs` | 431 | deploy script 과밀 | `scripts/deployPublicBackend/**` |
| Low | `backend/src/repositories/authRepository.test.mjs` | 413 | 테스트 harness 과밀 | `backend/src/repositories/testUtils/**` |
| High | `src/features/runs/matchRoomFlow.ts` | 400 | 방 UX 상태 계산 집중 | `src/features/match/utils/roomFlow/**` |
| Medium | `src/integrations/nativeHealth.ts` | 378 | native health readiness/import helper 집중 | `src/integrations/nativeHealth/**` |
| Medium | `backend/src/repositories/friendsRepository.mjs` | 372 | JSON friends repository 과밀 | `backend/src/repositories/json/friends/**` |
| Medium | `src/features/friends/FriendsRanking.tsx` | 370 | 랭킹 화면/행/요약 UI 집중 | `src/features/friends/components/ranking/**` |
| Medium | `src/lib/api/services/matches.ts` | 364 | match API service 응답 변환 포함 | `src/services/match/**` |
| Medium | `src/lib/api/services/mock/matchScheduling.ts` | 357 | mock scheduling 과밀 | `src/lib/api/services/mock/matchScheduling/**` |
| Low | `scripts/generate-testflight-qa-report.mjs` | 348 | 리포트 생성 script 과밀 | `scripts/testflightQaReport/**` |
| Medium | `src/lib/api/services/rooms.ts` | 331 | room API service 과밀 | `src/services/rooms/**` |
| High | `src/features/runs/hooks/useMatchLifecycle.ts` | 330 | 대결 신청/카운트다운/화면 이동 상태 집중 | `src/features/runs/hooks/matchLifecycle/**` |
| Medium | `src/components/matches/liveMatchArena/styles.ts` | 324 | 스타일 상수 집중, Android 튜닝 영향 가능 | `src/components/matches/liveMatchArena/styles/**` |
| Low | `backend/src/repositories/runsRepository.test.mjs` | 319 | 테스트 harness 과밀 | `backend/src/repositories/testUtils/**` |
| Medium | `backend/src/repositories/authRepository.mjs` | 317 | JSON auth repository 과밀 | `backend/src/repositories/json/auth/**` |
| High | `src/features/runs/hooks/usePartyRunSync.ts` | 315 | countdown ready ack, polling, linked match sync 집중 | `src/features/runs/hooks/partyRunSync/**` |
| Medium | `backend/src/points.mjs` | 315 | 포인트/러닝 metric 계산 집중 | `backend/src/points/**` |
| Low | `backend/src/repositories/friendsRepository.test.mjs` | 313 | 테스트 harness 과밀 | `backend/src/repositories/testUtils/**` |
| Medium | `src/components/matches/LiveMatchRaceBoard.tsx` | 308 | 순위 보드 row/list/style 집중 | `src/components/matches/raceBoard/**` |
| Medium | `backend/src/bridges/sessionRunsBridge.mjs` | 304 | bridge read fallback 과밀 | `backend/src/bridges/sessionRuns/**` |
| Medium | `src/features/runs/components/matchSetupCards/styles.ts` | 302 | match setup 스타일 집중 | `src/features/runs/components/matchSetupCards/styles/**` |

## 50줄 이상 함수 주요 후보

전체 228개가 50줄 이상이다. 아래는 우선 분리 효과가 큰 후보 중심 목록이다.

| 우선순위 | 파일:라인 | 함수 | 줄 수 | 문제 이유 | 분리 추천 위치 |
|---|---|---:|---:|---|---|
| High | `src/features/runs/TrackRunExperience.tsx:121` | `TrackRunExperience` | 2041 | 앱 핵심 러닝/대결 화면의 상태 조립과 화면 조립이 한 함수에 남아 있다. | `src/features/runs/containers/TrackRunExperienceContainer.tsx`, `src/features/runs/hooks/**` |
| Medium | `backend/src/smoke.mjs:89` | `main` | 920 | smoke scenario가 길어 실패 구간 분리가 어렵다. | `backend/src/smoke/scenarios/**` |
| Medium | `src/features/settings/screens/AdminScreen.tsx:389` | `AdminScreen` | 841 | 관리자 화면 상태와 렌더링이 한 함수에 집중되어 있다. | `src/features/settings/admin/**` |
| High | `src/features/runs/hooks/useRunTrackingFlow.ts:45` | `useRunTrackingFlow` | 785 | 위치/센서/서버 sync/카운트다운이 한 hook에 묶여 Android 병목 추적이 어렵다. | `src/features/runs/tracking/**` |
| High | `src/features/auth/screens/SignupFormScreen.tsx:55` | `SignupFormScreen` | 530 | 회원가입 form state와 region UI가 크다. | `src/features/auth/hooks/useSignupForm.ts`, `components/signup/**` |
| High | `src/features/runs/hooks/useMatchRoomLobby.ts:80` | `useMatchRoomLobby` | 523 | 방 조회/준비/초대/시작/예약이 한 hook에 있다. | `src/features/match/hooks/lobby/**` |
| High | `src/features/runs/hooks/useRunSaveFlow.ts:118` | `useRunSaveFlow` | 326 | 저장/기권/상대 기권/결과 이동 flow가 같이 있다. | `src/features/runs/hooks/saveFlow/**` |
| High | `src/features/runs/hooks/useMatchLifecycle.ts:30` | `useMatchLifecycle` | 301 | 1대1/그룹 신청 상태와 active match 이동 상태가 섞여 있다. | `src/features/runs/hooks/matchLifecycle/**` |
| Medium | `src/features/auth/screens/UniversityVerificationScreen.tsx:56` | `UniversityVerificationScreen` | 285 | 대학 인증 선택/필터/상태/렌더링이 크다. | `src/features/auth/components/universityVerification/**` |
| Medium | `src/data/mock.ts:258` | `createOfflineRaceHubMock` | 281 | mock data generation이 길다. | `src/data/mock/offlineRace.ts` |
| Medium | `backend/src/repositories/postgresRunsRepository.mjs:369` | `createPostgresRunsRepository` | 271 | runs repository query와 sync가 길다. | `backend/src/repositories/postgres/runs/**` |
| Medium | `backend/src/repositories/postgresAuthRepository.mjs:246` | `createPostgresAuthRepository` | 258 | auth repository query와 register가 길다. | `backend/src/repositories/postgres/auth/**` |
| Medium | `backend/src/bridges/friendsLeagueBridge.mjs:22` | `createFriendsLeagueBridge` | 232 | bridge fallback/read mapping이 길다. | `backend/src/bridges/friendsLeague/**` |
| Medium | `src/features/runs/components/LiveMatchArenaPage.tsx:52` | `LiveMatchArenaPage` | 230 | live arena props 조립과 UI 조건이 길다. | `src/features/runs/components/liveArena/**` |
| High | `src/features/runs/hooks/usePartyRunSync.ts:88` | `usePartyRunSync` | 228 | countdown ready ack/polling/open linked match가 같이 있다. | `src/features/runs/hooks/partyRunSync/**` |
| Medium | `src/features/integrations/NrcBridgeGuideCard.tsx:444` | `renderActionButtons` | 216 | guide card action branch가 길다. | `src/features/integrations/components/nrcGuide/NrcGuideActions.tsx` |
| Medium | `backend/src/repositories/postgresFriendsRepository.mjs:503` | `createPostgresFriendsRepository` | 213 | friends repository query가 길다. | `backend/src/repositories/postgres/friends/**` |
| Medium | `scripts/check-preview-public-api.mjs:259` | `main` | 211 | preview smoke orchestration이 길다. | `scripts/previewSmoke/**` |
| High | `backend/src/server.mjs:2486` | `buildRunningMatchStatusResponse` | 210 | match status response builder가 서버 파일에 남아 있다. | `backend/src/presenters/runningMatchStatusPresenter.mjs` |
| Medium | `src/features/home/HomeOverview.tsx:7` | `HomeOverview` | 209 | overview calendar/point summary UI가 크다. | `src/features/home/components/overview/**` |
| Medium | `src/features/integrations/screens/IntegrationManagementScreen.tsx:35` | `IntegrationManagementScreen` | 205 | integration loading/action UI가 길다. | `src/features/integrations/hooks/useIntegrationActions.ts` |
| Medium | `backend/src/repositories/friendsRepository.mjs:170` | `createJsonFriendsRepository` | 203 | JSON friends repository가 길다. | `backend/src/repositories/json/friends/**` |
| Medium | `src/features/runs/components/LiveMatchRaceBoardPage.tsx:63` | `LiveMatchRaceBoardPage` | 201 | 순위 보드 row model 생성이 많다. | `src/features/runs/components/raceBoard/**` |
| High | `src/features/runs/hooks/useLiveMatchProgress.ts:32` | `useLiveMatchProgress` | 197 | display/official/fallback progress 계산이 한 hook에 있다. | `src/features/runs/hooks/liveProgress/**` |
| Medium | `backend/src/repositories/authRepository.mjs:127` | `createJsonAuthRepository` | 191 | JSON auth repository가 길다. | `backend/src/repositories/json/auth/**` |
| Medium | `src/lib/api/services/mock/matchSessions.ts:117` | `buildMockGroupMatchResponse` | 181 | mock group response 생성이 길다. | `src/lib/api/services/mock/matchSessions/group.ts` |
| Medium | `backend/src/routes/adminRoutes.mjs:1` | `routeAdminRequest` | 177 | admin route dispatch가 길다. | `backend/src/routes/admin/**` |
| Medium | `src/features/friends/screens/FriendsScreen.tsx:17` | `FriendsScreen` | 175 | 친구 sync/load/filter/state가 한 화면에 있다. | `src/features/friends/hooks/useFriendsScreen.ts` |
| Medium | `src/features/home/screens/HomeScreen.tsx:42` | `HomeScreen` | 172 | 홈 로딩/다가오는 대결/알림 상태가 한 화면에 있다. | `src/features/home/hooks/useHomeScreen.ts` |
| High | `src/features/runs/hooks/useLiveMatchNavigationEffects.ts:52` | `useLiveMatchNavigationEffects` | 172 | 화면 전환 effect가 많아 파티런 화면 튐과 관련된다. | `src/features/runs/hooks/navigationEffects/**` |
| Medium | `src/features/runs/components/matchSetupCards/GroupMatchSetupCard.tsx:14` | `GroupMatchSetupCard` | 171 | group setup card JSX가 길다. | `src/features/runs/components/matchSetupCards/group/**` |
| Medium | `backend/src/bridges/sessionRunsBridge.mjs:136` | `createSessionRunsBridge` | 169 | session/run bridge fallback이 길다. | `backend/src/bridges/sessionRuns/**` |
| Medium | `src/features/integrations/screens/IntegrationsScreen.tsx:24` | `IntegrationsScreen` | 169 | integration action과 화면 조립이 길다. | `src/features/integrations/hooks/useIntegrationActions.ts` |
| Medium | `src/features/auth/screens/AccountRecoveryScreen.tsx:42` | `AccountRecoveryScreen` | 168 | 아이디 찾기/비밀번호 재설정 폼이 한 화면에 있다. | `src/features/auth/components/accountRecovery/**` |
| Medium | `backend/src/repositories/marketRepository.mjs:5` | `createJsonMarketRepository` | 165 | market repository가 길다. | `backend/src/repositories/json/market/**` |
| Medium | `backend/src/points.mjs:115` | `buildUserRunMetrics` | 161 | 포인트/러닝 metric 계산이 길다. | `backend/src/points/runMetrics.mjs` |
| Medium | `src/features/runs/hooks/useMatchCountdownModel.ts:39` | `useMatchCountdownModel` | 154 | 카운트다운/visible party flow 계산이 길다. | `src/features/runs/hooks/countdown/**` |
| Medium | `src/features/runs/components/matchSetupCards/DuelMatchSetupCard.tsx:13` | `DuelMatchSetupCard` | 145 | duel setup card JSX가 길다. | `src/features/runs/components/matchSetupCards/duel/**` |
| Medium | `src/features/match/screens/MatchRoomScreen.tsx:15` | `MatchRoomScreen` | 144 | 방 화면 조립과 설정 카드가 커지고 있다. | `src/features/match/components/lobby/**` |
| Medium | `src/features/runs/hooks/useMatchSelectionModel.ts:55` | `useMatchSelectionModel` | 138 | 선택 상태 계산이 길다. | `src/features/runs/hooks/selection/**` |
| Medium | `src/components/matches/useAndroidLiveMatchPerfProbe.ts:50` | `useAndroidLiveMatchPerfProbe` | 136 | Android perf probe 계산/진단이 길다. | `src/components/matches/perf/**` |
| High | `src/features/runs/hooks/useRunningMatchFocus.ts:57` | `useRunningMatchFocus` | 135 | 대결 화면 focus/open logic이 중요 flow에 집중되어 있다. | `src/features/runs/hooks/focus/**` |
| Medium | `src/features/integrations/NrcBridgeGuideCard.tsx:310` | `buildAndroidSections` | 133 | Android 안내 section 생성이 길다. | `src/features/integrations/components/nrcGuide/androidSections.ts` |
| Medium | `src/features/integrations/NrcBridgeGuideCard.tsx:177` | `buildIosSections` | 132 | iOS 안내 section 생성이 길다. | `src/features/integrations/components/nrcGuide/iosSections.ts` |
| Medium | `src/features/settings/screens/RegionSettingsScreen.tsx:13` | `RegionSettingsScreen` | 132 | 지역 설정 form 상태가 화면에 직접 있다. | `src/features/settings/hooks/useRegionSettings.ts` |
| Medium | `src/features/runs/hooks/useMatchProgressSync.ts:42` | `useMatchProgressSync` | 126 | progress upload/status refresh가 한 hook에 있다. | `src/features/runs/hooks/progressSync/**` |
| Medium | `src/features/running/screens/AddRunScreen.tsx:19` | `AddRunScreen` | 123 | 수동 기록 입력 form이 화면에 직접 있다. | `src/features/running/hooks/useAddRunForm.ts` |
| Medium | `backend/src/routes/authRoutes.mjs:1` | `routeAuthRequest` | 122 | auth route dispatch가 길다. | `backend/src/routes/auth/**` |
| Medium | `src/features/runs/hooks/usePartyRunRoom.ts:56` | `usePartyRunRoom` | 119 | 파티런 홈 패널 상태가 hook에 많다. | `src/features/runs/hooks/partyRoom/**` |
| Medium | `src/features/profile/screens/MyPageScreen.tsx:16` | `MyPageScreen` | 117 | 로그아웃/탈퇴/프로필 상태가 화면에 있다. | `src/features/profile/hooks/useMyPageActions.ts` |
| Medium | `backend/src/repositories/runsRepository.mjs:208` | `importPendingRunsForUser` | 116 | provider import logic이 repository에 길게 있다. | `backend/src/services/runImportService.mjs` |
| Medium | `src/features/friends/FriendsRanking.tsx:59` | `FriendsRanking` | 114 | ranking UI와 sorting/display logic이 함께 있다. | `src/features/friends/components/ranking/**` |
| Medium | `src/lib/session.ts:291` | `registerAccount` | 112 | 계정 생성과 profile/session side effect가 길다. | `src/lib/session/registerAccount.ts` |
| Medium | `backend/src/routes/runningMatchRoutes.mjs:1` | `routeRunningMatchRequest` | 111 | running match route dispatch가 길다. | `backend/src/routes/runningMatch/**` |
| Medium | `src/features/runs/matchResultModel.ts:52` | `buildDuelMatchFinishModel` | 109 | 1대1 결과 모델 계산이 길다. | `src/features/runs/matchResult/duel.ts` |
| Medium | `src/features/match/screens/MatchRecordScreen.tsx:58` | `MatchRecordScreen` | 105 | match record filtering/stat 계산이 화면에 있다. | `src/features/match/hooks/useMatchRecords.ts` |
| High | `src/features/runs/hooks/useRunTrackingFlow.ts:453` | `handleStartTracking` | 100 | tracking start side effect가 길어 센서/권한/카운트다운 분리가 필요하다. | `src/features/runs/tracking/startTracking.ts` |
| High | `src/features/runs/backgroundTracking.ts:371` | `appendTrackedLocation` | 98 | 위치 update 처리와 거리/고도/스냅샷 갱신이 길다. | `src/features/runs/tracking/appendTrackedLocation.ts` |
| High | `src/features/runs/hooks/useRunSaveFlow.ts:192` | `handleSaveTracking` | 95 | 저장, 대결 결과, 화면 이동 side effect가 길다. | `src/features/runs/hooks/saveFlow/handleSaveTracking.ts` |
| Medium | `src/features/runs/components/matchSetupCards/MatchSetupCommon.tsx:75` | `MatchTimeSlotSelector` | 92 | 시간 선택 UI가 길다. | `src/features/runs/components/matchSetupCards/TimeSlotSelector/**` |
| Medium | `src/integrations/nativeHealth.ts:102` | `getNativeHealthReadiness` | 91 | native readiness 판정이 길다. | `src/integrations/nativeHealth/readiness.ts` |
| Medium | `src/features/runs/matchProgress.ts:387` | `buildGroupLiveStandings` | 81 | 그룹 순위 계산 핵심 함수가 길다. | `src/features/runs/matchProgress/groupStandings.ts` |
| Medium | `src/features/runs/matchProgress.ts:219` | `buildMatchProgressModel` | 71 | progress display model 계산이 길다. | `src/features/runs/matchProgress/progressModel.ts` |
| Medium | `src/services/apiClient.ts:82` | `apiRequest` | 62 | 공통 request/error handling이 길다. | `src/services/apiClient/request.ts`, `errors.ts` |

## 화면 파일 상태/useEffect 밀도

| 우선순위 | 파일 | useState | useEffect | 기타 hook | 문제 이유 | 분리 추천 위치 |
|---|---|---:|---:|---:|---|---|
| High | `src/features/runs/TrackRunExperience.tsx` | 0 | 21 | 14 | 상태는 hook으로 많이 빠졌지만 effect가 아직 화면 진입/카운트다운/대결 이동을 많이 들고 있다. | `src/features/runs/hooks/navigationEffects/**` |
| High | `src/features/runs/hooks/useMatchLifecycle.ts` | 22 | 3 | 7 | 1대1/그룹/화면 이동 상태가 한 hook에 몰려 있다. | `useDuelMatchLifecycle.ts`, `useGroupMatchLifecycle.ts`, `useLiveArenaState.ts` |
| High | `src/features/auth/screens/SignupFormScreen.tsx` | 14 | 2 | 7 | 회원가입 form state가 화면에 직접 있다. | `src/features/auth/hooks/useSignupForm.ts` |
| High | `src/features/runs/hooks/useMatchRoomLobby.ts` | 6 | 4 | 7 | polling, 예약, 친구 초대, 시작 가능 여부가 같이 있다. | `src/features/match/hooks/lobby/**` |
| Medium | `src/features/settings/screens/AdminScreen.tsx` | 10 | 1 | 5 | 여러 관리자 탭의 query/filter 상태가 한 화면에 있다. | `src/features/settings/admin/hooks/**` |
| Medium | `src/features/auth/screens/AccountRecoveryScreen.tsx` | 11 | 0 | 0 | 2개 form이 한 화면 상태로 묶여 있다. | `useAccountRecoveryForm.ts` |
| Medium | `src/features/runs/hooks/usePartyRunRoom.ts` | 8 | 1 | 2 | 파티런 생성/입장 loading 상태가 많다. | `src/features/runs/hooks/partyRoom/**` |
| Medium | `src/features/settings/screens/NotificationSettingsScreen.tsx` | 7 | 1 | 0 | 설정 값과 저장 상태가 화면에 있다. | `useNotificationSettings.ts` |
| Medium | `src/features/settings/screens/RegionSettingsScreen.tsx` | 6 | 1 | 1 | 지역 form state가 화면에 있다. | `useRegionSettings.ts` |
| Medium | `src/features/runs/hooks/useLiveMatchNavigationEffects.ts` | 0 | 6 | 1 | 파티런 화면 튐과 직접 관련될 수 있는 effect가 많다. | `src/features/runs/hooks/navigationEffects/**` |

## 중복 코드 후보

| 우선순위 | 위치 | 문제 이유 | 분리 추천 위치 |
|---|---|---|---|
| High | `src/features/runs/TrackRunExperience.tsx`, `src/features/runs/hooks/useRunTracking.ts`, `src/features/runs/hooks/useRunTrackingFlow.ts` | pedometer/timer/route/live share/match progress 관련 ref 묶음이 반복된다. tracking runtime state shape를 한 곳에서 관리하는 편이 안전하다. | `src/features/runs/tracking/trackingRuntimeRefs.ts` |
| High | `src/features/integrations/screens/ConnectSourcesScreen.tsx`, `IntegrationManagementScreen.tsx`, `IntegrationsScreen.tsx` | `connectIntegrationSource` 후 exclusive source 메시지 처리와 status 갱신 코드가 반복된다. | `src/features/integrations/hooks/useIntegrationSourceActions.ts` |
| High | `src/features/runs/matchProgress.ts`, `src/lib/api/types/matches.ts`, `src/lib/api/types/rooms.ts` | `officialDistanceKm`, `officialElapsedSeconds`, `officialAveragePace`, `officialRank` 계열 타입 필드가 여러 곳에 반복된다. | `src/domain/matchProgress.ts` 또는 `src/lib/api/types/progress.ts` |
| Medium | `src/features/profile/screens/EditProfileScreen.tsx`, `src/features/settings/screens/NotificationSettingsScreen.tsx`, `RegionSettingsScreen.tsx` | 저장 후 `saved` 플래그, timeout, error 처리 패턴이 반복된다. | `src/hooks/useSavedFlag.ts`, `src/hooks/useAsyncAction.ts` |
| Medium | `src/features/running/screens/AddRunScreen.tsx`, `NotificationSettingsScreen.tsx`, `RegionSettingsScreen.tsx` | `Screen`, `Card`, `AuthHeader`, `PrimaryButton`, `SecondaryButton` import와 form layout 패턴이 반복된다. | `src/components/forms/FormScreenScaffold.tsx` |
| Medium | `src/features/runs/hooks/useLiveMatchNavigationEffects.ts`, `useMatchEntryEffects.ts`, `useRunningMatchFocus.ts` | `FocusRunningMatchInput` 타입과 대결 focus 옵션이 반복된다. | `src/features/runs/types/matchFocus.ts` |
| Medium | `src/features/runs/hooks/usePartyRunSync.test.ts`, `matchRoomFlow.test.ts`, `matchViewModels.test.ts` | `RunningMatchRoom` fixture 생성이 반복된다. | `src/features/runs/testUtils/matchRoomFixtures.ts` |
| Medium | `src/features/runs/matchProgress.test.ts`, `matchResultModel.test.ts`, `matchViewModels.test.ts` | runner/profile fixture가 반복된다. | `src/features/runs/testUtils/runnerFixtures.ts` |
| Medium | `src/domain/match.ts`, `src/lib/api/types/admin.ts` | offline race event/admin type 필드가 반복된다. | `src/domain/race.ts` 또는 shared admin DTO type |
| Medium | `src/features/runs/hooks/useRunSaveFlow.ts`, `src/features/runs/hooks/useRunTrackingFlow.ts` | active match id resolve 호출과 match context 조립이 반복된다. | `src/features/runs/matchContext.ts` |

## 추천 작업 순서

1. High: `TrackRunExperience.tsx` effect 분리
   - `useLiveMatchNavigationEffects`를 더 잘게 쪼개고, 화면 진입 조건과 active 전환 조건을 상태 머신 쪽으로 더 모은다.

2. High: tracking runtime 분리
   - `useRunTrackingFlow.ts`, `useRunTracking.ts`, `backgroundTracking.ts` 사이의 ref/state 중복을 `trackingRuntime` 모듈로 모은다.

3. High: 파티런 room/lifecycle 분리
   - `useMatchRoomLobby.ts`, `usePartyRunRoom.ts`, `usePartyRunSync.ts`, `useMatchLifecycle.ts`의 역할 경계를 다시 자른다.

4. High: backend `server.mjs` presenter/service 분리
   - `buildRunningMatchStatusResponse`, `buildRunningMatchRoomResponse`, `buildDuelMatchResponse`, `buildGroupMatchResponse`, `updateRunningMatchProgress`부터 먼저 뺀다.

5. Medium: auth/signup 화면 분리
   - `SignupFormScreen.tsx`, `UniversityVerificationScreen.tsx`, `AccountRecoveryScreen.tsx`를 form hook + section component 구조로 정리한다.

6. Medium: integration action 중복 제거
   - 세 화면의 source connect/disconnect/import action을 hook 하나로 통일한다.

## 재검출 명령

300줄 이상 파일:

```bash
find app src backend scripts -type f \\( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.mjs' \\) \\
  -not -path '*/node_modules/*' -not -path '*/dist/*' -not -path '*/.expo/*' -print0 \\
  | while IFS= read -r -d '' f; do lines=$(wc -l < "$f" | tr -d ' '); if [ "$lines" -ge 300 ]; then printf "%5d %s\\n" "$lines" "$f"; fi; done \\
  | sort -nr
```

hook 밀도:

```bash
rg -n "use(State|Effect|Memo|Callback|Reducer|Ref)\\(" app src -g'*.tsx' -g'*.ts'
```

## 비고

- 이 문서는 분석 전용이며 코드 동작은 바꾸지 않았다.
- 50줄 이상 함수는 총 228개라, 실제 리팩토링은 High 우선순위부터 작게 커밋을 끊어 진행하는 것이 안전하다.
- 테스트 파일과 스크립트는 앱 런타임 품질보다 우선순위를 낮게 잡았다.
