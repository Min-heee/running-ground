# RunningGround Refactor Roadmap

기준 문서:

- `docs/code-quality-audit.md`
- `docs/code-quality-report.generated.md`
- `docs/runtime-registry-policy.md`

갱신일: 2026-05-15

## 전체 원칙

이 로드맵은 기능 변경 없이 검증 가능한 작은 PR 단위로 구조 리팩토링을 나눈다. P0는 런타임 상태 연결 책임을 줄이는 구조 작업, P1은 이미 진행한 LiveMatch/registry 분리를 더 안정화하는 후속 작업, P2는 backend 대형 파일 분리 계획이다.

공통 기준:

- UI 디자인, 라우팅 경로, GPS 기록, 승패/저장/기권 정책을 변경하지 않는다.
- 한 PR은 하나의 책임 경계만 다룬다.
- Android 성능 정책 변경은 P0 구조 분리 이후 별도 PR에서만 진행한다.
- `android/` untracked 폴더는 커밋 대상에서 제외한다.
- `docs/code-quality-report.generated.md`는 `npm run code:quality`로만 갱신한다.

공통 검증 명령어:

```bash
npm run typecheck
npm run lint
npm run test
npm run code:quality
git diff --check
```

Android 런타임 관련 PR 추가 검증:

```bash
npm run perf:smells
npm run perf:trace-analyze -- ./logs/android-live-match.txt
```

Backend 관련 PR 추가 검증:

```bash
npm run backend:smoke
npm run release:gate:preview
```

## 우선순위 요약

| 우선순위 | PR | 작업명 | 핵심 대상 | 위험도 | rollback 기준 |
| --- | --- | --- | --- | --- | --- |
| P0 | PR-01 | TrackRunExperience shell router 축소 | `TrackRunExperienceRuntime`, shell/view model 연결 | High | idle/lobby/live 중 하나라도 기존 화면 진입이 깨지면 revert |
| P0 | PR-02 | useRoomSnapshot 책임 분리 마감 | lobby snapshot, hydration, invite inbox | High | 방 생성 직후 no-room 재발 또는 초대 카드 미표시 재발 시 revert |
| P0 | PR-03 | useRunningMatchFocus 책임 분리 마감 | navigation owner, hydration, recovery policy | High | 같은 matchId navigation 반복 또는 live screen mount 실패 시 revert |
| P0 | PR-04 | useRunTrackingFlow facade 축소 | tracking session/lifecycle/actions/timers/snapshot | High | GPS 기록 저장값, 기권, 저장, pause/resume 회귀 시 revert |
| P1 | PR-05 | LiveMatch UI 렌더 경계 후속 정리 | LiveMatch sections, Arena, RaceBoard, ViewModel | Medium | RoadMotion UI 또는 탭 전환 동작 변경 시 revert |
| P1 | PR-06 | runtime registry primitive 마감 | polling, heartbeat, active-room single-flight | Medium-High | polling/heartbeat count 증가 또는 cleanup test 실패 시 revert |
| P2 | PR-07 | backend server.mjs 분리 1단계 | route extraction plan and first route | High | `backend:smoke` 또는 contract test 실패 시 revert |

## PR-01: TrackRunExperience Shell Router 축소

목표: `src/features/runs/containers/TrackRunExperienceRuntime.tsx`가 idle/lobby/live 전체 상태를 계속 구독하지 않도록 shell router와 상태별 shell의 경계를 명확히 한다.

| 항목 | 내용 |
| --- | --- |
| 포함 파일 | `src/features/runs/containers/TrackRunExperienceRuntime.tsx`, `src/features/runs/components/shells/*`, `src/features/runs/viewModels/useTrackRunIdleViewModel.ts`, `src/features/runs/hooks/useMatchRuntimeState.ts` |
| 제외 파일 | `src/features/runs/tracking/background/*`, `src/features/runs/sync/*`, `src/services/*`, `backend/src/*` |
| 작업 단위 | `IdleRunShell`, `MatchLobbyShell`, `LiveMatchShell`가 자기 상태에 필요한 props만 받도록 adapter를 분리한다. |
| 금지 사항 | navigation/GPS/polling/heartbeat 정책 변경 금지 |
| 검증 명령어 | 공통 검증 + `npm run perf:smells` |
| 위험도 | High |
| rollback 기준 | idle tab 버튼 반응, 방 생성/입장, live match 화면 진입 중 하나라도 기존보다 나빠지면 PR 전체 revert |

