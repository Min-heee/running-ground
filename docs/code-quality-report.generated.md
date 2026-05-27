# 코드 품질 자동 분석 리포트

> 이 파일은 `npm run code:quality`로 생성됩니다. 수동 수정하지 말고 스크립트를 다시 실행해 갱신하세요.

생성 시각: 2026-05-27T19:10:18.496Z

## 실행 방법

```bash
npm run code:quality
```

## 요약

| 항목 | 값 |
| --- | --- |
| 분석 파일 | 914 |
| 코드 파일 | 857 |
| package scripts | 63 |
| 300줄 이상 파일 | 77 |
| 500줄 이상 파일 | 15 |
| 50줄 이상 함수 후보 | 279 |
| 순환 import 검사 | 별도 정적 graph가 아닌 파일 단위 휴리스틱 |

## 감지 항목 요약

| 항목 | 전체 | High | Medium | Low |
| --- | --- | --- | --- | --- |
| React component inline object/array/style 후보 | 63 | 0 | 11 | 52 |
| 렌더 중 sort/filter/map 후보 | 15 | 0 | 15 | 0 |
| useEffect가 많은 파일 | 0 | 0 | 0 | 0 |
| useMemo/useCallback 없이 props를 많이 만드는 후보 | 5 | 0 | 5 | 0 |
| services 밖 fetch/api 호출 후보 | 0 | 0 | 0 | 0 |
| utils/domain 밖 계산 로직 후보 | 30 | 0 | 30 | 0 |
| types 밖 타입 선언 후보 | 56 | 0 | 56 | 0 |
| setInterval/setTimeout/subscription cleanup 의심 후보 | 15 | 0 | 15 | 0 |
| Location/watchPosition/background task 사용 후보 | 15 | 0 | 15 | 0 |

## 300줄 이상 파일

| 파일 | 줄 | 신호 |
| --- | --- | --- |
| src/features/runs/runtime/TrackRunExperienceRuntimeModel.tsx | 2300 | imports 57, effects 3, sort/filter/map 1 |
| backend/src/lib/matchRoomStoreHelpers.mjs | 1209 | imports 11, sort/filter/map 45 |
| backend/src/runningMatchContract.test.mjs | 1189 | imports 8, timers 4 |
| backend/src/smoke.mjs | 1014 | imports 16, sort/filter/map 2, timers 2 |
| backend/src/server.mjs | 873 | imports 40, sort/filter/map 1, timers 1 |
| scripts/analyze-code-quality.mjs | 873 | imports 6, sort/filter/map 37, subs 16 |
| backend/src/lib/matchResponseBuilders.mjs | 788 | imports 11, sort/filter/map 21 |
| docs/backend-api-contract.md | 636 | imports 2 |
| backend/src/repositories/postgresAuthRepository.test.mjs | 623 | imports 5, sort/filter/map 20 |
| scripts/run-release-gate.mjs | 553 | imports 5, sort/filter/map 10 |
| backend/src/seed.mjs | 530 | imports 4, sort/filter/map 5 |
| backend/src/repositories/postgresAuthRepository.mjs | 529 | imports 3, sort/filter/map 1 |
| scripts/analyze-android-perf-trace.mjs | 529 | imports 2, sort/filter/map 7 |
| backend/src/repositories/postgresRunsRepository.test.mjs | 515 | imports 3, sort/filter/map 8 |
| docs/handoff/codex-pr-execution-plan.md | 502 |  |
| backend/src/repositories/postgresLeagueRepository.mjs | 491 | imports 1, sort/filter/map 16 |
| src/lib/api/services/rooms.ts | 488 | imports 6, sort/filter/map 4 |
| backend/src/store.mjs | 484 | imports 5, sort/filter/map 9 |
| scripts/check-preview-public-api.mjs | 482 | imports 4 |
| src/features/runs/tracking/session/useTrackingSessionSnapshots.ts | 479 | imports 11, effects 1, timers 1 |
| scripts/check-performance-smells.mjs | 477 | imports 3, sort/filter/map 22, subs 8 |
| backend/src/repositories/postgresFriendsRepository.test.mjs | 456 | imports 3, sort/filter/map 12 |
| backend/src/lib/validators.mjs | 452 | imports 6, sort/filter/map 3 |
| src/features/settings/admin/hooks/useAdminDashboard.ts | 451 | imports 7, effects 1 |
| src/lib/api/services/mock/matchSessions.ts | 451 | imports 6, sort/filter/map 12 |
| src/features/runs/lifecycle/hooks/runningMatchFocus/useLiveMatchNavigationExecutor.ts | 450 | imports 13 |
| backend/src/repositories/runsRepository.mjs | 443 | imports 2, sort/filter/map 11 |
| src/features/runs/lifecycle/matchLifecycleController.test.ts | 439 | imports 5 |
| src/features/runs/lifecycle/matchStateMachine.ts | 438 | imports 3 |
| scripts/deploy-public-backend.mjs | 432 | imports 7, timers 1 |
| src/features/runs/sync/roomInviteInbox.test.ts | 424 | imports 4 |
| src/lib/api/services/matches.ts | 422 | imports 6, sort/filter/map 6 |
| backend/src/repositories/authRepository.test.mjs | 418 | imports 5, sort/filter/map 1 |
| backend/src/lib/runningMatchSessionStoreHelpers.mjs | 403 | imports 7, sort/filter/map 13 |
| src/features/runs/lifecycle/matchRoomFlow.ts | 401 | imports 2, sort/filter/map 8 |
| src/features/runs/viewModels/matchProgress.ts | 396 | imports 4, sort/filter/map 2 |
| src/features/runs/tracking/background/locationTaskManager.test.ts | 389 | imports 6, timers 8 |
| src/components/matches/liveMatchArena/styles.ts | 382 | imports 4 |
| src/integrations/nativeHealth.ts | 379 | imports 8, sort/filter/map 1 |
| backend/src/repositories/friendsRepository.mjs | 373 | sort/filter/map 9 |
| backend/src/routes/adminRoutes.mjs | 373 | imports 1 |
| src/features/runs/lifecycle/matchStateMachine.test.ts | 372 | imports 3 |
| docs/server-backend-architecture.md | 367 | imports 1 |
| src/lib/api/services/mock/matchScheduling.ts | 358 | imports 4, sort/filter/map 8 |
| docs/refactor-roadmap.md | 358 |  |
| src/lib/api/services/runningRoomResponseGuards.ts | 356 | imports 2, sort/filter/map 4 |
| scripts/generate-testflight-qa-report.mjs | 349 | imports 5, sort/filter/map 1 |
| src/features/runs/lifecycle/matchLifecycleController.ts | 345 | imports 7 |
| src/data/mock/offlineRace.ts | 344 | imports 1 |
| src/features/runs/components/matchSetupCards/styles.ts | 343 | imports 2 |
| src/features/match/hooks/lobby/useRoomStartActions.ts | 336 | imports 15, effects 1 |
| backend/src/lib/runningMatchRankSystem.test.mjs | 336 | imports 3, sort/filter/map 2 |
| docs/code-quality-audit.md | 335 | imports 13 |
| src/features/integrations/IntegrationJourneyCard.tsx | 334 | imports 10, sort/filter/map 3 |
| src/features/runs/runtime/useTrackRunRoomLoader.ts | 333 | imports 11 |
| src/features/league/components/LeagueRegionSelectorCard.tsx | 331 | imports 10, sort/filter/map 2 |
| src/features/runs/lifecycle/hooks/runningMatchFocus/liveMatchNavigationOwnerPolicy.ts | 331 | imports 5 |
| src/features/runs/components/matchSetupCards/MatchSetupTabbedSelector.tsx | 329 | imports 6, effects 1, sort/filter/map 4 |
| backend/src/bridges/sessionRunsBridge.mjs | 328 | imports 3, sort/filter/map 3 |
| src/features/settings/admin/components/adminStyles.ts | 327 | imports 2 |
| src/features/runs/sync/matchPolling/useBlockingMatchStatusPolling.ts | 325 | imports 9, effects 3 |
| src/lib/api/services/runningRoomResponseGuards.test.ts | 323 | imports 5 |
| src/features/runs/viewModels/useLiveMatchViewModel.ts | 322 | imports 8 |
| docs/handoff/codex-quality-audit-2026-05-20.md | 321 | imports 4, subs 1 |
| src/features/auth/hooks/useSignupForm.ts | 320 | imports 7, effects 2 |
| backend/src/repositories/authRepository.mjs | 320 | imports 2, sort/filter/map 10 |
| backend/src/repositories/runsRepository.test.mjs | 320 | imports 3, sort/filter/map 1 |
| src/features/runs/runtime/useTrackRunRuntimeRecipientInviteInbox.ts | 319 | imports 9 |
| backend/src/points.mjs | 316 | sort/filter/map 5 |
| backend/src/repositories/friendsRepository.test.mjs | 314 | imports 2, sort/filter/map 3 |
| docs/testflight-real-device-qa.md | 314 |  |
| src/features/runs/sync/activeRoomCheck.ts | 310 | imports 6, timers 1 |
| backend/src/repositories/postgresFriendsQueries.mjs | 306 | imports 3, sort/filter/map 11 |
| src/features/runs/viewModels/matchProgress.test.ts | 302 | imports 5, sort/filter/map 6 |
| src/features/runs/viewModels/matchResultRowsPolicy.ts | 302 | imports 1 |
| docs/backend-server-refactor-plan.md | 302 | imports 2 |
| src/features/runs/viewModels/liveMatchRaceBoardViewModel.test.ts | 300 | imports 5, sort/filter/map 5 |

