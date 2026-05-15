# RunningGround 코드 품질 감사

생성일: 2026-05-15

## 검사 범위와 방법

- 검사 범위: `app/`, `src/`, `backend/src/`, `scripts/`, `docs/`, `package.json` scripts
- 제외 범위: `node_modules/`, `.git/`, `.expo/`, `dist/`, `android/`, `ios/`, `credentials/`, `coverage/`
- 검사 방식: 실제 파일 라인 수, import 수, React hook 사용량, timer/subscription 후보, `sort/filter/map` 후보, 직접 `fetch` 후보, 정적 import graph를 스캔했다.
- 주의: 함수 길이와 unused 후보는 정적 휴리스틱이다. Expo Router, platform suffix, Node CLI entrypoint, 동적 import는 false positive가 있을 수 있다.

## 전체 요약

- 분석 대상 파일은 540개이고, 코드 파일은 498개다.
- 300줄 이상 파일은 67개, 500줄 이상 파일은 21개다.
- 50줄 이상 함수 후보는 213개다.
- `app/` 라우트 파일은 대부분 1줄 re-export 형태로 잘 얇아졌다. 예외적으로 `app/_layout.tsx` 73줄, `app/(tabs)/_layout.tsx` 58줄은 라우팅 레이아웃 책임상 허용 가능하다.
- 가장 큰 구조 리스크는 `src/features/runs/TrackRunExperience.tsx` 3410줄과 `backend/src/server.mjs` 6392줄이다.
- `src/features/runs`는 152개 파일, 26330줄로 프로젝트에서 가장 큰 영역이다. 이미 `lifecycle`, `sync`, `tracking`, `viewModels`로 분리되어 있지만, 상위 container가 아직 너무 많은 연결 책임을 갖고 있다.
- 프론트 직접 `fetch`는 주로 `src/services/apiClient.ts`에 집중되어 있다. 다만 `src/lib/api/services/*`와 `src/services/*` 이중 서비스 계층이 남아 있어 API 경계가 다소 흐리다.
- 정적 import graph 기준 순환 import는 발견되지 않았다.
- unused 후보는 6개다. 이 중 backend CLI 파일은 package script entrypoint라 삭제 대상이 아니다.

## 가장 위험한 파일 TOP 20

| 순위 | 파일 | 이유 | 우선순위 | 난이도 | 기능 변경 위험 |
| --- | --- | --- | --- | --- | --- |
| 1 | `src/features/runs/TrackRunExperience.tsx` | 3410줄, import 56개, `useEffect` 12개. idle/lobby/live shell 라우팅과 runtime 연결이 아직 한 파일에 모여 있다. | P0 | High | High |
| 2 | `backend/src/server.mjs` | 6392줄, backend routing, repository wiring, response building, business flow가 한 파일에 집중되어 있다. | P0 | High | High |
| 3 | `src/features/runs/hooks/useRunTrackingFlow.ts` | 920줄, GPS/timer/session/save 전환이 큰 hook 하나에 남아 있다. | P0 | High | High |
| 4 | `src/features/runs/lifecycle/hooks/useRunningMatchFocus.ts` | 736줄, navigation/focus/recovery 결과 처리 책임이 크다. | P0 | High | High |
| 5 | `src/features/match/hooks/lobby/useRoomSnapshot.ts` | 645줄, state 5개, effect 4개, timer 2개, subscription 후보 2개. room snapshot과 handoff가 섞여 있다. | P0 | High | High |
| 6 | `src/features/runs/components/LiveMatchTrackingPage.tsx` | 699줄. live tab UI 조립, 순위, 기록, CTA 표시 책임이 크다. | P1 | Medium | Medium |
| 7 | `src/features/runs/hooks/useRunSaveFlow.ts` | 519줄. save/finish/forfeit/point/ranking 후처리를 더 작은 command로 쪼갤 후보. | P1 | Medium | High |
| 8 | `src/features/match/hooks/lobby/useRoomInviteActions.ts` | 335줄. friend invite, inbox, guard, trace, error handling이 섞여 있다. | P1 | Medium | Medium |
| 9 | `src/features/match/hooks/lobby/useRoomStartActions.ts` | 313줄. start API, lifecycle handoff, optimistic state, trace가 한 hook에 있다. | P1 | Medium | High |
| 10 | `src/features/runs/viewModels/useLiveMatchViewModel.ts` | 346줄. 표시값 계산과 Android throttle 입력 경계가 복잡하다. | P1 | Medium | Medium |
| 11 | `src/features/runs/viewModels/useLiveMatchProgress.ts` | 271줄, `sort/filter/map` 5개. ranking/progress 계산을 순수 함수로 더 분리할 후보. | P1 | Medium | Medium |
| 12 | `src/features/runs/sync/useMatchProgressSync.ts` | 284줄. heartbeat registry와 progress payload 생성 책임을 분리할 후보. | P1 | Medium | High |
| 13 | `src/features/runs/sync/partyRunSync/useLinkedMatchSync.ts` | 268줄, effect 3개, timer 후보. linked match polling owner 정리가 계속 중요한 영역. | P1 | Medium | High |
| 14 | `src/features/runs/sync/activeRoomCheck.ts` | 411줄. timeout, generation, single-flight, stale result policy가 모여 있다. | P1 | Medium | High |
| 15 | `src/features/runs/sync/matchPolling/useBlockingMatchStatusPolling.ts` | 250줄, timer/subscription 후보. recovery polling singleton 정책의 핵심. | P1 | Medium | Medium |
| 16 | `src/features/runs/tracking/background/locationTaskManagerCore.ts` | background task single-flight, timeout, appState policy 핵심. Android 성능 리스크가 높다. | P1 | Medium | High |
| 17 | `src/features/runs/tracking/useTrackingAppStateSync.ts` | appState debounce와 foreground/background 전환 책임. cleanup 회귀 테스트가 중요하다. | P1 | Medium | High |
| 18 | `src/features/auth/screens/SignupFormScreen.tsx` | 709줄. 화면 JSX가 크고 입력 섹션 분리 여지가 크다. | P2 | Medium | Low |
| 19 | `src/features/integrations/NrcBridgeGuideCard.tsx` | 775줄. 가이드 카드인데 action 렌더 함수가 216줄로 커졌다. | P2 | Medium | Low |
| 20 | `backend/src/repositories/postgresFriendsRepository.mjs` | 716줄, query/mapper/command가 큼. repository 단위 테스트는 있으나 유지보수 비용이 높다. | P2 | Medium | Medium |

