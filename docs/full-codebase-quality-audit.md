# RunningGround Full Codebase Quality Audit

생성일: 2026-05-18

기준 문서와 입력:

- `docs/code-quality-audit.md`
- `docs/code-quality-report.generated.md`
- `docs/refactor-roadmap.md`
- `docs/handoff/codex-audit-plan.md`
- 실제 파일 스캔 결과

전제:

- PR #3 `perf/match-sync-and-startup`은 머지된 상태로 가정한다.
- PR #3의 perf 영역은 잔여 작업을 `PR-03b`로 분리해 다룬다.
- 이 문서는 감사 문서이며 앱/백엔드 코드를 수정하지 않는다.

## 1. Summary

### 가장 큰 파일 TOP 10

| 순위 | 파일 | 줄 | 현재 문제 | 왜 위험한지 | 추천 분리 방향 | 위험도 | 테스트 필요 |
| --- | --- | ---: | --- | --- | --- | --- | --- |
| 1 | `backend/src/server.mjs` | 6190 | route, repository wiring, response builder, running match flow가 한 파일에 집중 | API response shape 회귀와 write route 부작용 위험이 큼 | read-only routes, response helpers, command services 순서로 분리 | P0 | 필요 |
| 2 | `src/features/runs/runtime/TrackRunExperienceRuntimeModel.tsx` | 1944 | idle/lobby/live runtime 조립과 action bridge가 집중 | Android startup, stale state, navigation handoff 회귀의 중심 | shell별 runtime model과 action adapter 추가 분리 | P0 | 필요 |
| 3 | `backend/src/smoke.mjs` | 1013 | smoke scenario가 단일 CLI에 큼 | backend route 분리 시 실패 위치 파악이 어려움 | scenario helper와 assertion helper 분리 | P2 | 필요 |
| 4 | `backend/src/runningMatchContract.test.mjs` | 898 | running match contract 테스트가 매우 큼 | 테스트 유지보수 비용 증가 | room, invite, progress, forfeit scenario별 분리 | P2 | 필요 |
| 5 | `src/features/runs/runtime/useTrackRunRuntimeRecipientInviteInbox.ts` | 722 | receiver inbox fetch, retry, stale ignore, focus effect가 집중 | 초대 수신 누락과 live/joined 반복 fetch 회귀 위험 | idle/pre-lobby owner, timeout retry, display model 분리 | P0 | 필요 |
| 6 | `backend/src/repositories/postgresFriendsRepository.mjs` | 715 | query, mapper, command가 집중 | repository parity와 response mapper 변경 위험 | query builders, row mappers, commands 분리 | P2 | 필요 |
| 7 | `backend/src/repositories/postgresRunsRepository.mjs` | 639 | run query와 stats mapping이 큼 | 기록 저장/랭킹 반영 회귀 위험 | run commands, metrics mappers 분리 | P2 | 필요 |
| 8 | `src/lib/session.ts` | 561 | auth/session API, storage, profile hydration 책임 혼재 | 앱 시작/로그인 회귀 위험 | session store, auth service, profile mapper 분리 | P1 | 필요 |
| 9 | `src/features/runs/sync/activeRoomCheck.ts` | 489 | single-flight, timeout, abort, stale policy가 집중 | stale room rehydration과 slow trace false positive 위험 | request registry, stale policy, result mapper 분리 | P0 | 필요 |
| 10 | `src/features/runs/viewModels/liveMatchRaceBoardViewModel.ts` | 463 | participants/progress/ranking row build가 큼 | 상대 row 누락과 UI 표시 회귀 위험 | participant-first builder, progress merge helper 분리 | P1 | 필요 |

### 가장 긴 함수/hook TOP 10

