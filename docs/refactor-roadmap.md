# RunningGround 리팩토링 로드맵

기준 문서:

- `docs/code-quality-audit.md`
- `docs/code-quality-report.generated.md`

작성일: 2026-05-15

## 방향

이번 로드맵은 큰 파일을 한 번에 갈아엎지 않고, 기능 변경 위험이 낮은 분리부터 시작해 Android 런타임 안정화와 API/type/test 강화로 이어지는 순서로 나눈다.

핵심 원칙:

- UI와 기능을 유지한다.
- 파일 이동과 책임 분리는 작은 PR 단위로 한다.
- `TrackRunExperience.tsx`, GPS/background tracking, polling/navigation은 바로 큰 수정에 들어가지 않고 준비 단계와 테스트를 먼저 둔다.
- 각 묶음은 `typecheck`, `lint`, `test`를 기본 통과 기준으로 삼는다.
- Android 성능 관련 묶음은 `perf:smells`와 필요 시 `perf:trace-analyze`까지 확인한다.

## 1차 리팩토링 묶음: 안전한 파일 분리와 표현 컴포넌트 정리

목표: 기능 변경 위험이 낮은 큰 presentational 파일과 스타일 파일부터 줄인다.

대상 파일:

| 대상 | 작업 단위 | 기대 효과 | 위험도 |
| --- | --- | --- | --- |
| `src/features/integrations/NrcBridgeGuideCard.tsx` | action button 영역, guide section, status copy를 하위 component로 분리 | 775줄 card를 읽기 쉬운 조립 파일로 축소 | Low |
| `src/features/auth/screens/SignupFormScreen.tsx` | 입력 섹션, 약관 섹션, region/university 안내 섹션을 `components/signup`으로 분리 | 709줄 화면 JSX 축소, form hook 변경 없이 UI 분리 | Low |
| `src/features/auth/screens/UniversityVerificationScreen.tsx` | 대학 검색 결과 row, empty/loading 안내, action footer 분리 | 렌더 중 map 후보와 큰 화면 JSX 감소 | Low |
| `src/features/friends/FriendsRanking.tsx` | ranking transform은 utils, row UI는 component로 분리 | ranking 재사용성 증가, 화면 책임 축소 | Low |
| `src/features/runs/components/matchSetupCards/styles.ts` | 공통 spacing/radius/text style을 작은 style modules로 분리 | style 파일 과밀 완화 | Low |
| `src/features/settings/admin/components/adminStyles.ts` | admin section별 style module 분리 | admin UI 유지하면서 style 탐색성 개선 | Low |

검증 명령어:

```bash
npm run typecheck
npm run lint
npm run test
npm run code:quality
```

완료 기준:

- UI 스냅샷 수준의 화면 변경이 없어야 한다.
- 기능 hook과 service 호출 흐름은 건드리지 않는다.
- 300줄 이상 presentational 파일 수가 줄어야 한다.
- `docs/code-quality-report.generated.md`에서 큰 JSX 파일 후보가 감소해야 한다.

## 2차 리팩토링 묶음: 컴포넌트, hook, ViewModel 책임 분리

목표: `runs`와 `match`의 큰 hook/component를 기능 단위로 나누되, polling/GPS/navigation 정책 자체는 아직 바꾸지 않는다.

대상 파일:

| 대상 | 작업 단위 | 기대 효과 | 위험도 |
| --- | --- | --- | --- |
| `src/features/runs/components/LiveMatchTrackingPage.tsx` | 대결 보기, 순위 보기, 기록 보기 content를 하위 component로 분리 | live match tab별 렌더 책임 명확화 | Medium |
| `src/components/matches/LiveMatchArena.tsx` | summary chip, race board shell, road section container 분리 | arena props 흐름 단순화 | Medium |
| `src/features/runs/components/LiveMatchPager.tsx` | pager shell과 page content props adapter 분리 | tab 전환과 content 렌더 경계 명확화 | Medium |
| `src/features/runs/viewModels/useLiveMatchViewModel.ts` | button visibility, progress display, opponent display 계산을 순수 builder로 이동 | ViewModel 테스트 용이성 증가 | Medium |
| `src/features/runs/viewModels/useLiveMatchProgress.ts` | ranking/progress 계산을 순수 함수로 분리 | render 중 계산 비용 추적 쉬움 | Medium |
| `src/features/match/hooks/lobby/useRoomInviteActions.ts` | friend invite send, invite inbox, submit guard hook 분리 | 초대 send/receive 문제 디버깅 쉬움 | Medium |
| `src/features/match/hooks/lobby/useRoomStartActions.ts` | start command와 live handoff intent 생성 분리 | 시작 API와 화면 handoff 책임 분리 | Medium |
| `src/features/runs/hooks/useRunSaveFlow.ts` | finish, save, forfeit, cleanup command 분리 | 저장/기권 로직 회귀 테스트 보강 가능 | Medium-High |

검증 명령어:

```bash
npm run typecheck
npm run lint
npm run test
npm run code:quality
```

완료 기준:

