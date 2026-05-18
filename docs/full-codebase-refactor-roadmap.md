# RunningGround Full Codebase Refactor Roadmap

생성일: 2026-05-18

기준 문서:

- `docs/full-codebase-quality-audit.md`
- `docs/code-quality-audit.md`
- `docs/code-quality-report.generated.md`
- `docs/refactor-roadmap.md`
- `docs/handoff/codex-audit-plan.md`

전제:

- PR #3 `perf/match-sync-and-startup`은 머지된 상태로 가정한다.
- PR #3에서 처리한 perf 영역은 다시 다루지 않고, live match navigation/recovery 잔여 작업은 `PR-03b`로 분리한다.

## 1. 전체 리팩토링 원칙

- PR은 작게 쪼갠다. 한 PR은 하나의 flow 또는 하나의 runtime registry만 다룬다.
- UI 디자인, 문구, 라우팅 경로, public API, response shape, GPS 기록 정확도, 승패/저장/기권 정책은 변경하지 않는다.
- iOS TestFlight runtimeVersion, Expo Updates URL/channel, app version/buildNumber 설정은 변경 금지다.
- Android live match 안정성을 최우선 회귀 기준으로 둔다. live screen mount 실패, RoadMotion remount 반복, routeStateOnly failure, recovery polling 재시작이 보이면 rollback한다.
- runtime, navigation, GPS, polling, heartbeat 영역은 모두 High risk로 취급한다.
- 리팩토링 전후에 stale state, single-flight, cleanup, mounted registry 테스트를 먼저 보강한다.

## 2. P0/P1/P2/P3 분류 요약

| 우선순위 | 의미 | 주요 영역 | 대표 rollback 신호 |
| --- | --- | --- | --- |
| P0 | 사용자가 바로 겪는 correctness/stale state 문제 | 방 삭제/blocker, 초대 수신, live navigation, active room check, manual join | 삭제 방 재진입, 초대 카드 미표시, live 화면 미진입, 중복 join |
| P1 | Android 성능과 runtime resource 중복 방지 | RaceBoard, heartbeat/progress, GPS tracking, LiveMatch render boundary | row 누락, heartbeat 중복, watcher 증가, render churn |
| P2 | 대형 파일과 유지보수성 개선 | TrackRun runtime model, backend server, session/API service | 큰 파일 회귀, API response diff |
| P3 | 문서/테스트 보강 | flow regression matrix, QA checklist, analyzer policy | 회귀 탐지 기준 누락 |

## 3. PR 계획 요약

| PR | P | 제목 | 핵심 대상 | 비고 |
| --- | --- | --- | --- | --- |
| PR-01 | P0 | Deleted room blocker/tombstone flow hardening | room delete, active hint, create blocker | 1순위 |
| PR-02 | P0 | Invite inbox receiver ownership cleanup | `roomInviteInbox`, recipient inbox runtime | 2순위 |
| PR-03b | P0 | Live match navigation/recovery state split | navigation executor, recovery policy, mounted registry | PR #3 perf 반영 후 잔여 |
| PR-04 | P0 | Active room check stale/abort policy consolidation | `activeRoomCheck`, room snapshot handlers | 3순위 |
| PR-05 | P0 | Manual invite join single-flight and preflight boundary | manual invite join, room join actions | |
| PR-06 | P1 | RaceBoard participant-first model cleanup | race board VM, progress merge, board tests | |
| PR-07 | P1 | Heartbeat/progress registry cleanup tests | heartbeat registry, progress sync | |
| PR-08 | P1 | GPS/tracking task boundary audit and tests | location task manager, app state sync | |
| PR-09 | P1 | LiveMatch render boundary follow-up | pager/pages/container/shell props | |
| PR-10 | P2 | TrackRun runtime model split continuation | runtime model and runtime adapters | |
| PR-11 | P2 | Backend read-only route extraction continuation | `backend/src/server.mjs`, routes/response helpers | |
| PR-12 | P3 | Flow-level regression test matrix documentation | docs and targeted test gaps | |

## PR-01: Deleted Room Blocker/Tombstone Flow Hardening