| 순위 | 파일 | 함수/hook | 길이 | 현재 문제 | 추천 분리 방향 | 위험도 | 테스트 필요 |
| --- | --- | --- | ---: | --- | --- | --- | --- |
| 1 | `src/features/runs/runtime/TrackRunExperienceRuntimeModel.tsx` | `TrackRunExperienceRuntime` | 1798 | runtime model, room action, match action, state bridge가 한 함수에 집중 | facade + shell별 runtime model + action adapters | P0 | 필요 |
| 2 | `src/features/runs/runtime/useTrackRunRuntimeRecipientInviteInbox.ts` | `useTrackRunRuntimeRecipientInviteInbox` | 647 | fetch, timeout, retry, stale, display, focus effect 혼재 | receiver fetch owner, retry scheduler, display builder | P0 | 필요 |
| 3 | `src/features/runs/runtime/useTrackRunRuntimeRecipientInviteInbox.ts` | `callback@useCallback` | 426 | recipient fetch command가 과도하게 큼 | request lifecycle command와 state commit 분리 | P0 | 필요 |
| 4 | `src/features/settings/admin/hooks/useAdminDashboard.ts` | `useAdminDashboard` | 400 | admin state/action 조립이 큼 | domain별 admin hooks 분리 | P2 | 필요 |
| 5 | `src/features/auth/hooks/useSignupForm.ts` | `useSignupForm` | 297 | form state, validation, submit flow가 큼 | reducer, validation utils, submit command 분리 | P2 | 필요 |
| 6 | `src/features/runs/viewModels/useLiveMatchViewModel.ts` | `useLiveMatchViewModel` | 285 | page/action/progress display 조립 집중 | page builders, action visibility builders | P1 | 필요 |
| 7 | `backend/src/repositories/postgresRunsRepository.mjs` | `createPostgresRunsRepository` | 271 | repository factory가 큼 | queries, mapper, command factory 분리 | P2 | 필요 |
| 8 | `src/features/match/hooks/lobby/useRoomStartActions.ts` | `useRoomStartActions` | 263 | ready/start/delete/handoff 처리 집중 | ready, start, delete command 분리 | P0 | 필요 |
| 9 | `src/features/runs/runtime/useTrackRunRoomLoader.ts` | `useTrackRunRoomLoader` | 258 | load, stale snapshot, deleted room guard 집중 | fetch command, accept policy, state commit 분리 | P0 | 필요 |
| 10 | `src/features/runs/sync/useMatchProgressSync.ts` | `useMatchProgressSync` | 235 | heartbeat registry와 progress payload commit 혼재 | heartbeat owner, progress payload builder 분리 | P1 | 필요 |

## 2. 파일 크기 감사

### 1000줄 이상

| 파일 | 줄 | 현재 문제 | 왜 위험한지 | 추천 분리 방향 | 위험도 | 테스트 필요 |
| --- | ---: | --- | --- | --- | --- | --- |
| `backend/src/server.mjs` | 6190 | backend 전체 route와 domain flow 집중 | route extraction 중 response diff 위험 | read-only route부터 service/controller 분리 | P0 | 필요 |
| `src/features/runs/runtime/TrackRunExperienceRuntimeModel.tsx` | 1944 | Running runtime facade가 여전히 큼 | Android startup과 live match handoff 회귀 위험 | idle/lobby/live runtime adapters 추가 분리 | P0 | 필요 |
| `backend/src/smoke.mjs` | 1013 | smoke CLI가 단일 흐름 | 실패 위치/원인 파악 어려움 | scenario helpers 분리 | P2 | 필요 |

### 500줄 이상

| 파일 | 줄 | 현재 문제 | 왜 위험한지 | 추천 분리 방향 | 위험도 | 테스트 필요 |
| --- | ---: | --- | --- | --- | --- | --- |
| `backend/src/runningMatchContract.test.mjs` | 898 | contract test가 큼 | route 분리 시 유지보수 비용 증가 | scenario별 test files | P2 | 필요 |
| `src/features/runs/runtime/useTrackRunRuntimeRecipientInviteInbox.ts` | 722 | receiver inbox runtime 집중 | 초대 수신 누락/반복 fetch 위험 | fetch owner, retry, display model 분리 | P0 | 필요 |
| `backend/src/repositories/postgresFriendsRepository.mjs` | 715 | query/mapper/command 집중 | DB schema 변경 시 영향 범위 큼 | mapper와 command 분리 | P2 | 필요 |
| `backend/src/repositories/postgresRunsRepository.mjs` | 639 | run query/mapper 집중 | 기록 저장/랭킹 회귀 위험 | run repository commands 분리 | P2 | 필요 |
| `backend/src/repositories/postgresAuthRepository.test.mjs` | 616 | auth repository test 큼 | 변경 위치 파악 어려움 | scenario별 test 분리 | P3 | 선택 |
| `src/lib/session.ts` | 561 | session, auth API, profile hydration 집중 | 앱 시작/로그인 회귀 위험 | session storage/service 분리 | P1 | 필요 |
| `backend/src/seed.mjs` | 527 | seed 생성 로직 집중 | dev/test 데이터 변경 위험 | factory/data blocks 분리 | P3 | 선택 |
| `backend/src/repositories/postgresRunsRepository.test.mjs` | 514 | runs repository test 큼 | 테스트 유지보수 비용 증가 | metrics/save/query tests 분리 | P3 | 선택 |
| `backend/src/repositories/postgresAuthRepository.mjs` | 503 | auth repository factory 큼 | auth flow 회귀 위험 | mapper/query/helper 분리 | P2 | 필요 |