## 300줄 이상 파일 목록

| 파일 | 줄 | 주요 신호 |
| --- | --- | --- |
| `backend/src/server.mjs` | 6392 | import 22, sort/filter/map 160, timer 1 |
| `src/features/runs/TrackRunExperience.tsx` | 3410 | import 56, effect 12, memo 21, callback 5 |
| `backend/src/smoke.mjs` | 1014 | smoke flow가 단일 `main`에 큼 |
| `src/features/runs/hooks/useRunTrackingFlow.ts` | 920 | effect 3, timer 2, subscription 후보 1 |
| `backend/src/runningMatchContract.test.mjs` | 899 | backend contract 테스트가 매우 큼 |
| `src/features/integrations/NrcBridgeGuideCard.tsx` | 775 | 큰 presentational card |
| `src/features/runs/lifecycle/hooks/useRunningMatchFocus.ts` | 736 | match focus/navigation recovery |
| `backend/src/repositories/postgresFriendsRepository.mjs` | 716 | repository query/mapper 집중 |
| `src/features/auth/screens/SignupFormScreen.tsx` | 709 | 큰 화면 JSX |
| `src/features/runs/components/LiveMatchTrackingPage.tsx` | 699 | live match page 조립 과다 |
| `src/data/mock.ts` | 648 | mock seed/factory 집중 |
| `src/features/match/hooks/lobby/useRoomSnapshot.ts` | 645 | polling/state/effect 집중 |
| `backend/src/repositories/postgresRunsRepository.mjs` | 640 | repository query/mapper 집중 |
| `docs/backend-api-contract.md` | 636 | 문서 크기, 코드 리스크 아님 |
| `backend/src/repositories/postgresAuthRepository.test.mjs` | 617 | 테스트 harness 큼 |
| `src/lib/session.ts` | 562 | session/auth API/storage 책임 혼재 |
| `scripts/run-release-gate.mjs` | 553 | release gate CLI 큼 |
| `backend/src/seed.mjs` | 528 | seed generator 큼 |
| `src/features/runs/hooks/useRunSaveFlow.ts` | 519 | save/finish flow 집중 |
| `backend/src/repositories/postgresRunsRepository.test.mjs` | 515 | 테스트 harness 큼 |
| `backend/src/repositories/postgresAuthRepository.mjs` | 504 | repository query/mapper 집중 |
| `backend/src/store.mjs` | 484 | JSON store 유틸 집중 |
| `scripts/check-preview-public-api.mjs` | 482 | preview smoke CLI 큼 |
| `scripts/check-performance-smells.mjs` | 477 | static smell scanner 큼 |
| `src/features/runs/viewModels/matchProgress.ts` | 468 | progress/ranking 계산 집중 |
| `backend/src/repositories/postgresFriendsRepository.test.mjs` | 456 | 테스트 harness 큼 |
| `src/features/settings/admin/hooks/useAdminDashboard.ts` | 451 | admin state/action 집중 |
| `src/lib/api/services/mock/matchSessions.ts` | 451 | mock match session state 큼 |
| `backend/src/repositories/runsRepository.mjs` | 443 | JSON runs repository 큼 |
| `backend/src/repositories/postgresLeagueRepository.mjs` | 441 | repository query/mapper 집중 |
| `src/features/runs/lifecycle/matchLifecycleController.test.ts` | 439 | lifecycle 테스트 큼 |
| `src/features/auth/screens/UniversityVerificationScreen.tsx` | 438 | 화면 계산/map 후보 |
| `src/features/runs/lifecycle/matchStateMachine.ts` | 437 | 상태 머신 로직 큼 |
| `src/lib/api/services/rooms.ts` | 434 | room API service/guard/transform 집중 |
| `scripts/analyze-android-perf-trace.mjs` | 433 | trace analyzer 큼 |
| `scripts/deploy-public-backend.mjs` | 432 | deploy CLI 큼 |
| `src/lib/api/services/matches.ts` | 422 | match API service 큼 |
| `backend/src/repositories/authRepository.test.mjs` | 414 | 테스트 harness 큼 |
| `src/features/runs/sync/activeRoomCheck.ts` | 411 | active room single-flight/timeout 정책 |
| `src/features/runs/lifecycle/matchRoomFlow.ts` | 401 | room view/domain flow 계산 큼 |
| `src/integrations/nativeHealth.ts` | 379 | native health adapter 큼 |
| `backend/src/repositories/friendsRepository.mjs` | 373 | JSON friends repository 큼 |
| `src/features/friends/FriendsRanking.tsx` | 371 | ranking transform/UI 혼합 |
| `docs/server-backend-architecture.md` | 367 | 문서 크기, 코드 리스크 아님 |
| `src/lib/api/services/mock/matchScheduling.ts` | 358 | mock scheduling state 큼 |
| `src/lib/api/services/runningRoomResponseGuards.ts` | 356 | response guard 큼 |
| `scripts/generate-testflight-qa-report.mjs` | 349 | report generator 큼 |
| `src/features/runs/viewModels/useLiveMatchViewModel.ts` | 346 | live match props 계산 큼 |
| `src/components/matches/liveMatchArena/styles.ts` | 338 | style object 큼 |
| `src/features/match/hooks/lobby/useRoomInviteActions.ts` | 335 | invite action flow 큼 |
| `src/features/runs/components/LiveMatchPager.tsx` | 327 | tab pager shell 큼 |
| `src/features/settings/admin/components/adminStyles.ts` | 326 | style object 큼 |
| `src/lib/api/services/runningRoomResponseGuards.test.ts` | 323 | guard 테스트 큼 |
| `backend/src/repositories/runsRepository.test.mjs` | 320 | 테스트 harness 큼 |
| `src/features/auth/hooks/useSignupForm.ts` | 320 | form state 14개 |
| `backend/src/repositories/authRepository.mjs` | 318 | JSON auth repository 큼 |
| `backend/src/points.mjs` | 316 | points domain 큼 |
| `backend/src/repositories/friendsRepository.test.mjs` | 314 | 테스트 harness 큼 |
| `docs/testflight-real-device-qa.md` | 314 | 문서 크기, 코드 리스크 아님 |
| `src/features/runs/lifecycle/matchLifecycleController.ts` | 314 | lifecycle controller 큼 |
| `src/features/match/hooks/lobby/useRoomStartActions.ts` | 313 | room start/handoff flow 큼 |
| `src/components/matches/LiveMatchRaceBoard.tsx` | 309 | race board UI 큼 |
| `backend/src/bridges/sessionRunsBridge.mjs` | 305 | bridge logic 큼 |
| `src/features/runs/components/matchSetupCards/styles.ts` | 303 | style object 큼 |
| `src/features/runs/hooks/useMatchRoomLobby.ts` | 302 | lobby adapter hook 큼 |
| `src/features/runs/components/TrackRunExperienceView.tsx` | 301 | view shell, effect 4 |
| `src/features/league/components/LeagueRegionSelectorCard.tsx` | 300 | region selector UI 큼 |