- `TrackRunExperience.tsx` 기능은 그대로 둔 상태에서 주변 ViewModel/component 파일 크기가 줄어야 한다.
- ViewModel 순수 함수 테스트가 추가되어야 한다.
- 대결 보기/순위 보기/기록 보기 탭 UI와 버튼 동작이 변하지 않아야 한다.

## 3차 리팩토링 묶음: Android 성능과 런타임 안정화

목표: Android에서 버튼 반응, live match mount 안정성, polling/GPS/navigation 중복을 줄인다. 이 묶음은 기능 변경 위험이 높으므로 테스트와 로그 확인을 반드시 같이 진행한다.

대상 파일:

| 대상 | 작업 단위 | 기대 효과 | 위험도 |
| --- | --- | --- | --- |
| `src/features/runs/TrackRunExperience.tsx` | shell router만 남기고 `IdleRunShell`, `MatchLobbyShell`, `LiveMatchShell` 구독 경계 강화 | idle/lobby/live 상위 렌더 전파 감소 | High |
| `src/features/runs/hooks/useRunTrackingFlow.ts` | tracking session, start/stop command, elapsed ticker, background sync 구독 경계 재정리 | GPS tick이 상위 화면을 깨우는 문제 감소 | High |
| `src/features/runs/lifecycle/hooks/useRunningMatchFocus.ts` | active room recovery, navigation owner, match focus hydration 분리 | navigation 반복/late result 흔들림 감소 | High |
| `src/features/match/hooks/lobby/useRoomSnapshot.ts` | room snapshot polling, optimistic hydration, invite inbox fetch를 owner별로 분리 | 대기실과 live-match handoff 충돌 감소 | High |
| `src/features/runs/sync/activeRoomCheck.ts` | local hint guard, hard timeout, stale generation test 강화 | idle active room check로 인한 JS frame delay 감소 | High |
| `src/features/runs/sync/matchPolling/useBlockingMatchStatusPolling.ts` | recovery polling singleton key와 cleanup test 강화 | duplicate polling 방지 | Medium-High |
| `src/features/runs/sync/useMatchProgressSync.ts` | heartbeat registry/payload builder 분리 | heartbeat 중복 시작 방지 | Medium-High |
| `src/features/runs/tracking/background/locationTaskManagerCore.ts` | appState active native background start 차단과 timeout test 강화 | GPS/background task가 UI를 block하는 문제 감소 | High |
| `src/features/runs/tracking/useTrackingAppStateSync.ts` | appState debounce와 active/background 전환 policy 재확인 | watcher/task 중복 위험 감소 | High |

검증 명령어:

```bash
npm run typecheck
npm run lint
npm run test
npm run perf:smells
npm run code:quality
```

실기기 로그 검증:

```bash
npm run perf:trace-analyze -- ./logs/android-live-match.txt
```

완료 기준:

- idle 상태에서 active room check가 local hint 없이 시작되지 않아야 한다.
- live match navigation begin이 같은 matchId로 반복되지 않아야 한다.
- recovery polling은 같은 matchId에서 1개만 유지되어야 한다.
- GPS/background task start가 UI mount/navigation success 판정을 block하지 않아야 한다.
- render counter 기준 목표를 재확인한다.
  - `IdleRunShell`: 10초 5회 이하
  - `MatchLobbyShell`: 10초 10회 이하
  - `LiveMatchShell`: 10초 15회 이하

## 4차 리팩토링 묶음: API guard, 타입 정리, 테스트 강화

목표: 런타임 안정화 이후 API 응답 경계와 테스트 커버리지를 강화해 출시 전 회귀 위험을 낮춘다.

대상 파일:

| 대상 | 작업 단위 | 기대 효과 | 위험도 |
| --- | --- | --- | --- |
| `src/lib/api/services/rooms.ts` | room create/join/delete/leave/cleanup-stale guard 일관화 | `success:true` 필수 필드 누락 방어 강화 | Medium |
| `src/lib/api/services/matches.ts` | linked match status, heartbeat, queue response guard 정리 | match 상태 응답 불일치 방어 | Medium |
| `src/lib/api/services/runningRoomResponseGuards.ts` | guard 함수와 error code 표준화 | 사용자 메시지와 내부 로그 메시지 분리 | Medium |
| `src/lib/api/services/runningMatchResponseGuards.ts` | match status/progress guard 강화 | live progress 회귀 방지 | Medium |
| `src/lib/session.ts` | auth API 호출과 session storage를 분리하는 계획 수립 또는 1차 분리 | service 경계 명확화 | Medium |
| `src/domain/*`, `src/lib/api/types/*` | 중복 타입과 local-only 타입 정리 | 타입 source of truth 강화 | Medium |
| `backend/src/server.mjs` | route handler, response builder, service helper 단계적 분리 | 6392줄 server hotfix 위험 감소 | High |
| `backend/src/repositories/postgres*.mjs` | mapper/query/command 분리 | Postgres/JSON repository parity 테스트 쉬움 | Medium-High |
| `backend/src/runningMatchContract.test.mjs` | fixture/harness 분리 | contract test 유지보수성 개선 | Low-Medium |

검증 명령어:

