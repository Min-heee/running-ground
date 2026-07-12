# 코드 품질 자동 분석 리포트

> 이 파일은 `npm run code:quality`로 생성됩니다. 수동 수정하지 말고 스크립트를 다시 실행해 갱신하세요.

생성 시각: 2026-07-12T17:45:56.425Z

## 실행 방법

```bash
npm run code:quality
```

## 요약

| 항목 | 값 |
| --- | --- |
| 분석 파일 | 1183 |
| 코드 파일 | 1108 |
| package scripts | 64 |
| 300줄 이상 파일 | 146 |
| 500줄 이상 파일 | 36 |
| 50줄 이상 함수 후보 | 334 |
| 순환 import 검사 | 별도 정적 graph가 아닌 파일 단위 휴리스틱 |

## 감지 항목 요약

| 항목 | 전체 | High | Medium | Low |
| --- | --- | --- | --- | --- |
| React component inline object/array/style 후보 | 77 | 0 | 11 | 66 |
| 렌더 중 sort/filter/map 후보 | 29 | 0 | 29 | 0 |
| useEffect가 많은 파일 | 4 | 0 | 4 | 0 |
| useMemo/useCallback 없이 props를 많이 만드는 후보 | 5 | 0 | 5 | 0 |
| services 밖 fetch/api 호출 후보 | 0 | 0 | 0 | 0 |
| utils/domain 밖 계산 로직 후보 | 59 | 2 | 57 | 0 |
| types 밖 타입 선언 후보 | 68 | 3 | 65 | 0 |
| setInterval/setTimeout/subscription cleanup 의심 후보 | 19 | 0 | 19 | 0 |
| Location/watchPosition/background task 사용 후보 | 26 | 3 | 23 | 0 |

## 300줄 이상 파일



> 146개 중 상위 80개만 표시합니다.


| 파일 | 줄 | 신호 |
| --- | --- | --- |
| backend/src/runningMatchContract.test.mjs | 3082 | imports 12, sort/filter/map 10, timers 5 |
| src/features/runs/runtime/TrackRunExperienceRuntimeModel.tsx | 2396 | imports 79, effects 1, sort/filter/map 1 |
| src/features/runs/tracking/background/backgroundMatchProgressSync.test.ts | 1949 | imports 15, timers 1, subs 1 |
| backend/src/lib/runningMatchRankSystem.test.mjs | 1442 | imports 5, sort/filter/map 2 |
| src/features/runs/tracking/background/backgroundMatchProgressSync.ts | 1075 | imports 17, timers 1 |
| backend/src/smoke.mjs | 1027 | imports 19, sort/filter/map 2, timers 2 |
| scripts/analyze-code-quality.mjs | 983 | imports 6, sort/filter/map 37, subs 16 |
| src/features/runs/sync/useMatchProgressSync.ts | 966 | imports 23, effects 7, timers 3 |
| backend/src/lib/matchResponseBuilders.mjs | 939 | imports 11, sort/filter/map 24 |
| src/features/runs/viewModels/matchResultModel.test.ts | 913 | imports 5, sort/filter/map 5 |
| backend/src/lib/matchResultBuilders.mjs | 842 | imports 5, sort/filter/map 8 |
| backend/src/repositories/postgresAuthRepository.test.mjs | 822 | imports 5, sort/filter/map 22 |
| src/features/runs/lifecycle/hooks/useMatchCountdownModel.ts | 821 | imports 9 |
| src/features/running/utils/runDetailMatchReconcile.test.ts | 786 | imports 5, sort/filter/map 4 |
| backend/src/repositories/postgresAuthRepository.mjs | 742 | imports 4, sort/filter/map 1 |
| src/features/runs/lifecycle/matchStateMachine.ts | 720 | imports 3, sort/filter/map 2 |
| src/features/runs/lifecycle/matchStateMachine.test.ts | 701 | imports 4, sort/filter/map 2 |
| src/features/runs/lifecycle/matchLifecycleController.test.ts | 692 | imports 5 |
| backend/src/lib/matchSealRevision.test.mjs | 674 | imports 8, sort/filter/map 6 |
| backend/src/repositories/postgresRunsRepository.test.mjs | 653 | imports 3, sort/filter/map 9 |
| src/features/runs/sync/matchPolling/useBlockingMatchStatusPolling.ts | 644 | imports 9, effects 4 |
| docs/backend-api-contract.md | 636 | imports 2 |
| backend/src/repositories/authRepository.test.mjs | 608 | imports 5, sort/filter/map 1 |
| src/lib/api/services/mock/matchSessions.ts | 594 | imports 6, sort/filter/map 15 |
| backend/src/repositories/runsRepository.test.mjs | 593 | imports 4, sort/filter/map 1 |
| backend/src/lib/matchActionHandlers.mjs | 588 | imports 16, sort/filter/map 6 |
| backend/src/store.mjs | 588 | imports 6, sort/filter/map 9 |
| backend/src/repositories/runsRepository.mjs | 579 | imports 4, sort/filter/map 11 |
| src/features/runs/lifecycle/hooks/useMatchCountdownModel.test.ts | 569 | imports 5 |
| backend/src/lib/runningMatchGroupVerdict.test.mjs | 568 | imports 6, sort/filter/map 11 |
| scripts/run-release-gate.mjs | 553 | imports 5, sort/filter/map 10 |
| backend/src/seed.mjs | 534 | imports 4, sort/filter/map 5 |
| src/features/runs/tracking/session/useTrackingSessionSnapshots.ts | 533 | imports 12, effects 1, timers 1 |
| scripts/analyze-android-perf-trace.mjs | 529 | imports 2, sort/filter/map 7 |
| src/lib/api/services/matches.ts | 521 | imports 7, sort/filter/map 6 |
| docs/handoff/codex-pr-execution-plan.md | 502 |  |
| backend/src/repositories/postgresLeagueRepository.mjs | 495 | imports 3, sort/filter/map 12 |
| src/lib/api/services/rooms.ts | 488 | imports 6, sort/filter/map 4 |
| src/features/runs/viewModels/matchResultModel.ts | 485 | imports 5, sort/filter/map 1 |
| backend/src/lib/validators.mjs | 485 | imports 6, sort/filter/map 3 |
| src/features/runs/viewModels/matchProgress.ts | 483 | imports 4, sort/filter/map 2 |
| scripts/check-preview-public-api.mjs | 482 | imports 4 |
| src/features/runs/tracking/background/routeAccumulator.test.ts | 480 | imports 5 |
| backend/src/database/integration/postgresRepositories.integration.test.mjs | 477 | imports 10, sort/filter/map 1 |
| scripts/check-performance-smells.mjs | 477 | imports 3, sort/filter/map 22, subs 8 |
| src/features/runs/sync/heartbeatSlotRetry.test.ts | 471 | imports 5 |
| backend/src/repositories/postgresFriendsRepository.test.mjs | 468 | imports 7, sort/filter/map 12 |
| backend/src/server.mjs | 464 | imports 27, timers 1 |
| src/features/runs/sync/partyRunSync/useLinkedMatchSync.ts | 460 | imports 9, effects 3 |
| src/features/runs/lifecycle/hooks/runningMatchFocus/useLiveMatchNavigationExecutor.ts | 459 | imports 13 |
| src/features/running/utils/runDetailMatchReconcile.ts | 458 | imports 3 |
| backend/src/storage/postgresStoreAdapter.mjs | 453 | imports 5 |
| src/features/settings/admin/hooks/useAdminDashboard.ts | 451 | imports 7, effects 1 |
| backend/src/lib/runIntegrity.test.mjs | 447 | imports 4, sort/filter/map 2 |
| backend/src/repositories/authRepository.mjs | 443 | imports 3, sort/filter/map 11 |
| src/features/runs/viewModels/matchProgress.test.ts | 441 | imports 5, sort/filter/map 10 |
| src/integrations/nativeHealth.ts | 438 | imports 12, sort/filter/map 1 |
| src/features/runs/runtime/useTrackRunMatchStatusLoaders.ts | 436 | imports 11, sort/filter/map 1 |
| src/features/runs/lifecycle/matchLifecycleController.ts | 432 | imports 7 |
| scripts/deploy-public-backend.mjs | 432 | imports 7, timers 1 |
| src/features/runs/sync/matchPolling/useBlockingMatchStatusPolling.test.ts | 430 | imports 6 |
| src/features/runs/tracking/background/locationDistance.ts | 428 | imports 3 |
| src/features/runs/sync/roomInviteInbox.test.ts | 424 | imports 4 |
| src/features/runs/liveGap/liveGapMessage.ts | 418 | imports 3, sort/filter/map 3 |
| src/features/runs/viewModels/liveMatchProgressModel.test.ts | 418 | imports 5 |
| src/features/runs/sync/serverClockSync.test.ts | 415 | imports 3 |
| backend/src/routes/index.test.mjs | 415 | imports 3, sort/filter/map 1 |
| backend/src/repositories/friendsRepository.mjs | 407 | imports 2, sort/filter/map 9 |
| src/features/runs/hooks/runSaveFlow/runSaveResultMapper.test.ts | 403 | imports 7, sort/filter/map 1 |
| backend/src/lib/matchRoom/matchRoomActions.mjs | 402 | imports 12, sort/filter/map 14 |
| src/features/runs/lifecycle/matchRoomFlow.ts | 401 | imports 2, sort/filter/map 8 |
| backend/src/lib/matchRoom/matchRoomCleanup.mjs | 394 | imports 7, sort/filter/map 11 |
| src/features/runs/hooks/runSaveFlow/useRunSaveCommand.ts | 393 | imports 18 |
| backend/src/routes/runningMatch/runningMatchProgressRoutes.test.mjs | 392 | imports 6 |
| src/features/runs/tracking/background/locationTaskManager.test.ts | 389 | imports 6, timers 8 |
| src/features/runs/sync/matchProgressSync.test.ts | 387 | imports 5 |
| backend/src/matchIntegrityContract.test.mjs | 381 | imports 13, sort/filter/map 1, timers 2 |
| src/features/runs/hooks/runSaveFlow/useRunForfeitCommand.ts | 379 | imports 12 |
| backend/src/lib/points.mjs | 378 | imports 2, sort/filter/map 8 |
| src/features/runs/viewModels/liveMatchRaceBoardViewModel.test.ts | 373 | imports 5, sort/filter/map 5 |