## 50줄 이상 함수 후보

총 213개 후보가 감지됐다. 아래는 수정 우선순위가 높은 상위 후보 목록이다.

| 위치 | 함수 | 줄 |
| --- | --- | --- |
| `src/features/runs/TrackRunExperience.tsx:171` | `TrackRunExperience` | 3239 |
| `backend/src/smoke.mjs:89` | `main` | 920 |
| `src/features/runs/hooks/useRunTrackingFlow.ts:79` | `useRunTrackingFlow` | 841 |
| `src/features/runs/lifecycle/hooks/useRunningMatchFocus.ts:114` | `useRunningMatchFocus` | 622 |
| `src/features/match/hooks/lobby/useRoomSnapshot.ts:102` | `useRoomSnapshot` | 543 |
| `src/features/runs/lifecycle/hooks/useRunningMatchFocus.ts:238` | `callback@useCallback` | 450 |
| `src/features/settings/admin/hooks/useAdminDashboard.ts:51` | `useAdminDashboard` | 400 |
| `src/features/runs/hooks/useRunSaveFlow.ts:133` | `useRunSaveFlow` | 386 |
| `src/features/auth/screens/SignupFormScreen.tsx:9` | `SignupFormScreen` | 351 |
| `src/features/match/hooks/lobby/useRoomInviteActions.ts:32` | `useRoomInviteActions` | 303 |
| `src/features/auth/hooks/useSignupForm.ts:23` | `useSignupForm` | 297 |
| `src/features/runs/viewModels/useLiveMatchViewModel.ts:52` | `useLiveMatchViewModel` | 294 |
| `src/features/runs/hooks/useMatchRoomLobby.ts:20` | `useMatchRoomLobby` | 282 |
| `backend/src/repositories/postgresRunsRepository.mjs:369` | `createPostgresRunsRepository` | 271 |
| `backend/src/repositories/postgresAuthRepository.mjs:246` | `createPostgresAuthRepository` | 258 |
| `src/features/settings/screens/AdminScreen.tsx:19` | `AdminScreen` | 254 |
| `src/features/match/hooks/lobby/useRoomStartActions.ts:65` | `useRoomStartActions` | 248 |
| `src/features/runs/viewModels/useLiveMatchProgress.ts:34` | `useLiveMatchProgress` | 237 |
| `src/features/runs/sync/useMatchProgressSync.ts:49` | `useMatchProgressSync` | 235 |
| `backend/src/bridges/friendsLeagueBridge.mjs:22` | `createFriendsLeagueBridge` | 232 |
| `src/features/runs/sync/partyRunSync/useLinkedMatchSync.ts:47` | `useLinkedMatchSync` | 221 |
| `src/features/runs/tracking/background/locationTaskManagerCore.ts:42` | `createLocationTaskManager` | 220 |
| `src/features/runs/lifecycle/hooks/useMatchEntryEffects.ts:46` | `useMatchEntryEffects` | 216 |
| `backend/src/repositories/postgresFriendsRepository.mjs:503` | `createPostgresFriendsRepository` | 213 |
| `scripts/check-preview-public-api.mjs:259` | `main` | 211 |
| `backend/src/server.mjs:2879` | `buildRunningMatchStatusResponse` | 210 |
| `src/features/auth/screens/UniversityVerificationScreen.tsx:12` | `UniversityVerificationScreen` | 209 |
| `src/features/runs/sync/matchPolling/useBlockingMatchStatusPolling.ts:41` | `useBlockingMatchStatusPolling` | 209 |
| `src/features/match/hooks/lobby/useRoomSnapshot.ts:212` | `callback@useCallback` | 207 |
| `src/features/runs/TrackRunExperience.tsx:1297` | `loadMatchRoom` | 205 |
| `scripts/analyze-android-perf-trace.mjs:142` | `analyzeLine` | 200 |
| `src/features/runs/hooks/useMatchRuntimeState.ts:57` | `useMatchRuntimeState` | 193 |
| `backend/src/repositories/authRepository.mjs:127` | `createJsonAuthRepository` | 191 |
| `backend/src/routes/adminRoutes.mjs:1` | `routeAdminRequest` | 177 |
| `src/components/matches/LiveMatchArena.tsx:97` | `LiveMatchArena` | 172 |
| `src/features/runs/components/matchSetupCards/GroupMatchSetupCard.tsx:14` | `GroupMatchSetupCard` | 171 |
| `src/features/runs/lifecycle/hooks/useMatchCountdownModel.ts:40` | `useMatchCountdownModel` | 171 |
| `backend/src/bridges/sessionRunsBridge.mjs:136` | `createSessionRunsBridge` | 169 |
| `src/features/auth/screens/AccountRecoveryScreen.tsx:43` | `AccountRecoveryScreen` | 168 |
| `backend/src/repositories/marketRepository.mjs:5` | `createJsonMarketRepository` | 165 |
| `src/features/integrations/hooks/useIntegrationActions.ts:61` | `useIntegrationActions` | 165 |
| `src/features/home/hooks/useHomeScreenModel.ts:23` | `useHomeScreenModel` | 161 |
| `src/features/runs/tracking/background/locationTaskManagerCore.ts:48` | `startLocationTaskWithTrace` | 156 |
| `backend/src/bridges/friendsLeagueBridge.test.mjs:11` | `createHarness` | 154 |
| `src/features/match/screens/MatchRoomScreen.tsx:15` | `MatchRoomScreen` | 147 |
| `src/features/runs/components/matchSetupCards/DuelMatchSetupCard.tsx:13` | `DuelMatchSetupCard` | 145 |
| `src/features/runs/components/LiveMatchPager.tsx:116` | `LiveMatchPager` | 142 |
| `src/features/runs/hooks/useMatchSelectionModel.ts:55` | `useMatchSelectionModel` | 138 |
| `src/components/matches/useAndroidLiveMatchPerfProbe.ts:50` | `useAndroidLiveMatchPerfProbe` | 136 |
| `src/features/friends/hooks/useFriendsScreen.ts:15` | `useFriendsScreen` | 134 |
| `src/features/runs/viewModels/useTrackRunIdleViewModel.ts:37` | `useTrackRunIdleViewModel` | 134 |
| `src/features/runs/TrackRunExperience.tsx:1917` | `handleJoinMatchRoom` | 131 |
| `src/features/runs/sync/usePartyRunSync.ts:60` | `usePartyRunSync` | 131 |
| `src/features/runs/tracking/useTrackingAppStateSync.ts:32` | `useTrackingAppStateSync` | 129 |
| `src/features/profile/hooks/useMyPageScreen.ts:8` | `useMyPageScreen` | 127 |
| `src/features/runs/hooks/useRunTrackingFlow.ts:503` | `handleStartTrackingInternal` | 126 |
| `src/features/runs/components/PartyRunHomePanel.tsx:35` | `PartyRunHomePanel` | 125 |
| `src/features/runs/hooks/usePartyRunRoom.ts:57` | `usePartyRunRoom` | 124 |
| `scripts/deploy-public-backend.mjs:304` | `main` | 123 |
| `src/features/runs/TrackRunExperience.tsx:1793` | `handleCreateMatchRoom` | 123 |