완료 기준:

- `TrackRunExperienceRuntime`의 50줄 이상 함수 후보가 줄어든다.
- idle shell이 live tracking/GPS/heartbeat selector를 직접 구독하지 않는다.
- lobby shell이 live progress/timer selector를 직접 구독하지 않는다.
- live shell이 invite inbox UI state를 직접 구독하지 않는다.

바로 실행 가능한 프롬프트:

```text
docs/refactor-roadmap.md의 PR-01만 진행해줘.

목표:
1. TrackRunExperienceRuntime을 shell router 중심으로 줄이기
2. IdleRunShell, MatchLobbyShell, LiveMatchShell이 필요한 상태만 받도록 adapter 분리
3. navigation/GPS/polling/heartbeat 정책 변경 금지
4. UI 디자인과 버튼 동작 변경 금지

검증:
npm run typecheck
npm run lint
npm run test
npm run code:quality
npm run perf:smells

마지막에 분리한 shell, 제외한 파일, rollback 기준 충족 여부를 요약해줘.
```

## PR-02: useRoomSnapshot 책임 분리 마감

목표: lobby snapshot polling, optimistic hydration, active room result handling, receiver invite inbox fetch가 서로 섞이지 않도록 책임 경계를 마감한다.

| 항목 | 내용 |
| --- | --- |
| 포함 파일 | `src/features/match/hooks/lobby/useRoomSnapshot.ts`, `src/features/match/hooks/lobby/roomSnapshot/*`, `src/features/match/hooks/lobby/useRoomInviteActions.ts` |
| 제외 파일 | `src/features/runs/lifecycle/*`, `src/features/runs/tracking/*`, `backend/src/*` |
| 작업 단위 | snapshot fetcher, hydration state, invite inbox receiver, polling owner policy, active room result handler를 더 작게 정리한다. |
| 금지 사항 | 초대코드 직접 입장, 방 생성/삭제 API 경로 변경 금지 |
| 검증 명령어 | 공통 검증 |
| 위험도 | High |
| rollback 기준 | 방 생성 후 no-room 화면이 다시 보이거나 receiver pending invite card가 표시되지 않으면 revert |

완료 기준:

- `useRoomSnapshot.ts`는 조립 facade 역할만 한다.
- host room snapshot polling과 receiver invite inbox fetch가 서로 다른 hook에서 관리된다.
- created/joined room hydration이 snapshot polling보다 먼저 UI state를 보호한다.
- selected invite count가 0이면 friend invite API가 호출되지 않는다.

바로 실행 가능한 프롬프트:

```text
docs/refactor-roadmap.md의 PR-02만 진행해줘.

목표:
1. useRoomSnapshot을 facade로 줄이고 roomSnapshot 폴더의 책임별 hook을 정리
2. optimistic room hydration과 서버 snapshot polling 분리
3. receiver invite inbox fetch를 userId 기준으로 분리
4. host polling과 receiver inbox polling이 섞이지 않게 하기
5. 초대코드 직접 입장과 방 생성/삭제 동작 변경 금지

검증:
npm run typecheck
npm run lint
npm run test
npm run code:quality

마지막에 no-room suppress, invite inbox receiver, rollback 기준을 요약해줘.
```

## PR-03: useRunningMatchFocus 책임 분리 마감

목표: running match focus, route hydration, navigation owner, mount signal, recovery polling policy를 각 모듈이 한 가지 책임만 갖도록 정리한다.