## 500줄 이상 파일

| 파일 | 줄 | 신호 |
| --- | --- | --- |
| src/features/runs/runtime/TrackRunExperienceRuntimeModel.tsx | 2300 | imports 57, effects 3, sort/filter/map 1 |
| backend/src/lib/matchRoomStoreHelpers.mjs | 1209 | imports 11, sort/filter/map 45 |
| backend/src/runningMatchContract.test.mjs | 1189 | imports 8, timers 4 |
| backend/src/smoke.mjs | 1014 | imports 16, sort/filter/map 2, timers 2 |
| backend/src/server.mjs | 873 | imports 40, sort/filter/map 1, timers 1 |
| scripts/analyze-code-quality.mjs | 873 | imports 6, sort/filter/map 37, subs 16 |
| backend/src/lib/matchResponseBuilders.mjs | 788 | imports 11, sort/filter/map 21 |
| docs/backend-api-contract.md | 636 | imports 2 |
| backend/src/repositories/postgresAuthRepository.test.mjs | 623 | imports 5, sort/filter/map 20 |
| scripts/run-release-gate.mjs | 553 | imports 5, sort/filter/map 10 |
| backend/src/seed.mjs | 530 | imports 4, sort/filter/map 5 |
| backend/src/repositories/postgresAuthRepository.mjs | 529 | imports 3, sort/filter/map 1 |
| scripts/analyze-android-perf-trace.mjs | 529 | imports 2, sort/filter/map 7 |
| backend/src/repositories/postgresRunsRepository.test.mjs | 515 | imports 3, sort/filter/map 8 |
| docs/handoff/codex-pr-execution-plan.md | 502 |  |

## 50줄 이상 함수 후보



> 279개 중 상위 80개만 표시합니다.


