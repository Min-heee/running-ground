# Codex PR Backlog — PR-08 이후 후보

> 2026-05-18 기준 (재정렬: 측정 후속 작업 우선). PR-06+07 머지 후 두 폰 실측에서 새 이슈 발견. 측정 안정성 트랙 우선, 그 다음 code:quality 트랙.

## 트랙 A — 측정/sync 안정성 (실측 발견)

### 🔴 PR-08 (긴급): shell gate linked match fallback

- **파일**: `src/features/runs/lifecycle/trackRunLiveShellGate.ts`, `src/features/runs/runtime/TrackRunExperienceRuntimeModel.tsx`, 새 테스트
- **증상**: 첫 arena mount 실패 → 일반 RUNNING shell로 fallback. PR-06의 mountedLiveMatchId fallback은 이미 mount 후에만 작동.
- **수정**: `routeMatchId` fallback chain에 `linkedMatchContext.matchId` 추가 (state='matched' 또는 'active' + live stage 가드).
- **위험도**: 낮음. 기존 fallback chain 확장만.
- **프롬프트**: `/tmp/codex-pr-08-prompt.md`

### 🟡 PR-09: phase oscillation guard (host countdown 깜빡임)

- **파일**: `src/features/runs/lifecycle/matchStateMachine.ts`, polling 관련 hook
- **증상**: Wide 6가 카운트다운 → RUNNING shell → 카운트다운 → 결국 arena. 20초 경계에서 `remainingSeconds` 재계산 + serverSnapshot이 phase 되돌림.
- **수정 방향**: 
  - `derivePartyRunStartPhase` 결과에 monotonic guard 적용 (단, server가 reset할 수 있는 경로는 보존)
  - 또는 20초 경계에 hysteresis (≤20이면 arenaHandoff 유지, 다시 >20으로 안 돌아감)
- **위험도**: 중간. serverSnapshot semantics 신중히 다뤄야.

### 🟡 PR-10: serverClockSync cold boot 보장

- **파일**: `src/features/runs/sync/serverClockSync.ts`, 첫 polling hook
- **증상**: 두 폰 카운트다운 N초 desync. cold start 직후 syncedNowMs가 로컬 Date.now()라 폰 drift.
- **수정 방향**: 첫 polling 응답에서 server clock offset 즉시 적용 (apply threshold 무시하거나 별도 boot path).
- **위험도**: 중간. 기존 jitter 방어와 충돌 없게 boot-only 분기.

### 🔵 PR-11 (보류): 27초 카운트다운 자체

- 별도 진단 노트: `docs/perf/a9-pro-27s-countdown-investigation.md`
- PR-08~10 머지 후 재측정에서 두 폰 sync 정상화되면 UX 결정 (백엔드 slot 정책 확인 필요).

## 트랙 B — code:quality (perf:smells 안정 후 진행)

### 🟢 PR-12: invite inbox 타입 분리

- **파일**: `src/features/runs/sync/roomInviteInbox.ts` (8 type declarations)
- **이유**: types 밖 타입 선언 High 1개
- **위험도**: 낮음. 타입 이동만.

### 🟢 PR-13: sourceCatalog 계산 로직 분리

- **파일**: `src/features/integrations/sourceCatalog.ts`
- **이유**: utils/domain 밖 High 1개
- **위험도**: 낮음. 순수 함수 추출.

### 🟡 PR-14: useTrackRunRuntimeRecipientInviteInbox 분할

- **파일**: 731줄짜리 hook
- **위험도**: 중간. invite 도메인은 PR-02/05에서 다듬어진 영역.

### 🔵 PR-15/16 (보류)

- GPS Location 5 high — lifecycle/native 의존성 큼
- React inline object 66 — 측정 데이터로 특정 화면 지목 필요

## stale PR 처리

| PR | 상태 | 권장 |
|----|------|------|
| #1 codex/simulator-parity → main (2026-04-02) | OPEN | 사용자 결정 |
| #2 claude/compassionate-swartz-d2f634 | CLOSED ✅ | 처리됨 (2026-05-18) |

## 측정 가이드

- PR-08 머지 후: A9 Pro에서 첫 arena mount 정상 + Wide 6 RUNNING fallback 없는지 확인
- PR-09 머지 후: Wide 6 oscillation 잡혔는지 확인
- PR-10 머지 후: 두 폰 카운트다운 sync 정상화 확인
- 세 PR 모두 머지 후 27초 이슈 재평가

## Codex 가이드

- 한 번에 1개 PR씩 보내기 (충돌 방지, 측정 사이클 유지)
- 검증: `npm run typecheck && npm run lint && npm run test && npm run perf:smells && npm run code:quality && git diff --check`
- generated docs 같은 커밋 포함
- PR 메타: 베이스 `feature/ios-oauth-flow`, 브랜치명 `fix/pr-XX-<slug>`