| 항목 | 내용 |
| --- | --- |
| 포함 파일 | `src/features/runs/lifecycle/hooks/useRunningMatchFocus.ts`, `src/features/runs/lifecycle/hooks/runningMatchFocus/*`, `src/features/runs/lifecycle/liveMatchNavigationGate.ts` |
| 제외 파일 | `src/features/runs/tracking/*`, `src/features/match/hooks/lobby/*`, `backend/src/*` |
| 작업 단위 | `useMatchFocusHydration`, `useLiveMatchNavigationOwner`, `useActiveRoomRecovery`, `useLiveMatchRecoveryPolicy`, `useLiveMatchMountSignalBridge` 책임을 재검토한다. |
| 금지 사항 | 라우팅 경로와 preferArena 정책 변경 금지 |
| 검증 명령어 | 공통 검증 + 관련 lifecycle/navigation 테스트 |
| 위험도 | High |
| rollback 기준 | 같은 matchId에서 navigation begin 반복, `success:false` 반복, mounted 후 recovery polling 중복이 재발하면 revert |

완료 기준:

- route state only는 success가 아니라 recovering으로 남는다.
- mount signal 또는 실제 live route 확인이 success 기준이다.
- recovery polling은 같은 `matchId`에 1개만 유지된다.
- stale active room result가 live match 화면을 내리지 못한다.

바로 실행 가능한 프롬프트:

```text
docs/refactor-roadmap.md의 PR-03만 진행해줘.

목표:
1. useRunningMatchFocus를 facade로 줄이고 navigation owner, hydration, recovery policy, mount signal bridge를 분리
2. route state only와 실제 mount signal을 명확히 구분
3. 같은 matchId navigation/recovery 중복 판단은 단일 policy에서 관리
4. 라우팅 경로, GPS, 저장, 승패 로직 변경 금지

검증:
npm run typecheck
npm run lint
npm run test
npm run code:quality

마지막에 navigation owner와 recovery polling rollback 기준을 요약해줘.
```

## PR-04: useRunTrackingFlow facade 축소

목표: tracking session, lifecycle action, timers, snapshot builder, GPS controller를 facade 아래로 정리해 GPS/timer/session/save 책임을 분리한다.

| 항목 | 내용 |
| --- | --- |
| 포함 파일 | `src/features/runs/hooks/useRunTrackingFlow.ts`, `src/features/runs/tracking/flow/*`, `src/features/runs/tracking/actions/useRunTrackingActions.ts`, `src/features/runs/tracking/session/*` |
| 제외 파일 | `src/features/runs/tracking/background/locationTaskManagerCore.ts`, `src/features/runs/sync/*`, `backend/src/*` |
| 작업 단위 | session state, lifecycle actions, timers, snapshot builder, GPS controller 경계를 더 작게 만든다. |
| 금지 사항 | GPS 기록 정확도, 저장 payload, 포인트/랭킹/승패 로직 변경 금지 |
| 검증 명령어 | 공통 검증 + tracking/session 관련 테스트 |
| 위험도 | High |
| rollback 기준 | 단독 러닝 저장, 대결 저장, pause/resume, 기권 중 하나라도 실패하면 revert |

완료 기준:

- `useRunTrackingFlow.ts`는 하위 hook 조립과 return shape 유지에 집중한다.
- save/finish/forfeit 함수 이름과 호출 의미가 유지된다.
- timer/elapsed state와 원본 tracking snapshot 경계가 명확해진다.

바로 실행 가능한 프롬프트:

```text
docs/refactor-roadmap.md의 PR-04만 진행해줘.

목표:
1. useRunTrackingFlow를 facade로 줄이고 tracking/flow 하위 hook 책임을 정리
2. useTrackingSessionState, useTrackingLifecycleActions, useTrackingTimers, useTrackingSnapshotBuilder, useTrackingGpsController 경계를 명확히 하기
3. save/finish/forfeit 함수 의미와 반환값 유지
4. GPS 기록 정확도와 저장 payload 변경 금지

검증:
npm run typecheck
npm run lint
npm run test
npm run code:quality

마지막에 flow facade 축소 내용과 rollback 기준을 요약해줘.
```

## PR-05: LiveMatch UI 렌더 경계 후속 정리

목표: 이미 분리된 LiveMatch UI 섹션을 기준으로 남은 render boundary 후보를 작게 정리한다.