### 300줄 이상 주요 production 파일

| 파일 | 줄 | 현재 문제 | 왜 위험한지 | 추천 분리 방향 | 위험도 | 테스트 필요 |
| --- | ---: | --- | --- | --- | --- | --- |
| `src/features/runs/sync/activeRoomCheck.ts` | 489 | active room request lifecycle 집중 | stale result가 UI를 되돌릴 수 있음 | timeout/abort/result policy 분리 | P0 | 필요 |
| `src/features/runs/viewModels/liveMatchRaceBoardViewModel.ts` | 463 | RaceBoard row builder 집중 | 상대 row 누락 위험 | participant-first builders | P1 | 필요 |
| `src/lib/api/services/rooms.ts` | 462 | room API service/guard/transform 집중 | response guard 회귀 위험 | endpoint commands와 guards 분리 | P1 | 필요 |
| `src/features/settings/admin/hooks/useAdminDashboard.ts` | 450 | admin state/action 집중 | admin screen 변경 영향 큼 | domain hooks 분리 | P2 | 필요 |
| `src/lib/api/services/mock/matchSessions.ts` | 450 | mock session state 집중 | mock/prod parity 회귀 | mock state, builders 분리 | P2 | 필요 |
| `src/lib/api/services/matches.ts` | 421 | match API service 집중 | progress/forfeit response guard 위험 | match status/progress/leave commands 분리 | P1 | 필요 |
| `src/features/runs/lifecycle/hooks/runningMatchFocus/useLiveMatchNavigationExecutor.ts` | 419 | navigation execution과 trace/fallback 집중 | routeStateOnly recovery 회귀 위험 | executor, trace finalizer 분리 | P0 | 필요 |
| `src/features/runs/lifecycle/matchRoomFlow.ts` | 400 | room UI/domain flow 계산 집중 | room UX model 회귀 위험 | pure selectors split | P1 | 필요 |
| `src/features/runs/viewModels/matchProgress.ts` | 395 | ranking/progress 계산 집중 | 승패/순위 표시 회귀 위험 | pure ranking helpers | P1 | 필요 |
| `src/features/match/hooks/lobby/useRoomStartActions.ts` | 383 | ready/start/delete/handoff 집중 | 방 삭제, 시작, live handoff 회귀 | command hooks 분리 | P0 | 필요 |
| `src/features/runs/sync/roomInviteInbox.ts` | 368 | invite identity/display policy 집중 | 초대 수신 누락 위험 | matching/display/skip policy 분리 | P0 | 필요 |
| `src/lib/api/services/runningRoomResponseGuards.ts` | 355 | room response guard 집중 | success:true malformed response 위험 | guard modules by endpoint | P1 | 필요 |
| `src/features/runs/lifecycle/matchStateMachine.ts` | 344 | lifecycle state machine 집중 | matched/active 전환 회귀 위험 | transition helpers와 tests 유지 | P1 | 필요 |
| `src/features/runs/components/matchSetupCards/MatchSetupCommon.tsx` | 331 | setup UI props/handlers 큼 | Android pre-match render 비용 | memoized chip rows | P2 | 선택 |
| `src/features/runs/viewModels/useLiveMatchViewModel.ts` | 321 | live match display VM 집중 | render props churn 위험 | display/action builders | P1 | 필요 |
| `src/features/runs/runtime/useTrackRunRoomLoader.ts` | 313 | room load/state accept 집중 | deleted room 복원 위험 | loader/policy/state commit 분리 | P0 | 필요 |
| `src/features/runs/sync/matchPolling/useBlockingMatchStatusPolling.ts` | 304 | recovery polling owner 집중 | mounted 후 polling 재시작 위험 | mounted skip policy 테스트 | P1 | 필요 |

## 3. 50줄 이상 함수/hook 감사 요약

