# Codex PR Backlog — PR-08 이후 후보

> 2026-05-18 기준. PR-01~PR-07 머지/대기 중. `code:quality` 결과에서 실제 클라이언트 코드 High 항목 + 큰 파일을 추려서 다음 사이클 후보로 정리.

## 선정 기준

- mock/backend 파일은 제외 (런타임 영향 적음)
- 클라이언트 런타임 코드만 대상
- Codex가 한 번에 잡을 수 있는 좁은 작업 단위

## 후보 목록 (우선순위 순)

### 🟢 PR-08: invite inbox 타입 분리

- **파일**: `src/features/runs/sync/roomInviteInbox.ts` (8 type/interface declarations)
- **이유**: types 밖 타입 선언 High 1개 (실제 클라 코드 중 유일한 High)
- **작업**: 타입을 같은 폴더의 `roomInviteInbox.types.ts` 또는 features/runs/types로 이동. 함수 시그니처는 유지.
- **위험도**: 낮음. 타입 이동만, 동작 변경 없음.
- **테스트**: 기존 invite inbox 테스트 유지로 충분.

### 🟢 PR-09: sourceCatalog 계산 로직 분리

- **파일**: `src/features/integrations/sourceCatalog.ts` (sort/filter/map 8회)
- **이유**: utils/domain 밖 계산 로직 High 1개 (실제 클라 코드 중)
- **작업**: 정렬/필터링 로직을 `src/features/integrations/utils/sourceCatalogQueries.ts` (또는 비슷한 위치)로 추출. 순수 함수로 테스트 가능하게.
- **위험도**: 낮음. 순수 함수 추출 + 호출처 1곳 갱신.
- **테스트**: 신규 utils 함수 unit test 추가.

### 🟡 PR-10: useTrackRunRuntimeRecipientInviteInbox 분할

- **파일**: `src/features/runs/runtime/useTrackRunRuntimeRecipientInviteInbox.ts` (731줄)
- **이유**: 500줄 이상 파일 + invite inbox 도메인이라 PR-02/PR-05 영역과 인접. 가독성과 향후 변경 비용에 직접 영향.
- **작업**: hook을 단계별 sub-helper로 분할 (예: receiver-state-machine / invite-arrival-policy / paused-policy). PR-04와 비슷한 패턴 (types / RequestRegistry / ResultPolicy 분리).
- **위험도**: 중간. invite 도메인은 PR-02/PR-05에서 다듬어진 영역이라 정의된 contract가 있음. 동작 변경 없이 분할만.
- **테스트**: 신규 sub-helper 테스트 + 기존 invite inbox 통합 테스트 유지.

### 🔵 PR-11 (보류): GPS Location High 5개

- **파일**: GPS 추적 관련 5개 파일 (`backgroundLocation*`, `nativeHealth.ts` 등)
- **이유**: Location/watchPosition/background task High 5개
- **유보 이유**: GPS는 라이프사이클 의존성이 크고 native module과 직접 통신. 단순 추출이 어렵고 회귀 위험 큼. 별도 측정 트랙으로 다뤄야 함.

### 🔵 PR-12 (보류): React inline object 66개

- **이유**: inline object/array/style 66 후보 (High 없음)
- **유보 이유**: 개별 위치는 작은 win이지만 66곳을 한 번에 고치면 review 부담 큼. 측정에서 특정 화면 jank가 잡힐 때 그 화면만 골라서 잡는 게 효율적.

## stale PR 처리

| PR | 상태 | 권장 |
|----|------|------|
| #1 codex/simulator-parity → main (2026-04-02) | OPEN, 4월 PR | 사용자 결정 필요 (작성자 본인) |
| #2 claude/compassionate-swartz-d2f634 → main (2026-05-16) | OPEN, 우리 초기 작업 묶음 | 작업이 다른 브랜치로 분기되어 흘러갔으므로 close 권장 |

## Codex에 보낼 때 가이드

- 한 번에 1개 PR씩 보내기 (충돌 방지)
- 검증 명령: `npm run typecheck && npm run lint && npm run test && npm run perf:smells && npm run code:quality && git diff --check`
- generated docs는 같은 커밋에 포함
- PR 메타: 베이스 `feature/ios-oauth-flow`, 브랜치명 `fix/pr-XX-<slug>`

## 측정과의 연결

PR-06/07 머지 후 두 폰 재측정:
- A9 stuck 시나리오 해결 확인 → 해결되면 PR-08~10 사이클로 이동
- 새로운 stale state 시나리오 발견 시 → 새 PR 후보로 backlog 추가
- A9 27초 카운트다운: docs/perf/a9-pro-27s-countdown-investigation.md 참조
