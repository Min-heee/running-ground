# Codex PR Execution Plan (PR-02 ~ PR-12)

> 이 문서는 사용자가 Codex에게 각 PR을 **그대로 복붙해서 시키기 위한 지시문 모음**입니다. PR-01은 별도로 이미 시작됨. 각 PR이 끝나면 다음 PR 지시문을 복사해서 보내면 됩니다.

## 공통 원칙 (모든 PR에 적용)

- **한 번에 PR 하나만**. 이전 PR 머지된 상태에서 다음 PR 시작.
- 베이스 브랜치는 `feature/ios-oauth-flow`의 최신 상태 (이전 PR이 거기에 머지됐다고 가정).
- 각 PR마다 별도 브랜치 + 별도 PR.
- **PR #3 perf 영역 (`serverClockSync`, `derivePartyRunStartPhase` fallback, polling interval 5s, tab lazy/freezeOnBlur, Card shadow Platform 분기)은 절대 재수정 금지**.
- public API, runtimeVersion, iOS updates config, GPS 정책, heartbeat interval, navigation route, UI 디자인 변경 금지.
- 검증 명령은 PR마다 동일: `npm run typecheck`, `npm run lint` (`.claude/**` 무시), `npm run test`, `npm run perf:smells`, `npm run code:quality`, `git diff --check`.
- 검증 실패 시 rollback 후 사용자에게 보고. 우회 금지.
- generated docs(`docs/android-performance-regression-check.md`, `docs/code-quality-report.generated.md`)가 자동 갱신되면 같이 commit하고 PR 본문에 기록.
- `app.json` buildNumber, untracked `android/`, `logs/`, `.vscode/`, `.claude/`는 unrelated로 두고 범위 밖.

각 PR 지시문 끝에 다음 형식으로 보고 요청:
- 브랜치 이름 / PR URL
- 변경 요약
- 추가한 테스트 목록
- 검증 결과 (통과/실패)
- generated docs 변경 여부

---

## PR-02 — Invite Inbox Receiver Ownership Cleanup

> PR-01 머지 후 시작.

```
RunningGround 리포에서 다음 작업을 진행해줘.

전제:
- PR-01 (Deleted room blocker)이 머지된 상태
- 베이스 브랜치: feature/ios-oauth-flow의 최신
- 새 브랜치: fix/pr-02-invite-inbox-receiver

작업: docs/full-codebase-refactor-roadmap.md의 PR-02 (Invite Inbox Receiver Ownership Cleanup) 그대로 실행.

목표:
- receiver invite inbox fetch를 idle/pre-lobby 전용 owner로 분리
- timeout/retry/display 경계 명확화

대상 파일:
- src/features/runs/sync/roomInviteInbox.ts
- src/features/runs/runtime/useTrackRunRuntimeRecipientInviteInbox.ts
- src/features/match/hooks/lobby/roomSnapshot/useInviteInboxReceiver.ts
- src/features/match/hooks/lobby/useRoomInviteActions.ts
- invite service/guard files (관련 invite matching/timeout 코드)

수정 내용:
- public tag/internal id/invitedFriendId matching을 순수 함수로 분리하고 테스트 고정
- joined/live 상태에서 focus effect pause, no-room key fetch 차단

금지 사항:
- 초대코드 직접 입장 흐름 변경 금지
- friend invite response shape 변경 금지
- UI 카드 디자인 변경 금지
- joined/live pause 정책의 의도 자체는 유지

추가 테스트:
- public tag match
- internal id match
- timeout retry scheduled
- pending invite display model
- joined/live focus pause
- duplicate card 방지

rollback 기준:
- idle/pre-lobby 초대 수신 실패
- joined/live에서 inbox fetch 반복 재발
- 수동 초대코드 입장 깨짐

커밋 메시지: `fix: isolate receiver invite inbox owner`

작업 끝나면 브랜치 push + PR 생성 (base: feature/ios-oauth-flow). PR 본문에 변경 요약/추가 테스트/검증 결과 포함.
```

---

## PR-03b — Live Match Navigation/Recovery State Split

> PR-02 머지 후 시작. **주의: PR #3에서 손댄 perf 영역은 재수정 금지.**