| 항목 | 내용 |
| --- | --- |
| 목표 | 삭제된 roomId가 active hint, snapshot, create blocker, lobby entry path를 통해 다시 살아나지 않게 한다. |
| 대상 파일 | `src/features/runs/lifecycle/matchRoomDeletionTombstone.ts`, `src/features/runs/runtime/deletedRoomBlockerPolicy.ts`, `src/features/runs/runtime/useTrackRunRoomCreateAction.ts`, `src/features/runs/runtime/useTrackRunRoomLoader.ts`, `src/features/match/hooks/lobby/optimisticRoomHydration.ts`, `src/features/match/hooks/lobby/roomSnapshot/*`, `src/features/runs/viewModels/useTrackRunIdleViewModel.ts` |
| 수정 내용 | deleted tombstone guard를 create preflight, active hint, active room result, room snapshot, optimistic hydration에 일관 적용한다. delete verification/recovery는 별도 helper로 둔다. |
| 금지 사항 | 방 생성/입장/초대/대결 시작 정책, API path, UI 디자인 변경 금지 |
| 추가할 테스트 | delete success 후 같은 roomId hydrate 차단, late snapshot ignored, local active hint clear, deleted blocker cleanup 후 create retry, delete failure fallback |
| 검증 명령어 | `npm run typecheck`, `npm run lint`, `npm run test`, `npm run perf:smells`, `npm run code:quality`, `git diff --check` |
| rollback 기준 | 삭제 후 새 방 생성이 막히거나, 삭제된 roomId가 다시 lobby로 hydrate되거나, 다른 roomId 생성/입장이 실패하면 rollback |
| 위험도 | High |
| 추천 커밋 메시지 | `fix: harden deleted room blocker cleanup` |

## PR-02: Invite Inbox Receiver Ownership Cleanup

| 항목 | 내용 |
| --- | --- |
| 목표 | receiver invite inbox fetch를 idle/pre-lobby 전용 owner로 분리하고 timeout/retry/display 경계를 명확히 한다. |
| 대상 파일 | `src/features/runs/sync/roomInviteInbox.ts`, `src/features/runs/runtime/useTrackRunRuntimeRecipientInviteInbox.ts`, `src/features/match/hooks/lobby/roomSnapshot/useInviteInboxReceiver.ts`, `src/features/match/hooks/lobby/useRoomInviteActions.ts`, invite service/guard files |
| 수정 내용 | public tag/internal id/invitedFriendId matching을 순수 함수와 테스트로 고정한다. joined/live 상태에서는 focus effect를 pause하고 no-room key fetch를 차단한다. |
| 금지 사항 | 초대코드 직접 입장, friend invite response shape, UI 카드 디자인, joined/live pause 정책 변경 금지 |
| 추가할 테스트 | public tag match, internal id match, timeout retry scheduled, pending invite display model, joined/live focus pause, duplicate card 방지 |
| 검증 명령어 | `npm run typecheck`, `npm run lint`, `npm run test`, `npm run perf:smells`, `npm run code:quality`, `git diff --check` |
| rollback 기준 | idle/pre-lobby 초대 수신이 실패하거나, joined/live에서 inbox fetch 반복이 재발하거나, 수동 초대코드 입장이 깨지면 rollback |
| 위험도 | High |
| 추천 커밋 메시지 | `fix: isolate receiver invite inbox owner` |

## PR-03b: Live Match Navigation/Recovery State Split

