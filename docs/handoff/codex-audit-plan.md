# Codex Audit & Refactor Handoff Plan

이 문서는 **Codex가 진행할 read-only 감사·로드맵 작업**과 **Claude가 진행할 PR 코드 작업** 간의 분업을 정리합니다. 사용자는 이 문서를 그대로 Codex에 전달해서 Task 1~3을 실행시킬 수 있습니다.

---

## 분업 개요

| Track | 담당 | 산출물 | 상태 |
|-------|------|-------|------|
| A. 코드 품질 1차 감사 (Plan 1) | Codex | `docs/full-codebase-quality-audit.md` | 미시작 |
| B. 매치 플로우 심층 감사 (Plan 2) | Codex | A 문서에 섹션 추가 | 미시작 |
| C. 리팩토링 로드맵 (Plan 3) | Codex | `docs/full-codebase-refactor-roadmap.md` | 미시작 |
| D. PR-03 일부 (Live match navigation, perf 측면) | Claude | PR #3 `perf/match-sync-and-startup` | 머지 대기 |
| E. PR-01 ~ PR-12 코드 작업 | Claude | PR 단위 별도 브랜치 | C 완료 후 시작 |

흐름: **Codex가 A → B → C 완료 → Claude가 그 로드맵 기준으로 PR-01부터 코드 작업**.

---

## Pre-condition — Claude의 PR #3 (반드시 먼저 머지)