```
RunningGround 리포에서 다음 작업을 진행해줘.

전제:
- PR-01, PR-02 머지됨
- PR #3 perf 영역은 그대로 유지하고 재수정 금지
- 베이스 브랜치: feature/ios-oauth-flow의 최신
- 새 브랜치: fix/pr-03b-live-match-recovery-split

작업: docs/full-codebase-refactor-roadmap.md의 PR-03b (Live Match Navigation/Recovery State Split) 그대로 실행.

목표:
- PR #3 이후에도 남은 routeStateOnly/recovery/mounted/final failure 상태를 분리

대상 파일:
- src/features/runs/lifecycle/hooks/runningMatchFocus/useLiveMatchNavigationExecutor.ts
- src/features/runs/lifecycle/hooks/runningMatchFocus/useLiveMatchRecoveryPolicy.ts
- src/features/runs/lifecycle/hooks/runningMatchFocus/useLiveMatchNavigationOwner.ts
- src/features/runs/lifecycle/hooks/runningMatchFocus/useLiveMatchMountSignalBridge.ts
- src/features/runs/lifecycle/liveMatchMountedRegistry.ts
- src/features/runs/sync/matchPolling/useBlockingMatchStatusPolling.ts

수정 내용:
- route state hydrated 상태는 즉시 failure로 끝내지 않고 recovering으로 유지
- mounted matchId는 recovery polling 재시작 skip
- recovered navigation은 perf trace failure로 잡히지 않게 로그 분리

금지 사항:
- PR #3의 polling interval(idle 5s), perf trace 변경 재수정 금지
- 라우팅 경로 변경 금지
- preferArena 정책 변경 금지
- GPS/background tracking, UI 변경 금지

추가 테스트:
- routeStateOnly pending recovery
- recovery success marks recovered
- finalized failure only after retry exhausted
- mounted match skips blocking polling
- duplicate owner cleanup

rollback 기준:
- live screen mount 실패
- 같은 matchId navigation 반복
- mounted 후 recovery polling 재시작
- success:false 반복 재발

커밋 메시지: `fix: split live match recovery navigation state`

작업 끝나면 push + PR 생성. PR 본문에 PR #3의 어떤 변경을 의도적으로 안 건드렸는지도 명시.
```

---

## PR-04 — Active Room Check Stale/Abort Policy Consolidation

> PR-03b 머지 후 시작.

```
RunningGround 리포에서 다음 작업을 진행해줘.

전제: PR-01, PR-02, PR-03b 머지됨.
브랜치: fix/pr-04-active-room-check
베이스: feature/ios-oauth-flow의 최신

작업: roadmap PR-04 그대로 실행.

목표:
- activeRoomCheck의 single-flight/timeout/abort/stale policy를 일관 적용

대상 파일:
- src/features/runs/sync/activeRoomCheck.ts
- 방 snapshot handler들 (위 audit doc P0 후보)

수정 내용:
- request registry, stale policy, result mapper 분리
- routeKey/live mounted skip 정책 일관화
- abort/timeout 후 inFlight/pending state cleanup 보장

금지 사항:
- API path 변경 금지
- snapshot response shape 변경 금지
- UI 변경 금지

추가 테스트:
- single-flight reuses active request
- stale result ignored after newer request
- abort cleanup releases inFlight
- live mounted matchId skips active check
- routeKey mismatch ignored

rollback 기준:
- 방 입장 시 active check 실패가 반복됨
- stale snapshot이 새 방을 덮음
- 동일 키 중복 요청이 다시 발생

커밋 메시지: `fix: consolidate active room check stale and abort policy`
```

---

## PR-05 — Manual Invite Join Single-Flight and Preflight Boundary

> PR-04 머지 후. P0 마지막 묶음.

```
전제: PR-01, PR-02, PR-03b, PR-04 머지됨.
브랜치: fix/pr-05-manual-invite-join
베이스: feature/ios-oauth-flow의 최신

작업: roadmap PR-05.

목표:
- manual invite join single-flight 보장 + preflight 경계 명확화

대상 파일:
- src/features/runs/sync/manualInviteJoin.ts (또는 동등 위치)
- 방 입장 action 관련 hook들
- preflight 검증 helpers

수정 내용:
- single-flight registry로 동일 invite code 중복 join 차단
- preflight (active room 확인, blocker 확인)을 별도 helper로 분리
- failure 후 retry policy 명시

금지 사항:
- 초대코드 형식 변경 금지
- API path 변경 금지
- UI 변경 금지

추가 테스트:
- duplicate invite code join blocked
- preflight failure (active blocker) surfaces correct error
- success clears single-flight registry
- abort cleanup

rollback 기준:
- 정상 초대코드 입장 실패
- preflight false negative로 입장 차단

커밋 메시지: `fix: enforce single-flight manual invite join with preflight`
```