| 항목 | 내용 |
| --- | --- |
| 목표 | PR #3 이후에도 남은 routeStateOnly/recovery/mounted/final failure 상태를 분리한다. |
| 대상 파일 | `src/features/runs/lifecycle/hooks/runningMatchFocus/useLiveMatchNavigationExecutor.ts`, `src/features/runs/lifecycle/hooks/runningMatchFocus/useLiveMatchRecoveryPolicy.ts`, `src/features/runs/lifecycle/hooks/runningMatchFocus/useLiveMatchNavigationOwner.ts`, `src/features/runs/lifecycle/hooks/runningMatchFocus/useLiveMatchMountSignalBridge.ts`, `src/features/runs/lifecycle/liveMatchMountedRegistry.ts`, `src/features/runs/sync/matchPolling/useBlockingMatchStatusPolling.ts` |
| 수정 내용 | route state hydrated 상태는 즉시 failure로 끝내지 않고 recovering으로 유지한다. mounted matchId는 recovery polling 재시작을 skip한다. recovered navigation은 perf trace failure로 잡히지 않게 로그를 분리한다. |
| 금지 사항 | PR #3의 polling interval/perf 변경 재수정 금지, 라우팅 경로, preferArena 정책, GPS/background tracking, UI 변경 금지 |
| 추가할 테스트 | routeStateOnly pending recovery, recovery success marks recovered, finalized failure only after retry exhausted, mounted match skips blocking polling, duplicate owner cleanup |
| 검증 명령어 | `npm run typecheck`, `npm run lint`, `npm run test`, `npm run perf:smells`, `npm run code:quality`, `git diff --check` |
| rollback 기준 | live screen mount 실패, 같은 matchId navigation 반복, mounted 후 recovery polling 재시작, `success:false` 반복이 재발하면 rollback |
| 위험도 | High |
| 추천 커밋 메시지 | `fix: split live match recovery navigation state` |

## PR-04: Active Room Check Stale/Abort Policy Consolidation

| 항목 | 내용 |
| --- | --- |
| 목표 | active room check timeout/abort/stale/live-mounted skip 정책을 한곳에서 검증 가능하게 만든다. |
| 대상 파일 | `src/features/runs/sync/activeRoomCheck.ts`, `src/features/runs/sync/activeRoomResult.ts`, `src/features/match/hooks/lobby/roomSnapshot/activeRoomResultHandler.ts`, `src/features/match/hooks/lobby/roomSnapshot/useActiveRoomSnapshotHandler.ts`, `src/features/runs/runtime/trackRunActiveRoomCheckPolicy.ts`, `scripts/analyze-android-perf-trace.mjs` |
| 수정 내용 | track-run experience와 match-room snapshot owner key를 분리해 유지한다. abort 이후 결과는 state update와 slow finding에서 제외한다. live mounted/linked match 상태에서는 track-run source check를 시작하지 않는다. |
| 금지 사항 | 정상 방 복귀 기능, polling interval, API response shape, UI 변경 금지 |
| 추가할 테스트 | hard timeout abort, ignored after abort not slow finding, stale generation ignored, live mounted skip, stale snapshot does not hydrate UI |
| 검증 명령어 | `npm run typecheck`, `npm run lint`, `npm run test`, `npm run perf:smells`, `npm run code:quality`, `npm run perf:trace-analyze -- ./logs/android-live-match-retest-3.txt`, `git diff --check` |
| rollback 기준 | 앱 재시작 방 복귀가 실패하거나, active room check가 다시 오래 살아 있거나, stale result가 live 화면을 내리면 rollback |
| 위험도 | High |
| 추천 커밋 메시지 | `fix: consolidate active room stale policy` |

## PR-05: Manual Invite Join Single-Flight And Preflight Boundary

| 항목 | 내용 |
| --- | --- |
| 목표 | 수동 초대코드 submit owner를 하나로 통합하고 같은 inviteToken join API가 한 번만 실행되게 한다. |
| 대상 파일 | `src/features/runs/sync/manualInviteJoin.ts`, `src/features/runs/runtime/useTrackRunRoomJoinAction.ts`, `src/features/runs/runtime/useTrackRunRuntimeRoomInviteActions.ts`, `src/features/runs/components/PartyRunHomePanel.tsx`, invite code input 관련 files |
| 수정 내용 | manual join key를 token 기준으로 single-flight 처리한다. preflight, network, hydration duration trace를 분리한다. invite card accept fast join은 별도 경로로 유지한다. |
| 금지 사항 | 초대코드 직접 입장, invite card accept fast join, 이미 참여 중인 방 처리, UI 문구/디자인 변경 금지 |
| 추가할 테스트 | same token submit API 1회, PartyRunHomePanel + TrackRun input 동시 submit 단일 처리, invite card accept fast join 유지, blocker retry 유지 |
| 검증 명령어 | `npm run typecheck`, `npm run lint`, `npm run test`, `npm run perf:smells`, `npm run code:quality`, `git diff --check` |
| rollback 기준 | 수동 초대코드 입장이 실패하거나 invite card accept가 느려지거나 blocker cleanup recovery가 깨지면 rollback |
| 위험도 | High |
| 추천 커밋 메시지 | `fix: single-flight manual invite join` |