```bash
npm run typecheck
npm run lint
npm run test
npm run backend:smoke
npm run code:quality
```

Preview 배포 전 추가 검증:

```bash
npm run release:gate:preview
npm run preview:smoke
```

완료 기준:

- room/match API에서 필수 필드 누락 성공 응답은 모두 실패로 처리된다.
- stale/blocker/already joined/not found error code가 일관된다.
- backend contract test와 smoke test가 API 문서와 맞아야 한다.
- `server.mjs`는 한 번에 크게 쪼개지 말고 route/domain별로 나눠야 한다.

## 실행 순서 제안

| 순서 | 묶음 | 먼저 할 이유 | 멈춰야 하는 신호 |
| --- | --- | --- | --- |
| 1 | 1차 안전 분리 | 기능 리스크가 낮고 코드 품질 리포트 숫자를 바로 낮출 수 있다. | UI diff가 발생하거나 hook/service 흐름을 건드리게 될 때 |
| 2 | 2차 책임 분리 | live match 주변 props/view model을 작게 만들어 3차 성능 작업의 충돌을 줄인다. | 대결/초대/기권 액션 함수의 의미가 바뀔 때 |
| 3 | 3차 Android 안정화 | 현재 실기기 병목과 직접 연결된다. 단, 테스트와 로그가 준비된 뒤 해야 한다. | polling/GPS/navigation 정책이 동시에 바뀌어 원인 추적이 어려울 때 |
| 4 | 4차 API/test 강화 | 런타임 안정화 후 응답 경계와 backend 구조를 다진다. | backend route와 repository를 한 PR에서 동시에 크게 바꾸게 될 때 |

## 각 묶음별 바로 실행 가능한 코덱스 프롬프트

### 1차 리팩토링 프롬프트

```text
docs/refactor-roadmap.md의 1차 리팩토링 묶음을 진행해줘.

목표:
1. 기능 변경 없이 큰 presentational 파일을 안전하게 분리
2. 우선 src/features/integrations/NrcBridgeGuideCard.tsx와 src/features/auth/screens/SignupFormScreen.tsx부터 처리
3. action button/guide section/signup input section을 하위 component로 이동
4. hook/service/API 호출 흐름은 변경하지 않기
5. UI 디자인과 문구 변경 금지

검증:
npm run typecheck
npm run lint
npm run test
npm run code:quality

마지막에 분리한 컴포넌트와 파일 크기 변화, 기능 변경이 없음을 요약해줘.
```

### 2차 리팩토링 프롬프트

```text
docs/refactor-roadmap.md의 2차 리팩토링 묶음을 진행해줘.

목표:
1. LiveMatchTrackingPage, LiveMatchArena, LiveMatchPager의 표시 책임을 component/ViewModel 경계로 분리
2. useLiveMatchViewModel과 useLiveMatchProgress에서 순수 계산 함수를 추출
3. useRoomInviteActions와 useRoomStartActions는 command/handoff/inbox 책임을 작은 hook으로 분리
4. polling/GPS/navigation 정책 자체는 변경하지 않기
5. UI와 버튼 동작 변경 금지

검증:
npm run typecheck
npm run lint
npm run test
npm run code:quality

마지막에 어떤 ViewModel/컴포넌트/hook 책임이 분리됐는지 요약해줘.
```

### 3차 리팩토링 프롬프트

```text
docs/refactor-roadmap.md의 3차 Android 성능 안정화 묶음을 진행해줘.

목표:
1. TrackRunExperience는 shell router 역할만 하게 줄이고 IdleRunShell, MatchLobbyShell, LiveMatchShell이 필요한 상태만 구독하게 하기
2. activeRoomCheck, recovery polling, heartbeat, GPS/background task start의 singleton/timeout/cleanup 정책을 테스트로 보강
3. local active hint가 없으면 idle active room check를 시작하지 않기
4. live match navigation/GPS start 실패나 stale result가 화면 unmount를 유발하지 않게 하기
5. UI, GPS 기록 정확도, 승패/저장/기권 로직 변경 금지

검증:
npm run typecheck
npm run lint
npm run test
npm run perf:smells
npm run code:quality

가능하면 Android RG perf 로그 기준으로 polling/heartbeat/watcher/render count 기대값도 요약해줘.
```

### 4차 리팩토링 프롬프트

```text
docs/refactor-roadmap.md의 4차 API guard/type/test 강화 묶음을 진행해줘.

목표:
1. room create/join/delete/leave/cleanup-stale, linked match status, heartbeat, run save 응답 guard를 일관화
2. success:true인데 roomId/matchId/inviteToken/userId 같은 필수 필드가 없으면 실패로 처리
3. stale/blocker/already joined/not found error code와 사용자 메시지/개발자 로그 메시지를 분리
4. src/lib/session.ts의 auth API 호출과 session storage 분리 계획 또는 작은 1차 분리 진행
5. backend contract/smoke 테스트를 깨지 않게 유지

검증:
npm run typecheck
npm run lint
npm run test
npm run backend:smoke
npm run code:quality

마지막에 강화한 guard, 추가/수정한 테스트, API 호환성 위험을 요약해줘.
```