| 항목 | 내용 |
| --- | --- |
| 포함 파일 | `src/features/runs/components/LiveMatchTrackingPage.tsx`, `src/features/runs/components/liveMatchTracking/*`, `src/features/runs/components/LiveMatchPager.tsx`, `src/features/runs/components/liveMatchPager/*`, `src/components/matches/LiveMatchArena.tsx`, `src/components/matches/liveMatchArena/*`, `src/components/matches/LiveMatchRaceBoard.tsx`, `src/components/matches/liveMatchRaceBoard/*`, `src/features/runs/viewModels/useLiveMatchViewModel.ts`, `src/features/runs/viewModels/useLiveMatchProgress.ts` |
| 제외 파일 | `src/features/runs/lifecycle/*`, `src/features/runs/tracking/*`, `src/features/runs/sync/*` |
| 작업 단위 | inline style 후보, ranking row 계산, mount signal hook effect 분리 후보를 작게 정리한다. |
| 금지 사항 | RoadMotion 디자인, tab label, 대결 진행/기권/저장 동작 변경 금지 |
| 검증 명령어 | 공통 검증 |
| 위험도 | Medium |
| rollback 기준 | RoadMotion 위치/색/움직임, RaceBoard row UI, 탭 전환 UI가 바뀌면 revert |

완료 기준:

- `LiveMatchTrackingPage`, `LiveMatchPager`, `LiveMatchArena`, `LiveMatchRaceBoard`는 300줄 미만을 유지한다.
- Android에서 현재 선택되지 않은 탭의 무거운 계산이 실행되지 않는다.
- `useLiveMatchProgress`의 ranking/status 계산은 memo 또는 순수 함수 경계에 있다.

바로 실행 가능한 프롬프트:

```text
docs/refactor-roadmap.md의 PR-05만 진행해줘.

목표:
1. LiveMatch UI 섹션 분리 후 남은 inline style/object/function 후보를 줄이기
2. LiveMatchRankingSection row style과 LiveMatchPagerTabs tab style을 memoized child 경계로 정리
3. useLiveMatchProgress ranking/status 계산을 순수 함수 또는 useMemo 경계로 더 명확히 하기
4. RoadMotion 디자인과 대결 진행/기권/저장 정책 변경 금지

검증:
npm run typecheck
npm run lint
npm run test
npm run code:quality

마지막에 줄어든 code-quality 후보와 UI 변경 없음 여부를 요약해줘.
```

## PR-06: Runtime Registry Primitive 마감

목표: polling, heartbeat, active-room single-flight primitive가 모든 런타임 경로에서 일관되게 쓰이도록 마감한다.

| 항목 | 내용 |
| --- | --- |
| 포함 파일 | `src/utils/rgKeyedRegistry.ts`, `src/utils/rgPollingRegistry.ts`, `src/utils/rgHeartbeatRegistry.ts`, `src/features/runs/sync/registryKeys.ts`, `src/features/runs/sync/activeRoomCheck.ts`, `src/features/runs/sync/matchPolling/useBlockingMatchStatusPolling.ts`, `src/features/runs/sync/useMatchProgressSync.ts`, `src/features/runs/sync/partyRunSync/*`, `docs/runtime-registry-policy.md` |
| 제외 파일 | `src/features/runs/tracking/background/*`, `src/features/runs/lifecycle/*`, `backend/src/*` |
| 작업 단위 | 남은 ad-hoc registry key, polling interval setup, heartbeat owner check를 공통 primitive로 통일한다. |
| 금지 사항 | polling interval, heartbeat cadence, API 호출 주기 변경 금지 |
| 검증 명령어 | 공통 검증 + registry 테스트 |
| 위험도 | Medium-High |
| rollback 기준 | `resource summary`에서 polling/heartbeat count가 증가하거나 cleanup test가 실패하면 revert |

완료 기준:

- key 정책은 `active-room:<userId/source>`, `blocking-match-status:<matchId>`, `match-progress:<matchId>`만 사용한다.
- 같은 key 중복 start 방지, stop 후 재시작 가능, stale result ignored 테스트가 유지된다.
- `setInterval/setTimeout/subscription cleanup` High 항목이 0으로 유지된다.