`perf/match-sync-and-startup` 브랜치(PR #3)가 다음 7개 커밋으로 머지된 상태를 가정하고 audit/roadmap 작성:

| 커밋 | 영역 | 변경 요약 |
|------|------|---------|
| `e11e2c2` | `serverClockSync` | apply threshold 3s → 500ms |
| `78b4edd` | `Tabs` + `Card` | lazy/freezeOnBlur, Card shadow Platform 분기 |
| `c36dd7a` | `PartyRunStartPhaseInput` | linkedMatchId/SlotStartAt plumbing |
| `bf06718` | `derivePartyRunStartPhase` | slot time 기반 matched 추론 |
| `f37375c` | 같은 함수 | slot fire 직후 active grace |
| `04c5b61` | 같은 함수 | matched 60s 윈도우 + grace 120s 확장 |
| `367172a` | `useBlockingMatchStatusPolling` | idle 15s → 5s |

→ audit/roadmap에서 PR-03(Live match navigation/recovery)의 perf 영역은 위 변경이 반영된 후 잔여 작업만 PR-03b로 분리해서 다룰 것.

---

## Codex Task 1 — `docs/full-codebase-quality-audit.md` 작성

### Goal
전체 코드베이스의 긴 파일·긴 함수·과도한 effect·분리 후보를 정리해서 리팩토링 우선순위를 매긴 문서를 만든다.

### Scope
- 분석 디렉토리: `src/features`, `src/components`, `src/hooks`, `src/utils`, `src/lib`, `app`, `backend/src`
- 제외: `android/`, `logs/`, `.vscode/`, `node_modules`, generated fixtures
- **앱·백엔드 코드는 절대 수정하지 않음** (read-only audit)
- `app.json`, `docs/android-performance-regression-check.md`, `docs/code-quality-report.generated.md`, untracked `android/`, `logs/`, `.vscode/` 등 기존 dirty 상태는 이번 범위 밖

### Baseline
- 기존 문서 `docs/code-quality-report.generated.md`, `docs/code-quality-audit.md`를 참고로 사용
- 파일 길이: `300+`, `500+`, `1000+`로 분류
- 함수/hook 길이: `50+`, `100+`로 분류
- 함께 점검: `useEffect` 개수, props 수, JSX 깊이, API/state/navigation/trace logging 혼재 여부
- 우선순위 분류:
  - `P0` 긴급 구조 분리
  - `P1` 성능·렌더 위험
  - `P2` 유지보수성
  - `P3` 문서·테스트 보강
- production runtime 파일이 test/script 파일보다 가중치 높음

### Document Structure
1. **Summary**: 가장 큰 파일 TOP 10, 가장 긴 함수/hook TOP 10
2. **파일 크기 표**: 300+, 500+, 1000+ 별도 표
3. **각 항목 컬럼**:
   - 파일 경로
   - 현재 문제
   - 왜 위험한지
   - 추천 분리 방향
   - 위험도
   - 테스트 필요 여부
4. **분리 TOP 20** (production runtime 가중치 적용)

### Initial Suspects
- `backend/src/server.mjs`
- `src/features/runs/runtime/TrackRunExperienceRuntimeModel.tsx`
- `src/features/runs/runtime/useTrackRunRuntimeRecipientInviteInbox.ts`
- `src/lib/session.ts`
- `src/features/runs/sync/activeRoomCheck.ts`

### Verification
작성 후 실행:
```
npm run typecheck
npm run lint
npm run test
npm run perf:smells
npm run code:quality
git diff --check
```
generated docs 변경되면 별도 기록.

---

## Codex Task 2 — Task 1 문서에 "Running/Match/LiveMatch 핵심 플로우 심층 감사" 섹션 추가

### 13개 플로우별 표
방 생성 / 방 삭제 / blocker / 초대 보내기 / 초대 수신 / 초대코드 입장 / 준비하기 / 시작하기 / live match navigation / RaceBoard / GPS·tracking / heartbeat·progress / save·forfeit

### 각 플로우 컬럼
- 관련 파일
- 책임 혼재 지점
- stale state 위험
- polling·heartbeat 중복 위험
- cleanup 누락 위험
- 테스트 보강
- 추천 리팩토링
- 위험도

### Runtime State 충돌 매트릭스
다음 컴포넌트 간 충돌 가능성을 표로 정리:
- deleted room tombstone
- active room hint
- room snapshot
- invite inbox
- live match mounted registry
- blocking match status polling
- heartbeat·progress registry
- location tracking task

### Initial P0 후보
- `TrackRunExperienceRuntimeModel.tsx` — runtime 조립 중심, 책임 혼재
- `useTrackRunRuntimeRecipientInviteInbox.ts` + `roomInviteInbox.ts` — 초대 timeout retry, joined/live pause, id matching
- `activeRoomCheck.ts` — stale result, abort, routeKey, live mounted skip

### Initial P1 후보
- `useLiveMatchNavigationExecutor`, `useLiveMatchRecoveryPolicy`, `liveMatchMountedRegistry`, blocking match polling — routeStateOnly/recovery/mounted cleanup 테스트 강화 필요
- RaceBoard — participant-first row builder + progress merge, 상대 progress 누락 시 row 보존

---

## Codex Task 3 — `docs/full-codebase-refactor-roadmap.md` 작성

### 금지 영역 (명시)
- Android live match 안정성
- iOS TestFlight runtime 설정
- public API, runtimeVersion
- GPS 정책
- polling interval (PR #3에서 이미 단축됨)
- heartbeat interval
- navigation routes

### Structure
1. 전체 원칙: 작은 PR / 기능·UI 불변 / 테스트 우선 / runtime·navigation·GPS·polling 고위험
2. P0/P1/P2/P3 요약
3. PR별 필수 항목:
   - 제목
   - 목표
   - 대상 파일
   - 수정 내용
   - 금지 사항
   - 추가 테스트
   - 검증 명령어
   - rollback 기준
   - 위험도
   - 추천 커밋 메시지
4. 마지막 섹션: 지금 당장 시작할 PR 3개 추천

### PR Plan 표

| PR | P | 제목 | 핵심 대상 | 비고 |
|----|---|------|---------|------|
| PR-01 | P0 | Deleted room blocker/tombstone flow hardening | room delete, active hint, create blocker | Codex 추천 1순위 |
| PR-02 | P0 | Invite inbox receiver ownership cleanup | `roomInviteInbox`, recipient inbox runtime | |
| PR-03b | P0 | Live match navigation/recovery state split (잔여) | navigation executor, recovery policy, mounted registry | PR #3에서 perf 영역은 이미 처리됨 |
| PR-04 | P0 | Active room check stale/abort policy consolidation | `activeRoomCheck`, room snapshot handlers | |
| PR-05 | P0 | Manual invite join single-flight and preflight boundary | manual invite join, room join actions | |
| PR-06 | P1 | RaceBoard participant-first model cleanup | race board VM, progress merge, board tests | |
| PR-07 | P1 | Heartbeat/progress registry cleanup tests | heartbeat registry, progress sync | |
| PR-08 | P1 | GPS/tracking task boundary audit and tests | location task manager, app state sync | |
| PR-09 | P1 | LiveMatch render boundary follow-up | pager/pages/container/shell props | |
| PR-10 | P2 | TrackRun runtime model split continuation | runtime model and runtime adapters | |
| PR-11 | P2 | Backend read-only route extraction continuation | `backend/src/server.mjs`, routes/response helpers | |
| PR-12 | P3 | Flow-level regression test matrix documentation | docs and targeted test gaps | |

### Immediate PR Recommendations
1. **PR-01** — 방 생성/삭제 정확성에 직접 영향 ("이미 참여 중인 방" blocker)
2. **PR-02** — 초대 수신 timeout/matching 버그가 사용자를 manual invite code로 fallback시킴
3. **PR-04** — 방 입장 stale state 정리 (PR-03b도 가능)

### Verification (이 문서 작성 자체)
- `git diff --check`
- 각 PR별 validation 명령어는 보통 `npm run typecheck`, `npm run lint`, `npm run test`, `npm run perf:smells`, targeted trace/code-quality commands
- 이 문서 작성 중에는 generated docs를 의도적으로 갱신하지 않음

---

## Common Assumptions (Codex가 기억해야 할 것)

- public API, runtimeVersion, iOS updates config, UI design, GPS policy, polling interval, heartbeat interval, navigation routes는 이번 task 범위에서 변경하지 않음
- 기존 dirty 파일들(`app.json` 등)은 unrelated로 두고 audit 범위에서 제외
- 작성 후 generated docs가 갱신되면 어떤 변경이 있었는지 최종 요약에 기록
- **앱·백엔드 코드는 절대 수정하지 않음**

---

## Claude 측 다음 흐름

1. Codex가 Task 1+2+3 완료 → docs 두 개 PR 머지
2. 사용자가 어떤 PR부터 작업할지 선택 (감사 결과 보고 우선순위 조정 가능)
3. Claude가 PR 단위 코드 작업 (예: PR-01부터)
4. 작업 끝나면 다시 audit/roadmap 업데이트 (Codex)

---

## 사용자 → Codex에 전달할 때

> RunningGround 리포의 PR #3 `perf/match-sync-and-startup`이 머지된 상태로 가정하고, `docs/handoff/codex-audit-plan.md`의 Task 1 → 2 → 3을 순서대로 진행해줘.