| 파일 | 줄 | 함수 | 길이 |
| --- | --- | --- | --- |
| src/features/runs/runtime/TrackRunExperienceRuntimeModel.tsx | 156 | TrackRunExperienceRuntime | 2144 |
| src/features/settings/admin/hooks/useAdminDashboard.ts | 51 | useAdminDashboard | 400 |
| src/features/runs/tracking/session/useTrackingSessionSnapshots.ts | 97 | useTrackingSessionSnapshots | 382 |
| src/features/auth/hooks/useSignupForm.ts | 23 | useSignupForm | 297 |
| src/features/runs/viewModels/useLiveMatchViewModel.ts | 37 | useLiveMatchViewModel | 285 |
| src/features/runs/runtime/useTrackRunRoomLoader.ts | 60 | useTrackRunRoomLoader | 273 |
| backend/src/repositories/postgresRunsRepository.mjs | 25 | createPostgresRunsRepository | 271 |
| src/features/runs/runtime/useTrackRunRuntimeRecipientInviteInbox.ts | 50 | useTrackRunRuntimeRecipientInviteInbox | 269 |
| backend/src/bridges/friendsLeagueBridge.mjs | 26 | createFriendsLeagueBridge | 267 |
| src/features/match/hooks/lobby/useRoomStartActions.ts | 70 | useRoomStartActions | 266 |
| backend/src/repositories/postgresAuthRepository.mjs | 269 | createPostgresAuthRepository | 260 |
| src/features/settings/screens/AdminScreen.tsx | 20 | AdminScreen | 254 |
| src/features/runs/sync/matchPolling/useBlockingMatchStatusPolling.ts | 83 | useBlockingMatchStatusPolling | 242 |
| src/features/runs/sync/useMatchProgressSync.ts | 54 | useMatchProgressSync | 240 |
| src/features/runs/runtime/useTrackRunRoomLoader.ts | 77 | callback@useCallback | 238 |
| src/features/runs/runtime/useRuntimeHydrationEffects.ts | 8 | useRuntimeHydrationEffects | 232 |
| src/features/runs/sync/partyRunSync/useLinkedMatchSync.ts | 48 | useLinkedMatchSync | 225 |
| src/features/runs/runtime/useTrackRunRuntimeRoomInviteActions.ts | 37 | useTrackRunRuntimeRoomInviteActions | 223 |
| src/features/runs/tracking/background/locationTaskManagerCore.ts | 42 | createLocationTaskManager | 220 |
| src/features/runs/lifecycle/hooks/useMatchEntryEffects.ts | 47 | useMatchEntryEffects | 217 |
| src/features/runs/lifecycle/hooks/runningMatchFocus/useLiveMatchNavigationOwner.ts | 27 | useLiveMatchNavigationOwner | 217 |
| src/features/runs/tracking/lifecycle/useMatchAutoTrackingEffects.ts | 45 | useMatchAutoTrackingEffects | 213 |
| backend/src/repositories/postgresFriendsRepository.mjs | 27 | createPostgresFriendsRepository | 213 |
| src/features/runs/hooks/useMatchRuntimeState.ts | 57 | useMatchRuntimeState | 212 |
| src/features/runs/runtime/useTrackRunRuntimeStateBridge.ts | 56 | useTrackRunRuntimeStateBridge | 212 |
| scripts/check-preview-public-api.mjs | 259 | main | 211 |
| backend/src/lib/matchResponseBuilders.mjs | 304 | buildRunningMatchStatusResponse | 210 |
| src/features/runs/runtime/useTrackRunRoomJoinAction.ts | 47 | useTrackRunRoomJoinAction | 208 |
| scripts/analyze-android-perf-trace.mjs | 218 | analyzeLine | 197 |
| backend/src/routes/adminRoutes.mjs | 3 | routeAdminRequest | 196 |
| src/features/runs/runtime/useTrackRunRoomCreateAction.ts | 79 | useTrackRunRoomCreateAction | 195 |
| src/features/match/hooks/lobby/useRoomInviteActions.ts | 16 | useRoomInviteActions | 194 |
| backend/src/repositories/authRepository.mjs | 128 | createJsonAuthRepository | 192 |
| src/features/runs/runtime/useTrackRunRuntimeMatchRequestActions.ts | 11 | useTrackRunRuntimeMatchRequestActions | 191 |
| src/features/runs/lifecycle/hooks/useMatchCountdownModel.ts | 64 | useMatchCountdownModel | 185 |
| src/features/runs/runtime/useTrackRunRuntimeRecipientInviteInbox.ts | 100 | callback@useCallback | 182 |
| src/features/match/screens/MatchRoomScreen.tsx | 17 | MatchRoomScreen | 181 |
| src/features/home/hooks/useHomeScreenModel.ts | 30 | useHomeScreenModel | 181 |
| src/features/runs/components/matchSetupCards/MatchSetupTabbedSelector.tsx | 21 | MatchSetupTabbedSelector | 177 |
| src/features/runs/runtime/useTrackRunRoomJoinAction.ts | 66 | callback@useCallback | 174 |
| backend/src/bridges/sessionRunsBridge.mjs | 159 | createSessionRunsBridge | 169 |
| src/features/runs/hooks/useMatchSelectionModel.ts | 75 | useMatchSelectionModel | 169 |
| src/features/runs/components/matchSetupCards/GroupMatchSetupCard.tsx | 41 | GroupMatchSetupCard | 169 |
| src/features/auth/screens/AccountRecoveryScreen.tsx | 44 | AccountRecoveryScreen | 168 |
| src/features/integrations/hooks/useIntegrationActions.ts | 61 | useIntegrationActions | 165 |
| src/features/runs/tracking/useTrackingAppStateSync.ts | 40 | useTrackingAppStateSync | 165 |
| backend/src/repositories/marketRepository.mjs | 5 | createJsonMarketRepository | 165 |
| src/features/runs/hooks/runSaveFlow/useRunForfeitCommand.ts | 42 | useRunForfeitCommand | 163 |
| src/features/runs/hooks/matchRoomLobby/useMatchRoomLobbyEffects.ts | 27 | useMatchRoomLobbyEffects | 159 |
| src/features/runs/hooks/usePartyRunRoom.ts | 79 | usePartyRunRoom | 158 |
| src/features/runs/tracking/background/locationTaskManagerCore.ts | 48 | startLocationTaskWithTrace | 156 |
| src/features/runs/runtime/useTrackRunRoomCreateAction.ts | 99 | callback@useCallback | 155 |
| backend/src/bridges/friendsLeagueBridge.test.mjs | 11 | createHarness | 154 |
| src/features/runs/hooks/matchLifecycle/useGroupMatchLifecycle.ts | 26 | useGroupMatchLifecycle | 151 |
| src/features/runs/runtime/useTrackRunRuntimeMatchMaintenanceActions.ts | 7 | useTrackRunRuntimeMatchMaintenanceActions | 151 |
| src/features/runs/viewModels/useTrackRunIdleViewModel.ts | 90 | useTrackRunIdleViewModel | 149 |
| src/features/runs/components/matchSetupCards/DuelMatchSetupCard.tsx | 13 | DuelMatchSetupCard | 149 |
| src/features/runs/lifecycle/hooks/runningMatchFocus/useLiveMatchMountSignalBridge.ts | 15 | useLiveMatchMountSignalBridge | 146 |
| src/features/runs/hooks/matchLifecycle/useDuelMatchLifecycle.ts | 25 | useDuelMatchLifecycle | 145 |
| src/features/runs/viewModels/useLiveMatchProgress.ts | 42 | useLiveMatchProgress | 143 |
| src/features/runs/hooks/runSaveFlow/useRunFinishCommand.ts | 44 | useRunFinishCommand | 141 |
| src/features/friends/hooks/useFriendsScreen.ts | 17 | useFriendsScreen | 140 |
| src/features/integrations/components/nrcBridge/NrcBridgeGuideActions.tsx | 10 | buildActionButtons | 139 |
| src/components/matches/useAndroidLiveMatchPerfProbe.ts | 50 | useAndroidLiveMatchPerfProbe | 136 |
| src/features/runs/tracking/actions/useStartTrackingAction.ts | 51 | callback@useCallback | 134 |
| src/features/profile/hooks/useMyPageScreen.ts | 10 | useMyPageScreen | 133 |
| src/features/runs/sync/recipientInviteInbox/applyRecipientInviteFetchSuccess.ts | 45 | applyRecipientInviteFetchSuccess | 132 |
| src/features/league/screens/LeagueScreen.tsx | 17 | LeagueScreen | 132 |
| src/features/runs/sync/usePartyRunSync.ts | 60 | usePartyRunSync | 131 |
| src/features/auth/components/signup/SignupCredentialsSection.tsx | 34 | SignupCredentialsSection | 129 |
| src/features/runs/lifecycle/hooks/runningMatchFocus/useLiveMatchMountSignalBridge.ts | 26 | callback@useCallback | 129 |
| src/features/match/hooks/lobby/roomSnapshot/useInviteInboxReceiver.ts | 21 | callback@useCallback | 127 |
| backend/src/routes/socialRoutes.mjs | 1 | routeSocialRequest | 126 |
| src/features/runs/lifecycle/hooks/runningMatchFocus/useLiveMatchNavigationOwner.ts | 104 | callback@useCallback | 126 |
| src/features/runs/runtime/useIdleRunModeModel.ts | 94 | useIdleRunModeModel | 125 |
| src/features/runs/components/PartyRunHomePanel.tsx | 37 | PartyRunHomePanel | 124 |
| scripts/deploy-public-backend.mjs | 304 | main | 123 |
| src/features/runs/hooks/useRunTrackingFlow.ts | 11 | useRunTrackingFlow | 122 |
| src/features/auth/hooks/useUniversityVerification.ts | 10 | useUniversityVerification | 121 |
| backend/src/repositories/raceRepository.mjs | 1 | createJsonRaceRepository | 121 |

## React component inline object/array/style 후보