---

## PR-06 — RaceBoard Participant-First Model Cleanup

> P0 묶음 머지 후 P1 시작.

```
전제: PR-01 ~ PR-05 머지됨.
브랜치: refactor/pr-06-raceboard-participant-first
베이스: feature/ios-oauth-flow의 최신

작업: roadmap PR-06.

목표:
- race board를 participant-first row builder로 정리
- 상대 progress 누락 시 row 보존 보장

대상 파일:
- src/features/runs/viewModels/liveMatchRaceBoardViewModel.ts
- 보드 row builder/progress merge helpers
- 관련 test files

수정 내용:
- participant 기준으로 row 생성 (progress 없어도 row 유지)
- progress가 도착하면 merge
- ranking 계산은 별도 pure helper

금지 사항:
- 보드 UI 디자인 변경 금지
- progress payload shape 변경 금지

추가 테스트:
- participant row preserved when progress missing
- progress merge updates existing row
- ranking stable across missing progress

rollback 기준:
- 보드에서 상대 row 사라짐
- ranking 순서 깨짐

커밋 메시지: `refactor: build race board rows from participants first`
```

---

## PR-07 — Heartbeat/Progress Registry Cleanup Tests

```
전제: PR-06 머지됨.
브랜치: test/pr-07-heartbeat-progress-cleanup
베이스: feature/ios-oauth-flow의 최신

작업: roadmap PR-07.

목표:
- heartbeat/progress registry cleanup 테스트 보강

대상 파일:
- src/features/runs/sync/heartbeat 관련 hooks/registry
- src/features/runs/sync/useMatchProgressSync.ts
- 관련 test files

수정 내용 (테스트 중심, 기존 동작 유지):
- duplicate heartbeat owner cleanup 테스트
- progress payload commit ordering 테스트
- abort/leave 후 registry release 테스트
- 필요한 helper만 작은 단위로 추출 (큰 리팩토링 X)

금지 사항:
- heartbeat interval 변경 금지
- progress payload shape 변경 금지

추가 테스트:
- duplicate registration blocked
- leave releases owner
- progress queue commit order

커밋 메시지: `test: cover heartbeat and progress registry cleanup`
```

---

## PR-08 — GPS/Tracking Task Boundary Audit and Tests

```
전제: PR-07 머지됨.
브랜치: test/pr-08-gps-tracking-boundary
베이스: feature/ios-oauth-flow의 최신

작업: roadmap PR-08. 위험도 High — 신중하게.

목표:
- location task manager + app state sync 경계 audit + 테스트 보강

대상 파일:
- src/features/runs/tracking 관련 (location task manager)
- app state sync hooks

수정 내용 (테스트 + 작은 경계 정리):
- background/foreground transition 시 task 시작/종료 테스트
- permission grant/deny path 테스트
- task duplicate start 방지 테스트
- 필요시 helper 추출 (대대적 리팩토링 X)

금지 사항:
- GPS 정책 변경 금지
- 위치 데이터 정확도 변경 금지
- permission 흐름 변경 금지

추가 테스트:
- foreground → background → foreground task lifecycle
- permission denied path
- duplicate task start blocked

rollback 기준:
- 위치 추적 시작 실패
- background 추적 끊김
- duplicate task 생성

커밋 메시지: `test: cover location tracking task boundary cases`
```

---

## PR-09 — LiveMatch Render Boundary Follow-Up

