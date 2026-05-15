# 코드 품질 자동 분석 리포트

> 이 파일은 `npm run code:quality`로 생성됩니다. 수동 수정하지 말고 스크립트를 다시 실행해 갱신하세요.

생성 시각: 2026-05-15T04:26:03.747Z

## 실행 방법

```bash
npm run code:quality
```

## 요약

| 항목 | 값 |
| --- | --- |
| 분석 파일 | 561 |
| 코드 파일 | 517 |
| package scripts | 63 |
| 300줄 이상 파일 | 65 |
| 500줄 이상 파일 | 20 |
| 50줄 이상 함수 후보 | 224 |
| 순환 import 검사 | 별도 정적 graph가 아닌 파일 단위 휴리스틱 |

## 감지 항목 요약

| 항목 | 전체 | High | Medium | Low |
| --- | --- | --- | --- | --- |
| React component inline object/array/style 후보 | 80 | 6 | 19 | 55 |
| 렌더 중 sort/filter/map 후보 | 31 | 0 | 31 | 0 |
| useEffect가 많은 파일 | 4 | 1 | 3 | 0 |
| useMemo/useCallback 없이 props를 많이 만드는 후보 | 19 | 5 | 14 | 0 |
| services 밖 fetch/api 호출 후보 | 0 | 0 | 0 | 0 |
| utils/domain 밖 계산 로직 후보 | 41 | 6 | 35 | 0 |
| types 밖 타입 선언 후보 | 49 | 4 | 45 | 0 |
| setInterval/setTimeout/subscription cleanup 의심 후보 | 15 | 1 | 14 | 0 |
| Location/watchPosition/background task 사용 후보 | 18 | 5 | 13 | 0 |

## 300줄 이상 파일

| 파일 | 줄 | 신호 |
| --- | --- | --- |
| backend/src/server.mjs | 6392 | imports 22, sort/filter/map 160, timers 1 |
| src/features/runs/TrackRunExperience.tsx | 3410 | imports 56, effects 12, focusEffects 1, sort/filter/map 2, timers 1 |
| backend/src/smoke.mjs | 1014 | imports 16, sort/filter/map 2, timers 2 |
| src/features/runs/hooks/useRunTrackingFlow.ts | 920 | imports 19, effects 3, timers 2 |
| backend/src/runningMatchContract.test.mjs | 899 | imports 8, timers 2 |
| scripts/analyze-code-quality.mjs | 838 | imports 4, sort/filter/map 37, subs 14 |
| src/features/runs/lifecycle/hooks/useRunningMatchFocus.ts | 736 | imports 9 |
| backend/src/repositories/postgresFriendsRepository.mjs | 716 | sort/filter/map 13 |
| src/features/runs/components/LiveMatchTrackingPage.tsx | 699 | imports 10, sort/filter/map 1 |
| src/data/mock.ts | 648 | imports 2, sort/filter/map 2 |
| src/features/match/hooks/lobby/useRoomSnapshot.ts | 645 | imports 17, effects 4, focusEffects 1, sort/filter/map 2, timers 2, subs 1 |
| backend/src/repositories/postgresRunsRepository.mjs | 640 | imports 3, sort/filter/map 9 |
| docs/backend-api-contract.md | 636 | imports 2 |
| backend/src/repositories/postgresAuthRepository.test.mjs | 617 | imports 4, sort/filter/map 20 |
| src/lib/session.ts | 562 | imports 10 |
| scripts/run-release-gate.mjs | 553 | imports 5, sort/filter/map 10 |
| backend/src/seed.mjs | 528 | imports 3, sort/filter/map 5 |
| src/features/runs/hooks/useRunSaveFlow.ts | 519 | imports 17 |
| backend/src/repositories/postgresRunsRepository.test.mjs | 515 | imports 3, sort/filter/map 8 |
| backend/src/repositories/postgresAuthRepository.mjs | 504 | imports 2, sort/filter/map 1 |
| backend/src/store.mjs | 484 | imports 5, sort/filter/map 9 |
| scripts/check-preview-public-api.mjs | 482 | imports 4 |
| scripts/check-performance-smells.mjs | 477 | imports 3, sort/filter/map 22, subs 8 |
| src/features/runs/viewModels/matchProgress.ts | 468 | imports 2, sort/filter/map 5 |
| backend/src/repositories/postgresFriendsRepository.test.mjs | 456 | imports 3, sort/filter/map 12 |
| src/features/settings/admin/hooks/useAdminDashboard.ts | 451 | imports 7, effects 1 |
| src/lib/api/services/mock/matchSessions.ts | 451 | imports 6, sort/filter/map 12 |
| backend/src/repositories/runsRepository.mjs | 443 | imports 2, sort/filter/map 11 |
| backend/src/repositories/postgresLeagueRepository.mjs | 441 | sort/filter/map 14 |
| src/features/runs/lifecycle/matchLifecycleController.test.ts | 439 | imports 5 |
| src/features/runs/lifecycle/matchStateMachine.ts | 437 | imports 2 |
| src/lib/api/services/rooms.ts | 434 | imports 6, sort/filter/map 4 |
| scripts/analyze-android-perf-trace.mjs | 433 | imports 2, sort/filter/map 4 |
| scripts/deploy-public-backend.mjs | 432 | imports 7, timers 1 |
| src/lib/api/services/matches.ts | 422 | imports 6, sort/filter/map 6 |
| backend/src/repositories/authRepository.test.mjs | 414 | imports 4, sort/filter/map 1 |
| src/features/runs/sync/activeRoomCheck.ts | 411 | imports 3, timers 1 |
| src/features/runs/lifecycle/matchRoomFlow.ts | 401 | imports 2, sort/filter/map 8 |
| src/integrations/nativeHealth.ts | 379 | imports 8, sort/filter/map 1 |
| backend/src/repositories/friendsRepository.mjs | 373 | sort/filter/map 9 |
| docs/server-backend-architecture.md | 367 | imports 1 |
| src/lib/api/services/mock/matchScheduling.ts | 358 | imports 4, sort/filter/map 8 |
| src/lib/api/services/runningRoomResponseGuards.ts | 356 | imports 2, sort/filter/map 4 |
| scripts/generate-testflight-qa-report.mjs | 349 | imports 5, sort/filter/map 1 |
| src/features/runs/viewModels/useLiveMatchViewModel.ts | 346 | imports 12 |
| src/components/matches/liveMatchArena/styles.ts | 338 | imports 3 |
| src/features/match/hooks/lobby/useRoomInviteActions.ts | 335 | imports 15 |
| docs/code-quality-audit.md | 335 | imports 13 |
| src/features/runs/components/LiveMatchPager.tsx | 327 | imports 5 |
| src/features/settings/admin/components/adminStyles.ts | 326 | imports 1 |
| src/lib/api/services/runningRoomResponseGuards.test.ts | 323 | imports 5 |
| src/features/auth/hooks/useSignupForm.ts | 320 | imports 7, effects 2 |
| backend/src/repositories/runsRepository.test.mjs | 320 | imports 3, sort/filter/map 1 |
| backend/src/repositories/authRepository.mjs | 318 | imports 1, sort/filter/map 10 |
| backend/src/points.mjs | 316 | sort/filter/map 5 |
| src/features/runs/lifecycle/matchLifecycleController.ts | 314 | imports 6 |
| backend/src/repositories/friendsRepository.test.mjs | 314 | imports 2, sort/filter/map 3 |
| docs/testflight-real-device-qa.md | 314 |  |
| src/features/match/hooks/lobby/useRoomStartActions.ts | 313 | imports 13, effects 1 |
| src/components/matches/LiveMatchRaceBoard.tsx | 309 | imports 3 |
| backend/src/bridges/sessionRunsBridge.mjs | 305 | imports 2, sort/filter/map 3 |
| src/features/runs/components/matchSetupCards/styles.ts | 303 | imports 1 |
| src/features/runs/hooks/useMatchRoomLobby.ts | 302 | imports 15, effects 2, sort/filter/map 1, timers 1 |
| src/features/runs/components/TrackRunExperienceView.tsx | 301 | imports 11, effects 4 |
| src/features/league/components/LeagueRegionSelectorCard.tsx | 300 | imports 11, sort/filter/map 1 |

## 500줄 이상 파일

