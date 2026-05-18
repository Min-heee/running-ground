# A9 Pro 카운트다운 27초 시작 — 진단 트랙

> 2026-05-18 실측에서 발견. PR-06/07과 별도 트랙으로 기록.

## 증상

1대1 대결 매치 시작 시점:
- **A9 Pro (guest)**: 카운트다운 UI가 **27초부터 시작**됨
- **Wide 6 (host)**: 카운트다운 UI 아예 안 봄 (PR-07로 잡힘 — `hostStartRequested`가 phase 되돌림)

기대 동작: 5초 안팎의 짧은 카운트다운으로 두 폰 거의 동기.

## 즉시 원인 분석

`derivePartyRunStartPhase`는 `phase === 'countdown'`을 보여줄 때 `remainingSeconds` 값을 그대로 사용. 27초 = 매치 시작 시점의 `slotStartAt - serverNow`.

코드 위치:
- `src/features/runs/lifecycle/matchStateMachine.ts:128-166` (phase derivation)
- `src/features/runs/lifecycle/matchStateMachine.ts:374` (`shouldShowCountdown`)

## 가능한 root cause들

### A. 백엔드가 slot을 +N초 미래로 잡음
prod 백엔드(`api.running-ground.com`)가 매치 link 시점에 slot_start_at을 얼마나 미래로 잡는지 알 수 없음. 27초가 백엔드 정책일 수 있음.

증거: mock 코드(`src/lib/api/services/rooms.ts:261,299`)는 `+40_000ms`로 잡음. prod도 비슷하게 ~30-40초로 잡을 가능성.

### B. Cold start 직후 polling/hydration 지연
A9 Pro는 cold start였고 (앱 첫 실행), 매치 link 시점부터 client snapshot 받기까지 N초 지연. 그 사이 host는 이미 시작 시그널 보냈고, A9는 늦게 받아서 27초만 남음.

증거: logcat에서 A9 Pro `Displayed com.minheee... +213ms` (정상). 다만 그 후 React/JS bridge + auth + initial fetch 등 cold start 비용은 별개.

### C. 둘 다 (가능성 높음)
백엔드가 40초 미래로 잡고 + cold start로 client snapshot이 13초 지연 = 남은 시간 27초.

## 검증 방법

1. **백엔드 slot offset 측정**: 매치 link API 응답에서 `slotStartAt - server_now` 직접 확인 (DevTools / 백엔드 로그)
2. **Cold start 시간 분리**: warm start (앱 background → foreground)와 cold start에서 카운트다운 시작 시간 비교
3. **logcat 진단 로그 임시 추가**: release 빌드에 매치 sync 핵심 시점만 `console.warn` 추가 (그리고 후속 PR로 제거)

## 잠재적 fix 방향 (백엔드 변경 없이)

### Fix 1: 카운트다운 표시 윈도우 단축
현재 `derivePartyRunStartPhase`는 fallback으로 60초 윈도우 안이면 countdown 표시. 이를 더 좁히면 (예: 15초) 27초 시점엔 그냥 `arming` UI 보이고, 시간이 흘러서 5초 남았을 때부터 countdown 표시.

**trade-off**: arming UI가 명확하지 않으면 UX가 어색해짐.

### Fix 2: 카운트다운 숫자 자체를 clamp
27초 표시 대신 "곧 시작" 같은 텍스트 → 5초 이하부터 숫자 표시.

`shouldUseFullscreenMatchCountdown` 같은 조건에서 `remainingSeconds <= 10` 가드 추가.

**trade-off**: 사용자가 정확한 시간을 못 봄. 다만 "곧 시작"이 더 자연스러울 수도.

### Fix 3: Client side server clock 보정 강화
PR-03에서 NTP threshold 500ms로 낮췄지만, 27초는 그 차원이 아님 (slot이 명백히 미래). client clock 보정으로는 해결 안 됨. **이건 잘못된 방향.**

## 결정

지금은 **노트만 보존하고 fix는 보류**. 이유:
- 백엔드 측 slot offset이 실제로 얼마인지 측정 안 됐음
- 27초 카운트다운이 UX적으로 정말 문제인지 사용자 피드백 추가 필요 (PR-07로 host도 카운트다운 보게 되면 두 폰이 같은 27초를 같이 카운트할 수 있음 — 그러면 sync는 정상)
- PR-06/07 머지 후 재측정에서 27초가 어떻게 보이는지 확인하고 결정

## 다음 액션

- [ ] PR-06 (shell gate), PR-07 (host countdown) 머지
- [ ] 재측정에서 두 폰 카운트다운 동기 여부 확인
- [ ] 두 폰이 같은 N초를 같이 카운트하면 → 정상 (UX 결정만 남음)
- [ ] 두 폰이 다른 N초 보면 → server clock sync 더 파야 함
- [ ] 백엔드 팀에 slot_start_at 정책 문의 (40s 미래가 정상인지)

## 관련 코드

- `src/features/runs/lifecycle/matchStateMachine.ts`: phase derivation + countdown UI 조건
- `src/features/runs/sync/serverClockSync.ts`: 500ms NTP offset threshold (sub-second 동기)
- `src/features/runs/runtime/useTrackRunRuntimeScreenState.ts:47-52`: `shouldShowFullscreenMatchCountdown` 조건
- `src/lib/api/services/rooms.ts:261,299,427`: mock slot 결정 (참고용 — prod는 백엔드)