| 파일 | 함수/hook | 길이 | 현재 문제 | 추천 분리 방향 | 위험도 | 테스트 필요 |
| --- | --- | ---: | --- | --- | --- | --- |
| `src/features/runs/runtime/TrackRunExperienceRuntimeModel.tsx` | `TrackRunExperienceRuntime` | 1798 | runtime state/action/model 조립 집중 | facade + shell runtime adapters | P0 | 필요 |
| `src/features/runs/runtime/useTrackRunRuntimeRecipientInviteInbox.ts` | `useTrackRunRuntimeRecipientInviteInbox` | 647 | fetch, retry, stale, display, focus 혼재 | receiver owner + request lifecycle | P0 | 필요 |
| `src/features/runs/runtime/useTrackRunRuntimeRecipientInviteInbox.ts` | `callback@useCallback` | 426 | fetch callback 과대 | pure policy + command + state commit | P0 | 필요 |
| `src/features/runs/sync/useMatchProgressSync.ts` | `useMatchProgressSync` | 235 | heartbeat owner와 API call 혼재 | heartbeat hook + progress command | P1 | 필요 |
| `src/features/runs/sync/matchPolling/useBlockingMatchStatusPolling.ts` | `useBlockingMatchStatusPolling` | 225 | polling lifecycle 집중 | key policy + effect wrapper | P1 | 필요 |
| `src/features/runs/tracking/background/locationTaskManagerCore.ts` | `createLocationTaskManager` | 220 | task state, timeout, trace 집중 | task registry + policy + adapter | P1 | 필요 |
| `src/features/runs/lifecycle/hooks/runningMatchFocus/useLiveMatchNavigationOwner.ts` | `useLiveMatchNavigationOwner` | 217 | owner selection/retry/trace 집중 | owner policy pure helper 유지 | P0 | 필요 |
| `src/features/runs/runtime/useTrackRunRoomJoinAction.ts` | `useTrackRunRoomJoinAction` | 226 | manual join preflight/API/hydration 집중 | preflight, network, hydration commands | P0 | 필요 |
| `src/features/runs/runtime/useTrackRunRoomCreateAction.ts` | `useTrackRunRoomCreateAction` | 203 | blocker cleanup/retry/create 집중 | blocker policy + create command | P0 | 필요 |
| `src/features/match/hooks/lobby/useRoomInviteActions.ts` | `useRoomInviteActions` | 194 | accept/decline/share/friend invite 집중 | invite accept, decline, share actions | P1 | 필요 |

## 4. TOP 20 분리 후보