| 파일 | 줄 | 신호 |
| --- | --- | --- |
| backend/src/server.mjs | 6392 | imports 22, sort/filter/map 160, timers 1 |
| src/features/runs/TrackRunExperience.tsx | 3410 | imports 56, effects 12, focusEffects 1, sort/filter/map 2, timers 1 |
| backend/src/smoke.mjs | 1014 | imports 16, sort/filter/map 2, timers 2 |
| src/features/runs/hooks/useRunTrackingFlow.ts | 920 | imports 19, effects 3, timers 2 |
| backend/src/runningMatchContract.test.mjs | 899 | imports 8, timers 2 |
| scripts/analyze-code-quality.mjs | 838 | imports 4, sort/filter/map 37, subs 14 |
| src/features/runs/lifecycle/hooks/useRunningMatchFocus.ts | 736 | imports 9 |
| backend/src/repositories/postgresFriendsRepository.mjs | 716 | sort/filter/map 13 |
| src/features/runs/components/LiveMatchTrackingPage.tsx | 699 | imports 10, sort/filter/map 1 |
| src/data/mock.ts | 648 | imports 2, sort/filter/map 2 |
| src/features/match/hooks/lobby/useRoomSnapshot.ts | 645 | imports 17, effects 4, focusEffects 1, sort/filter/map 2, timers 2, subs 1 |
| backend/src/repositories/postgresRunsRepository.mjs | 640 | imports 3, sort/filter/map 9 |
| docs/backend-api-contract.md | 636 | imports 2 |
| backend/src/repositories/postgresAuthRepository.test.mjs | 617 | imports 4, sort/filter/map 20 |
| src/lib/session.ts | 562 | imports 10 |
| scripts/run-release-gate.mjs | 553 | imports 5, sort/filter/map 10 |
| backend/src/seed.mjs | 528 | imports 3, sort/filter/map 5 |
| src/features/runs/hooks/useRunSaveFlow.ts | 519 | imports 17 |
| backend/src/repositories/postgresRunsRepository.test.mjs | 515 | imports 3, sort/filter/map 8 |
| backend/src/repositories/postgresAuthRepository.mjs | 504 | imports 2, sort/filter/map 1 |

## 50줄 이상 함수 후보



> 224개 중 상위 80개만 표시합니다.


| 파일 | 줄 | 함수 | 길이 |
| --- | --- | --- | --- |
| src/features/runs/TrackRunExperience.tsx | 171 | TrackRunExperience | 3239 |
| src/features/runs/hooks/useRunTrackingFlow.ts | 79 | useRunTrackingFlow | 841 |
| src/features/runs/lifecycle/hooks/useRunningMatchFocus.ts | 114 | useRunningMatchFocus | 622 |
| src/features/match/hooks/lobby/useRoomSnapshot.ts | 102 | useRoomSnapshot | 543 |
| src/features/runs/lifecycle/hooks/useRunningMatchFocus.ts | 238 | callback@useCallback | 450 |
| src/features/settings/admin/hooks/useAdminDashboard.ts | 51 | useAdminDashboard | 400 |
| src/features/runs/hooks/useRunSaveFlow.ts | 133 | useRunSaveFlow | 386 |
| src/features/match/hooks/lobby/useRoomInviteActions.ts | 32 | useRoomInviteActions | 303 |
| src/features/auth/hooks/useSignupForm.ts | 23 | useSignupForm | 297 |
| src/features/runs/viewModels/useLiveMatchViewModel.ts | 52 | useLiveMatchViewModel | 294 |
| src/features/runs/hooks/useMatchRoomLobby.ts | 20 | useMatchRoomLobby | 282 |
| backend/src/repositories/postgresRunsRepository.mjs | 369 | createPostgresRunsRepository | 271 |
| backend/src/repositories/postgresAuthRepository.mjs | 246 | createPostgresAuthRepository | 258 |
| src/features/settings/screens/AdminScreen.tsx | 19 | AdminScreen | 254 |
| src/features/match/hooks/lobby/useRoomStartActions.ts | 65 | useRoomStartActions | 248 |
| src/features/runs/viewModels/useLiveMatchProgress.ts | 34 | useLiveMatchProgress | 237 |
| src/features/runs/sync/useMatchProgressSync.ts | 49 | useMatchProgressSync | 235 |
| backend/src/bridges/friendsLeagueBridge.mjs | 22 | createFriendsLeagueBridge | 232 |
| src/features/runs/sync/partyRunSync/useLinkedMatchSync.ts | 47 | useLinkedMatchSync | 221 |
| src/features/runs/tracking/background/locationTaskManagerCore.ts | 42 | createLocationTaskManager | 220 |
| src/features/runs/lifecycle/hooks/useMatchEntryEffects.ts | 46 | useMatchEntryEffects | 216 |
| backend/src/repositories/postgresFriendsRepository.mjs | 503 | createPostgresFriendsRepository | 213 |
| scripts/check-preview-public-api.mjs | 259 | main | 211 |
| backend/src/server.mjs | 2879 | buildRunningMatchStatusResponse | 210 |
| src/features/runs/sync/matchPolling/useBlockingMatchStatusPolling.ts | 41 | useBlockingMatchStatusPolling | 209 |
| src/features/match/hooks/lobby/useRoomSnapshot.ts | 212 | callback@useCallback | 207 |
| src/features/runs/TrackRunExperience.tsx | 1297 | loadMatchRoom | 205 |
| scripts/analyze-android-perf-trace.mjs | 142 | analyzeLine | 200 |
| src/features/runs/hooks/useMatchRuntimeState.ts | 57 | useMatchRuntimeState | 193 |
| backend/src/repositories/authRepository.mjs | 127 | createJsonAuthRepository | 191 |
| backend/src/routes/adminRoutes.mjs | 1 | routeAdminRequest | 177 |
| src/components/matches/LiveMatchArena.tsx | 97 | LiveMatchArena | 172 |
| src/features/runs/lifecycle/hooks/useMatchCountdownModel.ts | 40 | useMatchCountdownModel | 171 |
| src/features/runs/components/matchSetupCards/GroupMatchSetupCard.tsx | 14 | GroupMatchSetupCard | 171 |
| backend/src/bridges/sessionRunsBridge.mjs | 136 | createSessionRunsBridge | 169 |
| src/features/auth/screens/AccountRecoveryScreen.tsx | 43 | AccountRecoveryScreen | 168 |
| src/features/integrations/hooks/useIntegrationActions.ts | 61 | useIntegrationActions | 165 |
| backend/src/repositories/marketRepository.mjs | 5 | createJsonMarketRepository | 165 |
| src/features/home/hooks/useHomeScreenModel.ts | 23 | useHomeScreenModel | 161 |
| src/features/runs/tracking/background/locationTaskManagerCore.ts | 48 | startLocationTaskWithTrace | 156 |
| backend/src/bridges/friendsLeagueBridge.test.mjs | 11 | createHarness | 154 |
| src/features/match/screens/MatchRoomScreen.tsx | 15 | MatchRoomScreen | 147 |
| src/features/runs/components/matchSetupCards/DuelMatchSetupCard.tsx | 13 | DuelMatchSetupCard | 145 |
| src/features/runs/components/LiveMatchPager.tsx | 116 | LiveMatchPager | 142 |
| src/features/integrations/components/nrcBridge/NrcBridgeGuideActions.tsx | 10 | buildActionButtons | 139 |
| src/features/runs/hooks/useMatchSelectionModel.ts | 55 | useMatchSelectionModel | 138 |
| src/components/matches/useAndroidLiveMatchPerfProbe.ts | 50 | useAndroidLiveMatchPerfProbe | 136 |
| src/features/runs/viewModels/useTrackRunIdleViewModel.ts | 37 | useTrackRunIdleViewModel | 134 |
| src/features/friends/hooks/useFriendsScreen.ts | 15 | useFriendsScreen | 134 |
| src/features/runs/TrackRunExperience.tsx | 1917 | handleJoinMatchRoom | 131 |
| src/features/runs/sync/usePartyRunSync.ts | 60 | usePartyRunSync | 131 |
| src/features/runs/tracking/useTrackingAppStateSync.ts | 32 | useTrackingAppStateSync | 129 |
| src/features/profile/hooks/useMyPageScreen.ts | 8 | useMyPageScreen | 127 |
| src/features/runs/hooks/useRunTrackingFlow.ts | 503 | handleStartTrackingInternal | 126 |
| src/features/runs/components/PartyRunHomePanel.tsx | 35 | PartyRunHomePanel | 125 |
| src/features/runs/hooks/usePartyRunRoom.ts | 57 | usePartyRunRoom | 124 |
| src/features/runs/TrackRunExperience.tsx | 1793 | handleCreateMatchRoom | 123 |
| scripts/deploy-public-backend.mjs | 304 | main | 123 |
| src/features/runs/hooks/matchLifecycle/useGroupMatchLifecycle.ts | 18 | useGroupMatchLifecycle | 123 |
| backend/src/routes/authRoutes.mjs | 1 | routeAuthRequest | 122 |
| src/features/runs/TrackRunExperience.tsx | 1509 | callback@useCallback | 121 |
| src/features/auth/hooks/useUniversityVerification.ts | 10 | useUniversityVerification | 121 |
| backend/src/repositories/raceRepository.mjs | 1 | createJsonRaceRepository | 121 |
| src/features/runs/hooks/useMatchLifecycle.ts | 17 | useMatchLifecycle | 120 |
| backend/src/seed.mjs | 378 | createRegionTree | 118 |
| backend/src/repositories/runsRepository.mjs | 325 | createJsonRunsRepository | 118 |
| src/features/runs/hooks/matchLifecycle/useDuelMatchLifecycle.ts | 17 | useDuelMatchLifecycle | 117 |
| backend/src/routes/runningMatchRoutes.mjs | 1 | routeRunningMatchRequest | 117 |
| backend/src/repositories/runsRepository.mjs | 208 | importPendingRunsForUser | 116 |
| src/features/match/hooks/lobby/useRoomInviteActions.ts | 187 | handleSendFriendInvites | 116 |
| backend/src/repositories/adminRepository.mjs | 5 | createJsonAdminRepository | 115 |
| src/features/auth/components/signup/SignupCredentialsSection.tsx | 30 | SignupCredentialsSection | 113 |
| src/lib/session.ts | 291 | registerAccount | 112 |
| src/features/runs/lifecycle/hooks/useActiveArenaPinEffect.ts | 27 | useActiveArenaPinEffect | 109 |
| src/features/league/screens/LeagueScreen.tsx | 15 | LeagueScreen | 109 |
| scripts/generate-testflight-qa-report.mjs | 194 | buildMarkdown | 108 |
| scripts/analyze-code-quality.mjs | 664 | buildReport | 107 |
| src/features/settings/admin/components/MarketAdminSection.tsx | 39 | MarketAdminSection | 107 |
| src/features/match/hooks/lobby/useRoomSettings.ts | 32 | useRoomSettings | 106 |
| src/features/settings/admin/components/NoticeAdminSection.tsx | 39 | NoticeAdminSection | 102 |