바로 실행 가능한 프롬프트:

```text
docs/refactor-roadmap.md의 PR-06만 진행해줘.

목표:
1. runtime registry primitive 사용 경로를 마감
2. active-room, blocking-match-status, match-progress key 정책을 코드와 테스트에서 일관되게 사용
3. polling interval과 heartbeat cadence 변경 없이 중복 구현만 제거
4. cleanup 보장 테스트 유지 및 필요한 테스트 추가

검증:
npm run typecheck
npm run lint
npm run test
npm run code:quality

마지막에 registry key 정책, cleanup 테스트, code-quality cleanup 후보 변화를 요약해줘.
```

## PR-07: Backend server.mjs 분리 1단계

목표: `backend/src/server.mjs` 6392줄을 한 번에 쪼개지 않고, smoke 영향이 낮은 route부터 routes/controllers/services/repositories 경계를 만든다.

| 항목 | 내용 |
| --- | --- |
| 포함 파일 | `backend/src/server.mjs`, `backend/src/routes/*`, `backend/src/response/*`, `backend/src/services/*`, `backend/src/smoke.mjs`, `backend/src/runningMatchContract.test.mjs`, `docs/backend-server-refactor-plan.md` |
| 제외 파일 | `src/features/*`, `src/services/*`, mobile UI 코드 |
| 작업 단위 | health/admin/read-only route 또는 response builder처럼 부작용이 낮은 단위부터 추출한다. |
| 금지 사항 | API path, response shape, repository storage format 변경 금지 |
| 검증 명령어 | `npm run test`, `npm run backend:smoke`, `npm run release:gate:preview`, `npm run code:quality` |
| 위험도 | High |
| rollback 기준 | smoke, contract, preview gate 중 하나라도 실패하거나 response diff가 생기면 revert |

분리 순서:

| 단계 | 작업 | 이유 |
| --- | --- | --- |
| 1 | response builder와 common error helper 추출 | route behavior 변경 없이 중복을 줄이기 쉽다. |
| 2 | health/config/read-only route 추출 | DB write 위험이 낮다. |
| 3 | room/match response builder 추출 | running match contract test로 보호할 수 있다. |
| 4 | running match command route 추출 | 가장 위험하므로 마지막에 진행한다. |

바로 실행 가능한 프롬프트:

```text
docs/refactor-roadmap.md의 PR-07 1단계만 진행해줘.

목표:
1. backend/src/server.mjs에서 response builder와 common error helper만 먼저 분리
2. API path, response shape, repository storage format 변경 금지
3. health/read-only route 외 running match command route는 건드리지 않기
4. backend smoke와 release gate 기준으로 검증

검증:
npm run test
npm run backend:smoke
npm run release:gate:preview
npm run code:quality

마지막에 분리한 backend 파일, smoke 영향 범위, rollback 기준을 요약해줘.
```

## PR 진행 순서

| 순서 | PR | 이유 |
| --- | --- | --- |
| 1 | PR-02 | lobby hydration/invite inbox는 사용자 체감 이슈와 직접 연결되어 있고 범위가 runs tracking보다 좁다. |
| 2 | PR-03 | live match navigation/recovery 안정성이 TrackRunExperience shell 축소의 선행 조건이다. |
| 3 | PR-01 | owner/hydration 경계가 정리된 뒤 shell 구독 경계를 줄이면 회귀 추적이 쉽다. |
| 4 | PR-04 | shell 경계 이후 tracking facade를 줄여 GPS/timer state 전파를 더 안전하게 분리한다. |
| 5 | PR-05 | UI 렌더 경계는 구조 안정화 후 남은 render 후보를 정리한다. |
| 6 | PR-06 | runtime registry는 이미 일부 정리됐으므로 후속 마감 PR로 작게 유지한다. |
| 7 | PR-07 | backend는 mobile runtime PR과 분리해 smoke/release gate 중심으로 진행한다. |