## 컴포넌트 분리 후보

| 파일 | 후보 | 이유 | 추천 위치 | 우선순위 | 난이도 | 기능 위험 |
| --- | --- | --- | --- | --- | --- | --- |
| `src/features/runs/TrackRunExperience.tsx` | `IdleRunShell`, `MatchLobbyShell`, `LiveMatchShell` 경계 강화 | 파일은 shell 라우팅만 담당해야 한다. 현재 상태 구독과 액션 연결이 아직 남아 있다. | `src/features/runs/components/shells/` | P0 | High | High |
| `src/features/runs/components/LiveMatchTrackingPage.tsx` | 탭별 content component | 대결/순위/기록 보기 content가 한 파일에 크다. | `src/features/runs/components/liveMatch/` | P1 | Medium | Medium |
| `src/components/matches/LiveMatchArena.tsx` | summary/board/road container 분리 | arena props가 많고 표시-only row가 섞인다. | `src/components/matches/liveMatchArena/` | P1 | Medium | Medium |
| `src/features/auth/screens/SignupFormScreen.tsx` | signup form sections | 709줄 화면 JSX. 입력 섹션, 약관, region/university 선택을 분리 가능. | `src/features/auth/components/signup/` | P2 | Medium | Low |
| `src/features/integrations/NrcBridgeGuideCard.tsx` | action button block, guide sections | card 하나가 775줄이고 `renderActionButtons`가 216줄이다. | `src/features/integrations/components/nrcBridge/` | P2 | Medium | Low |
| `src/features/friends/FriendsRanking.tsx` | ranking transform와 row UI 분리 | ranking 계산과 row 렌더가 함께 있다. | `src/features/friends/components/` + `utils/` | P2 | Low | Low |
| `src/features/runs/components/matchSetupCards/*` | distance/date/time picker 공통화 | setup cards에 반복 옵션 UI와 picker 로직이 많다. | `src/features/runs/components/matchSetupCards/common/` | P2 | Medium | Medium |