## 500줄 이상 파일

| 파일 | 줄 | 신호 |
| --- | --- | --- |
| backend/src/runningMatchContract.test.mjs | 3082 | imports 12, sort/filter/map 10, timers 5 |
| src/features/runs/runtime/TrackRunExperienceRuntimeModel.tsx | 2396 | imports 79, effects 1, sort/filter/map 1 |
| src/features/runs/tracking/background/backgroundMatchProgressSync.test.ts | 1949 | imports 15, timers 1, subs 1 |
| backend/src/lib/runningMatchRankSystem.test.mjs | 1442 | imports 5, sort/filter/map 2 |
| src/features/runs/tracking/background/backgroundMatchProgressSync.ts | 1075 | imports 17, timers 1 |
| backend/src/smoke.mjs | 1027 | imports 19, sort/filter/map 2, timers 2 |
| scripts/analyze-code-quality.mjs | 983 | imports 6, sort/filter/map 37, subs 16 |
| src/features/runs/sync/useMatchProgressSync.ts | 966 | imports 23, effects 7, timers 3 |
| backend/src/lib/matchResponseBuilders.mjs | 939 | imports 11, sort/filter/map 24 |
| src/features/runs/viewModels/matchResultModel.test.ts | 913 | imports 5, sort/filter/map 5 |
| backend/src/lib/matchResultBuilders.mjs | 842 | imports 5, sort/filter/map 8 |
| backend/src/repositories/postgresAuthRepository.test.mjs | 822 | imports 5, sort/filter/map 22 |
| src/features/runs/lifecycle/hooks/useMatchCountdownModel.ts | 821 | imports 9 |
| src/features/running/utils/runDetailMatchReconcile.test.ts | 786 | imports 5, sort/filter/map 4 |
| backend/src/repositories/postgresAuthRepository.mjs | 742 | imports 4, sort/filter/map 1 |
| src/features/runs/lifecycle/matchStateMachine.ts | 720 | imports 3, sort/filter/map 2 |
| src/features/runs/lifecycle/matchStateMachine.test.ts | 701 | imports 4, sort/filter/map 2 |
| src/features/runs/lifecycle/matchLifecycleController.test.ts | 692 | imports 5 |
| backend/src/lib/matchSealRevision.test.mjs | 674 | imports 8, sort/filter/map 6 |
| backend/src/repositories/postgresRunsRepository.test.mjs | 653 | imports 3, sort/filter/map 9 |
| src/features/runs/sync/matchPolling/useBlockingMatchStatusPolling.ts | 644 | imports 9, effects 4 |
| docs/backend-api-contract.md | 636 | imports 2 |
| backend/src/repositories/authRepository.test.mjs | 608 | imports 5, sort/filter/map 1 |
| src/lib/api/services/mock/matchSessions.ts | 594 | imports 6, sort/filter/map 15 |
| backend/src/repositories/runsRepository.test.mjs | 593 | imports 4, sort/filter/map 1 |
| backend/src/lib/matchActionHandlers.mjs | 588 | imports 16, sort/filter/map 6 |
| backend/src/store.mjs | 588 | imports 6, sort/filter/map 9 |
| backend/src/repositories/runsRepository.mjs | 579 | imports 4, sort/filter/map 11 |
| src/features/runs/lifecycle/hooks/useMatchCountdownModel.test.ts | 569 | imports 5 |
| backend/src/lib/runningMatchGroupVerdict.test.mjs | 568 | imports 6, sort/filter/map 11 |
| scripts/run-release-gate.mjs | 553 | imports 5, sort/filter/map 10 |
| backend/src/seed.mjs | 534 | imports 4, sort/filter/map 5 |
| src/features/runs/tracking/session/useTrackingSessionSnapshots.ts | 533 | imports 12, effects 1, timers 1 |
| scripts/analyze-android-perf-trace.mjs | 529 | imports 2, sort/filter/map 7 |
| src/lib/api/services/matches.ts | 521 | imports 7, sort/filter/map 6 |
| docs/handoff/codex-pr-execution-plan.md | 502 |  |

## 50줄 이상 함수 후보



> 334개 중 상위 80개만 표시합니다.