## PR-06: RaceBoard Participant-First Model Cleanup

| 항목 | 내용 |
| --- | --- |
| 목표 | duel participants 2명은 progress가 0/누락이어도 RaceBoard row 2개가 보이게 보장한다. |
| 대상 파일 | `src/features/runs/viewModels/liveMatchRaceBoardViewModel.ts`, `src/features/runs/viewModels/useLiveMatchProgress.ts`, `src/features/runs/viewModels/matchProgress.ts`, `src/components/matches/LiveMatchRaceBoard.tsx`, `src/features/runs/components/LiveMatchRaceBoardPage.tsx` |
| 수정 내용 | participant-first row builder와 progress merge helper를 테스트 가능한 순수 함수로 유지한다. nickname/userTag fallback을 명확히 한다. |
| 금지 사항 | 승패/저장/공식 ranking 정책, UI 디자인 변경 금지 |
| 추가할 테스트 | duel participants 2명 progress 0/0 rows 2개, opponent progress missing row 유지, current user filter row 축소 방지, fallback label |
| 검증 명령어 | `npm run typecheck`, `npm run lint`, `npm run test`, `npm run perf:smells`, `npm run code:quality`, `git diff --check` |
| rollback 기준 | RaceBoard row 순서/표시가 깨지거나 저장/승패 테스트가 실패하면 rollback |
| 위험도 | Medium |
| 추천 커밋 메시지 | `fix: preserve race board participant rows` |

## PR-07: Heartbeat/Progress Registry Cleanup Tests

| 항목 | 내용 |
| --- | --- |
| 목표 | match progress heartbeat와 progress upload single-flight가 matchId 기준 하나만 유지되고 cleanup 후 재시작 가능하게 보장한다. |
| 대상 파일 | `src/utils/rgHeartbeatRegistry.ts`, `src/utils/rgPollingRegistry.ts`, `src/features/runs/sync/useMatchProgressSync.ts`, `src/features/runs/sync/matchProgressSync.ts`, `src/features/runs/tracking/useMatchProgressHeartbeat.ts`, `src/features/runs/sync/registryKeys.ts` |
| 수정 내용 | key policy `match-progress:<matchId>`를 테스트로 고정한다. duplicate start, cleanup, rejected retry, room exit cleanup을 보강한다. |
| 금지 사항 | heartbeat interval, progress payload shape, API endpoint, 저장/승패 로직 변경 금지 |
| 추가할 테스트 | same matchId heartbeat 1개, cleanup 후 재시작, rejected API cleanup, room exit releases owner, duplicate progress upload single-flight |
| 검증 명령어 | `npm run typecheck`, `npm run lint`, `npm run test`, `npm run perf:smells`, `npm run code:quality`, `git diff --check` |
| rollback 기준 | progress 전송이 멈추거나 heartbeat activeKindCount가 2 이상으로 재발하면 rollback |
| 위험도 | Medium-High |
| 추천 커밋 메시지 | `test: harden match progress registry cleanup` |

## PR-08: GPS/Tracking Task Boundary Audit And Tests