## Hook 분리 후보

| 파일 | 문제 | 추천 분리 | 우선순위 | 난이도 | 기능 위험 |
| --- | --- | --- | --- | --- | --- |
| `src/features/runs/hooks/useRunTrackingFlow.ts` | tracking, elapsed, pedometer, save snapshot, callbacks가 크다. | `tracking/session`, `tracking/lifecycle`, `tracking/actions` 단위 | P0 | High | High |
| `src/features/runs/lifecycle/hooks/useRunningMatchFocus.ts` | focus, active room result, navigation/recovery 처리 콜백이 매우 크다. | `useActiveRoomRecovery`, `useLiveMatchNavigationOwner`, `useMatchFocusHydration` | P0 | High | High |
| `src/features/match/hooks/lobby/useRoomSnapshot.ts` | snapshot polling, active room check, optimistic hydration, invite inbox fetch가 섞인다. | snapshot fetcher, hydration state, inbox side effect 분리 | P0 | High | High |
| `src/features/runs/hooks/useRunSaveFlow.ts` | save, finish, forfeit, points, local cleanup이 한 hook에 있다. | `useRunFinishCommand`, `useForfeitCommand`, `useRunSaveResultMapper` | P1 | Medium | High |
| `src/features/match/hooks/lobby/useRoomInviteActions.ts` | invite send, invite inbox, response guard, trace가 섞인다. | `useFriendInviteSend`, `useInviteInboxActions` | P1 | Medium | Medium |
| `src/features/match/hooks/lobby/useRoomStartActions.ts` | start API와 lifecycle owner handoff가 섞인다. | `useRoomStartCommand`, `useLiveMatchHandoff` | P1 | Medium | High |
| `src/features/runs/sync/useMatchProgressSync.ts` | heartbeat registry와 payload 생성 혼합 | `progressHeartbeatRegistry`, `progressPayloadBuilder` | P1 | Medium | High |
| `src/features/runs/sync/activeRoomCheck.ts` | single-flight, timeout, blocker normalization이 한 파일에 큼 | request registry, result policy, response mapper | P1 | Medium | High |
| `src/features/auth/hooks/useSignupForm.ts` | state 14개, validation/action/store 연결이 큼 | reducer + validation utils + submit command | P2 | Medium | Medium |
| `src/features/settings/admin/hooks/useAdminDashboard.ts` | admin dashboard state 10개와 도메인별 액션 집중 | user/notice/market/redemption/race hooks | P2 | Medium | Medium |