| 순위 | 파일 | 현재 문제 | 왜 위험한지 | 추천 분리 방향 | 위험도 | 테스트 필요 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `src/features/runs/runtime/TrackRunExperienceRuntimeModel.tsx` | runtime 조립 집중 | idle/lobby/live 구독 경계가 다시 섞일 수 있음 | shell별 runtime adapters | P0 | 필요 |
| 2 | `src/features/runs/runtime/useTrackRunRuntimeRecipientInviteInbox.ts` | receiver inbox runtime 집중 | 초대 카드 미표시/반복 fetch 위험 | receiver owner, retry, display model | P0 | 필요 |
| 3 | `src/features/runs/sync/activeRoomCheck.ts` | stale/abort/request registry 집중 | stale result가 live 화면을 내릴 수 있음 | active request lifecycle 분리 | P0 | 필요 |
| 4 | `src/features/match/hooks/lobby/useRoomStartActions.ts` | ready/start/delete/handoff 집중 | 방 삭제와 live handoff 회귀 위험 | ready/start/delete commands | P0 | 필요 |
| 5 | `src/features/runs/runtime/useTrackRunRoomLoader.ts` | room load accept policy 집중 | deleted room 재복원 위험 | loader + accept policy | P0 | 필요 |
| 6 | `src/features/runs/runtime/useTrackRunRoomCreateAction.ts` | create blocker cleanup 집중 | "이미 참여 중인 방" blocker 회귀 위험 | blocker cleanup policy 분리 | P0 | 필요 |
| 7 | `src/features/runs/runtime/useTrackRunRoomJoinAction.ts` | manual join flow 집중 | 중복 submit과 join delay 위험 | single-flight + network command | P0 | 필요 |
| 8 | `src/features/runs/lifecycle/hooks/runningMatchFocus/useLiveMatchNavigationExecutor.ts` | route hydration/recovery/final trace 집중 | routeStateOnly false failure 위험 | executor + finalizer 분리 | P0 | 필요 |
| 9 | `src/features/runs/lifecycle/hooks/runningMatchFocus/useLiveMatchNavigationOwner.ts` | navigation owner policy 큼 | duplicate navigation 위험 | pure owner policy 테스트 강화 | P0 | 필요 |
| 10 | `src/features/runs/sync/roomInviteInbox.ts` | identity matching/display policy 집중 | invitedUserId/publicTag mismatch 위험 | matching/display/skip modules | P0 | 필요 |
| 11 | `src/features/runs/sync/matchPolling/useBlockingMatchStatusPolling.ts` | recovery polling lifecycle 집중 | mounted 후 polling 재시작 위험 | mounted skip + registry tests | P1 | 필요 |
| 12 | `src/features/runs/sync/useMatchProgressSync.ts` | heartbeat/progress sync 집중 | heartbeat 중복과 cleanup 누락 위험 | heartbeat owner + progress command | P1 | 필요 |
| 13 | `src/features/runs/tracking/background/locationTaskManagerCore.ts` | location task state 집중 | GPS start가 UI/mount에 영향 줄 위험 | task registry + stale policy | P1 | 필요 |
| 14 | `src/features/runs/tracking/useTrackingAppStateSync.ts` | appState tracking sync | active/background 경계 회귀 위험 | appState policy tests | P1 | 필요 |
| 15 | `src/features/runs/viewModels/liveMatchRaceBoardViewModel.ts` | RaceBoard builder 큼 | 상대 row 누락 위험 | participant-first row builders | P1 | 필요 |
| 16 | `src/features/runs/viewModels/useLiveMatchViewModel.ts` | LiveMatch VM 집중 | props churn과 render 비용 | display/action/page builders | P1 | 필요 |
| 17 | `src/lib/api/services/rooms.ts` | room service endpoint 집중 | guard/response shape 회귀 위험 | endpoint command modules | P1 | 필요 |
| 18 | `src/lib/api/services/matches.ts` | match service endpoint 집중 | progress/forfeit API 회귀 위험 | status/progress/leave commands | P1 | 필요 |
| 19 | `src/lib/session.ts` | session/auth/profile 집중 | app startup/auth 회귀 위험 | session store + auth service | P2 | 필요 |
| 20 | `backend/src/server.mjs` | backend route/domain 집중 | route extraction high blast radius | read-only routes first | P2 | 필요 |

## 5. Running/Match/LiveMatch 핵심 플로우 심층 감사

### 13개 플로우별 위험 지도