| 파일 | 줄 | 함수 | 길이 |
| --- | --- | --- | --- |
| src/features/runs/runtime/TrackRunExperienceRuntimeModel.tsx | 164 | TrackRunExperienceRuntime | 2232 |
| src/features/runs/sync/useMatchProgressSync.ts | 154 | useMatchProgressSync | 812 |
| src/features/runs/tracking/session/useTrackingSessionSnapshots.ts | 102 | useTrackingSessionSnapshots | 431 |
| src/features/runs/sync/matchPolling/useBlockingMatchStatusPolling.ts | 228 | useBlockingMatchStatusPolling | 416 |
| src/features/settings/admin/hooks/useAdminDashboard.ts | 51 | useAdminDashboard | 400 |
| backend/src/repositories/postgresAuthRepository.mjs | 366 | createPostgresAuthRepository | 376 |
| src/features/runs/lifecycle/hooks/useMatchCountdownModel.ts | 454 | useMatchCountdownModel | 367 |
| src/features/runs/runtime/useTrackRunMatchStatusLoaders.ts | 84 | useTrackRunMatchStatusLoaders | 352 |
| src/features/runs/sync/partyRunSync/useLinkedMatchSync.ts | 133 | useLinkedMatchSync | 327 |
| src/features/runs/hooks/runSaveFlow/useRunForfeitCommand.ts | 54 | useRunForfeitCommand | 325 |
| src/features/auth/hooks/useSignupForm.ts | 27 | useSignupForm | 323 |
| src/features/runs/viewModels/useLiveMatchViewModel.ts | 37 | useLiveMatchViewModel | 310 |
| backend/src/repositories/authRepository.mjs | 142 | createJsonAuthRepository | 301 |
| backend/src/storage/postgresStoreAdapter.mjs | 163 | createPostgresStoreAdapter | 288 |
| src/features/runs/runtime/useTrackRunRoomLoader.ts | 60 | useTrackRunRoomLoader | 280 |
| src/features/runs/runtime/useTrackRunRuntimeRecipientInviteInbox.ts | 50 | useTrackRunRuntimeRecipientInviteInbox | 269 |
| src/features/match/hooks/lobby/useRoomStartActions.ts | 70 | useRoomStartActions | 266 |
| src/features/running/hooks/useRunDetail.ts | 49 | useRunDetail | 259 |
| src/features/settings/screens/AdminScreen.tsx | 20 | AdminScreen | 254 |
| src/features/runs/runtime/useTrackRunRoomLoader.ts | 77 | callback@useCallback | 245 |
| src/features/runs/hooks/useMatchRuntimeState.ts | 69 | useMatchRuntimeState | 238 |
| backend/src/bridges/friendsLeagueBridge.mjs | 22 | createFriendsLeagueBridge | 236 |
| backend/src/lib/matchResponseBuilders.mjs | 312 | buildRunningMatchStatusResponse | 234 |
| src/features/runs/runtime/useRuntimeHydrationEffects.ts | 8 | useRuntimeHydrationEffects | 232 |
| src/features/runs/lifecycle/hooks/runningMatchFocus/useLiveMatchNavigationOwner.ts | 27 | useLiveMatchNavigationOwner | 231 |
| src/features/runs/lifecycle/hooks/useMatchEntryEffects.ts | 48 | useMatchEntryEffects | 229 |
| src/features/runs/runtime/useTrackRunRuntimeRoomInviteActions.ts | 37 | useTrackRunRuntimeRoomInviteActions | 228 |
| src/features/auth/components/signup/SignupCredentialsSection.tsx | 45 | SignupCredentialsSection | 224 |
| src/features/runs/tracking/background/locationTaskManagerCore.ts | 42 | createLocationTaskManager | 220 |
| src/features/match/hooks/lobby/useRoomInviteActions.ts | 17 | useRoomInviteActions | 216 |
| src/features/runs/hooks/matchRoomLobby/useMatchRoomLobbyEffects.ts | 29 | useMatchRoomLobbyEffects | 213 |
| backend/src/repositories/postgresFriendsRepository.mjs | 27 | createPostgresFriendsRepository | 213 |
| src/features/runs/runtime/useTrackRunRuntimeStateBridge.ts | 57 | useTrackRunRuntimeStateBridge | 212 |
| src/features/runs/runtime/useTrackRunRoomJoinAction.ts | 48 | useTrackRunRoomJoinAction | 212 |
| scripts/check-preview-public-api.mjs | 259 | main | 211 |
| src/features/runs/runtime/useTrackRunRoomCreateAction.ts | 78 | useTrackRunRoomCreateAction | 211 |
| backend/src/lib/matchActionHandlers.mjs | 354 | updateRunningMatchProgress | 200 |
| src/features/runs/tracking/useTrackingAppStateSync.ts | 50 | useTrackingAppStateSync | 200 |
| src/features/runs/runtime/useTrackRunRuntimeMatchRequestActions.ts | 11 | useTrackRunRuntimeMatchRequestActions | 200 |
| scripts/analyze-android-perf-trace.mjs | 218 | analyzeLine | 197 |
| src/features/runs/tracking/background/routeAccumulator.ts | 174 | appendTrackedLocation | 197 |
| backend/src/routes/adminRoutes.mjs | 3 | routeAdminRequest | 196 |
| src/features/runs/liveActivity/useLiveActivityBridge.ts | 70 | useLiveActivityBridge | 196 |
| src/features/runs/runtime/useTrackRunRuntimeMatchMaintenanceActions.ts | 8 | useTrackRunRuntimeMatchMaintenanceActions | 187 |
| src/features/runs/components/matchSetupCards/MatchSetupTabbedSelector.tsx | 33 | MatchSetupTabbedSelector | 186 |
| src/features/runs/runtime/useTrackRunRuntimeRecipientInviteInbox.ts | 100 | callback@useCallback | 182 |
| src/features/home/hooks/useHomeScreenModel.ts | 30 | useHomeScreenModel | 181 |
| src/features/match/screens/MatchRoomScreen.tsx | 19 | MatchRoomScreen | 179 |
| src/features/runs/runtime/useTrackRunRoomJoinAction.ts | 67 | callback@useCallback | 178 |
| src/features/runs/runtime/useTrackRunRoomCreateAction.ts | 95 | callback@useCallback | 177 |
| src/features/runs/tracking/lifecycle/useMatchAutoTrackingEffects.ts | 43 | useMatchAutoTrackingEffects | 171 |
| backend/src/bridges/sessionRunsBridge.mjs | 161 | createSessionRunsBridge | 169 |
| src/features/integrations/hooks/useIntegrationActions.ts | 86 | useIntegrationActions | 165 |
| backend/src/repositories/marketRepository.mjs | 5 | createJsonMarketRepository | 165 |
| src/features/running/screens/RunDetailScreen.tsx | 18 | RunDetailScreen | 160 |
| src/features/runs/hooks/useMatchSelectionModel.ts | 57 | useMatchSelectionModel | 159 |
| src/features/runs/hooks/usePartyRunRoom.ts | 79 | usePartyRunRoom | 158 |
| src/features/runs/tracking/background/locationTaskManagerCore.ts | 48 | startLocationTaskWithTrace | 156 |
| src/features/auth/screens/WelcomeTourScreen.tsx | 24 | WelcomeTourScreen | 156 |
| src/features/running/components/RunMatchResultCard.tsx | 40 | RunMatchResultCardBase | 155 |
| src/features/runs/runtime/useTrackRunWedgedLoadingWatchdog.ts | 47 | useTrackRunWedgedLoadingWatchdog | 155 |
| src/features/runs/tracking/actions/useStartTrackingAction.ts | 54 | callback@useCallback | 152 |
| src/features/runs/runtime/useTrackRunIdlePressHandlers.ts | 40 | useTrackRunIdlePressHandlers | 152 |
| src/features/runs/hooks/useMatchResultController.ts | 101 | useMatchResultController | 151 |
| src/features/runs/hooks/matchLifecycle/useGroupMatchLifecycle.ts | 26 | useGroupMatchLifecycle | 151 |
| src/features/runs/components/matchSetupCards/GroupMatchSetupCard.tsx | 41 | GroupMatchSetupCard | 150 |
| src/features/runs/viewModels/useTrackRunIdleViewModel.ts | 90 | useTrackRunIdleViewModel | 149 |
| src/features/runs/hooks/runSaveFlow/useRunFinishCommand.ts | 46 | useRunFinishCommand | 146 |
| src/features/notifications/screens/NotificationCenterScreen.tsx | 26 | NotificationCenterScreen | 146 |
| src/features/runs/lifecycle/hooks/runningMatchFocus/useLiveMatchMountSignalBridge.ts | 15 | useLiveMatchMountSignalBridge | 146 |
| src/features/runs/hooks/matchLifecycle/useDuelMatchLifecycle.ts | 25 | useDuelMatchLifecycle | 145 |
| src/features/match/hooks/lobby/roomSnapshot/useRoomSnapshotFetcher.ts | 41 | callback@useCallback | 144 |
| src/features/runs/viewModels/useLiveMatchProgress.ts | 43 | useLiveMatchProgress | 143 |
| src/features/runs/runtime/useTrackRunLiveArenaDiagnostics.ts | 39 | useTrackRunLiveArenaDiagnostics | 142 |
| backend/src/bridges/friendsLeagueBridge.test.mjs | 11 | createHarness | 141 |
| src/features/runs/sync/partyRunSync/useCountdownReadyAck.ts | 68 | useCountdownReadyAck | 141 |
| src/features/friends/hooks/useFriendsScreen.ts | 17 | useFriendsScreen | 140 |
| src/features/auth/hooks/usePhoneVerificationForm.ts | 24 | usePhoneVerificationForm | 139 |
| src/features/runs/components/LiveMatchExitActionCard.tsx | 20 | LiveMatchExitActionCard | 137 |
| src/components/matches/useAndroidLiveMatchPerfProbe.ts | 50 | useAndroidLiveMatchPerfProbe | 136 |

## React component inline object/array/style 후보