## services/utils/types 이동 후보

| 후보 | 현재 위치 | 추천 위치 | 이유 |
| --- | --- | --- | --- |
| auth/session API 호출 | `src/lib/session.ts` | `src/services/authService.ts`, `src/session/sessionStore.ts` | session 저장소와 auth API가 한 파일에 섞여 있다. |
| room/match API facade | `src/lib/api/services/rooms.ts`, `src/lib/api/services/matches.ts`, `src/services/matchService.ts` | 한쪽 service 경계로 통합 | `src/lib/api/services`와 `src/services` 이중 계층 때문에 호출 위치를 찾기 어렵다. |
| room response guard | `src/lib/api/services/runningRoomResponseGuards.ts` | `src/services/guards/roomGuards.ts` 또는 `src/features/match/api/guards.ts` | API guard는 service boundary에 두는 편이 응답 타입 정책을 찾기 쉽다. |
| match room flow 계산 | `src/features/runs/lifecycle/matchRoomFlow.ts` | `src/features/match/utils/matchRoomFlow.ts` | room participant/invite row 계산은 runs보다 match 도메인에 가깝다. |
| progress/ranking 계산 | `src/features/runs/viewModels/matchProgress.ts` | `src/features/runs/utils/matchProgressMath.ts` + view model mapper | 순수 계산과 UI view model이 섞일 위험이 있다. |
| mock 데이터/상태 | `src/data/mock.ts`, `src/lib/api/services/mock/*` | `src/lib/api/mock/factories`, `state`, `transforms` | mock factory, state mutation, response transform을 더 나누면 테스트 데이터 꼬임을 줄일 수 있다. |
| backend route handlers | `backend/src/server.mjs` | `backend/src/routes/*`, `controllers/*`, `services/*` | server wiring과 business flow가 한 파일에 과도하게 집중되어 있다. |
| backend repository mappers | `backend/src/repositories/postgres*.mjs` | `backend/src/repositories/mappers/*` | query와 DTO mapping을 분리하면 Postgres/JSON repository parity 테스트가 쉬워진다. |

## 중복 코드 후보

- Card류 컴포넌트가 많다: `src/components/Card.tsx`, `src/components/ui/InfoCard.tsx`, `StateMessageCard.tsx`, feature별 `*Card.tsx`. 디자인 톤은 유지하되 공통 padding, title, subtitle, action slot을 가진 base card를 더 명확히 할 수 있다.
- Button류가 나뉘어 있다: `Button.tsx`, `PrimaryButton.tsx`, `SecondaryButton.tsx`, 그리고 feature 내부 Pressable 스타일. loading/disabled/pending feedback을 공통 API로 맞추면 Android 버튼 반응성 회귀를 줄일 수 있다.
- Ranking row가 여러 곳에 있다: `src/components/ranking/RankingItemRow.tsx`, `FriendsRanking.tsx`, `DistrictMemberRankingCard.tsx`, `LiveMatchRaceBoard.tsx`. rank badge, name, metric, delta UI를 공통 row primitive로 정리할 수 있다.
- Polling/single-flight registry 패턴이 여러 파일에 반복된다: active room check, blocking match status polling, heartbeat, location task manager. `src/features/runs/sync/registries` 같은 작은 primitive로 묶으면 중복 정책을 줄일 수 있다.
- Backend JSON repository와 Postgres repository 사이에 같은 domain operation mapping이 반복된다. interface test는 좋지만 mapper 계층이 없어서 수정 폭이 커질 수 있다.

## Android 성능 위험 후보