| 플로우 | 관련 파일 | 책임 혼재 지점 | stale state 위험 | polling/heartbeat 중복 위험 | cleanup 누락 위험 | 테스트 보강 | 추천 리팩토링 | 위험도 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 방 생성 | `useTrackRunRoomCreateAction.ts`, `deletedRoomBlockerPolicy.ts`, `rooms.ts`, `server.mjs` | create API, blocker cleanup, optimistic commit, navigation trace | deleted tombstone room이 blocker로 돌아올 수 있음 | active room check와 create preflight가 겹칠 수 있음 | create 실패 후 inFlight/pending reset 누락 | deleted blocker cleanup 후 create retry, local hint clear | blocker policy와 create command 분리 | P0 |
| 방 삭제 | `useRoomStartActions.ts`, `matchRoomDeletionTombstone.ts`, `optimisticRoomHydration.ts`, room snapshot handlers | delete, tombstone, local clear, verification cleanup | 늦은 snapshot이 삭제 room을 복원할 수 있음 | delete 중 room polling late result 위험 | tombstone rollback/delete failure cleanup | delete success 후 entry/hydrate 차단, delete failure fallback | delete command와 verification helper 분리 | P0 |
| 이미 참여 중 blocker | `useTrackRunRoomCreateAction.ts`, `staleRoomCleanup.ts`, `deletedRoomBlockerPolicy.ts`, backend blocker builders | server blocker, local tombstone, cleanup retry 혼재 | deleted room blocker가 새 방 생성을 막을 수 있음 | active room check stale result가 blocker로 쓰일 수 있음 | cleanup timeout 후 retry state 불명확 | deleted blocker ignored, cleanup recovery, normal blocker 유지 | blocker classifier pure module | P0 |
| 초대 보내기 | `useRoomInviteActions.ts`, `useFriendInviteSend.ts`, `invitePayloadGuard.ts`, `rooms.ts`, `server.mjs` | selection guard, saveRoomSettings, invite response guard, trace | selectedInviteCount 0/invalid userId 상태로 send 가능성 | 낮음 | pending state reset 누락 | null invitedUserId API 미호출, invite payload required fields | selection guard와 send command 분리 | P1 |
| 초대 수신 | `roomInviteInbox.ts`, `useTrackRunRuntimeRecipientInviteInbox.ts`, `useInviteInboxReceiver.ts` | receiver identity matching, timeout, retry, display, focus owner | timeout 후 pending invite 놓침, joined/live stale result | no-room focus fetch 반복 위험 | timeout retry timer/focus cleanup 누락 | public tag/internal id matching, timeout retry, joined/live pause | idle/pre-lobby receiver owner 분리 | P0 |
| 초대코드 입장 | `manualInviteJoin.ts`, `useTrackRunRoomJoinAction.ts`, `PartyRunHomePanel.tsx`, `useMatchEntryEffects.ts` | input submit, preflight, API network, hydration trace | late preflight가 current room state 덮을 수 있음 | 같은 token 중복 submit 위험 | join inFlight reset 누락 | same token single-flight, party panel + track input 동시 submit | single join owner와 hydration command | P0 |
| 준비하기 | `useRoomStartActions.ts`, `useMatchRoomLobbyEffects.ts`, backend ready route | ready toggle, saving state, room snapshot commit | stale serverNow snapshot reject 필요 | room polling과 ready response 중복 commit | ready inFlight reset 누락 | ready duplicate press blocked, stale serverNow ignored | ready command 분리 | P1 |
| 시작하기 | `useRoomStartActions.ts`, `matchLifecycleController.ts`, `matchStateMachine.ts`, `liveMatchRouteHydration.ts` | start API, linkedMatch hydration, room polling handoff | linkedMatchId가 no-match routeKey로 남을 수 있음 | match-room polling과 live recovery polling 경합 | room polling stop/handoff cleanup | start success route hydrated, handoff keeps runtime active | start command + live handoff helper | P0 |
| live match navigation | `useLiveMatchNavigationExecutor.ts`, `useLiveMatchNavigationOwner.ts`, `useLiveMatchRecoveryPolicy.ts`, `liveMatchMountedRegistry.ts` | owner selection, route hydration, mount signal, final trace | routeStateOnly가 failure로 기록되거나 idle/lobby가 live shell 덮음 | recovery polling 재시작/중복 위험 | active owner cleanup 누락 | routeStateOnly recovering, mounted cleanup, duplicate owner blocked | executor finalizer와 recovery policy 분리 | P0 |
| RaceBoard | `liveMatchRaceBoardViewModel.ts`, `useLiveMatchProgress.ts`, `LiveMatchRaceBoard.tsx`, `RaceBoardListRow.tsx` | participant/progress/ranking/display label 계산 | progress missing opponent row 누락 위험 | 낮음 | memo/cache cleanup 낮음 | participant 2명 progress 0/0 rows 2개, fallback label | participant-first builder | P1 |
| GPS/tracking | `locationTaskManagerCore.ts`, `useTrackingAppStateSync.ts`, `useTrackingGpsController.ts`, `useRunTrackingFlow.ts` | foreground watch, background task, appState, trace, session state | stale GPS start/fail이 UI state 흔들 가능성 | watcher activeKindCount 증가 위험 | stop/unmount cleanup 누락 | active no background native call, timeout ignored, stop clears pending | tracking task manager policy tests | P1 |
| heartbeat/progress | `useMatchProgressSync.ts`, `matchProgressSync.ts`, `rgHeartbeatRegistry.ts`, `registryKeys.ts` | heartbeat owner, API single-flight, displayed progress commit | late heartbeat status가 ended match에 적용될 수 있음 | same matchId heartbeat 중복 위험 | room exit/unmount cleanup 누락 | same matchId one heartbeat, cleanup restart, rejected retry | heartbeat owner hook + progress command | P1 |
| save/forfeit | `useRunSaveFlow.ts`, `runSaveFlow/*`, `matchExitFlow.ts`, `matches.ts`, backend leave/progress routes | save, finish, forfeit, cleanup, point/ranking post-process | late progress/save result가 wrong match에 적용될 수 있음 | heartbeat/watcher cleanup 연계 위험 | forfeit 후 heartbeat/watcher/polling cleanup 누락 | forfeit win/loss, cleanup after save, stale match ignored | command boundaries 유지 + cleanup tests | P1 |