## React component inline object/array/style 후보

| 우선순위 | 파일 | 줄 | 이유 | 권장 조치 | 근거 |
| --- | --- | --- | --- | --- | --- |
| High | src/features/settings/admin/components/RaceAdminSection.tsx | 61 | inline style/object/array/function prop 21개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <View style={[styles.formGrid, isMedium ? styles.formGridTwoColumns : null]}> |
| High | src/features/settings/admin/components/MarketAdminSection.tsx | 60 | inline style/object/array/function prop 19개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <View style={[styles.formGrid, isMedium ? styles.formGridTwoColumns : null]}> |
| High | src/features/match/screens/MatchRoomScreen.tsx | 57 | inline style/object/array/function prop 13개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <Pressable style={styles.backButton} onPress={() => router.back()}> |
| High | src/features/runs/components/matchSetupCards/MatchSetupCommon.tsx | 40 | inline style/object/array/function prop 13개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[styles.matchDistanceChip, isSelected ? styles.matchDistanceChipSelected : undefined]} |
| High | src/features/settings/admin/components/NoticeAdminSection.tsx | 63 | inline style/object/array/function prop 13개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | onChangeText={(value) => setNoticeForm((current) => ({ ...current, title: value }))} |
| High | src/features/settings/admin/components/RedemptionAdminSection.tsx | 52 | inline style/object/array/function prop 12개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <ToggleChip label="전체" active={redemptionFilter === 'all'} onPress={() => setRedemptionFilter('all')} /> |
| Medium | src/features/auth/components/universityVerification/UniversityVerificationContent.tsx | 32 | inline style/object/array/function prop 10개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <SecondaryButton label="마이페이지로 돌아가기" onPress={() => router.replace('/(tabs)/mypage')} /> |
| Medium | src/features/auth/components/signup/SignupCredentialsSection.tsx | 60 | inline style/object/array/function prop 9개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[styles.input, styles.inlineInput, !submitting && !checkingUsername ? null : styles.inputDisabled]} |
| Medium | src/features/runs/components/matchRoom/MatchRoomStartModeCard.tsx | 50 | inline style/object/array/function prop 8개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[styles.modeChip, isSelected ? styles.modeChipSelected : undefined]} |
| Medium | src/features/settings/screens/NotificationSettingsScreen.tsx | 42 | inline style/object/array/function prop 8개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <ToggleRow label="친구 요청 및 수락 알림" active={friendAlerts} disabled={saving} onPress={() => setFriendAlerts((prev) => !prev… |
| Medium | src/components/matches/LiveMatchRaceBoard.tsx | 36 | inline style/object/array/function prop 7개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[ |
| Medium | src/features/auth/screens/AccountRecoveryScreen.tsx | 138 | inline style/object/array/function prop 7개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | onChangeText={(nextValue) => setFindPhone(formatPhoneInput(nextValue))} |
| Medium | src/features/friends/screens/FriendsScreen.tsx | 54 | inline style/object/array/function prop 7개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <Pressable style={styles.addButton} onPress={() => router.push('/add-friend')}> |
| Medium | src/features/settings/admin/components/AdminPrimitives.tsx | 15 | inline style/object/array/function prop 7개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <Pressable style={[styles.toggleChip, active ? styles.toggleChipActive : null]} onPress={onPress}> |
| Medium | src/components/matches/liveMatchArena/DuelRoad.tsx | 43 | inline style/object/array/function prop 6개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <View style={[ |
| Medium | src/features/integrations/components/nrcBridge/NrcBridgeGuideActions.tsx | 37 | inline style/object/array/function prop 6개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | onPress={() => onConnectSource('nrc')} |
| Medium | src/features/league/components/LeagueModeSwitch.tsx | 18 | inline style/object/array/function prop 6개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <Pressable style={[styles.modeButton, !isUniversityView && styles.modeButtonActive]} onPress={() => onChange('region')}> |
| Medium | src/features/league/components/LeagueRegionSelectorCard.tsx | 68 | inline style/object/array/function prop 6개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[styles.pathChip, isCurrentPath && styles.pathChipActive]} |
| Medium | src/features/settings/screens/AdminScreen.tsx | 93 | inline style/object/array/function prop 6개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <View style={[styles.container, isWide ? styles.containerWide : null]}> |
| Medium | src/components/matches/liveMatchArena/RoadMotion.tsx | 32 | inline style/object/array/function prop 5개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <View style={[styles.duelLaneBase, styles.duelLaneLeft]} /> |
| Medium | src/features/auth/components/signup/SignupProfileSection.tsx | 55 | inline style/object/array/function prop 5개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | onPress={() => setDisplayNamePreference('nickname')} |
| Medium | src/features/friends/FriendsRanking.tsx | 55 | inline style/object/array/function prop 5개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | onPress={() => setRankingWindow('today')} |
| Medium | src/features/integrations/IntegrationJourneyCard.tsx | 133 | inline style/object/array/function prop 5개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <View key={step.id} style={[styles.stepRow, index === steps.length - 1 && styles.stepRowLast]}> |
| Medium | src/features/integrations/screens/ConnectSourcesScreen.tsx | 58 | inline style/object/array/function prop 5개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | onAddManualRun={() => router.push('/add-run')} |
| Medium | src/features/league/screens/LeagueScreen.tsx | 70 | inline style/object/array/function prop 5개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | onAction={() => loadLeague(currentNode?.id)} |
| Low | src/components/matches/liveMatchArena/GroupRoad.tsx | 51 | inline style/object/array/function prop 4개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[ |
| Low | src/features/auth/components/signup/SignupFormPrimitives.tsx | 35 | inline style/object/array/function prop 4개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[styles.input, !editable && styles.inputDisabled]} |
| Low | src/features/auth/screens/LoginScreen.tsx | 45 | inline style/object/array/function prop 4개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[styles.input, styles.passwordInput]} |
| Low | src/features/home/components/overview/HomePointCalendar.tsx | 29 | inline style/object/array/function prop 4개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[styles.calendarNavButton, calendarMonthOffset === 0 && styles.calendarNavButtonCurrent]} |
| Low | src/features/home/components/overview/HomePointGaugeCard.tsx | 43 | inline style/object/array/function prop 4개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[styles.pointTab, active && styles.pointTabActive]} |
| Low | src/features/integrations/components/IntegrationSourcesCards.tsx | 40 | inline style/object/array/function prop 4개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[styles.actionButton, styles.connectedBadge, actionSourceType === source.sourceType && styles.actionButtonDisabl… |
| Low | src/features/league/components/LeagueRankBadges.tsx | 16 | inline style/object/array/function prop 4개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[ |
| Low | src/features/profile/screens/MyActivityScreen.tsx | 15 | inline style/object/array/function prop 4개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <Link href={{ pathname: '/run-detail', params: { runId: run.id } }} asChild> |
| Low | src/features/runs/components/matchRoom/MatchRoomFriendInviteCard.tsx | 37 | inline style/object/array/function prop 4개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[styles.friendChip, isSelected ? styles.friendChipSelected : undefined]} |
| Low | src/features/runs/components/PartyRunHomePanel.tsx | 85 | inline style/object/array/function prop 4개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[styles.roomModeChip, optionIsSelected ? styles.roomModeChipSelected : undefined]} |
| Low | src/features/auth/components/signup/SignupRegionSection.tsx | 61 | inline style/object/array/function prop 3개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | onPress={() => setOpenRegionStep('province')} |
| Low | src/features/friends/components/FriendRequestsCard.tsx | 48 | inline style/object/array/function prop 3개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[styles.ghostButton, isActing && styles.disabledButton]} |
| Low | src/features/home/HomeOverview.tsx | 63 | inline style/object/array/function prop 3개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | onPreviousMonth={() => setCalendarMonthOffset((current) => current - 1)} |
| Low | src/features/league/screens/DistrictPersonalScreen.tsx | 14 | inline style/object/array/function prop 3개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <View style={[styles.rankRow, runner.isMe && styles.meRow]}> |
| Low | src/features/location/RegionSelection.tsx | 56 | inline style/object/array/function prop 3개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[styles.selectionChip, selected && styles.selectionChipSelected, disabled && styles.disabledButton]} |
| Low | src/features/runs/components/LiveMatchTrackingPage.tsx | 323 | inline style/object/array/function prop 3개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[styles.groupLiveRow, participant.isCurrentUser ? styles.groupLiveRowCurrent : undefined]} |
| Low | src/features/runs/components/MatchOptionSelector.tsx | 30 | inline style/object/array/function prop 3개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[styles.option, isSelected ? styles.optionSelected : styles.optionIdle]} |
| Low | src/features/runs/components/matchRoom/MatchRoomDistanceSettingsCard.tsx | 32 | inline style/object/array/function prop 3개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[styles.distanceChip, isSelected ? styles.distanceChipSelected : undefined]} |
| Low | src/features/settings/admin/components/UserAdminSection.tsx | 40 | inline style/object/array/function prop 3개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | keyExtractor={(user) => user.id} |
| Low | src/components/Screen.tsx | 30 | inline style/object/array/function prop 2개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <SafeAreaView style={styles.safe} edges={['top']}> |
| Low | src/components/ui/Button.tsx | 19 | inline style/object/array/function prop 2개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[ |
| Low | src/features/auth/screens/OnboardingScreen.tsx | 18 | inline style/object/array/function prop 2개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <PrimaryButton label="회원가입하고 시작" onPress={() => router.push('/signup')} /> |
| Low | src/features/friends/components/FriendListCard.tsx | 56 | inline style/object/array/function prop 2개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[ |
| Low | src/features/friends/components/FriendRankRow.tsx | 14 | inline style/object/array/function prop 2개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <Link href={{ pathname: '/friend-detail', params: { friendId: runner.id } }} asChild> |
| Low | src/features/friends/screens/FriendDetailScreen.tsx | 24 | inline style/object/array/function prop 2개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | href={{ pathname: '/run-detail', params: { runId: run.id, friendId } }} |
| Low | src/features/home/components/HomeUpcomingMatchesCard.tsx | 44 | inline style/object/array/function prop 2개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | onPress={() => onOpenMatch(match)} |
| Low | src/features/integrations/NativeHealthReadinessCard.tsx | 25 | inline style/object/array/function prop 2개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <View style={[styles.badge, badgeStyles[readiness.state]]}> |
| Low | src/features/match/screens/MatchRecordScreen.tsx | 31 | inline style/object/array/function prop 2개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <Link href={{ pathname: '/run-detail', params: { runId: run.id } }} asChild> |
| Low | src/features/profile/components/AccountActionsCard.tsx | 32 | inline style/object/array/function prop 2개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[ |
| Low | src/features/profile/screens/EditProfileScreen.tsx | 53 | inline style/object/array/function prop 2개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <SecondaryButton label="마이페이지로 돌아가기" onPress={() => router.replace('/(tabs)/mypage')} /> |
| Low | src/features/runs/components/LiveMatchExitActionCard.tsx | 72 | inline style/object/array/function prop 2개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[styles.button, actionState.disabled ? styles.buttonDisabled : undefined]} |
| Low | src/features/runs/components/LiveMatchPager.tsx | 80 | inline style/object/array/function prop 2개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[styles.tab, selected ? styles.tabSelected : undefined]} |
| Low | src/features/runs/components/MatchResultPanel.tsx | 35 | inline style/object/array/function prop 2개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[ |
| Low | src/features/runs/components/matchRoom/MatchRoomInviteActionCard.tsx | 26 | inline style/object/array/function prop 2개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[ |
| Low | src/features/runs/components/matchRoom/MatchRoomWheelColumn.tsx | 49 | inline style/object/array/function prop 2개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <Text style={[styles.wheelItemText, isSelected ? styles.wheelItemTextSelected : undefined]}> |
| Low | src/features/runs/components/PartyRunInviteCard.tsx | 37 | inline style/object/array/function prop 2개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[styles.declineButton, isBusy ? styles.buttonDisabled : undefined]} |
| Low | app/_layout.tsx | 40 | inline style/object/array/function prop 1개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <Stack screenOptions={{ headerShown: false }}> |
| Low | app/(tabs)/_layout.tsx | 22 | inline style/object/array/function prop 1개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | screenOptions={{ |
| Low | src/components/Card.tsx | 7 | inline style/object/array/function prop 1개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | return <View style={[styles.card, style]} {...rest}>{children}</View>; |
| Low | src/components/matches/AndroidLiveMatchPerfPanel.tsx | 50 | inline style/object/array/function prop 1개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <Text style={[styles.diagnosis, diagnosisStyle]}> |
| Low | src/components/matches/MatchStartCountdownOverlay.tsx | 15 | inline style/object/array/function prop 1개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <View style={[styles.overlay, variant === 'centered' ? styles.overlayCentered : null]} pointerEvents="none"> |
| Low | src/components/ranking/RankingItemRow.tsx | 28 | inline style/object/array/function prop 1개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[styles.row, friend && styles.friendRow, highlighted && styles.highlightedRow]} |
| Low | src/features/auth/components/signup/SignupSubmitSection.tsx | 63 | inline style/object/array/function prop 1개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[styles.primaryButton, (submitting \|\| catalogLoading \|\| Boolean(catalogError) \|\| !signupReady) ? styles.disabled… |
| Low | src/features/friends/screens/AddFriendScreen.tsx | 75 | inline style/object/array/function prop 1개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <SecondaryButton label="친구 화면으로 돌아가기" onPress={() => router.replace('/(tabs)/friends')} /> |
| Low | src/features/home/screens/HomeScreen.tsx | 41 | inline style/object/array/function prop 1개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | onCancelMatch={(match) => { |
| Low | src/features/integrations/NrcBridgeGuideCard.tsx | 82 | inline style/object/array/function prop 1개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | onToggle={() => setOpenSectionId((current) => (current === section.id ? null : section.id))} |
| Low | src/features/integrations/screens/IntegrationManagementScreen.tsx | 119 | inline style/object/array/function prop 1개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <SecondaryButton label={backLabel} onPress={() => router.replace(backHref)} /> |
| Low | src/features/integrations/screens/IntegrationsScreen.tsx | 102 | inline style/object/array/function prop 1개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | onAddManualRun={() => router.push('/add-run')} |
| Low | src/features/running/components/RunMatchResultCard.tsx | 25 | inline style/object/array/function prop 1개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[ |
| Low | src/features/running/components/RunPointBreakdownCard.tsx | 50 | inline style/object/array/function prop 1개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <Text style={[styles.pointBreakdownValue, highlight ? styles.pointBreakdownValueHighlight : null]}> |
| Low | src/features/running/screens/AddRunScreen.tsx | 94 | inline style/object/array/function prop 1개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <SecondaryButton label="내 활동으로 돌아가기" onPress={() => router.replace('/my-activity')} /> |
| Low | src/features/running/screens/RunDetailScreen.tsx | 82 | inline style/object/array/function prop 1개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | onPress={() => router.replace(backHref)} |
| Low | src/features/runs/components/PartyRunParticipantListCard.tsx | 43 | inline style/object/array/function prop 1개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | style={[styles.participantRow, participant.isInvitee ? styles.invitedParticipantRow : undefined]} |
| Low | src/features/runs/components/RunningReadyScreen.tsx | 32 | inline style/object/array/function prop 1개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <Card style={[styles.readyCard, readyCardStyle]}> |
| Low | src/features/settings/screens/RegionSettingsScreen.tsx | 88 | inline style/object/array/function prop 1개가 감지됐다. | 반복 렌더 경로라면 StyleSheet, 상수, useMemo/useCallback 또는 memoized row 컴포넌트로 분리한다. | <SecondaryButton label="마이페이지로 돌아가기" onPress={() => router.replace('/(tabs)/mypage')} /> |

## 렌더 중 sort/filter/map 후보

| 우선순위 | 파일 | 줄 | 이유 | 권장 조치 | 근거 |
| --- | --- | --- | --- | --- | --- |
| Medium | src/features/auth/components/universityVerification/UniversityVerificationContent.tsx | 65 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | {VERIFICATION_METHODS.map((method) => { |
| Medium | src/features/auth/components/universityVerification/UniversityVerificationContent.tsx | 105 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | {model.filteredUniversities.map((university) => { |
| Medium | src/features/auth/components/universityVerification/UniversityVerificationContent.tsx | 222 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | {steps.map((step, index) => ( |
| Medium | src/features/auth/components/universityVerification/UniversityVerificationContent.tsx | 235 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | {checklist.map((item) => ( |
| Medium | src/features/home/components/HomeUpcomingMatchesCard.tsx | 34 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | {matches.slice(0, 2).map((match) => { |
| Medium | src/features/home/components/overview/HomePointCalendar.tsx | 50 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | {calendar.weekdayLabels.map((label) => ( |
| Medium | src/features/home/components/overview/HomePointCalendar.tsx | 56 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | {calendarRows.map((row, rowIndex) => ( |
| Medium | src/features/home/components/overview/HomePointCalendar.tsx | 58 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | {row.map((cell) => ( |
| Medium | src/features/home/components/overview/HomePointGaugeCard.tsx | 37 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | {tracks.map((track) => { |
| Medium | src/features/home/screens/HomeScreen.tsx | 32 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | {notices.map((notice) => ( |
| Medium | src/features/integrations/components/IntegrationSourcesCards.tsx | 28 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | {sources.map((source) => { |
| Medium | src/features/integrations/components/IntegrationSourcesCards.tsx | 74 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | {sources.map((source) => { |
| Medium | src/features/integrations/components/nrcBridge/NrcBridgeGuideActions.tsx | 147 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | return buttons.map((button, index) => <Fragment key={`garmin-action-${index}`}>{button}</Fragment>); |
| Medium | src/features/integrations/components/nrcBridge/NrcBridgeGuideSection.tsx | 46 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | {section.steps.map((step, index) => ( |
| Medium | src/features/integrations/IntegrationJourneyCard.tsx | 132 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | {steps.map((step, index) => ( |
| Medium | src/features/integrations/IntegrationStatus.tsx | 18 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | {connectedSources.map((source) => { |
| Medium | src/features/integrations/NativeHealthReadinessCard.tsx | 31 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | {readiness.steps.map((step) => ( |
| Medium | src/features/integrations/NrcBridgeGuideCard.tsx | 74 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | {sections.map((section) => { |
| Medium | src/features/integrations/screens/ConnectSourcesScreen.tsx | 36 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | const connectedCount = sources.filter((source) => source.connected).length; |
| Medium | src/features/integrations/screens/ConnectSourcesScreen.tsx | 73 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | {recommended.map((source) => { |
| Medium | src/features/league/components/LeagueRegionSelectorCard.tsx | 61 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | {breadcrumbNodes.length > 0 ? breadcrumbNodes.map((node, index) => { |
| Medium | src/features/location/RegionSelection.tsx | 50 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | {options.map((option) => { |
| Medium | src/features/match/screens/MatchRecordScreen.tsx | 28 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | ].filter(Boolean).join(' · '); |
| Medium | src/features/profile/components/ProfileEnvironmentDebugCard.tsx | 34 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | {rows.map(([label, value]) => ( |
| Medium | src/features/profile/components/ProfileSummaryCard.tsx | 29 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | {[profile.districtName, profile.universityName].filter(Boolean).join(' · ') \|\| '대학교 인증 전'} |
| Medium | src/features/runs/components/MatchOptionSelector.tsx | 24 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | {options.map((option) => { |
| Medium | src/features/runs/components/matchRoom/MatchRoomDistanceSettingsCard.tsx | 27 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | {MATCH_ROOM_DISTANCE_OPTIONS.map((optionKm) => { |
| Medium | src/features/runs/components/matchRoom/MatchRoomFriendInviteCard.tsx | 32 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | {friendOptions.map((friend) => { |
| Medium | src/features/runs/components/matchRoom/MatchRoomFriendInviteCard.tsx | 40 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | ? selectedFriendIds.filter((id) => id !== friend.id) |
| Medium | src/features/runs/components/matchRoom/MatchRoomStartModeCard.tsx | 45 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | ]).map((option) => { |
| Medium | src/features/runs/components/matchSetupCards/GroupMatchSetupCard.tsx | 139 | 렌더링 경로 근처에서 반복 계산이 감지됐다. | 결과를 useMemo로 분리하고, 리스트 렌더는 renderItem/useCallback 경계를 확인한다. | {participants.slice(0, 3).map((participant) => ( |

## useEffect가 많은 파일

| 우선순위 | 파일 | 줄 | 이유 | 권장 조치 | 근거 |
| --- | --- | --- | --- | --- | --- |
| High | src/features/runs/TrackRunExperience.tsx |  | effect가 많아 dependency 변경과 cleanup 회귀 위험이 높다. | effect를 책임별 hook으로 분리하고, dependency/result dedupe 테스트를 추가한다. | useEffect=12, useFocusEffect=1 |
| Medium | src/components/matches/LiveMatchArena.tsx |  | effect가 많아 dependency 변경과 cleanup 회귀 위험이 높다. | effect를 책임별 hook으로 분리하고, dependency/result dedupe 테스트를 추가한다. | useEffect=6, useFocusEffect=0 |
| Medium | src/features/match/hooks/lobby/useRoomSnapshot.ts |  | effect가 많아 dependency 변경과 cleanup 회귀 위험이 높다. | effect를 책임별 hook으로 분리하고, dependency/result dedupe 테스트를 추가한다. | useEffect=4, useFocusEffect=1 |
| Medium | src/features/runs/components/TrackRunExperienceView.tsx |  | effect가 많아 dependency 변경과 cleanup 회귀 위험이 높다. | effect를 책임별 hook으로 분리하고, dependency/result dedupe 테스트를 추가한다. | useEffect=4, useFocusEffect=0 |

## useMemo/useCallback 없이 props를 많이 만드는 후보

| 우선순위 | 파일 | 줄 | 이유 | 권장 조치 | 근거 |
| --- | --- | --- | --- | --- | --- |
| High | src/features/settings/admin/components/RaceAdminSection.tsx |  | props/object/function을 많이 만들지만 memo/callback 경계가 감지되지 않았다. | 반복 렌더가 있는 화면이면 props 생성 hook 또는 memoized child로 분리한다. | inline props=21, useMemo/useCallback=0 |
| High | src/features/settings/admin/components/MarketAdminSection.tsx |  | props/object/function을 많이 만들지만 memo/callback 경계가 감지되지 않았다. | 반복 렌더가 있는 화면이면 props 생성 hook 또는 memoized child로 분리한다. | inline props=19, useMemo/useCallback=0 |
| High | src/features/match/screens/MatchRoomScreen.tsx |  | props/object/function을 많이 만들지만 memo/callback 경계가 감지되지 않았다. | 반복 렌더가 있는 화면이면 props 생성 hook 또는 memoized child로 분리한다. | inline props=13, useMemo/useCallback=0 |
| High | src/features/settings/admin/components/NoticeAdminSection.tsx |  | props/object/function을 많이 만들지만 memo/callback 경계가 감지되지 않았다. | 반복 렌더가 있는 화면이면 props 생성 hook 또는 memoized child로 분리한다. | inline props=13, useMemo/useCallback=0 |
| High | src/features/settings/admin/components/RedemptionAdminSection.tsx |  | props/object/function을 많이 만들지만 memo/callback 경계가 감지되지 않았다. | 반복 렌더가 있는 화면이면 props 생성 hook 또는 memoized child로 분리한다. | inline props=12, useMemo/useCallback=0 |
| Medium | src/features/auth/components/universityVerification/UniversityVerificationContent.tsx |  | props/object/function을 많이 만들지만 memo/callback 경계가 감지되지 않았다. | 반복 렌더가 있는 화면이면 props 생성 hook 또는 memoized child로 분리한다. | inline props=10, useMemo/useCallback=0 |
| Medium | src/features/auth/components/signup/SignupCredentialsSection.tsx |  | props/object/function을 많이 만들지만 memo/callback 경계가 감지되지 않았다. | 반복 렌더가 있는 화면이면 props 생성 hook 또는 memoized child로 분리한다. | inline props=9, useMemo/useCallback=0 |
| Medium | src/features/runs/components/matchRoom/MatchRoomStartModeCard.tsx |  | props/object/function을 많이 만들지만 memo/callback 경계가 감지되지 않았다. | 반복 렌더가 있는 화면이면 props 생성 hook 또는 memoized child로 분리한다. | inline props=8, useMemo/useCallback=0 |
| Medium | src/features/settings/screens/NotificationSettingsScreen.tsx |  | props/object/function을 많이 만들지만 memo/callback 경계가 감지되지 않았다. | 반복 렌더가 있는 화면이면 props 생성 hook 또는 memoized child로 분리한다. | inline props=8, useMemo/useCallback=0 |
| Medium | src/features/auth/screens/AccountRecoveryScreen.tsx |  | props/object/function을 많이 만들지만 memo/callback 경계가 감지되지 않았다. | 반복 렌더가 있는 화면이면 props 생성 hook 또는 memoized child로 분리한다. | inline props=7, useMemo/useCallback=0 |
| Medium | src/features/friends/screens/FriendsScreen.tsx |  | props/object/function을 많이 만들지만 memo/callback 경계가 감지되지 않았다. | 반복 렌더가 있는 화면이면 props 생성 hook 또는 memoized child로 분리한다. | inline props=7, useMemo/useCallback=0 |
| Medium | src/features/settings/admin/components/AdminPrimitives.tsx |  | props/object/function을 많이 만들지만 memo/callback 경계가 감지되지 않았다. | 반복 렌더가 있는 화면이면 props 생성 hook 또는 memoized child로 분리한다. | inline props=7, useMemo/useCallback=0 |
| Medium | src/features/integrations/components/nrcBridge/NrcBridgeGuideActions.tsx |  | props/object/function을 많이 만들지만 memo/callback 경계가 감지되지 않았다. | 반복 렌더가 있는 화면이면 props 생성 hook 또는 memoized child로 분리한다. | inline props=6, useMemo/useCallback=0 |
| Medium | src/features/league/components/LeagueModeSwitch.tsx |  | props/object/function을 많이 만들지만 memo/callback 경계가 감지되지 않았다. | 반복 렌더가 있는 화면이면 props 생성 hook 또는 memoized child로 분리한다. | inline props=6, useMemo/useCallback=0 |
| Medium | src/features/settings/screens/AdminScreen.tsx |  | props/object/function을 많이 만들지만 memo/callback 경계가 감지되지 않았다. | 반복 렌더가 있는 화면이면 props 생성 hook 또는 memoized child로 분리한다. | inline props=6, useMemo/useCallback=0 |
| Medium | src/features/auth/components/signup/SignupProfileSection.tsx |  | props/object/function을 많이 만들지만 memo/callback 경계가 감지되지 않았다. | 반복 렌더가 있는 화면이면 props 생성 hook 또는 memoized child로 분리한다. | inline props=5, useMemo/useCallback=0 |
| Medium | src/features/integrations/IntegrationJourneyCard.tsx |  | props/object/function을 많이 만들지만 memo/callback 경계가 감지되지 않았다. | 반복 렌더가 있는 화면이면 props 생성 hook 또는 memoized child로 분리한다. | inline props=5, useMemo/useCallback=0 |
| Medium | src/features/integrations/screens/ConnectSourcesScreen.tsx |  | props/object/function을 많이 만들지만 memo/callback 경계가 감지되지 않았다. | 반복 렌더가 있는 화면이면 props 생성 hook 또는 memoized child로 분리한다. | inline props=5, useMemo/useCallback=0 |
| Medium | src/features/league/screens/LeagueScreen.tsx |  | props/object/function을 많이 만들지만 memo/callback 경계가 감지되지 않았다. | 반복 렌더가 있는 화면이면 props 생성 hook 또는 memoized child로 분리한다. | inline props=5, useMemo/useCallback=0 |

## services 밖 fetch/api 호출 후보

없음


## utils/domain 밖 계산 로직 후보

| 우선순위 | 파일 | 줄 | 이유 | 권장 조치 | 근거 |
| --- | --- | --- | --- | --- | --- |
| High | backend/src/server.mjs |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=172, sort/filter/map=160 |
| High | src/lib/api/services/mock/matchSessions.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=23, sort/filter/map=12 |
| High | src/lib/api/services/mock/matchScheduling.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=22, sort/filter/map=8 |
| High | backend/src/store.mjs |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=7, sort/filter/map=9 |
| High | src/features/integrations/sourceCatalog.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=1, sort/filter/map=8 |
| High | src/lib/api/services/mock/state.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=0, sort/filter/map=9 |
| Medium | src/data/mock.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=46, sort/filter/map=2 |
| Medium | backend/src/seed.mjs |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=28, sort/filter/map=5 |
| Medium | backend/src/points.mjs |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=23, sort/filter/map=5 |
| Medium | src/lib/api/services/matches.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=20, sort/filter/map=6 |
| Medium | src/features/runs/components/LiveMatchTrackingPage.tsx |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=19, sort/filter/map=1 |
| Medium | backend/src/smoke.mjs |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=17, sort/filter/map=2 |
| Medium | src/lib/api/services/mock/league.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=13, sort/filter/map=6 |
| Medium | src/lib/api/services/mock/rooms.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=9, sort/filter/map=7 |
| Medium | src/integrations/nativeHealth.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=13, sort/filter/map=1 |
| Medium | src/lib/api/services/runs.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=14, sort/filter/map=0 |
| Medium | backend/src/runningMatchContract.test.mjs |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=11, sort/filter/map=0 |
| Medium | src/features/league/leagueRanking.test.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=8, sort/filter/map=3 |
| Medium | src/features/league/components/LeagueRankBadges.tsx |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=9, sort/filter/map=0 |
| Medium | src/features/points/pointSystem.test.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=8, sort/filter/map=1 |
| Medium | src/features/points/pointSystem.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=8, sort/filter/map=1 |
| Medium | src/features/runs/sync/activeRoomResult.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=5, sort/filter/map=4 |
| Medium | src/lib/api/services/integrations.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=4, sort/filter/map=5 |
| Medium | src/lib/api/services/rooms.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=5, sort/filter/map=4 |
| Medium | backend/src/routing.mjs |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=7, sort/filter/map=1 |
| Medium | src/lib/api/services/runningRoomResponseGuards.test.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=8, sort/filter/map=0 |
| Medium | src/components/matches/liveMatchArena/helpers.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=3, sort/filter/map=4 |
| Medium | src/features/runs/hooks/usePartyRunRoom.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=5, sort/filter/map=2 |
| Medium | src/features/runs/TrackRunExperience.tsx |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=5, sort/filter/map=2 |
| Medium | src/lib/api/services/friends.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=3, sort/filter/map=4 |
| Medium | src/components/matches/liveMatchArena/RoadMotion.tsx |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=2, sort/filter/map=4 |
| Medium | src/features/location/addressCatalog.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=0, sort/filter/map=6 |
| Medium | src/features/match/screens/MatchRecordScreen.tsx |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=5, sort/filter/map=1 |
| Medium | src/lib/api/services/mock/races.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=0, sort/filter/map=6 |
| Medium | backend/src/auth.mjs |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=5, sort/filter/map=0 |
| Medium | src/features/running/hooks/useAddRunForm.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=5, sort/filter/map=0 |
| Medium | src/lib/matchCountdown.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=1, sort/filter/map=4 |
| Medium | src/features/auth/components/universityVerification/UniversityVerificationContent.tsx |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=0, sort/filter/map=4 |
| Medium | src/features/profile/hooks/useMyPageScreen.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=0, sort/filter/map=4 |
| Medium | src/features/runs/components/matchSetupCards/MatchSetupCommon.tsx |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=0, sort/filter/map=4 |
| Medium | src/lib/api/services/runningRoomResponseGuards.ts |  | 계산/정렬/포맷 로직 신호가 화면, hook, service 등에 남아 있다. | 순수 계산은 feature utils/domain으로 분리하고 테스트를 붙인다. | calculation signals=0, sort/filter/map=4 |

## types 밖 타입 선언 후보

| 우선순위 | 파일 | 줄 | 이유 | 권장 조치 | 근거 |
| --- | --- | --- | --- | --- | --- |
| High | src/features/runs/lifecycle/matchStateMachine.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=16 |
| High | src/features/runs/components/matchSetupCards/types.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=8 |
| High | src/features/runs/lifecycle/hooks/useRunningMatchFocus.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=8 |
| High | src/features/runs/viewModels/matchProgress.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=8 |
| Medium | src/features/runs/hooks/useRunSaveFlow.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=7 |
| Medium | src/features/runs/lifecycle/matchRoomFlow.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=7 |
| Medium | src/features/runs/sync/activeRoomCheck.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=7 |
| Medium | src/features/runs/lifecycle/matchLifecycleController.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=6 |
| Medium | src/integrations/nativeHealth.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=6 |
| Medium | src/lib/session/types.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=6 |
| Medium | src/features/runs/hooks/matchLifecycle/types.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=5 |
| Medium | src/components/matches/liveMatchPerfQaLog.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=4 |
| Medium | src/features/integrations/components/IntegrationSourcesCards.tsx |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=4 |
| Medium | src/features/integrations/components/nrcBridge/types.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=4 |
| Medium | src/features/runs/components/TrackRunExperienceView.tsx |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=4 |
| Medium | src/features/runs/tracking/background/snapshotStore.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=4 |
| Medium | src/features/runs/viewModels/matchResultModel.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=4 |
| Medium | src/utils/rgPerfTrace.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=4 |
| Medium | src/components/matches/useAndroidLiveMatchPerfProbe.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/friends/components/FriendListCard.tsx |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/league/utils/leagueScore.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/running/components/RunDetailInfoCard.tsx |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/running/components/RunMatchResultCard.tsx |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/running/components/RunPointBreakdownCard.tsx |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/running/components/RunSummaryCards.tsx |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/runs/components/LiveMatchPager.tsx |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/runs/components/LiveMatchTrackingPage.tsx |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/runs/components/MatchOptionSelector.tsx |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/runs/components/MatchResultPanel.tsx |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/runs/hooks/useMatchSelectionModel.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/runs/lifecycle/hooks/useCountdownHandoffEffect.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/runs/lifecycle/hooks/useLiveMatchNavigationEffects.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/runs/lifecycle/liveMatchNavigationGate.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/runs/sync/partyRunSync/types.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/runs/sync/roomInviteInbox.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/runs/tracking/background/locationTaskManagerCore.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/runs/tracking/background/locationTaskPolicy.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/runs/utils/matchScheduling.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/runs/viewModels/liveMatchRaceBoardViewModel.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/runs/viewModels/matchViewModels.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/runs/viewModels/useLiveMatchViewModel.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/features/settings/admin/types.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/integrations/provider.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/lib/api/services/runningRoomResponseGuards.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/lib/api/services/runningRunResponseGuards.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/navigation/matchReminderNotificationRouting.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/utils/marketRedemption.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/utils/rgHeartbeatRegistry.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |
| Medium | src/utils/rgPollingRegistry.ts |  | 여러 타입/interface 선언이 types/domain 경계 밖에 있다. | 공유 타입이면 feature types 또는 domain/api types로 이동하고, local-only 타입이면 파일 하단에 좁게 유지한다. | type/interface declarations=3 |

## setInterval/setTimeout/subscription cleanup 의심 후보

| 우선순위 | 파일 | 줄 | 이유 | 권장 조치 | 근거 |
| --- | --- | --- | --- | --- | --- |
| High | src/features/runs/sync/matchPolling/useBlockingMatchStatusPolling.ts | 165 | effect 내부에 timer/subscription 후보가 있지만 cleanup 패턴이 같은 block에서 감지되지 않았다. | unmount, dependency 변경, focus 해제 시 clear/remove/stop이 보장되는지 확인한다. | useEffect(() => { |
| Medium | src/features/runs/sync/activeRoomCheck.test.ts |  | 파일에 timer가 있지만 clearTimeout/clearInterval 패턴이 없다. | non-blocking timeout인지, cleanup이 외부 registry에서 보장되는지 확인한다. | setTimeout/setInterval without clear pattern |
| Medium | src/utils/rgInputTrace.ts |  | 파일에 timer가 있지만 clearTimeout/clearInterval 패턴이 없다. | non-blocking timeout인지, cleanup이 외부 registry에서 보장되는지 확인한다. | setTimeout/setInterval without clear pattern |
| Medium | backend/src/runningMatchContract.test.mjs |  | 파일에 timer가 있지만 clearTimeout/clearInterval 패턴이 없다. | non-blocking timeout인지, cleanup이 외부 registry에서 보장되는지 확인한다. | setTimeout/setInterval without clear pattern |
| Medium | backend/src/smoke.mjs |  | 파일에 timer가 있지만 clearTimeout/clearInterval 패턴이 없다. | non-blocking timeout인지, cleanup이 외부 registry에서 보장되는지 확인한다. | setTimeout/setInterval without clear pattern |
| Medium | src/features/friends/hooks/useAddFriendScreen.ts |  | 파일에 timer가 있지만 clearTimeout/clearInterval 패턴이 없다. | non-blocking timeout인지, cleanup이 외부 registry에서 보장되는지 확인한다. | setTimeout/setInterval without clear pattern |
| Medium | scripts/check-public-backend-domain.mjs |  | 파일에 timer가 있지만 clearTimeout/clearInterval 패턴이 없다. | non-blocking timeout인지, cleanup이 외부 registry에서 보장되는지 확인한다. | setTimeout/setInterval without clear pattern |
| Medium | scripts/deploy-public-backend.mjs |  | 파일에 timer가 있지만 clearTimeout/clearInterval 패턴이 없다. | non-blocking timeout인지, cleanup이 외부 registry에서 보장되는지 확인한다. | setTimeout/setInterval without clear pattern |
| Medium | scripts/sync-preview-eas-env.mjs |  | 파일에 timer가 있지만 clearTimeout/clearInterval 패턴이 없다. | non-blocking timeout인지, cleanup이 외부 registry에서 보장되는지 확인한다. | setTimeout/setInterval without clear pattern |
| Medium | src/features/profile/hooks/useEditProfile.ts |  | 파일에 timer가 있지만 clearTimeout/clearInterval 패턴이 없다. | non-blocking timeout인지, cleanup이 외부 registry에서 보장되는지 확인한다. | setTimeout/setInterval without clear pattern |
| Medium | src/features/profile/hooks/useMyPageScreen.ts |  | 파일에 timer가 있지만 clearTimeout/clearInterval 패턴이 없다. | non-blocking timeout인지, cleanup이 외부 registry에서 보장되는지 확인한다. | setTimeout/setInterval without clear pattern |
| Medium | src/features/runs/sync/staleRoomCleanup.test.ts |  | 파일에 timer가 있지만 clearTimeout/clearInterval 패턴이 없다. | non-blocking timeout인지, cleanup이 외부 registry에서 보장되는지 확인한다. | setTimeout/setInterval without clear pattern |
| Medium | src/features/settings/hooks/useNotificationSettings.ts |  | 파일에 timer가 있지만 clearTimeout/clearInterval 패턴이 없다. | non-blocking timeout인지, cleanup이 외부 registry에서 보장되는지 확인한다. | setTimeout/setInterval without clear pattern |
| Medium | src/features/settings/hooks/useRegionSettings.ts |  | 파일에 timer가 있지만 clearTimeout/clearInterval 패턴이 없다. | non-blocking timeout인지, cleanup이 외부 registry에서 보장되는지 확인한다. | setTimeout/setInterval without clear pattern |
| Medium | src/utils/rgPerfTrace.ts |  | 파일에 timer가 있지만 clearTimeout/clearInterval 패턴이 없다. | non-blocking timeout인지, cleanup이 외부 registry에서 보장되는지 확인한다. | setTimeout/setInterval without clear pattern |

## Location/watchPosition/background task 사용 후보

| 우선순위 | 파일 | 줄 | 이유 | 권장 조치 | 근거 |
| --- | --- | --- | --- | --- | --- |
| High | scripts/analyze-code-quality.mjs | 173 | 위치 watcher/background task/AppState 관련 코드가 감지됐다. | single-flight, appState guard, cleanup, timeout이 테스트로 보장되는지 확인한다. | /\\b(?:Location\\.\|watchPositionAsync\|startLocationUpdatesAsync\|stopLocationUpdatesAsync\|TaskManager\|background task\|Back… |
| High | scripts/check-performance-smells.mjs | 183 | 위치 watcher/background task/AppState 관련 코드가 감지됐다. | single-flight, appState guard, cleanup, timeout이 테스트로 보장되는지 확인한다. | /watchPositionAsync\\(/, |
| High | src/features/match/hooks/lobby/useRoomSnapshot.ts | 3 | 위치 watcher/background task/AppState 관련 코드가 감지됐다. | single-flight, appState guard, cleanup, timeout이 테스트로 보장되는지 확인한다. | import { AppState, Platform } from 'react-native'; |
| High | scripts/analyze-android-perf-trace.mjs |  | 위치 watcher/background task/AppState 관련 코드가 감지됐다. | single-flight, appState guard, cleanup, timeout이 테스트로 보장되는지 확인한다. | signals=2 |
| High | src/features/runs/hooks/useRunTracking.ts | 2 | 위치 watcher/background task/AppState 관련 코드가 감지됐다. | single-flight, appState guard, cleanup, timeout이 테스트로 보장되는지 확인한다. | import { AppState } from 'react-native'; |
| Medium | src/features/runs/tracking/background/backgroundSubscription.ts | 18 | 위치 watcher/background task/AppState 관련 코드가 감지됐다. | single-flight, appState guard, cleanup, timeout이 테스트로 보장되는지 확인한다. | const started = await Location.hasStartedLocationUpdatesAsync(taskName); |
| Medium | src/features/runs/tracking/background/locationTask.ts | 3 | 위치 watcher/background task/AppState 관련 코드가 감지됐다. | single-flight, appState guard, cleanup, timeout이 테스트로 보장되는지 확인한다. | import * as TaskManager from 'expo-task-manager'; |
| Medium | src/features/runs/tracking/background/locationTaskManager.test.ts |  | 위치 watcher/background task/AppState 관련 코드가 감지됐다. | single-flight, appState guard, cleanup, timeout이 테스트로 보장되는지 확인한다. | signals=7 |
| Medium | src/features/runs/tracking/background/locationTaskManagerCore.ts |  | 위치 watcher/background task/AppState 관련 코드가 감지됐다. | single-flight, appState guard, cleanup, timeout이 테스트로 보장되는지 확인한다. | signals=7 |
| Medium | src/features/runs/tracking/background/locationTaskPolicy.test.ts |  | 위치 watcher/background task/AppState 관련 코드가 감지됐다. | single-flight, appState guard, cleanup, timeout이 테스트로 보장되는지 확인한다. | signals=6 |
| Medium | src/features/runs/tracking/background/foregroundSubscription.ts | 8 | 위치 watcher/background task/AppState 관련 코드가 감지됐다. | single-flight, appState guard, cleanup, timeout이 테스트로 보장되는지 확인한다. | function buildForegroundLocationOptions(): Location.LocationOptions { |
| Medium | src/features/runs/tracking/useLocationTracking.ts | 27 | 위치 watcher/background task/AppState 관련 코드가 감지됐다. | single-flight, appState guard, cleanup, timeout이 테스트로 보장되는지 확인한다. | const foregroundPermission = await Location.requestForegroundPermissionsAsync(); |
| Medium | src/features/runs/tracking/background/locationDistance.ts | 44 | 위치 watcher/background task/AppState 관련 코드가 감지됐다. | single-flight, appState guard, cleanup, timeout이 테스트로 보장되는지 확인한다. | export function resolveLocationTimestampMs(location: Location.LocationObject) { |
| Medium | src/features/runs/tracking/trackingSession.ts | 146 | 위치 watcher/background task/AppState 관련 코드가 감지됐다. | single-flight, appState guard, cleanup, timeout이 테스트로 보장되는지 확인한다. | export function buildRoutePoint(location: Location.LocationObject): RunRoutePoint { |
| Medium | src/features/runs/tracking/useTrackingAppStateSync.ts | 3 | 위치 watcher/background task/AppState 관련 코드가 감지됐다. | single-flight, appState guard, cleanup, timeout이 테스트로 보장되는지 확인한다. | import { AppState } from 'react-native'; |
| Medium | src/features/runs/tracking/background/index.ts | 105 | 위치 watcher/background task/AppState 관련 코드가 감지됐다. | single-flight, appState guard, cleanup, timeout이 테스트로 보장되는지 확인한다. | initialLocation?: Location.LocationObject \| null, |
| Medium | src/features/runs/tracking/background/locationTaskPolicy.ts |  | 위치 watcher/background task/AppState 관련 코드가 감지됐다. | single-flight, appState guard, cleanup, timeout이 테스트로 보장되는지 확인한다. | signals=1 |
| Medium | src/features/runs/tracking/background/routeAccumulator.ts | 141 | 위치 watcher/background task/AppState 관련 코드가 감지됐다. | single-flight, appState guard, cleanup, timeout이 테스트로 보장되는지 확인한다. | export function appendTrackedLocation(location: Location.LocationObject) { |

## 동일/유사 역할 파일 후보

| 우선순위 | 파일 | 줄 | 이유 | 권장 조치 | 근거 |
| --- | --- | --- | --- | --- | --- |
| High | Card 계열 |  | Card 계열 파일이 42개 있다. | 공통 primitive와 feature-specific wrapper 경계를 다시 확인한다. | src/features/league/components/LeagueRegionSelectorCard.tsx, src/features/integrations/IntegrationJourneyCard.tsx, src/… |
| High | Repository 계열 |  | Repository 계열 파일이 22개 있다. | 공통 primitive와 feature-specific wrapper 경계를 다시 확인한다. | backend/src/repositories/postgresFriendsRepository.mjs, backend/src/repositories/postgresRunsRepository.mjs, backend/sr… |
| Medium | Route 계열 |  | Route 계열 파일이 13개 있다. | 공통 primitive와 feature-specific wrapper 경계를 다시 확인한다. | src/features/runs/tracking/background/routeAccumulator.ts, backend/src/routes/adminRoutes.mjs, src/features/runs/RunRou… |
| Medium | Service 계열 |  | Service 계열 파일이 11개 있다. | 공통 primitive와 feature-specific wrapper 경계를 다시 확인한다. | src/services/matchService.ts, src/services/authService.ts, src/services/runningService.ts, src/services/friendsService.… |
| Medium | Ranking 계열 |  | Ranking 계열 파일이 8개 있다. | 공통 primitive와 feature-specific wrapper 경계를 다시 확인한다. | src/features/friends/components/friendsRankingStyles.ts, src/features/friends/FriendsRanking.tsx, src/features/league/c… |
| Medium | league |  | 같은 basename을 가진 파일 6개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | src/lib/api/services/mock/league.ts, src/lib/api/services/league.ts, src/domain/league.ts, src/lib/api/types/league.ts,… |
| Medium | friends |  | 같은 basename을 가진 파일 5개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | src/lib/api/services/friends.ts, src/lib/api/services/mock/friends.ts, src/lib/api/types/friends.ts, src/domain/friends… |
| Medium | market |  | 같은 basename을 가진 파일 5개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | src/lib/api/services/market.ts, src/domain/market.ts, src/lib/api/services/mock/market.ts, src/lib/api/types/market.ts,… |
| Medium | integrations |  | 같은 basename을 가진 파일 4개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | src/lib/api/services/integrations.ts, src/domain/integrations.ts, src/lib/api/services/mock/integrations.ts, app/(tabs)… |
| Medium | admin |  | 같은 basename을 가진 파일 3개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | src/lib/api/admin.ts, src/lib/api/types/admin.ts, app/admin.tsx |
| Medium | config |  | 같은 basename을 가진 파일 3개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | backend/src/config.mjs, src/components/matches/liveMatchArena/config.ts, src/lib/api/config.ts |
| Medium | matches |  | 같은 basename을 가진 파일 3개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | src/lib/api/services/matches.ts, src/lib/api/types/matches.ts, src/lib/api/services/mock/matches.ts |
| Medium | rooms |  | 같은 basename을 가진 파일 3개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | src/lib/api/services/rooms.ts, src/lib/api/types/rooms.ts, src/lib/api/services/mock/rooms.ts |
| Medium | _layout |  | 같은 basename을 가진 파일 2개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | app/_layout.tsx, app/(tabs)/_layout.tsx |
| Medium | addresscatalog |  | 같은 basename을 가진 파일 2개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | src/features/location/addressCatalog.ts, backend/src/addressCatalog.mjs |
| Medium | auth |  | 같은 basename을 가진 파일 2개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | backend/src/auth.mjs, src/lib/api/services/mock/auth.ts |
| Medium | home |  | 같은 basename을 가진 파일 2개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | src/lib/api/services/home.ts, app/(tabs)/home.tsx |
| Medium | homeoverview |  | 같은 basename을 가진 파일 2개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | src/features/home/HomeOverview.tsx, src/features/home/utils/homeOverview.ts |
| Medium | matchprogress |  | 같은 basename을 가진 파일 2개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | src/features/runs/viewModels/matchProgress.ts, src/lib/api/services/mock/matchProgress.ts |
| Medium | matchscheduling |  | 같은 basename을 가진 파일 2개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | src/lib/api/services/mock/matchScheduling.ts, src/features/runs/utils/matchScheduling.ts |
| Medium | phoneverification |  | 같은 basename을 가진 파일 2개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | backend/src/phoneVerification.mjs, src/lib/session/phoneVerification.ts |
| Medium | points |  | 같은 basename을 가진 파일 2개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | backend/src/points.mjs, src/domain/points.ts |
| Medium | pointsystem |  | 같은 basename을 가진 파일 2개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | src/features/points/pointSystem.ts, src/features/points/types/pointSystem.ts |
| Medium | profile |  | 같은 basename을 가진 파일 2개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | src/lib/api/services/profile.ts, src/lib/api/types/profile.ts |
| Medium | races |  | 같은 basename을 가진 파일 2개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | src/lib/api/services/mock/races.ts, src/lib/api/services/races.ts |
| Medium | running |  | 같은 basename을 가진 파일 2개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | src/domain/running.ts, app/(tabs)/running.tsx |
| Medium | runs |  | 같은 basename을 가진 파일 2개가 있다. | 역할이 같은지 확인하고, 공통 컴포넌트/유틸로 묶을 수 있는지 검토한다. | src/lib/api/services/runs.ts, src/lib/api/types/runs.ts |

## 해석 규칙

- 이 리포트는 정적 휴리스틱이라 false positive가 있을 수 있습니다.
- High 항목은 먼저 눈으로 확인하고, 기능 변경 없이 작은 단위로 분리하는 것을 권장합니다.
- `ScrollView + map`, timer/subscription, Location/background task 항목은 Android 실기기 로그와 함께 확인하세요.
- `services 밖 API 호출`은 frontend 기준입니다. backend smoke/scripts의 직접 fetch는 별도 CLI 용도로 허용될 수 있습니다.
- generated report 자체는 스캔 대상에서 제외합니다.
