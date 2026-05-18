# 2026-05-18 Arena Diagnostics — 충격적 발견

> PR-06~10 머지 후 진단 로그(PR-10)로 두 폰 측정. 결론: 우리가 처음부터 잘못된 컴포넌트를 진단하고 있었음.

## 측정 시나리오

- Wide 6 (host): 1대1 방 생성
- A9 Pro (guest): 입장
- host start → A9가 카운트다운 30→26→22→21초 봄, 그 후 측정화면 stuck
- Wide 6: 측정화면 → A9가 20초 지나고 잠깐 23초 보였다가 사라짐
- A9가 알림 → 5초 후 Wide 6 대결화면 진입

## 진단 로그 결과 (`docs/perf/2026-05-18-{wide6,a9}-arena-diag.log`)

9개 라인 모두에서:

| 필드 | 관찰값 |
|------|--------|
| `partyRunPhase` | 항상 'waiting' |
| `roomState` | null or 'waiting' |
| `linkedMatchId` | 항상 null |
| `linkedMatchStatus` | 항상 null |
| `duelMatchState` | 항상 'idle' |
| `remainingSeconds` | 항상 null |
| `hasRoomLinkedDuelContext` | 항상 false |
| `roomLinkedDuelPlaceholderParticipantsLength` | 항상 0 |
| `duelArenaParticipantsLength` | 항상 0 |
| `forceOpenActiveMatch` | 가끔 true |

## 충격적 발견

**`TrackRunExperienceRuntimeModel`은 매치 정보를 거의 받지 못하고 있음.** 사용자가 분명히 카운트다운/측정화면을 봤는데도 이 컴포넌트의 phase는 'waiting'에 머무름.

**즉 사용자가 본 측정화면(00:00 / 0.00km / MATCH MODE)은 우리가 4번 진단했던 `LiveMatchTrackingPage`가 아닐 가능성이 매우 큼.** 별도 screen 또는 다른 RuntimeModel 인스턴스에서 렌더링되는 중.

## PR-06~09가 효과 없었던 진짜 이유

**잘못된 컴포넌트를 잡고 있었음.** shellKind, showLiveArena, canRenderLiveArena 다 진단했지만 그건 사용자가 본 화면이 아니었음.

좋은 소식: PR-06, PR-07은 실제 효과 있는 fix였음 (shell gate fallback, host phase monotonic guard) — 다만 정작 막혀 있던 측정화면 stuck은 다른 컴포넌트 path 문제라 해결 못 함.

## 다음 작업 (PR-11)

1. "1대1 매치 진행 중" / "실시간 러닝" 텍스트를 가진 진짜 screen 컴포넌트 재식별
   - 이미 알려진 곳: `LiveMatchProgressSection` → `LiveMatchTrackingPage` (그러나 진단 결과 이 path는 매치 정보 못 받음)
   - 다른 path 가능: solo run shell, RUNNING phase의 별도 screen, lobby 후 fresh navigation
2. 진단 로그를 더 넓게 추가 (PR-10b)
   - 다른 RuntimeModel 인스턴스
   - navigation entry points (router/expo-router)
   - `useMatchSelectionModel` 호출처 ('1대1 매치 진행 중' 문자열 정의처)
3. 그 컴포넌트의 state 진단 후 진짜 fix

## 보존 로그

- `docs/perf/2026-05-18-wide6-arena-diag.log` (9 lines)
- `docs/perf/2026-05-18-a9-arena-diag.log` (9 lines)