| 파일 | 위험 | 현재 상태 | 추천 |
| --- | --- | --- | --- |
| `src/features/runs/TrackRunExperience.tsx` | 상위 컴포넌트 렌더 전파 | 12 effects, 많은 runtime prop 생성 | shell별 구독 경계를 더 작게 만들고 route/live/lobby state를 selector 단위로 고정 |
| `src/features/match/hooks/lobby/useRoomSnapshot.ts` | polling/timer/subscription 중첩 | effect 4, timer 2 | room state별 owner policy를 hook 밖 controller로 더 명확히 |
| `src/features/runs/hooks/useRunTrackingFlow.ts` | GPS/timer/session update | timer 2, subscription 후보 | tracking manager 상태 구독을 selector 기반으로 축소 |
| `src/features/runs/tracking/background/locationTaskManagerCore.ts` | native background task start 지연 | Android 먹통 원인 후보였던 영역 | single-flight timeout 테스트를 계속 유지하고 appState active native call 차단 검증 |
| `src/features/runs/sync/activeRoomCheck.ts` | 오래 살아 있는 pending request | timeout/generation 정책이 중요 | hard timeout, local hint guard 테스트 추가 |
| `src/features/runs/sync/matchPolling/useBlockingMatchStatusPolling.ts` | recovery polling 중복 | singleton key 정책 필요 | registry test를 유지하고 log analyzer에 count 기준 유지 |
| `src/features/runs/viewModels/useLiveMatchProgress.ts` | ranking/progress 계산 | `sort/filter/map` 5개 | 입력 snapshot 단위 memoization과 순수 계산 테스트 확대 |
| `src/features/runs/components/LiveMatchPager.tsx` | ScrollView pager와 props 전파 | 327줄, memo/callback 있음 | page index 외 prop 변화가 pager를 깨우지 않는지 render counter로 추적 |
| `src/components/matches/liveMatchArena/RoadMotion.tsx` | token/road render | memoized stripe map 존재 | Android lightweight 옵션 회귀 방지 테스트 또는 story fixture 필요 |
| `src/features/runs/components/matchRoom/MatchRoomWheelColumn.tsx` | 의도된 ScrollView + map | wheel UI라 FlatList 전환 위험 | 현재는 memoization 유지, 긴 리스트로 확장 시만 FlatList 검토 |

## API 호출 구조 점검

- 직접 `fetch`는 앱 화면에서 발견되지 않았고 `src/services/apiClient.ts`에 모여 있다.
- scripts와 backend smoke는 CLI 목적상 직접 `fetch`를 사용한다.
- 개선 핵심은 직접 fetch 제거가 아니라 `src/lib/api/services/*`와 `src/services/*`의 책임 중복이다.
- `package.json`에는 `perf:smells`와 `performance:smells`가 같은 스크립트를 가리킨다. 호환 alias로 유지 가능하지만 문서에서는 하나만 표준으로 쓰는 편이 좋다.
- release gate 관련 scripts는 충분히 갖춰져 있다: `typecheck`, `lint`, `test`, `perf:smells`, `backend:smoke`, `release:gate:preview`, `perf:trace-analyze`.

## 순환 import 가능성

- 정적 import graph에서 순환 import는 0개로 감지됐다.
- `src/features/runs` 내부가 넓지만 현재 `lifecycle`, `sync`, `tracking`, `viewModels` 사이의 명시적 순환은 발견되지 않았다.
- 앞으로 barrel export를 늘릴 때 `features/runs/index.ts` 같은 대형 barrel은 피하는 것이 좋다.

## 사용되지 않거나 정리 필요한 파일 후보

| 파일 | 판단 | 조치 |
| --- | --- | --- |
| `backend/src/backup-store.mjs` | package script `backend:backup` entrypoint | 삭제 금지 |
| `backend/src/list-backups.mjs` | package script `backend:backups` entrypoint | 삭제 금지 |
| `backend/src/reset-store.mjs` | package script `backend:reset` entrypoint | 삭제 금지 |
| `backend/src/restore-store.mjs` | package script `backend:restore` entrypoint | 삭제 금지 |
| `src/features/runs/RunRouteMap.native.tsx` | platform-specific import라 정적 graph false positive 가능 | 삭제 금지, 실제 bundler resolution 확인 |
| `src/lib/api/services.ts` | 정적 import 0개 후보 | 실제 사용 여부 확인 후 `src/lib/api/services/index.ts`와 통합 검토 |

## 테스트 추가 후보

| 영역 | 필요한 테스트 | 우선순위 |
| --- | --- | --- |
| match lifecycle owner handoff | room start success 후 match-room polling이 stop되고 live owner가 유지되는지 | P0 |
| live match shell stability | 같은 `matchId`에서 route/preferArena/tracking 변화가 있어도 LiveMatchShell key가 유지되는지 | P0 |
| active room check | local hint 없을 때 idle check skip, interaction 중 suppress, stale result 무시 | P0 |
| location task manager | appState active에서는 background native call이 생성되지 않는지 | P0 |
| invite receiver inbox | sender success 후 receiver pending fetch로 card 표시, duplicate display만 dedupe | P1 |
| API response guards | `success:true`인데 필수 field 누락 시 실패로 변환 | P1 |
| run save/forfeit | cleanup이 polling/watcher/heartbeat를 모두 정리하는지 | P1 |
| backend blockers | cleanup-stale과 create precondition이 같은 blocker detector를 쓰는지 | P1 |
| trace analyzer | 위험 로그 fixture를 넣었을 때 table output이 기대대로 나오는지 | P2 |
| mock services | mock state reset과 generated IDs가 테스트 간 섞이지 않는지 | P2 |