| 항목 | 내용 |
| --- | --- |
| 목표 | foreground/background location task 경계와 stale result ignore를 테스트로 고정한다. |
| 대상 파일 | `src/features/runs/tracking/background/locationTaskManagerCore.ts`, `src/features/runs/tracking/useTrackingAppStateSync.ts`, `src/features/runs/tracking/flow/useTrackingGpsController.ts`, `src/features/runs/tracking/actions/useStartTrackingAction.ts`, `src/features/runs/hooks/useRunTrackingFlow.ts` |
| 수정 내용 | appState active에서는 background native start가 생성되지 않음을 보장한다. GPS/background start timeout 결과가 navigation/mount success에 관여하지 않게 테스트한다. |
| 금지 사항 | native location policy 대폭 변경, GPS 기록 정확도 저하, 저장 payload/승패/포인트/랭킹 정책 변경 금지 |
| 추가할 테스트 | active no background native call, same tracking key single-flight, timeout ignored non-blocking, stale/fail does not unmount live screen, stop clears pending source |
| 검증 명령어 | `npm run typecheck`, `npm run lint`, `npm run test`, `npm run perf:smells`, `npm run code:quality`, `git diff --check` |
| rollback 기준 | GPS 기록 저장 누락, background 기록 실패, live screen unmount, appState 전환 regression 발생 시 rollback |
| 위험도 | High |
| 추천 커밋 메시지 | `test: harden tracking task boundaries` |

## PR-09: LiveMatch Render Boundary Follow-Up

| 항목 | 내용 |
| --- | --- |
| 목표 | LiveMatchShell, LiveMatchContainer, LiveMatchPager props reference를 안정화하고 선택되지 않은 page의 heavy 계산을 막는다. |
| 대상 파일 | `src/features/runs/components/LiveMatchPager.tsx`, `src/features/runs/components/liveMatchPager/*`, `src/features/runs/components/LiveMatchPages.tsx`, `src/features/runs/components/LiveMatchContainer.tsx`, `src/features/runs/components/shells/TrackRunShells.tsx`, `src/components/matches/LiveMatchArena.tsx`, `src/features/runs/components/LiveMatchRaceBoardPage.tsx` |
| 수정 내용 | page props composer를 memoized builder로 정리한다. ranking page가 아닐 때 RaceBoard VM이 실행되지 않게 테스트한다. same matchId defer state가 RoadMotion remount를 유발하지 않게 comparator를 점검한다. |
| 금지 사항 | RoadMotion 디자인, LiveMatch 탭 구조, 대결 진행/기권/저장 정책 변경 금지 |
| 추가할 테스트 | ranking 아닌 page에서 race board VM 미실행, tracking 아닌 page에서 tracking heavy props 미생성, same matchId defer 변화 RoadMotion remount 없음 |
| 검증 명령어 | `npm run typecheck`, `npm run lint`, `npm run test`, `npm run perf:smells`, `npm run code:quality`, `git diff --check` |
| rollback 기준 | page 전환이 깨지거나 RoadMotion mount/unmount 반복이 재발하면 rollback |
| 위험도 | Medium |
| 추천 커밋 메시지 | `perf: stabilize live match page props` |

## PR-10: TrackRun Runtime Model Split Continuation

| 항목 | 내용 |
| --- | --- |
| 목표 | `TrackRunExperienceRuntimeModel.tsx`가 shell별 model과 action adapter만 조립하는 facade가 되게 줄인다. |
| 대상 파일 | `src/features/runs/runtime/TrackRunExperienceRuntimeModel.tsx`, `src/features/runs/runtime/useIdleRunRuntimeModel.tsx`, `src/features/runs/runtime/useMatchLobbyRuntimeModel.ts`, `src/features/runs/runtime/useLiveMatchRuntimeModel.tsx`, `src/features/runs/runtime/useTrackRunRuntimePropsComposer.ts`, `src/features/runs/runtime/useTrackRunRuntimeRoomActions.ts`, `src/features/runs/runtime/useTrackRunRuntimeMatchActions.ts` |
| 수정 내용 | room actions, match actions, share state, screen state, props composer를 300줄 이하 hook/module로 유지한다. 현재 shell에 필요한 model만 조립한다. |
| 금지 사항 | navigation/GPS/polling/heartbeat 정책, UI, 방 생성/입장/초대/대결 시작/저장/기권 동작 변경 금지 |
| 추가할 테스트 | idle runtime excludes live state, lobby runtime excludes GPS/heartbeat, live runtime excludes invite inbox UI, return shape compatibility |
| 검증 명령어 | `npm run typecheck`, `npm run lint`, `npm run test`, `npm run perf:smells`, `npm run code:quality`, `git diff --check` |
| rollback 기준 | idle/lobby/live 화면 진입이 깨지거나 Android first tab cold path가 악화되면 rollback |
| 위험도 | High |
| 추천 커밋 메시지 | `refactor: reduce track run runtime facade` |