| 우선순위 | 파일 | 줄 | 이유 | 권장 조치 | 근거 |
| --- | --- | --- | --- | --- | --- |
| Medium | src/features/runs/components/matchSetupCards/matchSetupSelectorChips.tsx | 16 | inline style/object/array/function prop 11개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[styles.tabPill, active ? styles.tabPillActive : undefined]} |
| Medium | src/features/runs/components/matchSetupCards/LiveGapPushCard.tsx | 37 | inline style/object/array/function prop 8개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <Pressable style={[styles.chip, selected ? styles.chipSelected : undefined]} onPress={onPress}> |
| Medium | src/features/friends/screens/FriendsScreen.tsx | 61 | inline style/object/array/function prop 7개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <Pressable style={styles.addButton} onPress={() => router.push('/add-friend')}> |
| Medium | src/features/running/screens/RunDetailScreen.tsx | 102 | inline style/object/array/function prop 6개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <View style={[styles.skeletonBlock, styles.skeletonHero]} /> |
| Medium | src/features/settings/screens/AdminScreen.tsx | 94 | inline style/object/array/function prop 6개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <View style={[styles.container, isWide ? styles.containerWide : null]}> |
| Medium | src/components/matches/liveMatchArena/DuelRoad.tsx | 45 | inline style/object/array/function prop 5개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <View style={[ |
| Medium | src/components/matches/liveMatchArena/RoadMotion.tsx | 32 | inline style/object/array/function prop 5개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <View style={[styles.duelLaneBase, styles.duelLaneLeft]} /> |
| Medium | src/features/auth/components/welcomeTour/PermissionsStepCard.tsx | 59 | inline style/object/array/function prop 5개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | onRequest={() => { |
| Medium | src/features/friends/FriendsRanking.tsx | 46 | inline style/object/array/function prop 5개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | onPress={() => setRankingWindow('today')} |
| Medium | src/features/league/components/LeagueRegionSelectorCard.tsx | 97 | inline style/object/array/function prop 5개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[styles.pathChip, isCurrentPath && styles.pathChipActive]} |
| Medium | src/features/league/components/RankLeaderboardCard.tsx | 62 | inline style/object/array/function prop 5개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <View style={[styles.tierHeader, { backgroundColor: accentColor }]}> |
| Low | src/features/auth/components/signup/SignupFormPrimitives.tsx | 36 | inline style/object/array/function prop 4개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[styles.input, !editable && styles.inputDisabled]} |
| Low | src/features/auth/components/signup/SignupProfileSection.tsx | 51 | inline style/object/array/function prop 4개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | onPress={() => setDisplayNamePreference('nickname')} |
| Low | src/features/auth/screens/LoginScreen.tsx | 49 | inline style/object/array/function prop 4개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[styles.input, styles.passwordInput]} |
| Low | src/features/home/components/overview/HomePointCalendar.tsx | 42 | inline style/object/array/function prop 4개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[styles.calendarNavButton, calendarMonthOffset === 0 && styles.calendarNavButtonCurrent]} |
| Low | src/features/integrations/components/ExclusiveSourceSelectorCard.tsx | 49 | inline style/object/array/function prop 4개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[ |
| Low | src/features/league/components/LeagueRankBadges.tsx | 16 | inline style/object/array/function prop 4개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[ |
| Low | src/features/match/screens/MatchRecordScreen.tsx | 40 | inline style/object/array/function prop 4개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <Link href={{ pathname: '/run-detail', params: { runId: run.id } }} asChild> |
| Low | src/features/notifications/components/NotificationRow.tsx | 29 | inline style/object/array/function prop 4개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | onPress={() => onPress(item)} |
| Low | src/features/profile/screens/MyActivityScreen.tsx | 35 | inline style/object/array/function prop 4개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <Link href={{ pathname: '/run-detail', params: { runId: run.id } }} asChild> |
| Low | src/features/runs/components/LiveMatchExitActionCard.tsx | 101 | inline style/object/array/function prop 4개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[styles.button, actionState.disabled ? styles.buttonDisabled : undefined]} |
| Low | src/features/runs/components/PartyRunHomePanel.tsx | 86 | inline style/object/array/function prop 4개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[styles.roomModeChip, optionIsSelected ? styles.roomModeChipSelected : undefined]} |
| Low | src/components/matches/liveMatchArena/GroupRoad.tsx | 101 | inline style/object/array/function prop 3개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[ |
| Low | src/components/ui/Button.tsx | 19 | inline style/object/array/function prop 3개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[ |
| Low | src/components/ui/SegmentedTabs.tsx | 29 | inline style/object/array/function prop 3개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | accessibilityState={{ selected }} |
| Low | src/features/auth/components/SocialLoginButtons.tsx | 44 | inline style/object/array/function prop 3개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[ |
| Low | src/features/friends/components/FriendRequestsCard.tsx | 48 | inline style/object/array/function prop 3개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[styles.ghostButton, isActing && styles.disabledButton]} |
| Low | src/features/home/HomeOverview.tsx | 64 | inline style/object/array/function prop 3개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | onPreviousMonth={() => setCalendarMonthOffset((current) => current - 1)} |
| Low | src/features/integrations/IntegrationJourneyCard.tsx | 148 | inline style/object/array/function prop 3개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <View style={[styles.stepRow, isLast && styles.stepRowLast]}> |
| Low | src/features/league/components/TodayRankingCard.tsx | 34 | inline style/object/array/function prop 3개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | accessibilityState={{ selected: active }} |
| Low | src/features/runs/components/matchRoom/MatchRoomFriendInviteCard.tsx | 64 | inline style/object/array/function prop 3개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[ |
| Low | src/features/settings/admin/components/UserAdminSection.tsx | 40 | inline style/object/array/function prop 3개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | keyExtractor={(user) => user.id} |
| Low | src/components/BrandLoadingView.tsx | 57 | inline style/object/array/function prop 2개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <SafeAreaView style={[styles.container, style]} edges={edges}> |
| Low | src/components/RouteErrorBoundary.tsx | 52 | inline style/object/array/function prop 2개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <SecondaryButton label="다시 시도" onPress={() => { void retry(); }} /> |
| Low | src/components/Screen.tsx | 31 | inline style/object/array/function prop 2개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <SafeAreaView style={styles.safe} edges={['top']}> |
| Low | src/components/ui/YearMonthFilterRow.tsx | 70 | inline style/object/array/function prop 2개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | onPress={() => setActivePicker('year')} |
| Low | src/features/auth/components/recovery/ResetPhoneVerificationSection.tsx | 45 | inline style/object/array/function prop 2개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[ |
| Low | src/features/auth/components/signup/SignupCredentialsSection.tsx | 208 | inline style/object/array/function prop 2개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <Pressable onPress={() => handlePhoneChange('')} disabled={submitting}> |
| Low | src/features/auth/components/signup/SignupRegionSection.tsx | 52 | inline style/object/array/function prop 2개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | onPress={() => setOpenRegionStep('province')} |
| Low | src/features/auth/screens/AccountRecoveryScreen.tsx | 47 | inline style/object/array/function prop 2개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[styles.primaryButton, findForm.finding ? styles.disabledButton : null]} |
| Low | src/features/auth/screens/OnboardingScreen.tsx | 50 | inline style/object/array/function prop 2개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <PrimaryButton label="회원가입하고 시작" onPress={() => router.push('/signup')} /> |
| Low | src/features/auth/screens/WelcomeTourScreen.tsx | 171 | inline style/object/array/function prop 2개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | onBeginPermissions={() => setStep('permissions')} |
| Low | src/features/friends/components/FriendListCard.tsx | 56 | inline style/object/array/function prop 2개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[ |
| Low | src/features/friends/components/FriendRankRow.tsx | 14 | inline style/object/array/function prop 2개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <Link href={{ pathname: '/friend-detail', params: { friendId: runner.id } }} asChild> |
| Low | src/features/friends/screens/FriendDetailScreen.tsx | 24 | inline style/object/array/function prop 2개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | href={{ pathname: '/run-detail', params: { runId: run.id, friendId } }} |
| Low | src/features/home/components/overview/HomeActivityStatusCard.tsx | 62 | inline style/object/array/function prop 2개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | accessibilityState={{ selected }} |
| Low | src/features/home/components/overview/RunPeriodPickerSheet.tsx | 109 | inline style/object/array/function prop 2개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[ |
| Low | src/features/location/RegionSelection.tsx | 85 | inline style/object/array/function prop 2개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[styles.selectionChip, selected && styles.selectionChipSelected, disabled && styles.disabledButton]} |
| Low | src/features/profile/components/AccountActionsCard.tsx | 33 | inline style/object/array/function prop 2개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[ |
| Low | src/features/profile/screens/EditProfileScreen.tsx | 42 | inline style/object/array/function prop 2개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <SecondaryButton label="마이페이지로 돌아가기" onPress={() => router.replace('/(tabs)/mypage')} /> |
| Low | src/features/runs/components/matchResult/ResultRankRow.tsx | 26 | inline style/object/array/function prop 2개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[ |
| Low | src/features/runs/components/matchRoom/MatchRoomInviteActionCard.tsx | 27 | inline style/object/array/function prop 2개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[ |
| Low | src/features/runs/components/matchSetupCards/HorizontalScrollIndicator.tsx | 39 | inline style/object/array/function prop 2개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[ |
| Low | src/features/runs/components/PartyRunInviteCard.tsx | 38 | inline style/object/array/function prop 2개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[styles.declineButton, isBusy ? styles.buttonDisabled : undefined]} |
| Low | src/features/runs/components/TrackRunExperienceView.tsx | 58 | inline style/object/array/function prop 2개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[styles.roomArmingOverlay, styles.roomArmingOverlayAboveCountdown, { opacity: opacityRef.current }]} |
| Low | app/_layout.tsx | 87 | inline style/object/array/function prop 1개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <Stack screenOptions={{ headerShown: false, freezeOnBlur: true }}> |
| Low | src/components/Card.tsx | 7 | inline style/object/array/function prop 1개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | return <View style={[styles.card, style]} {...rest}>{children}</View>; |
| Low | src/components/matches/AndroidLiveMatchPerfPanel.tsx | 129 | inline style/object/array/function prop 1개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <Text style={[styles.diagnosis, diagnosisStyle]}> |
| Low | src/components/matches/liveMatchArena/ArenaRoadContent.tsx | 10 | inline style/object/array/function prop 1개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | return <BrandLoadingView style={styles.startupRoadShell} edges={[]} />; |
| Low | src/components/matches/MatchStartCountdownOverlay.tsx | 31 | inline style/object/array/function prop 1개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <View style={[styles.overlay, variant === 'centered' ? styles.overlayCentered : null]} pointerEvents="none"> |
| Low | src/components/ranking/RankingItemRow.tsx | 28 | inline style/object/array/function prop 1개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[styles.row, friend && styles.friendRow, highlighted && styles.highlightedRow]} |
| Low | src/features/auth/components/signup/SignupActionFooter.tsx | 29 | inline style/object/array/function prop 1개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[styles.primaryButton, disabled ? styles.disabledButton : null]} |
| Low | src/features/auth/components/welcomeTour/PermissionRow.tsx | 39 | inline style/object/array/function prop 1개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <Text style={[styles.permissionBadge, styles.permissionBadgeOn]}>✓ 허용됨</Text> |
| Low | src/features/friends/screens/AddFriendScreen.tsx | 76 | inline style/object/array/function prop 1개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <SecondaryButton label="친구 화면으로 돌아가기" onPress={() => router.replace('/(tabs)/friends')} /> |
| Low | src/features/integrations/screens/ConnectSourcesScreen.tsx | 139 | inline style/object/array/function prop 1개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[source.connected ? styles.badgeConnected : styles.badge, connecting && styles.badgeDisabled]} |
| Low | src/features/integrations/screens/IntegrationManagementScreen.tsx | 118 | inline style/object/array/function prop 1개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <SecondaryButton label={backLabel} onPress={() => router.replace(backHref)} /> |
| Low | src/features/match/screens/DuelReservationRoomScreen.tsx | 164 | inline style/object/array/function prop 1개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[styles.participantRow, participant.isSelf ? undefined : styles.opponentParticipantRow]} |
| Low | src/features/match/screens/GroupReservationRoomScreen.tsx | 165 | inline style/object/array/function prop 1개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[styles.participantRow, participant.isSelf ? styles.selfParticipantRow : undefined]} |
| Low | src/features/match/screens/OpponentProfileScreen.tsx | 89 | inline style/object/array/function prop 1개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <SecondaryButton label="다시 시도" onPress={() => setRetryNonce((nonce) => nonce + 1)} /> |
| Low | src/features/running/components/RunMatchResultCard.tsx | 31 | inline style/object/array/function prop 1개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <Text style={[styles.runnerName, highlight ? styles.runnerNameMe : null]} numberOfLines={1}> |
| Low | src/features/running/components/RunPointBreakdownCard.tsx | 44 | inline style/object/array/function prop 1개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <Text style={[styles.pointBreakdownValue, highlight ? styles.pointBreakdownValueHighlight : null]}> |
| Low | src/features/running/screens/AddRunScreen.tsx | 95 | inline style/object/array/function prop 1개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <SecondaryButton label="내 활동으로 돌아가기" onPress={() => router.replace('/my-activity')} /> |
| Low | src/features/runs/components/matchResult/ResultDuelCard.tsx | 40 | inline style/object/array/function prop 1개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <View style={[styles.card, isWin ? styles.cardWin : styles.cardLose]}> |
| Low | src/features/runs/components/PartyRunParticipantListCard.tsx | 43 | inline style/object/array/function prop 1개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[styles.participantRow, participant.isInvitee ? styles.invitedParticipantRow : undefined]} |
| Low | src/features/runs/components/RunningReadyScreen.tsx | 33 | inline style/object/array/function prop 1개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <Card style={[styles.readyCard, readyCardStyle]}> |
| Low | src/features/runs/screens/MatchResultScreen.tsx | 98 | inline style/object/array/function prop 1개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | onPress={() => router.back()} |
| Low | src/features/settings/screens/RegionSettingsScreen.tsx | 75 | inline style/object/array/function prop 1개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <SecondaryButton label="마이페이지로 돌아가기" onPress={() => router.replace('/(tabs)/mypage')} /> |