## 우선순위별 작업 계획

### P0: 반드시 먼저 해야 하는 구조 문제

| 작업 | 대상 | 이유 | 난이도 | 기능 위험 |
| --- | --- | --- | --- | --- |
| TrackRunExperience를 shell router로 축소 | `TrackRunExperience`, `IdleRunShell`, `MatchLobbyShell`, `LiveMatchShell` | Android idle/lobby/live 상위 렌더 전파를 근본적으로 줄인다. | High | High |
| match lifecycle owner 단일화 | `useRoomSnapshot`, `useRunningMatchFocus`, `matchLifecycleController` | room snapshot과 live runtime이 동시에 주도하는 흔들림을 방지한다. | High | High |
| tracking start manager 경계 강화 | `useRunTrackingFlow`, `locationTaskManagerCore`, `useTrackingAppStateSync` | GPS/background task가 UI를 block하지 않게 보장한다. | High | High |
| backend server route/service 분리 계획 수립 | `backend/src/server.mjs` | 6392줄 server는 출시 후 hotfix 위험이 크다. | High | High |

### P1: 성능/렌더 최적화

| 작업 | 대상 | 이유 | 난이도 | 기능 위험 |
| --- | --- | --- | --- | --- |
| live match view model 입력 경계 축소 | `useLiveMatchViewModel`, `useLiveMatchProgress`, `LiveMatchTrackingPage` | progress tick이 버튼/카드/shell을 깨우지 않게 한다. | Medium | Medium |
| polling registry primitive 공통화 | `activeRoomCheck`, `useBlockingMatchStatusPolling`, `useMatchProgressSync` | 중복 polling/heartbeat 회귀를 줄인다. | Medium | High |
| room invite flow 분리 | `useRoomInviteActions`, `useRoomSnapshot` | send/receive/inbox/push fallback 책임을 명확히 한다. | Medium | Medium |
| Android perf budget 자동 검사 확대 | `scripts/analyze-android-perf-trace.mjs` | 로그 기반 회귀 감지를 CI에 붙일 수 있다. | Low | Low |

### P2: 유지보수성 개선

| 작업 | 대상 | 이유 | 난이도 | 기능 위험 |
| --- | --- | --- | --- | --- |
| auth/signup 화면 섹션 분리 | `SignupFormScreen`, `useSignupForm` | 화면/validation/action 책임을 분리한다. | Medium | Low |
| integration guide card 분리 | `NrcBridgeGuideCard` | 거대한 presentational component를 읽기 쉽게 만든다. | Medium | Low |
| backend repository mapper 분리 | `postgres*Repository.mjs`, `*Repository.mjs` | JSON/Postgres parity 유지가 쉬워진다. | Medium | Medium |
| service 계층 이름 정리 | `src/lib/api/services`, `src/services` | API 호출 위치를 예측 가능하게 만든다. | Medium | Medium |

### P3: 문서/테스트 보강

| 작업 | 대상 | 이유 | 난이도 | 기능 위험 |
| --- | --- | --- | --- | --- |
| code quality scanner script화 | 이 문서 생성에 쓴 기준 | 다음 감사 때 수동 집계를 줄인다. | Low | Low |
| release QA checklist와 perf budget 연결 | `docs/release-qa-checklist.md`, `docs/android-live-match-performance-budget.md` | 실기기 QA와 코드 게이트를 연결한다. | Low | Low |
| unused 후보 정리 PR | `src/lib/api/services.ts` 등 | 삭제 안전성을 별도 PR에서 확인한다. | Low | Medium |

## 다음에 바로 실행할 리팩토링 프롬프트 3개

1. `docs/code-quality-audit.md 기준 P0-1: src/features/runs/TrackRunExperience.tsx를 shell router로 축소해줘. IdleRunShell, MatchLobbyShell, LiveMatchShell이 각자 필요한 상태만 구독하게 하고 UI/기능/GPS/저장/승패 로직은 변경하지 마. npm run typecheck, npm run lint, npm run test 통과까지 확인해줘.`

2. `docs/code-quality-audit.md 기준 P0-2: match lifecycle owner를 단일화해줘. room start 이후 match-room snapshot polling이 live-match owner로 handoff되도록 useRoomSnapshot, useRunningMatchFocus, matchLifecycleController 경계를 정리하고 기존 방 생성/초대/입장/카운트다운/대결 시작 동작은 유지해줘. 테스트도 추가해줘.`

3. `docs/code-quality-audit.md 기준 P0-3: Android GPS/background tracking start manager를 강화해줘. appState active에서는 background native start를 만들지 않고, matchId/taskName single-flight와 timeout/ignore stale result 테스트를 추가해줘. UI block 없이 live match 화면이 유지되게 하고 기존 기록 정확도는 유지해줘.`