| 우선순위 | 파일 | 줄 | 이유 | 권장 조치 | 근거 |
| --- | --- | --- | --- | --- | --- |
| Medium | src/features/runs/components/matchSetupCards/MatchSetupTabbedSelector.tsx | 206 | inline style/object/array/function prop 11개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[styles.tabPill, active ? styles.tabPillActive : undefined]} |
| Medium | src/features/auth/screens/AccountRecoveryScreen.tsx | 139 | inline style/object/array/function prop 7개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | onChangeText={(nextValue) => setFindPhone(formatPhoneInput(nextValue))} |
| Medium | src/features/friends/screens/FriendsScreen.tsx | 57 | inline style/object/array/function prop 7개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <Pressable style={styles.addButton} onPress={() => router.push('/add-friend')}> |
| Medium | src/components/matches/liveMatchArena/DuelRoad.tsx | 46 | inline style/object/array/function prop 6개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <View style={[ |
| Medium | src/features/integrations/components/nrcBridge/NrcBridgeGuideActions.tsx | 37 | inline style/object/array/function prop 6개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | onPress={() => onConnectSource('nrc')} |
| Medium | src/features/settings/screens/AdminScreen.tsx | 94 | inline style/object/array/function prop 6개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <View style={[styles.container, isWide ? styles.containerWide : null]}> |
| Medium | src/components/matches/liveMatchArena/RoadMotion.tsx | 32 | inline style/object/array/function prop 5개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <View style={[styles.duelLaneBase, styles.duelLaneLeft]} /> |
| Medium | src/features/auth/components/signup/SignupProfileSection.tsx | 55 | inline style/object/array/function prop 5개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | onPress={() => setDisplayNamePreference('nickname')} |
| Medium | src/features/auth/components/universityVerification/UniversityVerificationRows.tsx | 22 | inline style/object/array/function prop 5개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[styles.methodPickerButton, selected ? styles.methodPickerButtonSelected : null]} |
| Medium | src/features/friends/FriendsRanking.tsx | 46 | inline style/object/array/function prop 5개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | onPress={() => setRankingWindow('today')} |
| Medium | src/features/league/components/LeagueRegionSelectorCard.tsx | 97 | inline style/object/array/function prop 5개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[styles.pathChip, isCurrentPath && styles.pathChipActive]} |
| Low | src/components/matches/liveMatchArena/GroupRoad.tsx | 64 | inline style/object/array/function prop 4개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[ |
| Low | src/features/auth/components/signup/SignupFormPrimitives.tsx | 36 | inline style/object/array/function prop 4개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[styles.input, !editable && styles.inputDisabled]} |
| Low | src/features/auth/screens/LoginScreen.tsx | 46 | inline style/object/array/function prop 4개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[styles.input, styles.passwordInput]} |
| Low | src/features/home/components/overview/HomePointCalendar.tsx | 42 | inline style/object/array/function prop 4개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[styles.calendarNavButton, calendarMonthOffset === 0 && styles.calendarNavButtonCurrent]} |
| Low | src/features/league/components/LeagueRankBadges.tsx | 16 | inline style/object/array/function prop 4개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[ |
| Low | src/features/profile/screens/MyActivityScreen.tsx | 15 | inline style/object/array/function prop 4개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <Link href={{ pathname: '/run-detail', params: { runId: run.id } }} asChild> |
| Low | src/features/runs/components/LiveMatchExitActionCard.tsx | 73 | inline style/object/array/function prop 4개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[styles.button, actionState.disabled ? styles.buttonDisabled : undefined]} |
| Low | src/features/runs/components/PartyRunHomePanel.tsx | 86 | inline style/object/array/function prop 4개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[styles.roomModeChip, optionIsSelected ? styles.roomModeChipSelected : undefined]} |
| Low | src/components/ui/Button.tsx | 19 | inline style/object/array/function prop 3개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[ |
| Low | src/features/auth/components/signup/SignupRegionSection.tsx | 61 | inline style/object/array/function prop 3개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | onPress={() => setOpenRegionStep('province')} |
| Low | src/features/friends/components/FriendRequestsCard.tsx | 48 | inline style/object/array/function prop 3개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[styles.ghostButton, isActing && styles.disabledButton]} |
| Low | src/features/home/HomeOverview.tsx | 67 | inline style/object/array/function prop 3개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | onPreviousMonth={() => setCalendarMonthOffset((current) => current - 1)} |
| Low | src/features/integrations/IntegrationJourneyCard.tsx | 205 | inline style/object/array/function prop 3개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <View style={[styles.stepRow, isLast && styles.stepRowLast]}> |
| Low | src/features/league/components/TodayRankingCard.tsx | 34 | inline style/object/array/function prop 3개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | accessibilityState={{ selected: active }} |
| Low | src/features/league/screens/DistrictPersonalScreen.tsx | 14 | inline style/object/array/function prop 3개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <View style={[styles.rankRow, runner.isMe && styles.meRow]}> |
| Low | src/features/runs/components/matchRoom/MatchRoomFriendInviteCard.tsx | 64 | inline style/object/array/function prop 3개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[ |
| Low | src/features/settings/admin/components/UserAdminSection.tsx | 40 | inline style/object/array/function prop 3개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | keyExtractor={(user) => user.id} |
| Low | src/components/Screen.tsx | 31 | inline style/object/array/function prop 2개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <SafeAreaView style={styles.safe} edges={['top']}> |
| Low | src/features/auth/components/universityVerification/UniversityVerificationContent.tsx | 180 | inline style/object/array/function prop 2개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[styles.checkRow, selected ? styles.checkRowSelected : null]} |
| Low | src/features/auth/screens/OnboardingScreen.tsx | 19 | inline style/object/array/function prop 2개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <PrimaryButton label="회원가입하고 시작" onPress={() => router.push('/signup')} /> |
| Low | src/features/friends/components/FriendListCard.tsx | 56 | inline style/object/array/function prop 2개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[ |
| Low | src/features/friends/components/FriendRankRow.tsx | 14 | inline style/object/array/function prop 2개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <Link href={{ pathname: '/friend-detail', params: { friendId: runner.id } }} asChild> |
| Low | src/features/friends/screens/FriendDetailScreen.tsx | 24 | inline style/object/array/function prop 2개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | href={{ pathname: '/run-detail', params: { runId: run.id, friendId } }} |
| Low | src/features/integrations/components/IntegrationSourcesCards.tsx | 72 | inline style/object/array/function prop 2개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[styles.actionButton, styles.connectedBadge, isBusy && styles.actionButtonDisabled]} |
| Low | src/features/integrations/NativeHealthReadinessCard.tsx | 26 | inline style/object/array/function prop 2개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <View style={[styles.badge, badgeStyles[readiness.state]]}> |
| Low | src/features/location/RegionSelection.tsx | 85 | inline style/object/array/function prop 2개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[styles.selectionChip, selected && styles.selectionChipSelected, disabled && styles.disabledButton]} |
| Low | src/features/match/screens/MatchRecordScreen.tsx | 30 | inline style/object/array/function prop 2개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <Link href={{ pathname: '/run-detail', params: { runId: run.id } }} asChild> |
| Low | src/features/profile/components/AccountActionsCard.tsx | 33 | inline style/object/array/function prop 2개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[ |
| Low | src/features/profile/screens/EditProfileScreen.tsx | 54 | inline style/object/array/function prop 2개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <SecondaryButton label="마이페이지로 돌아가기" onPress={() => router.replace('/(tabs)/mypage')} /> |
| Low | src/features/runs/components/matchRoom/MatchRoomInviteActionCard.tsx | 27 | inline style/object/array/function prop 2개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[ |
| Low | src/features/runs/components/matchRoom/MatchRoomStartModeCard.tsx | 149 | inline style/object/array/function prop 2개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[styles.modeChip, selected ? styles.modeChipSelected : undefined]} |
| Low | src/features/runs/components/matchRoom/MatchRoomWheelColumn.tsx | 50 | inline style/object/array/function prop 2개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <Text style={[styles.wheelItemText, isSelected ? styles.wheelItemTextSelected : undefined]}> |
| Low | src/features/runs/components/PartyRunInviteCard.tsx | 38 | inline style/object/array/function prop 2개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[styles.declineButton, isBusy ? styles.buttonDisabled : undefined]} |
| Low | app/_layout.tsx | 50 | inline style/object/array/function prop 1개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <Stack screenOptions={{ headerShown: false, freezeOnBlur: true }}> |
| Low | src/components/Card.tsx | 7 | inline style/object/array/function prop 1개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | return <View style={[styles.card, style]} {...rest}>{children}</View>; |
| Low | src/components/matches/AndroidLiveMatchPerfPanel.tsx | 129 | inline style/object/array/function prop 1개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <Text style={[styles.diagnosis, diagnosisStyle]}> |
| Low | src/components/matches/MatchStartCountdownOverlay.tsx | 16 | inline style/object/array/function prop 1개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <View style={[styles.overlay, variant === 'centered' ? styles.overlayCentered : null]} pointerEvents="none"> |
| Low | src/components/ranking/RankingItemRow.tsx | 28 | inline style/object/array/function prop 1개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[styles.row, friend && styles.friendRow, highlighted && styles.highlightedRow]} |
| Low | src/features/auth/components/signup/SignupActionFooter.tsx | 29 | inline style/object/array/function prop 1개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[styles.primaryButton, disabled ? styles.disabledButton : null]} |
| Low | src/features/friends/screens/AddFriendScreen.tsx | 76 | inline style/object/array/function prop 1개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <SecondaryButton label="친구 화면으로 돌아가기" onPress={() => router.replace('/(tabs)/friends')} /> |
| Low | src/features/integrations/screens/ConnectSourcesScreen.tsx | 139 | inline style/object/array/function prop 1개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[source.connected ? styles.badgeConnected : styles.badge, connecting && styles.badgeDisabled]} |
| Low | src/features/integrations/screens/IntegrationManagementScreen.tsx | 120 | inline style/object/array/function prop 1개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <SecondaryButton label={backLabel} onPress={() => router.replace(backHref)} /> |
| Low | src/features/integrations/screens/IntegrationsScreen.tsx | 103 | inline style/object/array/function prop 1개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | onAddManualRun={() => router.push('/add-run')} |
| Low | src/features/league/components/RankLeaderboardCard.tsx | 58 | inline style/object/array/function prop 1개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <View style={[styles.tierHeader, { backgroundColor: accentColor }]}> |
| Low | src/features/running/components/RunMatchResultCard.tsx | 26 | inline style/object/array/function prop 1개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[ |
| Low | src/features/running/components/RunPointBreakdownCard.tsx | 51 | inline style/object/array/function prop 1개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <Text style={[styles.pointBreakdownValue, highlight ? styles.pointBreakdownValueHighlight : null]}> |
| Low | src/features/running/screens/AddRunScreen.tsx | 95 | inline style/object/array/function prop 1개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <SecondaryButton label="내 활동으로 돌아가기" onPress={() => router.replace('/my-activity')} /> |
| Low | src/features/running/screens/RunDetailScreen.tsx | 83 | inline style/object/array/function prop 1개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | onPress={() => router.replace(backHref)} |
| Low | src/features/runs/components/PartyRunParticipantListCard.tsx | 43 | inline style/object/array/function prop 1개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[styles.participantRow, participant.isInvitee ? styles.invitedParticipantRow : undefined]} |
| Low | src/features/runs/components/RunningReadyScreen.tsx | 33 | inline style/object/array/function prop 1개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <Card style={[styles.readyCard, readyCardStyle]}> |
| Low | src/features/runs/components/TrackRunExperienceView.tsx | 78 | inline style/object/array/function prop 1개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[ |
| Low | src/features/settings/screens/RegionSettingsScreen.tsx | 89 | inline style/object/array/function prop 1개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <SecondaryButton label="마이페이지로 돌아가기" onPress={() => router.replace('/(tabs)/mypage')} /> |

## 렌더 중 sort/filter/map 후보

| 우선순위 | 파일 | 줄 | 이유 | 권장 조치 | 근거 |
| --- | --- | --- | --- | --- | --- |
| Medium | src/features/friends/components/FriendListCard.tsx | 102 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | {friends.map((friend) => ( |
| Medium | src/features/friends/components/FriendRequestsCard.tsx | 111 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | {received.map((request) => ( |
| Medium | src/features/friends/components/FriendRequestsCard.tsx | 120 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | {pending.map((request) => ( |
| Medium | src/features/friends/FriendsRanking.tsx | 75 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | {displayedRanks.map((runner) => ( |
| Medium | src/features/friends/screens/FriendDetailScreen.tsx | 94 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | {activityRuns.map((run) => ( |
| Medium | src/features/league/components/DistrictMemberRankingCard.tsx | 76 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | {regionMembers.ranks.map((runner) => ( |
| Medium | src/features/league/components/LeagueRegionSelectorCard.tsx | 126 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | {nodes.map((node, index) => { |
| Medium | src/features/league/screens/DistrictPersonalScreen.tsx | 67 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | competition.focusRanks.map((runner) => ( |
| Medium | src/features/league/screens/DistrictPersonalScreen.tsx | 76 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | competition.ranks.map((runner) => ( |
| Medium | src/features/match/screens/MatchRecordScreen.tsx | 105 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | stats.matchRuns.map((run) => ( |
| Medium | src/features/profile/screens/MyActivityScreen.tsx | 63 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | activityRuns.map((run) => ( |
| Medium | src/features/runs/components/MatchResultPanel.tsx | 48 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | {duelRows.map((row) => ( |
| Medium | src/features/runs/components/MatchResultPanel.tsx | 72 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | {groupRows.map((row) => ( |
| Medium | src/features/runs/components/PartyRunParticipantListCard.tsx | 73 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | {uxModel.participants.map((participant) => ( |
| Medium | src/features/settings/admin/components/AdminPrimitives.tsx | 199 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | {data.map((item, index) => ( |

## useEffect가 많은 파일

없음


## useMemo/useCallback 없이 props를 많이 만드는 후보

| 우선순위 | 파일 | 줄 | 이유 | 권장 조치 | 근거 |
| --- | --- | --- | --- | --- | --- |
| Medium | src/features/auth/screens/AccountRecoveryScreen.tsx |  | props/object/function을 많이 만들지만 memo/callback 경계가 감지되지 않았다. | 반복 렌더가 있는 화면이면 props 생성 hook 또는 memoized child로 분리한다. | inline props=7, useMemo/useCallback=0 |
| Medium | src/features/friends/screens/FriendsScreen.tsx |  | props/object/function을 많이 만들지만 memo/callback 경계가 감지되지 않았다. | 반복 렌더가 있는 화면이면 props 생성 hook 또는 memoized child로 분리한다. | inline props=7, useMemo/useCallback=0 |
| Medium | src/features/integrations/components/nrcBridge/NrcBridgeGuideActions.tsx |  | props/object/function을 많이 만들지만 memo/callback 경계가 감지되지 않았다. | 반복 렌더가 있는 화면이면 props 생성 hook 또는 memoized child로 분리한다. | inline props=6, useMemo/useCallback=0 |
| Medium | src/features/settings/screens/AdminScreen.tsx |  | props/object/function을 많이 만들지만 memo/callback 경계가 감지되지 않았다. | 반복 렌더가 있는 화면이면 props 생성 hook 또는 memoized child로 분리한다. | inline props=6, useMemo/useCallback=0 |
| Medium | src/features/auth/components/signup/SignupProfileSection.tsx |  | props/object/function을 많이 만들지만 memo/callback 경계가 감지되지 않았다. | 반복 렌더가 있는 화면이면 props 생성 hook 또는 memoized child로 분리한다. | inline props=5, useMemo/useCallback=0 |

## services 밖 fetch/api 호출 후보

없음


## utils/domain 밖 계산 로직 후보

| 우선순위 | 파일 | 줄 | 이유 | 권장 조치 | 근거 |
| --- | --- | --- | --- | --- | --- |
| Medium | backend/src/seed.mjs |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=28, sort/filter/map=5 |
| Medium | backend/src/points.mjs |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=23, sort/filter/map=5 |
| Medium | backend/src/smoke.mjs |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=17, sort/filter/map=2 |
| Medium | src/features/runs/components/liveMatchTracking/LiveMatchRankingSection.tsx |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=17, sort/filter/map=1 |
| Medium | src/data/mock/regionTree.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=14, sort/filter/map=2 |
| Medium | backend/src/runningMatchContract.test.mjs |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=14, sort/filter/map=0 |
| Medium | src/integrations/nativeHealth.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=13, sort/filter/map=1 |
| Medium | src/data/mock/friends.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=12, sort/filter/map=0 |
| Medium | src/features/league/leagueRanking.test.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=8, sort/filter/map=3 |
| Medium | src/features/runs/components/matchSetupCards/MatchSetupTabbedSelector.tsx |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=6, sort/filter/map=4 |
| Medium | src/features/league/components/LeagueRankBadges.tsx |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=9, sort/filter/map=0 |
| Medium | src/features/points/pointSystem.test.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=8, sort/filter/map=1 |
| Medium | src/features/points/pointSystem.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=8, sort/filter/map=1 |
| Medium | src/features/runs/sync/activeRoomResult.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=5, sort/filter/map=4 |
| Medium | backend/src/routes/authPhoneVerificationRoutes.mjs |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=7, sort/filter/map=1 |
| Medium | backend/src/routing.mjs |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=7, sort/filter/map=1 |
| Medium | src/data/mock/league.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=8, sort/filter/map=0 |
| Medium | src/data/mock/runs.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=8, sort/filter/map=0 |
| Medium | src/features/runs/hooks/usePartyRunRoom.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=5, sort/filter/map=2 |
| Medium | src/components/matches/liveMatchArena/RoadMotion.tsx |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=2, sort/filter/map=4 |
| Medium | src/features/location/addressCatalog.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=0, sort/filter/map=6 |
| Medium | src/features/match/screens/MatchRecordScreen.tsx |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=5, sort/filter/map=1 |
| Medium | src/features/runs/sync/roomInviteInboxRecipientMatcher.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=2, sort/filter/map=4 |
| Medium | backend/src/auth.mjs |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=5, sort/filter/map=0 |
| Medium | src/components/matches/liveMatchRaceBoard/RaceBoardListRow.tsx |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=5, sort/filter/map=0 |
| Medium | src/features/running/hooks/useAddRunForm.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=5, sort/filter/map=0 |
| Medium | src/lib/matchCountdown.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=1, sort/filter/map=4 |
| Medium | backend/src/routes/socialRoutes.mjs |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=0, sort/filter/map=4 |
| Medium | src/features/auth/components/universityVerification/UniversityVerificationContent.tsx |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=0, sort/filter/map=4 |
| Medium | src/features/profile/hooks/useMyPageScreen.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=0, sort/filter/map=4 |

## types 밖 타입 선언 후보

| 우선순위 | 파일 | 줄 | 이유 | 권장 조치 | 근거 |
| --- | --- | --- | --- | --- | --- |
| Medium | src/features/runs/hooks/runSaveFlow/types.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=7 |
| Medium | src/features/runs/lifecycle/matchRoomFlow.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=7 |
| Medium | src/features/runs/runtime/trace/types.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=7 |
| Medium | src/features/runs/lifecycle/matchLifecycleController.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=6 |
| Medium | src/integrations/nativeHealth.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=6 |
| Medium | src/lib/session/types.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=6 |
| Medium | src/features/runs/hooks/matchLifecycle/types.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=5 |
| Medium | src/features/runs/sync/manualInviteJoin.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=5 |
| Medium | src/features/runs/sync/recipientInviteInbox/types.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=5 |
| Medium | src/components/matches/liveMatchPerfQaLog.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=4 |
| Medium | src/features/integrations/components/IntegrationSourcesCards.tsx |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=4 |
| Medium | src/features/integrations/components/nrcBridge/types.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=4 |
| Medium | src/features/match/hooks/lobby/roomDeleteVerification.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=4 |
| Medium | src/features/runs/runtime/TrackRunExperienceRuntimeModel.tsx |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=4 |
| Medium | src/features/runs/runtime/useTrackRunRoomLoader.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=4 |
| Medium | src/features/runs/sync/roomInviteInboxRecipientMatcher.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=4 |
| Medium | src/features/runs/tracking/background/snapshotStore.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=4 |
| Medium | src/features/settings/admin/components/MarketAdminSection.tsx |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=4 |
| Medium | src/features/settings/admin/components/NoticeAdminSection.tsx |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=4 |
| Medium | src/utils/rgPerfTrace.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=4 |
| Medium | src/components/matches/useAndroidLiveMatchPerfProbe.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/friends/components/FriendListCard.tsx |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/league/utils/leagueScore.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/running/components/RunDetailInfoCard.tsx |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/running/components/RunMatchResultCard.tsx |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/running/components/RunPointBreakdownCard.tsx |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/running/components/RunSummaryCards.tsx |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/runs/components/liveMatchTracking/types.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/runs/components/MatchOptionSelector.tsx |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/runs/components/matchSetupCards/MatchSetupTabbedSelector.tsx |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/runs/hooks/useMatchSelectionModel.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/runs/lifecycle/hooks/runningMatchFocus/useLiveMatchNavigationExecutor.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/runs/lifecycle/hooks/useCountdownHandoffEffect.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/runs/lifecycle/hooks/useLiveMatchNavigationEffects.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/runs/lifecycle/liveMatchMountedRegistry.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/runs/lifecycle/liveMatchNavigationGate.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/runs/lifecycle/trackRunShellSelection.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/runs/runtime/useTrackRunNavigationAdapter.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/runs/runtime/useTrackRunRuntimeScreenState.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/runs/runtime/useTrackRunRuntimeStateBridge.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/runs/sync/partyRunSync/types.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/runs/tracking/background/locationTaskManagerCore.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/runs/tracking/background/locationTaskPolicy.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/runs/tracking/session/useTrackingSessionSnapshots.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/runs/utils/matchScheduling.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/runs/viewModels/liveMatchProgressModel.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/runs/viewModels/liveMatchRaceBoardProgressive.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/runs/viewModels/matchViewModels.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/runs/viewModels/useTrackRunIdleViewModel.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/settings/admin/components/RaceAdminSection.tsx |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/settings/admin/types.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/integrations/provider.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/lib/api/services/runningRoomResponseGuards.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/lib/api/services/runningRunResponseGuards.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/navigation/matchReminderNotificationRouting.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/utils/marketRedemption.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |

## setInterval/setTimeout/subscription cleanup 의심 후보

| 우선순위 | 파일 | 줄 | 이유 | 권장 조치 | 근거 |
| --- | --- | --- | --- | --- | --- |
| Medium | backend/src/runningMatchContract.test.mjs |  | 파일에 timer가 있지만 clearTimeout/clearInterval 패턴이 없다. | non-blocking timeout인지, cleanup이 외부 registry에서 보장되는지 확인한다. | setTimeout/setInterval without clear pattern |
| Medium | src/features/runs/sync/activeRoomCheck.test.ts |  | 파일에 timer가 있지만 clearTimeout/clearInterval 패턴이 없다. | non-blocking timeout인지, cleanup이 외부 registry에서 보장되는지 확인한다. | setTimeout/setInterval without clear pattern |
| Medium | src/utils/rgInputTrace.ts |  | 파일에 timer가 있지만 clearTimeout/clearInterval 패턴이 없다. | non-blocking timeout인지, cleanup이 외부 registry에서 보장되는지 확인한다. | setTimeout/setInterval without clear pattern |
| Medium | backend/src/smoke.mjs |  | 파일에 timer가 있지만 clearTimeout/clearInterval 패턴이 없다. | non-blocking timeout인지, cleanup이 외부 registry에서 보장되는지 확인한다. | setTimeout/setInterval without clear pattern |
| Medium | src/features/friends/hooks/useAddFriendScreen.ts |  | 파일에 timer가 있지만 clearTimeout/clearInterval 패턴이 없다. | non-blocking timeout인지, cleanup이 외부 registry에서 보장되는지 확인한다. | setTimeout/setInterval without clear pattern |
| Medium | scripts/check-public-backend-domain.mjs |  | 파일에 timer가 있지만 clearTimeout/clearInterval 패턴이 없다. | non-blocking timeout인지, cleanup이 외부 registry에서 보장되는지 확인한다. | setTimeout/setInterval without clear pattern |
| Medium | scripts/deploy-public-backend.mjs |  | 파일에 timer가 있지만 clearTimeout/clearInterval 패턴이 없다. | non-blocking timeout인지, cleanup이 외부 registry에서 보장되는지 확인한다. | setTimeout/setInterval without clear pattern |
| Medium | scripts/sync-preview-eas-env.mjs |  | 파일에 timer가 있지만 clearTimeout/clearInterval 패턴이 없다. | non-blocking timeout인지, cleanup이 외부 registry에서 보장되는지 확인한다. | setTimeout/setInterval without clear pattern |
| Medium | src/features/profile/hooks/useEditProfile.ts |  | 파일에 timer가 있지만 clearTimeout/clearInterval 패턴이 없다. | non-blocking timeout인지, cleanup이 외부 registry에서 보장되는지 확인한다. | setTimeout/setInterval without clear pattern |
| Medium | src/features/profile/hooks/useMyPageScreen.ts |  | 파일에 timer가 있지만 clearTimeout/clearInterval 패턴이 없다. | non-blocking timeout인지, cleanup이 외부 registry에서 보장되는지 확인한다. | setTimeout/setInterval without clear pattern |
| Medium | src/features/runs/sync/staleRoomCleanup.test.ts |  | 파일에 timer가 있지만 clearTimeout/clearInterval 패턴이 없다. | non-blocking timeout인지, cleanup이 외부 registry에서 보장되는지 확인한다. | setTimeout/setInterval without clear pattern |
| Medium | src/features/runs/tracking/actions/useAutoStartMatchTrackingAction.ts |  | 파일에 timer가 있지만 clearTimeout/clearInterval 패턴이 없다. | non-blocking timeout인지, cleanup이 외부 registry에서 보장되는지 확인한다. | setTimeout/setInterval without clear pattern |
| Medium | src/features/settings/hooks/useNotificationSettings.ts |  | 파일에 timer가 있지만 clearTimeout/clearInterval 패턴이 없다. | non-blocking timeout인지, cleanup이 외부 registry에서 보장되는지 확인한다. | setTimeout/setInterval without clear pattern |
| Medium | src/features/settings/hooks/useRegionSettings.ts |  | 파일에 timer가 있지만 clearTimeout/clearInterval 패턴이 없다. | non-blocking timeout인지, cleanup이 외부 registry에서 보장되는지 확인한다. | setTimeout/setInterval without clear pattern |
| Medium | src/utils/rgPerfTrace.ts |  | 파일에 timer가 있지만 clearTimeout/clearInterval 패턴이 없다. | non-blocking timeout인지, cleanup이 외부 registry에서 보장되는지 확인한다. | setTimeout/setInterval without clear pattern |

## Location/watchPosition/background task 사용 후보

| 우선순위 | 파일 | 줄 | 이유 | 권장 조치 | 근거 |
| --- | --- | --- | --- | --- | --- |
| Medium | src/features/runs/tracking/background/backgroundSubscription.ts | 23 | 위치 watcher/background task/AppState 관련 코드가 감지됐다. | single-flight, appState guard, cleanup, timeout이 테스트로 보장되는지 확인한다. | const started = await Location.hasStartedLocationUpdatesAsync(taskName); |
| Medium | src/features/runs/tracking/background/locationTask.ts | 3 | 위치 watcher/background task/AppState 관련 코드가 감지됐다. | single-flight, appState guard, cleanup, timeout이 테스트로 보장되는지 확인한다. | import * as TaskManager from 'expo-task-manager'; |
| Medium | src/features/runs/tracking/background/locationTaskManager.test.ts |  | 위치 watcher/background task/AppState 관련 코드가 감지됐다. | single-flight, appState guard, cleanup, timeout이 테스트로 보장되는지 확인한다. | signals=8 |
| Medium | src/features/runs/tracking/background/locationTaskManagerCore.ts |  | 위치 watcher/background task/AppState 관련 코드가 감지됐다. | single-flight, appState guard, cleanup, timeout이 테스트로 보장되는지 확인한다. | signals=7 |
| Medium | src/features/runs/tracking/background/locationTaskPolicy.test.ts |  | 위치 watcher/background task/AppState 관련 코드가 감지됐다. | single-flight, appState guard, cleanup, timeout이 테스트로 보장되는지 확인한다. | signals=6 |
| Medium | src/features/runs/tracking/background/foregroundSubscription.ts | 8 | 위치 watcher/background task/AppState 관련 코드가 감지됐다. | single-flight, appState guard, cleanup, timeout이 테스트로 보장되는지 확인한다. | function buildForegroundLocationOptions(): Location.LocationOptions { |
| Medium | src/features/runs/tracking/useLocationTracking.ts | 27 | 위치 watcher/background task/AppState 관련 코드가 감지됐다. | single-flight, appState guard, cleanup, timeout이 테스트로 보장되는지 확인한다. | const foregroundPermission = await Location.requestForegroundPermissionsAsync(); |
| Medium | src/features/match/hooks/lobby/roomSnapshot/useRoomSnapshotForegroundRefresh.ts | 3 | 위치 watcher/background task/AppState 관련 코드가 감지됐다. | single-flight, appState guard, cleanup, timeout이 테스트로 보장되는지 확인한다. | import { AppState } from 'react-native'; |
| Medium | src/features/runs/tracking/useTrackingAppStateSync.ts | 3 | 위치 watcher/background task/AppState 관련 코드가 감지됐다. | single-flight, appState guard, cleanup, timeout이 테스트로 보장되는지 확인한다. | import { AppState } from 'react-native'; |
| Medium | src/features/runs/hooks/useRunTracking.ts | 2 | 위치 watcher/background task/AppState 관련 코드가 감지됐다. | single-flight, appState guard, cleanup, timeout이 테스트로 보장되는지 확인한다. | import { AppState } from 'react-native'; |
| Medium | src/features/runs/tracking/background/index.ts | 70 | 위치 watcher/background task/AppState 관련 코드가 감지됐다. | single-flight, appState guard, cleanup, timeout이 테스트로 보장되는지 확인한다. | // Android can miss the AppState transition that used to start this task. |
| Medium | src/features/runs/tracking/background/locationDistance.ts | 44 | 위치 watcher/background task/AppState 관련 코드가 감지됐다. | single-flight, appState guard, cleanup, timeout이 테스트로 보장되는지 확인한다. | export function resolveLocationTimestampMs(location: Location.LocationObject) { |
| Medium | src/features/runs/tracking/trackingSession.ts | 146 | 위치 watcher/background task/AppState 관련 코드가 감지됐다. | single-flight, appState guard, cleanup, timeout이 테스트로 보장되는지 확인한다. | export function buildRoutePoint(location: Location.LocationObject): RunRoutePoint { |
| Medium | src/features/runs/tracking/background/locationTaskPolicy.ts |  | 위치 watcher/background task/AppState 관련 코드가 감지됐다. | single-flight, appState guard, cleanup, timeout이 테스트로 보장되는지 확인한다. | signals=1 |
| Medium | src/features/runs/tracking/background/routeAccumulator.ts | 160 | 위치 watcher/background task/AppState 관련 코드가 감지됐다. | single-flight, appState guard, cleanup, timeout이 테스트로 보장되는지 확인한다. | export function appendTrackedLocation(location: Location.LocationObject) { |

## 동일/유사 역할 파일 후보

| 우선순위 | 파일 | 줄 | 이유 | 권장 조치 | 근거 |
| --- | --- | --- | --- | --- | --- |
| High | Card 계열 |  | Card 계열 파일이 45개 있다. | 공통 primitive와 feature-specific wrapper 경계를 다시 확인한다. | src/features/integrations/IntegrationJourneyCard.tsx, src/features/league/components/LeagueRegionSelectorCard.tsx, src/… |
| High | Route 계열 |  | Route 계열 파일이 26개 있다. | 공통 primitive와 feature-specific wrapper 경계를 다시 확인한다. | backend/src/routes/adminRoutes.mjs, backend/src/routes/runningMatch/runningMatchRoomRoutes.mjs, backend/src/routes/soci… |
| High | Ranking 계열 |  | Ranking 계열 파일이 25개 있다. | 공통 primitive와 feature-specific wrapper 경계를 다시 확인한다. | backend/src/lib/runningMatchRankSystem.test.mjs, src/features/friends/components/friendsRankingStyles.ts, backend/src/s… |
| High | Repository 계열 |  | Repository 계열 파일이 22개 있다. | 공통 primitive와 feature-specific wrapper 경계를 다시 확인한다. | backend/src/repositories/postgresAuthRepository.test.mjs, backend/src/repositories/postgresAuthRepository.mjs, backend/… |
| Medium | Service 계열 |  | Service 계열 파일이 15개 있다. | 공통 primitive와 feature-specific wrapper 경계를 다시 확인한다. | backend/src/services/backendStatusService.mjs, backend/src/services/phoneVerificationService.mjs, backend/src/services/… |
| Medium | league |  | 같은 basename을 가진 파일 7개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | src/lib/api/services/mock/league.ts, src/lib/api/services/league.ts, src/domain/league.ts, src/lib/api/types/league.ts,… |
| Medium | friends |  | 같은 basename을 가진 파일 6개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | src/lib/api/services/friends.ts, src/lib/api/services/mock/friends.ts, src/lib/api/types/friends.ts, src/domain/friends… |
| Medium | market |  | 같은 basename을 가진 파일 6개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | src/data/mock/market.ts, src/lib/api/services/market.ts, src/domain/market.ts, src/lib/api/services/mock/market.ts, src… |
| Medium | integrations |  | 같은 basename을 가진 파일 5개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | src/lib/api/services/integrations.ts, src/domain/integrations.ts, src/data/mock/integrations.ts, src/lib/api/services/m… |
| Medium | admin |  | 같은 basename을 가진 파일 3개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | src/lib/api/admin.ts, src/lib/api/types/admin.ts, app/admin.tsx |
| Medium | config |  | 같은 basename을 가진 파일 3개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | backend/src/config.mjs, src/components/matches/liveMatchArena/config.ts, src/lib/api/config.ts |
| Medium | matches |  | 같은 basename을 가진 파일 3개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | src/lib/api/services/matches.ts, src/lib/api/types/matches.ts, src/lib/api/services/mock/matches.ts |
| Medium | matchprogress |  | 같은 basename을 가진 파일 3개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | src/features/runs/viewModels/matchProgress.ts, src/features/runs/types/matchProgress.ts, src/lib/api/services/mock/matc… |
| Medium | profile |  | 같은 basename을 가진 파일 3개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | src/lib/api/services/profile.ts, src/lib/api/types/profile.ts, src/data/mock/profile.ts |
| Medium | rooms |  | 같은 basename을 가진 파일 3개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | src/lib/api/services/rooms.ts, src/lib/api/types/rooms.ts, src/lib/api/services/mock/rooms.ts |
| Medium | runs |  | 같은 basename을 가진 파일 3개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | src/lib/api/services/runs.ts, src/lib/api/types/runs.ts, src/data/mock/runs.ts |
| Medium | _layout |  | 같은 basename을 가진 파일 2개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | app/(tabs)/_layout.tsx, app/_layout.tsx |
| Medium | addresscatalog |  | 같은 basename을 가진 파일 2개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | src/features/location/addressCatalog.ts, backend/src/addressCatalog.mjs |
| Medium | auth |  | 같은 basename을 가진 파일 2개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | backend/src/auth.mjs, src/lib/api/services/mock/auth.ts |
| Medium | home |  | 같은 basename을 가진 파일 2개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | src/lib/api/services/home.ts, app/(tabs)/home.tsx |
| Medium | homeoverview |  | 같은 basename을 가진 파일 2개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | src/features/home/HomeOverview.tsx, src/features/home/utils/homeOverview.ts |
| Medium | matchscheduling |  | 같은 basename을 가진 파일 2개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | src/lib/api/services/mock/matchScheduling.ts, src/features/runs/utils/matchScheduling.ts |
| Medium | matchsetupcards |  | 같은 basename을 가진 파일 2개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | src/features/runs/types/matchSetupCards.ts, src/features/runs/components/MatchSetupCards.tsx |
| Medium | matchstatemachine |  | 같은 basename을 가진 파일 2개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | src/features/runs/lifecycle/matchStateMachine.ts, src/features/runs/types/matchStateMachine.ts |
| Medium | phoneverification |  | 같은 basename을 가진 파일 2개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | backend/src/phoneVerification.mjs, src/lib/session/phoneVerification.ts |
| Medium | points |  | 같은 basename을 가진 파일 2개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | backend/src/points.mjs, src/domain/points.ts |
| Medium | pointsystem |  | 같은 basename을 가진 파일 2개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | src/features/points/pointSystem.ts, src/features/points/types/pointSystem.ts |
| Medium | races |  | 같은 basename을 가진 파일 2개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | src/lib/api/services/mock/races.ts, src/lib/api/services/races.ts |
| Medium | running |  | 같은 basename을 가진 파일 2개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | src/domain/running.ts, app/(tabs)/running.tsx |

## 해석 규칙

- 이 리포트는 정적 휴리스틱이라 false positive가 있을 수 있습니다.
- High 항목은 먼저 눈으로 확인하고, 기능 변경 없이 작은 단위로 분리하는 것을 권장합니다.
- `ScrollView + map`, timer/subscription, Location/background task 항목은 Android 실기기 로그와 함께 확인하세요.
- `services 밖 API 호출`은 frontend 기준입니다. backend smoke/scripts의 직접 fetch는 별도 CLI 용도로 허용될 수 있습니다.
- generated report 자체는 스캔 대상에서 제외합니다.