```
전제: PR-08 머지됨.
브랜치: refactor/pr-09-livematch-render-boundary
베이스: feature/ios-oauth-flow의 최신

작업: roadmap PR-09.

목표:
- pager/pages/container/shell의 props 경계 정리

대상 파일:
- src/features/runs/components 또는 src/features/match/components의 LiveMatch 관련 컴포넌트
- pager / pages / container / shell 관련 파일

수정 내용:
- props drilling 정리, 필요한 곳에 useMemo/memo 적용
- container ↔ presentational 분리 명확화

금지 사항:
- UI 디자인 변경 금지
- prop name public API 깨는 변경 금지

추가 테스트:
- 각 page snapshot 또는 props mapping 테스트
- memo가 같은 props에 재렌더 안 함 확인

커밋 메시지: `refactor: tighten live match render boundary`
```

---

## PR-10 — TrackRun Runtime Model Split Continuation

> 대형 파일 분리. 위험도 High.

```
전제: PR-09 머지됨.
브랜치: refactor/pr-10-trackrun-runtime-split
베이스: feature/ios-oauth-flow의 최신

작업: roadmap PR-10.

목표:
- src/features/runs/runtime/TrackRunExperienceRuntimeModel.tsx (1944줄, 함수 1798줄) 분리 계속

수정 내용:
- shell별 runtime model (idle, lobby, live) 분리
- action adapter 패턴으로 room action / match action 분리
- facade 패턴으로 외부 API 유지

금지 사항:
- 외부 export name 깨지 말 것
- 동작 변경 금지 (refactor only)
- runtime trace logging은 의도 유지

추가 테스트:
- runtime model state transition 테스트 (각 shell)
- action adapter dispatch 테스트
- facade public API 안정성 테스트

rollback 기준:
- 매치/방 lifecycle 회귀
- navigation 회귀

커밋 메시지: `refactor: split track run runtime model by shell`
```

---

## PR-11 — Backend Read-Only Route Extraction Continuation

```
전제: PR-10 머지됨.
브랜치: refactor/pr-11-backend-route-split
베이스: feature/ios-oauth-flow의 최신

작업: roadmap PR-11. backend/src/server.mjs (6190줄) 분리 계속.

목표:
- read-only route + response helpers를 별도 module로 추출

대상 파일:
- backend/src/server.mjs
- backend/src/routes/* (필요시 신규)
- backend/src/responses/* (필요시 신규)

수정 내용:
- GET-only routes 분리 (write route는 다른 PR로)
- response builder helpers 별도 module
- repository wiring는 그대로 두고 route 분리만

금지 사항:
- API path/shape 변경 금지
- write routes 손대지 말 것 (다음 PR)
- repository 동작 변경 금지

추가 테스트:
- 기존 contract tests 통과
- read route response equivalence 테스트

커밋 메시지: `refactor: extract read-only routes from server.mjs`
```

---

## PR-12 — Flow-Level Regression Test Matrix Documentation

```
전제: PR-11 머지됨.
브랜치: docs/pr-12-regression-matrix
베이스: feature/ios-oauth-flow의 최신

작업: roadmap PR-12. docs only.

목표:
- 13개 플로우(audit doc Task 2 매트릭스 기반)에 대한 regression test matrix 작성

대상 파일:
- docs/regression-test-matrix.md (신규)
- 필요시 일부 targeted test 추가 (gap 메우기)

수정 내용:
- 각 플로우 × 시나리오 × 디바이스 × 기대 동작 매트릭스
- 현재 test 커버되는 곳 / gap 명시
- 사용자가 manual 측정 시 사용할 checklist 포함

검증: git diff --check + npm run typecheck (테스트 추가 시).

커밋 메시지: `docs: regression test matrix for match flows`
```

---

## 진행 체크리스트 (사용자가 사용)

- [ ] PR-01: Deleted Room Blocker (이미 시작)
- [ ] PR-02: Invite Inbox Receiver
- [ ] PR-03b: Live Match Recovery Split
- [ ] PR-04: Active Room Check Stale/Abort
- [ ] PR-05: Manual Invite Join Single-Flight
- [ ] PR-06: RaceBoard Participant-First
- [ ] PR-07: Heartbeat/Progress Tests
- [ ] PR-08: GPS/Tracking Boundary
- [ ] PR-09: LiveMatch Render Boundary
- [ ] PR-10: TrackRun Runtime Split
- [ ] PR-11: Backend Read-Only Routes
- [ ] PR-12: Regression Test Matrix

각 PR 머지 후 다음 PR 지시문을 Codex에 복사해서 보내면 됩니다.