## 렌더 중 sort/filter/map 후보

| 우선순위 | 파일 | 줄 | 이유 | 권장 조치 | 근거 |
| --- | --- | --- | --- | --- | --- |
| Medium | src/components/ui/SegmentedTabs.tsx | 23 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | {options.map((option) => { |
| Medium | src/features/auth/components/SocialLoginButtons.tsx | 39 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | {PROVIDER_BUTTONS.map(({ provider, label, background, text, border }) => { |
| Medium | src/features/auth/components/welcomeTour/PermissionsStepCard.tsx | 64 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | {PERMISSION_ITEMS.map((item) => ( |
| Medium | src/features/auth/components/welcomeTour/StepDots.tsx | 9 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | {STEP_ORDER.map((step, index) => ( |
| Medium | src/features/auth/screens/OnboardingScreen.tsx | 35 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | {FEATURES.map((feature) => ( |
| Medium | src/features/friends/components/FriendListCard.tsx | 102 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | {friends.map((friend) => ( |
| Medium | src/features/friends/components/FriendRequestsCard.tsx | 111 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | {received.map((request) => ( |
| Medium | src/features/friends/components/FriendRequestsCard.tsx | 120 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | {pending.map((request) => ( |
| Medium | src/features/friends/FriendsRanking.tsx | 75 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | {displayedRanks.map((runner) => ( |
| Medium | src/features/friends/screens/FriendDetailScreen.tsx | 94 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | {activityRuns.map((run) => ( |
| Medium | src/features/integrations/components/ExclusiveSourceSelectorCard.tsx | 163 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | {model.rows.map((row) => ( |
| Medium | src/features/integrations/components/SourceMethodGuideModal.tsx | 58 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | {guide.steps.map((step, index) => ( |
| Medium | src/features/league/components/DistrictMemberRankingCard.tsx | 105 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | {sortedRanks.map((runner) => ( |
| Medium | src/features/league/components/LeagueRegionSelectorCard.tsx | 126 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | {nodes.map((node, index) => { |
| Medium | src/features/match/screens/DuelReservationRoomScreen.tsx | 188 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | {participants.map((participant) => ( |
| Medium | src/features/match/screens/GroupReservationRoomScreen.tsx | 190 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | {participants.map((participant) => ( |
| Medium | src/features/match/screens/MatchRecordScreen.tsx | 163 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | visibleMatchRuns.map((run) => ( |
| Medium | src/features/notifications/components/AnnouncementList.tsx | 39 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | {notices.map((notice) => ( |
| Medium | src/features/notifications/components/InboxList.tsx | 68 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | items.map((item) => ( |
| Medium | src/features/profile/screens/MyActivityScreen.tsx | 147 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | visibleRuns.map((run) => ( |
| Medium | src/features/runs/components/MatchResultPanel.tsx | 54 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | {duelRows.map((row) => ( |
| Medium | src/features/runs/components/MatchResultPanel.tsx | 81 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | {groupRows.map((row) => ( |
| Medium | src/features/runs/components/matchSetupCards/LiveGapPushCard.tsx | 81 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | {LIVE_GAP_INTERVAL_OPTIONS.map((option) => ( |
| Medium | src/features/runs/components/matchSetupCards/LiveGapPushCard.tsx | 94 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | {LIVE_GAP_GROUP_TARGET_OPTIONS.map((option) => ( |
| Medium | src/features/runs/components/matchSetupCards/LiveGapPushCard.tsx | 112 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | {LIVE_GAP_METRIC_OPTIONS.map((option) => ( |
| Medium | src/features/runs/components/matchSetupCards/LiveGapPushCard.tsx | 130 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | {LIVE_GAP_DELIVERY_MODE_OPTIONS.map((option) => ( |
| Medium | src/features/runs/components/PartyRunParticipantListCard.tsx | 73 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | {uxModel.participants.map((participant) => ( |
| Medium | src/features/runs/screens/MatchResultScreen.tsx | 73 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | {model.rows.map((row, index) => ( |
| Medium | src/features/settings/admin/components/AdminPrimitives.tsx | 199 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | {data.map((item, index) => ( |

## useEffect가 많은 파일

| 우선순위 | 파일 | 줄 | 이유 | 권장 조치 | 근거 |
| --- | --- | --- | --- | --- | --- |
| Medium | src/features/runs/sync/useMatchProgressSync.ts |  | effect가 많아 dependency 변경과 cleanup 회귀 위험이 높다. | effect를 책임별 hook으로 분리하고, dependency/result dedupe 테스트를 추가한다. | useEffect=7, useFocusEffect=0 |
| Medium | src/features/match/hooks/useDuelReservationRoom.ts |  | effect가 많아 dependency 변경과 cleanup 회귀 위험이 높다. | effect를 책임별 hook으로 분리하고, dependency/result dedupe 테스트를 추가한다. | useEffect=4, useFocusEffect=0 |
| Medium | src/features/match/hooks/useGroupReservationRoom.ts |  | effect가 많아 dependency 변경과 cleanup 회귀 위험이 높다. | effect를 책임별 hook으로 분리하고, dependency/result dedupe 테스트를 추가한다. | useEffect=4, useFocusEffect=0 |
| Medium | src/features/runs/sync/matchPolling/useBlockingMatchStatusPolling.ts |  | effect가 많아 dependency 변경과 cleanup 회귀 위험이 높다. | effect를 책임별 hook으로 분리하고, dependency/result dedupe 테스트를 추가한다. | useEffect=4, useFocusEffect=0 |

## useMemo/useCallback 없이 props를 많이 만드는 후보

| 우선순위 | 파일 | 줄 | 이유 | 권장 조치 | 근거 |
| --- | --- | --- | --- | --- | --- |
| Medium | src/features/runs/components/matchSetupCards/LiveGapPushCard.tsx |  | props/object/function을 많이 만들지만 memo/callback 경계가 감지되지 않았다. | 반복 렌더가 있는 화면이면 props 생성 hook 또는 memoized child로 분리한다. | inline props=8, useMemo/useCallback=0 |
| Medium | src/features/friends/screens/FriendsScreen.tsx |  | props/object/function을 많이 만들지만 memo/callback 경계가 감지되지 않았다. | 반복 렌더가 있는 화면이면 props 생성 hook 또는 memoized child로 분리한다. | inline props=7, useMemo/useCallback=0 |
| Medium | src/features/running/screens/RunDetailScreen.tsx |  | props/object/function을 많이 만들지만 memo/callback 경계가 감지되지 않았다. | 반복 렌더가 있는 화면이면 props 생성 hook 또는 memoized child로 분리한다. | inline props=6, useMemo/useCallback=0 |
| Medium | src/features/settings/screens/AdminScreen.tsx |  | props/object/function을 많이 만들지만 memo/callback 경계가 감지되지 않았다. | 반복 렌더가 있는 화면이면 props 생성 hook 또는 memoized child로 분리한다. | inline props=6, useMemo/useCallback=0 |
| Medium | src/features/auth/components/welcomeTour/PermissionsStepCard.tsx |  | props/object/function을 많이 만들지만 memo/callback 경계가 감지되지 않았다. | 반복 렌더가 있는 화면이면 props 생성 hook 또는 memoized child로 분리한다. | inline props=5, useMemo/useCallback=0 |

## services 밖 fetch/api 호출 후보

없음


## utils/domain 밖 계산 로직 후보

| 우선순위 | 파일 | 줄 | 이유 | 권장 조치 | 근거 |
| --- | --- | --- | --- | --- | --- |
| High | backend/src/runningMatchContract.test.mjs |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=56, sort/filter/map=10 |
| High | src/features/runs/liveGap/liveGapPushConfig.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=2, sort/filter/map=10 |
| Medium | src/features/runs/liveGap/liveGapMessage.test.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=48, sort/filter/map=1 |
| Medium | src/features/runs/liveGap/liveGapMessage.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=43, sort/filter/map=3 |
| Medium | backend/src/seed.mjs |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=29, sort/filter/map=5 |
| Medium | src/features/runs/runtime/TrackRunExperienceRuntimeModel.tsx |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=28, sort/filter/map=1 |
| Medium | src/features/runs/hooks/runSaveFlow/runSaveResultMapper.test.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=27, sort/filter/map=1 |
| Medium | src/features/runs/liveActivity/buildLiveCardState.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=21, sort/filter/map=5 |
| Medium | src/features/runs/hooks/runSaveFlow/runSaveResultMapper.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=23, sort/filter/map=0 |
| Medium | src/features/runs/finishReminder/finishApproachReminderDecision.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=21, sort/filter/map=0 |
| Medium | backend/src/smoke.mjs |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=17, sort/filter/map=2 |
| Medium | src/features/runs/components/liveMatchTracking/LiveMatchRankingSection.tsx |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=17, sort/filter/map=1 |
| Medium | src/data/mock/regionTree.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=14, sort/filter/map=2 |
| Medium | src/features/integrations/exclusiveSourceSelectorModel.test.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=8, sort/filter/map=7 |
| Medium | src/features/runs/sync/matchDistanceStaleness.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=15, sort/filter/map=0 |
| Medium | backend/src/matchIntegrityContract.test.mjs |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=13, sort/filter/map=1 |
| Medium | src/features/runs/runtime/trackRunRuntimeDerivedState.test.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=14, sort/filter/map=0 |
| Medium | src/integrations/nativeHealth.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=12, sort/filter/map=1 |
| Medium | src/data/mock/friends.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=12, sort/filter/map=0 |
| Medium | src/features/integrations/integrationJourneyModel.test.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=7, sort/filter/map=4 |
| Medium | src/features/league/leagueRanking.test.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=8, sort/filter/map=3 |
| Medium | src/features/runs/liveActivity/useLiveActivityBridge.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=11, sort/filter/map=0 |
| Medium | src/lib/api/types/matches.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=11, sort/filter/map=0 |
| Medium | src/features/match/screens/MatchRecordScreen.tsx |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=6, sort/filter/map=4 |
| Medium | src/features/runs/liveActivity/buildLiveCardState.test.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=8, sort/filter/map=2 |
| Medium | src/features/runs/runtime/trackRunRuntimeDerivedState.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=9, sort/filter/map=1 |
| Medium | backend/src/points.test.mjs |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=9, sort/filter/map=0 |
| Medium | src/features/league/components/LeagueRankBadges.tsx |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=9, sort/filter/map=0 |
| Medium | src/features/points/pointSystem.test.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=8, sort/filter/map=1 |
| Medium | src/features/points/pointSystem.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=8, sort/filter/map=1 |
| Medium | src/features/runs/components/matchSetupCards/MatchSetupTabbedSelector.tsx |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=5, sort/filter/map=4 |
| Medium | src/features/runs/finishReminder/finishApproachReminderDecision.test.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=9, sort/filter/map=0 |
| Medium | src/features/runs/sync/activeRoomResult.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=5, sort/filter/map=4 |
| Medium | backend/src/routes/authPhoneVerificationRoutes.mjs |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=7, sort/filter/map=1 |
| Medium | backend/src/routing.mjs |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=7, sort/filter/map=1 |
| Medium | src/data/mock/runs.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=8, sort/filter/map=0 |
| Medium | src/features/profile/screens/MyActivityScreen.tsx |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=2, sort/filter/map=6 |
| Medium | src/features/runs/liveActivity/liveActivityController.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=7, sort/filter/map=1 |
| Medium | src/features/runs/liveGap/useLiveGapNotificationScheduler.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=8, sort/filter/map=0 |
| Medium | src/features/runs/sync/pendingFinishStore.test.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=8, sort/filter/map=0 |
| Medium | src/features/runs/sync/useMatchProgressSync.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=8, sort/filter/map=0 |
| Medium | backend/src/routes/index.test.mjs |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=6, sort/filter/map=1 |
| Medium | backend/src/storage/fileStoreBackup.mjs |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=3, sort/filter/map=4 |
| Medium | src/features/runs/hooks/useMatchResultController.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=7, sort/filter/map=0 |
| Medium | src/features/runs/hooks/usePartyRunRoom.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=5, sort/filter/map=2 |
| Medium | src/components/matches/liveMatchArena/RoadMotion.tsx |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=2, sort/filter/map=4 |
| Medium | src/features/location/addressCatalog.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=0, sort/filter/map=6 |
| Medium | src/features/runs/finishReminder/useFinishApproachReminder.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=6, sort/filter/map=0 |
| Medium | src/features/runs/sync/roomInviteInboxRecipientMatcher.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=2, sort/filter/map=4 |
| Medium | backend/src/auth.mjs |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=5, sort/filter/map=0 |
| Medium | src/components/matches/liveMatchArena/DuelRoad.tsx |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=5, sort/filter/map=0 |
| Medium | src/components/matches/liveMatchRaceBoard/RaceBoardListRow.tsx |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=5, sort/filter/map=0 |
| Medium | src/features/running/hooks/useAddRunForm.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=5, sort/filter/map=0 |
| Medium | src/features/runs/components/matchResult/ResultRankRow.tsx |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=5, sort/filter/map=0 |
| Medium | src/features/runs/components/matchSetupCards/scrollIndicatorMetrics.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=5, sort/filter/map=0 |
| Medium | src/features/runs/sync/localGoalFreezeStore.test.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=5, sort/filter/map=0 |
| Medium | src/lib/matchCountdown.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=1, sort/filter/map=4 |
| Medium | backend/src/routes/socialRoutes.mjs |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=0, sort/filter/map=4 |
| Medium | src/features/runs/components/matchSetupCards/LiveGapPushCard.tsx |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=0, sort/filter/map=4 |

## types 밖 타입 선언 후보

| 우선순위 | 파일 | 줄 | 이유 | 권장 조치 | 근거 |
| --- | --- | --- | --- | --- | --- |
| High | src/features/runs/tracking/background/backgroundMatchProgressSync.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=10 |
| High | src/features/runs/liveGap/liveGapPushConfig.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=9 |
| High | src/features/runs/permissions/competitivePreflightModel.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=8 |
| Medium | src/features/runs/lifecycle/matchRoomFlow.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=7 |
| Medium | src/features/runs/lifecycle/matchStateMachine.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=7 |
| Medium | src/features/runs/lifecycle/liveMatchSlot.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=6 |
| Medium | src/features/runs/lifecycle/matchLifecycleController.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=6 |
| Medium | src/features/runs/liveGap/liveGapMessage.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=6 |
| Medium | src/features/runs/sync/matchPolling/useBlockingMatchStatusPolling.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=6 |
| Medium | src/integrations/nativeHealth.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=6 |
| Medium | src/features/runs/sync/manualInviteJoin.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=5 |
| Medium | src/components/matches/liveMatchPerfQaLog.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=4 |
| Medium | src/features/auth/onboarding/onboardingPermissions.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=4 |
| Medium | src/features/match/hooks/lobby/roomDeleteVerification.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=4 |
| Medium | src/features/running/viewModels/runMatchResultCardModel.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=4 |
| Medium | src/features/runs/liveGap/opponentForfeitAnnouncements.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=4 |
| Medium | src/features/runs/permissions/competitiveMotionGateModel.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=4 |
| Medium | src/features/runs/runtime/useTrackRunRoomLoader.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=4 |
| Medium | src/features/runs/sync/matchProgressSync.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=4 |
| Medium | src/features/runs/sync/roomInviteInboxRecipientMatcher.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=4 |
| Medium | src/features/runs/tracking/background/backgroundMatchProgressTimer.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=4 |
| Medium | src/features/runs/tracking/background/snapshotStore.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=4 |
| Medium | src/features/runs/viewModels/liveMatchProgressModel.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=4 |
| Medium | src/features/settings/admin/components/MarketAdminSection.tsx |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=4 |
| Medium | src/features/settings/admin/components/NoticeAdminSection.tsx |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=4 |
| Medium | src/navigation/matchReminderNotificationRouting.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=4 |
| Medium | src/utils/rgPerfTrace.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=4 |
| Medium | src/components/matches/useAndroidLiveMatchPerfProbe.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/friends/components/FriendListCard.tsx |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/home/utils/otaUpdatePrompt.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/home/utils/runPeriodSummary.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/integrations/components/ExclusiveSourceSelectorCard.tsx |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/integrations/exclusiveSourceSelectorModel.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/integrations/sourceMethodGuide.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/match/hooks/useDuelReservationRoom.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/match/hooks/useGroupReservationRoom.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/running/components/RunPointBreakdownCard.tsx |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/runs/components/MatchOptionSelector.tsx |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/runs/hooks/useMatchSelectionModel.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/runs/lifecycle/hooks/runningMatchFocus/useLiveMatchNavigationExecutor.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/runs/lifecycle/hooks/useCountdownHandoffEffect.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/runs/lifecycle/hooks/useLiveMatchNavigationEffects.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/runs/lifecycle/hooks/useMatchCountdownModel.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/runs/lifecycle/hooks/useSlotGatedArenaOpen.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/runs/lifecycle/liveMatchMountedRegistry.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/runs/lifecycle/liveMatchNavigationGate.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/runs/lifecycle/trackRunShellSelection.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/runs/liveActivity/buildLiveCardState.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/runs/runtime/TrackRunExperienceRuntimeModel.tsx |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/runs/runtime/useTrackRunNavigationAdapter.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/runs/runtime/useTrackRunRuntimeScreenState.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/runs/runtime/useTrackRunRuntimeStateBridge.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/runs/sync/serverClockSync.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/runs/sync/useMatchProgressSync.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/runs/tracking/background/locationTaskManagerCore.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/runs/tracking/background/locationTaskPolicy.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/runs/tracking/session/useTrackingSessionSnapshots.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/runs/utils/matchScheduling.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/runs/viewModels/liveMatchRaceBoardProgressive.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/runs/viewModels/matchViewModels.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/runs/viewModels/useTrackRunIdleViewModel.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/settings/admin/components/RaceAdminSection.tsx |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/integrations/provider.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/lib/api/services/runningRoomResponseGuards.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/lib/api/services/runningRunResponseGuards.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/services/apiClient.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/utils/marketRedemption.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/utils/rgKeyedRegistry.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |

## setInterval/setTimeout/subscription cleanup 의심 후보

| 우선순위 | 파일 | 줄 | 이유 | 권장 조치 | 근거 |
| --- | --- | --- | --- | --- | --- |
| Medium | backend/src/runningMatchContract.test.mjs |  | 파일에 timer가 있지만 clearTimeout/clearInterval 패턴이 없다. | non-blocking timeout인지, cleanup이 외부 registry에서 보장되는지 확인한다. | setTimeout/setInterval without clear pattern |
| Medium | src/features/runs/sync/activeRoomCheck.test.ts |  | 파일에 timer가 있지만 clearTimeout/clearInterval 패턴이 없다. | non-blocking timeout인지, cleanup이 외부 registry에서 보장되는지 확인한다. | setTimeout/setInterval without clear pattern |
| Medium | src/utils/rgInputTrace.ts |  | 파일에 timer가 있지만 clearTimeout/clearInterval 패턴이 없다. | non-blocking timeout인지, cleanup이 외부 registry에서 보장되는지 확인한다. | setTimeout/setInterval without clear pattern |
| Medium | backend/src/matchIntegrityContract.test.mjs |  | 파일에 timer가 있지만 clearTimeout/clearInterval 패턴이 없다. | non-blocking timeout인지, cleanup이 외부 registry에서 보장되는지 확인한다. | setTimeout/setInterval without clear pattern |
| Medium | backend/src/smoke.mjs |  | 파일에 timer가 있지만 clearTimeout/clearInterval 패턴이 없다. | non-blocking timeout인지, cleanup이 외부 registry에서 보장되는지 확인한다. | setTimeout/setInterval without clear pattern |
| Medium | src/features/friends/hooks/useAddFriendScreen.ts |  | 파일에 timer가 있지만 clearTimeout/clearInterval 패턴이 없다. | non-blocking timeout인지, cleanup이 외부 registry에서 보장되는지 확인한다. | setTimeout/setInterval without clear pattern |
| Medium | backend/src/store.test.mjs |  | 파일에 timer가 있지만 clearTimeout/clearInterval 패턴이 없다. | non-blocking timeout인지, cleanup이 외부 registry에서 보장되는지 확인한다. | setTimeout/setInterval without clear pattern |
| Medium | scripts/check-public-backend-domain.mjs |  | 파일에 timer가 있지만 clearTimeout/clearInterval 패턴이 없다. | non-blocking timeout인지, cleanup이 외부 registry에서 보장되는지 확인한다. | setTimeout/setInterval without clear pattern |
| Medium | scripts/deploy-public-backend.mjs |  | 파일에 timer가 있지만 clearTimeout/clearInterval 패턴이 없다. | non-blocking timeout인지, cleanup이 외부 registry에서 보장되는지 확인한다. | setTimeout/setInterval without clear pattern |
| Medium | scripts/sync-preview-eas-env.mjs |  | 파일에 timer가 있지만 clearTimeout/clearInterval 패턴이 없다. | non-blocking timeout인지, cleanup이 외부 registry에서 보장되는지 확인한다. | setTimeout/setInterval without clear pattern |
| Medium | src/features/profile/hooks/useEditProfile.ts |  | 파일에 timer가 있지만 clearTimeout/clearInterval 패턴이 없다. | non-blocking timeout인지, cleanup이 외부 registry에서 보장되는지 확인한다. | setTimeout/setInterval without clear pattern |
| Medium | src/features/profile/hooks/useMyPageScreen.ts |  | 파일에 timer가 있지만 clearTimeout/clearInterval 패턴이 없다. | non-blocking timeout인지, cleanup이 외부 registry에서 보장되는지 확인한다. | setTimeout/setInterval without clear pattern |
| Medium | src/features/runs/sync/localGoalFreezeStore.test.ts |  | 파일에 timer가 있지만 clearTimeout/clearInterval 패턴이 없다. | non-blocking timeout인지, cleanup이 외부 registry에서 보장되는지 확인한다. | setTimeout/setInterval without clear pattern |
| Medium | src/features/runs/sync/staleRoomCleanup.test.ts |  | 파일에 timer가 있지만 clearTimeout/clearInterval 패턴이 없다. | non-blocking timeout인지, cleanup이 외부 registry에서 보장되는지 확인한다. | setTimeout/setInterval without clear pattern |
| Medium | src/features/runs/tracking/actions/useAutoStartMatchTrackingAction.ts |  | 파일에 timer가 있지만 clearTimeout/clearInterval 패턴이 없다. | non-blocking timeout인지, cleanup이 외부 registry에서 보장되는지 확인한다. | setTimeout/setInterval without clear pattern |
| Medium | src/features/runs/tracking/background/backgroundMatchProgressSync.test.ts |  | 파일에 timer가 있지만 clearTimeout/clearInterval 패턴이 없다. | non-blocking timeout인지, cleanup이 외부 registry에서 보장되는지 확인한다. | setTimeout/setInterval without clear pattern |
| Medium | src/features/settings/hooks/useNotificationSettings.ts |  | 파일에 timer가 있지만 clearTimeout/clearInterval 패턴이 없다. | non-blocking timeout인지, cleanup이 외부 registry에서 보장되는지 확인한다. | setTimeout/setInterval without clear pattern |
| Medium | src/features/settings/hooks/useRegionSettings.ts |  | 파일에 timer가 있지만 clearTimeout/clearInterval 패턴이 없다. | non-blocking timeout인지, cleanup이 외부 registry에서 보장되는지 확인한다. | setTimeout/setInterval without clear pattern |
| Medium | src/utils/rgPerfTrace.ts |  | 파일에 timer가 있지만 clearTimeout/clearInterval 패턴이 없다. | non-blocking timeout인지, cleanup이 외부 registry에서 보장되는지 확인한다. | setTimeout/setInterval without clear pattern |

## Location/watchPosition/background task 사용 후보

| 우선순위 | 파일 | 줄 | 이유 | 권장 조치 | 근거 |
| --- | --- | --- | --- | --- | --- |
| High | src/features/auth/onboarding/onboardingPermissions.ts | 132 | 위치 watcher/background task/AppState 관련 코드가 감지됐다. | single-flight, appState guard, cleanup, timeout이 테스트로 보장되는지 확인한다. | Location.getForegroundPermissionsAsync().catch(() => null), |
| High | src/features/runs/hooks/runSaveFlow/useRunForfeitCommand.ts |  | 위치 watcher/background task/AppState 관련 코드가 감지됐다. | single-flight, appState guard, cleanup, timeout이 테스트로 보장되는지 확인한다. | signals=1 |
| High | src/features/runs/permissions/competitivePreflightModel.ts |  | 위치 watcher/background task/AppState 관련 코드가 감지됐다. | single-flight, appState guard, cleanup, timeout이 테스트로 보장되는지 확인한다. | signals=1 |
| Medium | src/features/runs/tracking/background/backgroundSubscription.ts | 23 | 위치 watcher/background task/AppState 관련 코드가 감지됐다. | single-flight, appState guard, cleanup, timeout이 테스트로 보장되는지 확인한다. | const started = await Location.hasStartedLocationUpdatesAsync(taskName); |
| Medium | src/features/runs/tracking/background/locationTaskManager.test.ts |  | 위치 watcher/background task/AppState 관련 코드가 감지됐다. | single-flight, appState guard, cleanup, timeout이 테스트로 보장되는지 확인한다. | signals=9 |
| Medium | src/features/runs/tracking/background/locationTask.ts | 3 | 위치 watcher/background task/AppState 관련 코드가 감지됐다. | single-flight, appState guard, cleanup, timeout이 테스트로 보장되는지 확인한다. | import * as TaskManager from 'expo-task-manager'; |
| Medium | src/features/runs/tracking/background/locationTaskManagerCore.ts |  | 위치 watcher/background task/AppState 관련 코드가 감지됐다. | single-flight, appState guard, cleanup, timeout이 테스트로 보장되는지 확인한다. | signals=7 |
| Medium | src/features/runs/tracking/background/locationTaskPolicy.test.ts |  | 위치 watcher/background task/AppState 관련 코드가 감지됐다. | single-flight, appState guard, cleanup, timeout이 테스트로 보장되는지 확인한다. | signals=6 |
| Medium | src/features/auth/screens/WelcomeTourScreen.tsx | 3 | 위치 watcher/background task/AppState 관련 코드가 감지됐다. | single-flight, appState guard, cleanup, timeout이 테스트로 보장되는지 확인한다. | import { AppState, Linking, StyleSheet, Text, View } from 'react-native'; |
| Medium | src/features/runs/tracking/background/foregroundSubscription.ts | 18 | 위치 watcher/background task/AppState 관련 코드가 감지됐다. | single-flight, appState guard, cleanup, timeout이 테스트로 보장되는지 확인한다. | function buildForegroundLocationOptions(): Location.LocationOptions { |
| Medium | src/features/runs/tracking/useLocationTracking.ts | 27 | 위치 watcher/background task/AppState 관련 코드가 감지됐다. | single-flight, appState guard, cleanup, timeout이 테스트로 보장되는지 확인한다. | const foregroundPermission = await Location.requestForegroundPermissionsAsync(); |
| Medium | src/features/match/hooks/lobby/roomSnapshot/useRoomSnapshotForegroundRefresh.ts | 3 | 위치 watcher/background task/AppState 관련 코드가 감지됐다. | single-flight, appState guard, cleanup, timeout이 테스트로 보장되는지 확인한다. | import { AppState } from 'react-native'; |
| Medium | src/features/runs/components/MatchEndTransitionOverlay.tsx | 2 | 위치 watcher/background task/AppState 관련 코드가 감지됐다. | single-flight, appState guard, cleanup, timeout이 테스트로 보장되는지 확인한다. | import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from 'react-native'; |
| Medium | src/features/runs/tracking/background/locationTaskPolicy.ts |  | 위치 watcher/background task/AppState 관련 코드가 감지됐다. | single-flight, appState guard, cleanup, timeout이 테스트로 보장되는지 확인한다. | signals=3 |
| Medium | src/features/runs/tracking/background/routeAccumulator.test.ts | 51 | 위치 watcher/background task/AppState 관련 코드가 감지됐다. | single-flight, appState guard, cleanup, timeout이 테스트로 보장되는지 확인한다. | } as Location.LocationObject; |
| Medium | src/features/runs/tracking/useTrackingAppStateSync.ts | 3 | 위치 watcher/background task/AppState 관련 코드가 감지됐다. | single-flight, appState guard, cleanup, timeout이 테스트로 보장되는지 확인한다. | import { AppState, Platform } from 'react-native'; |
| Medium | src/features/home/hooks/useOtaUpdatePrompt.ts | 2 | 위치 watcher/background task/AppState 관련 코드가 감지됐다. | single-flight, appState guard, cleanup, timeout이 테스트로 보장되는지 확인한다. | import { AppState } from 'react-native'; |
| Medium | src/features/runs/hooks/useRunTracking.ts | 2 | 위치 watcher/background task/AppState 관련 코드가 감지됐다. | single-flight, appState guard, cleanup, timeout이 테스트로 보장되는지 확인한다. | import { AppState } from 'react-native'; |
| Medium | src/features/runs/runtime/useTrackRunOpponentSyncLifeline.ts | 3 | 위치 watcher/background task/AppState 관련 코드가 감지됐다. | single-flight, appState guard, cleanup, timeout이 테스트로 보장되는지 확인한다. | import { AppState } from 'react-native'; |
| Medium | src/features/runs/tracking/background/index.ts | 74 | 위치 watcher/background task/AppState 관련 코드가 감지됐다. | single-flight, appState guard, cleanup, timeout이 테스트로 보장되는지 확인한다. | // Android can miss the AppState transition that used to start this task. |
| Medium | src/features/runs/tracking/background/locationDistance.ts | 80 | 위치 watcher/background task/AppState 관련 코드가 감지됐다. | single-flight, appState guard, cleanup, timeout이 테스트로 보장되는지 확인한다. | export function resolveLocationTimestampMs(location: Location.LocationObject) { |
| Medium | src/features/runs/tracking/trackingSession.ts | 146 | 위치 watcher/background task/AppState 관련 코드가 감지됐다. | single-flight, appState guard, cleanup, timeout이 테스트로 보장되는지 확인한다. | export function buildRoutePoint(location: Location.LocationObject): RunRoutePoint { |
| Medium | src/features/runs/sync/matchPolling/useBlockingMatchStatusPolling.ts | 114 | 위치 watcher/background task/AppState 관련 코드가 감지됐다. | single-flight, appState guard, cleanup, timeout이 테스트로 보장되는지 확인한다. | // permanently dead (no effect re-run) until match end or an AppState resume — the match's only |
| Medium | src/features/runs/sync/useMatchProgressSync.ts | 313 | 위치 watcher/background task/AppState 관련 코드가 감지됐다. | single-flight, appState guard, cleanup, timeout이 테스트로 보장되는지 확인한다. | // 'duplicate-heartbeat-owner', and NOTHING ever re-attempted the acquire (AppState resumes |
| Medium | src/features/runs/tracking/background/backgroundMatchProgressSync.ts | 785 | 위치 watcher/background task/AppState 관련 코드가 감지됐다. | single-flight, appState guard, cleanup, timeout이 테스트로 보장되는지 확인한다. | // and the 3s throttle, so EVERY surviving TaskManager tick retries the finish delivery: after |
| Medium | src/features/runs/tracking/background/routeAccumulator.ts | 174 | 위치 watcher/background task/AppState 관련 코드가 감지됐다. | single-flight, appState guard, cleanup, timeout이 테스트로 보장되는지 확인한다. | export function appendTrackedLocation(location: Location.LocationObject) { |

## 동일/유사 역할 파일 후보

| 우선순위 | 파일 | 줄 | 이유 | 권장 조치 | 근거 |
| --- | --- | --- | --- | --- | --- |
| High | Card 계열 |  | Card 계열 파일이 50개 있다. | 공통 primitive와 feature-specific wrapper 경계를 다시 확인한다. | src/features/running/components/RunMatchResultCard.tsx, src/features/league/components/LeagueRegionSelectorCard.tsx, sr… |
| High | Route 계열 |  | Route 계열 파일이 42개 있다. | 공통 primitive와 feature-specific wrapper 경계를 다시 확인한다. | src/features/runs/tracking/background/routeAccumulator.test.ts, backend/src/routes/runningMatch/runningMatchProgressRou… |
| High | Ranking 계열 |  | Ranking 계열 파일이 30개 있다. | 공통 primitive와 feature-specific wrapper 경계를 다시 확인한다. | backend/src/lib/runningMatchRankSystem.test.mjs, backend/src/services/todayRankingBuilder.mjs, src/features/friends/com… |
| High | Repository 계열 |  | Repository 계열 파일이 23개 있다. | 공통 primitive와 feature-specific wrapper 경계를 다시 확인한다. | backend/src/repositories/postgresAuthRepository.test.mjs, backend/src/repositories/postgresAuthRepository.mjs, backend/… |
| Medium | Service 계열 |  | Service 계열 파일이 17개 있다. | 공통 primitive와 feature-specific wrapper 경계를 다시 확인한다. | backend/src/services/phoneVerificationService.mjs, backend/src/services/adminReadService.mjs, backend/src/services/back… |
| Medium | friends |  | 같은 basename을 가진 파일 6개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | src/lib/api/services/friends.ts, src/lib/api/services/mock/friends.ts, src/lib/api/types/friends.ts, src/domain/friends… |
| Medium | league |  | 같은 basename을 가진 파일 6개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | src/lib/api/services/mock/league.ts, src/lib/api/services/league.ts, src/domain/league.ts, src/features/league/types/le… |
| Medium | market |  | 같은 basename을 가진 파일 6개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | src/data/mock/market.ts, src/lib/api/services/market.ts, src/domain/market.ts, src/lib/api/services/mock/market.ts, src… |
| Medium | integrations |  | 같은 basename을 가진 파일 4개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | src/lib/api/services/integrations.ts, src/domain/integrations.ts, src/data/mock/integrations.ts, src/lib/api/services/m… |
| Medium | admin |  | 같은 basename을 가진 파일 3개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | src/lib/api/admin.ts, src/lib/api/types/admin.ts, app/admin.tsx |
| Medium | config |  | 같은 basename을 가진 파일 3개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | backend/src/config.mjs, src/components/matches/liveMatchArena/config.ts, src/lib/api/config.ts |
| Medium | matches |  | 같은 basename을 가진 파일 3개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | src/lib/api/services/matches.ts, src/lib/api/types/matches.ts, src/lib/api/services/mock/matches.ts |
| Medium | matchprogress |  | 같은 basename을 가진 파일 3개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | src/features/runs/viewModels/matchProgress.ts, src/features/runs/types/matchProgress.ts, src/lib/api/services/mock/matc… |
| Medium | profile |  | 같은 basename을 가진 파일 3개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | src/lib/api/services/profile.ts, src/lib/api/types/profile.ts, src/data/mock/profile.ts |
| Medium | rooms |  | 같은 basename을 가진 파일 3개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | src/lib/api/services/rooms.ts, src/lib/api/types/rooms.ts, src/lib/api/services/mock/rooms.ts |
| Medium | runs |  | 같은 basename을 가진 파일 3개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | src/lib/api/services/runs.ts, src/lib/api/types/runs.ts, src/data/mock/runs.ts |
| Medium | _layout |  | 같은 basename을 가진 파일 2개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | app/_layout.tsx, app/(tabs)/_layout.tsx |
| Medium | addresscatalog |  | 같은 basename을 가진 파일 2개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | src/features/location/addressCatalog.ts, backend/src/addressCatalog.mjs |
| Medium | auth |  | 같은 basename을 가진 파일 2개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | backend/src/auth.mjs, src/lib/api/services/mock/auth.ts |
| Medium | competitiveruns |  | 같은 basename을 가진 파일 2개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | src/features/runs/utils/competitiveRuns.ts, backend/src/lib/competitiveRuns.mjs |
| Medium | home |  | 같은 basename을 가진 파일 2개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | src/lib/api/services/home.ts, app/(tabs)/home.tsx |
| Medium | homeoverview |  | 같은 basename을 가진 파일 2개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | src/features/home/HomeOverview.tsx, src/features/home/utils/homeOverview.ts |
| Medium | matchscheduling |  | 같은 basename을 가진 파일 2개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | src/lib/api/services/mock/matchScheduling.ts, src/features/runs/utils/matchScheduling.ts |
| Medium | matchsetupcards |  | 같은 basename을 가진 파일 2개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | src/features/runs/types/matchSetupCards.ts, src/features/runs/components/MatchSetupCards.tsx |
| Medium | matchstatemachine |  | 같은 basename을 가진 파일 2개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | src/features/runs/lifecycle/matchStateMachine.ts, src/features/runs/types/matchStateMachine.ts |
| Medium | notifications |  | 같은 basename을 가진 파일 2개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | src/lib/api/services/notifications.ts, src/lib/api/types/notifications.ts |
| Medium | phoneverification |  | 같은 basename을 가진 파일 2개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | backend/src/phoneVerification.mjs, src/lib/session/phoneVerification.ts |
| Medium | points |  | 같은 basename을 가진 파일 2개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | backend/src/lib/points.mjs, src/domain/points.ts |
| Medium | pointsystem |  | 같은 basename을 가진 파일 2개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | src/features/points/pointSystem.ts, src/features/points/types/pointSystem.ts |
| Medium | races |  | 같은 basename을 가진 파일 2개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | src/lib/api/services/mock/races.ts, src/lib/api/services/races.ts |
| Medium | running |  | 같은 basename을 가진 파일 2개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | src/domain/running.ts, app/(tabs)/running.tsx |
| Medium | users |  | 같은 basename을 가진 파일 2개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | src/lib/api/services/users.ts, src/lib/api/types/users.ts |

## 해석 규칙

- 이 리포트는 정적 휴리스틱이라 false positive가 있을 수 있습니다.
- High 항목은 먼저 눈으로 확인하고, 기능 변경 없이 작은 단위로 분리하는 것을 권장합니다.
- `ScrollView + map`, timer/subscription, Location/background task 항목은 Android 실기기 로그와 함께 확인하세요.
- `services 밖 API 호출`은 frontend 기준입니다. backend smoke/scripts의 직접 fetch는 별도 CLI 용도로 허용될 수 있습니다.
- generated report 자체는 스캔 대상에서 제외합니다.