## PR-11: Backend Read-Only Route Extraction Continuation

| 항목 | 내용 |
| --- | --- |
| 목표 | `backend/src/server.mjs`에서 부작용 낮은 read-only route를 추가 분리한다. |
| 대상 파일 | `backend/src/server.mjs`, `backend/src/routes/*`, `backend/src/response/*`, `backend/src/services/*` |
| 수정 내용 | health/config/admin read-only 계열처럼 response shape가 명확한 route를 하나씩 module로 이동한다. |
| 금지 사항 | running match command route, room create/join/start, save/settlement write route, repository storage format, response field name 변경 금지 |
| 추가할 테스트 | backend smoke 유지, extracted route response shape assertion |
| 검증 명령어 | `npm run test`, `npm run backend:smoke`, `npm run code:quality`, `git diff --check`; 선택: `npm run release:gate:preview` |
| rollback 기준 | `backend:smoke` 실패, API response diff, preview gate 코드성 실패 발생 시 rollback |
| 위험도 | Medium-High |
| 추천 커밋 메시지 | `refactor: extract backend read-only routes` |

## PR-12: Flow-Level Regression Test Matrix Documentation

| 항목 | 내용 |
| --- | --- |
| 목표 | Running/Match/LiveMatch 핵심 플로우의 stale state, cleanup, single-flight, navigation recovery 테스트 매트릭스를 문서화한다. |
| 대상 파일 | `docs/full-codebase-quality-audit.md`, `docs/full-codebase-refactor-roadmap.md`, `docs/android-performance-regression-check.md`, QA checklist docs |
| 수정 내용 | 방 생성/삭제/blocker, 초대, manual join, ready/start, live navigation, RaceBoard, GPS, heartbeat, save/forfeit별 regression scenario와 로그 기대값을 정리한다. |
| 금지 사항 | 코드 변경, generated docs 수동 수정, Android/iOS config 변경 금지 |
| 추가할 테스트 | 이 PR에서는 코드 테스트 추가 대신 각 PR의 테스트 목록을 명확히 연결한다. |
| 검증 명령어 | `git diff --check` |
| rollback 기준 | 문서가 실제 파일 경로와 맞지 않거나 위험도/금지 사항이 모호하면 수정 |
| 위험도 | Low |
| 추천 커밋 메시지 | `docs: add running match regression roadmap` |

## 4. 지금 당장 시작할 PR 3개

1. PR-01 `Deleted room blocker/tombstone flow hardening`
   - 삭제 후 새 방 생성이 막히는 문제는 방 생성/삭제 correctness와 직결된다.
   - active hint, snapshot, create blocker, tombstone이 충돌하는 범위가 명확해 테스트 보호막을 먼저 만들기 좋다.

2. PR-02 `Invite inbox receiver ownership cleanup`
   - 친구 초대 성공 후 수신자 카드 미표시는 사용자가 수동 초대코드로 우회하게 만드는 P0 UX 문제다.
   - idle/pre-lobby와 joined/live pause 경계를 명확히 하면 Android 반복 fetch/log 부담도 줄일 수 있다.

3. PR-04 `Active room check stale/abort policy consolidation`
   - stale result, abort, live mounted skip은 방 입장과 live 화면 안정성 모두에 걸쳐 있다.
   - PR-03b도 중요하지만, PR #3에서 perf 일부가 이미 처리되었다는 전제에서는 active room stale 정리가 더 빠른 안정화 효과를 낸다.

## 5. 공통 완료 기준

- 코드 PR은 `npm run typecheck`, `npm run lint`, `npm run test`, `npm run perf:smells`, `npm run code:quality`, `git diff --check`를 기본으로 통과한다.
- 문서 전용 PR은 `git diff --check`를 필수로 통과한다.
- runtime/navigation/GPS/polling PR은 최신 Android trace가 있으면 `npm run perf:trace-analyze -- <trace>`를 추가한다.
- generated docs가 자동 변경되면 해당 PR 요약에 별도 기록하고, 수동 편집하지 않는다.