### Runtime State 충돌 매트릭스

| 상태/registry | 충돌 대상 | 충돌 가능성 | 현재 위험 | 필요한 테스트/가드 |
| --- | --- | --- | --- | --- |
| deleted room tombstone | active room hint, room snapshot, create blocker | 삭제된 roomId가 다시 hydrate되거나 blocker로 사용됨 | P0 | deleted room hydrate ignored, blocker ignored/recovered, local hint clear |
| active room hint | room snapshot, invite inbox, active room check | local hint가 오래 남아 idle check 또는 lobby entry를 유발 | P0 | deleted hint clear, no local hint idle skip, live mounted skip |
| room snapshot | live match handoff, deleted tombstone | start 후 lobby snapshot이 live handoff를 덮음 | P0 | linkedMatchId handoff keeps live owner, deleted snapshot ignored |
| invite inbox | room snapshot, live mounted registry | joined/live 후 no-room fetch 또는 invite card check 반복 | P0 | live mounted focus pause, joined room skip once, timeout retry only idle |
| live match mounted registry | blocking match status polling, navigation owner | mounted 후 recovery polling 재시작 | P0 | mounted match skip polling, owner cleanup after mount |
| blocking match status polling | live navigation recovery, room snapshot polling | route correction/defer state가 recovery polling을 다시 시작 | P1 | same matchId singleton, mounted cleanup |
| heartbeat/progress registry | tracking task, save/forfeit cleanup | save/forfeit 후 heartbeat가 계속 살아 있을 수 있음 | P1 | room exit cleanup releases heartbeat, rejected retry cleanup |
| location tracking task | live navigation, GPS start stale result | GPS start timeout/fail이 화면 mount나 navigation retry에 영향 | P1 | GPS result ignored without screen change, appState active background native blocked |

## 6. 우선순위별 결론

### P0 플로우 위험

- 방 삭제와 create blocker는 tombstone, active hint, server membership verification이 모두 맞아야 한다.
- 초대 수신은 receiver id matching, timeout retry, joined/live pause 조건이 한 경로라도 흔들리면 카드 미표시로 이어진다.
- live match navigation은 routeStateOnly, shell gate, mount signal, recovery polling의 상태 전이가 정확해야 한다.
- active room check는 stale/abort/live-mounted skip 정책이 깨지면 live 화면을 되돌리는 위험이 있다.
- 수동 초대코드 입장은 duplicate submit과 preflight delay가 Android 체감 지연으로 바로 나타난다.

### P1 플로우 위험

- RaceBoard는 상대 progress가 늦어도 participant row를 유지해야 한다.
- heartbeat/progress는 matchId singleton과 cleanup 보장이 핵심이다.
- GPS/tracking은 UI mount/navigation success와 분리되어야 한다.
- LiveMatch render boundary는 page props, heavy child mount, RoadMotion preservation이 핵심이다.

### 테스트 보강 우선순위

1. deleted tombstone + create blocker recovery
2. receiver invite inbox matching + timeout retry + joined/live pause
3. routeStateOnly live navigation recovery + mounted cleanup
4. active room check abort/stale/live mounted skip
5. manual invite join single-flight
6. RaceBoard participant-first rows
7. heartbeat/progress cleanup after exit
8. GPS task active/background boundary

### 다음 리팩토링 후보 5개

| 순위 | 후보 | 목표 | 위험도 |
| --- | --- | --- | --- |
| 1 | `useTrackRunRoomCreateAction` + deleted blocker policy | 삭제 room blocker를 정확히 무시/정리 | P0 |
| 2 | `useTrackRunRuntimeRecipientInviteInbox` | receiver inbox owner와 retry/display 경계 분리 | P0 |
| 3 | `useLiveMatchNavigationExecutor` | routeStateOnly/recovery/mounted finalization 분리 | P0 |
| 4 | `activeRoomCheck` | abort/stale/result policy를 pure module로 분리 | P0 |
| 5 | `useTrackRunRoomJoinAction` | manual invite join single-flight와 preflight/network/hydration 경계 분리 | P0 |
