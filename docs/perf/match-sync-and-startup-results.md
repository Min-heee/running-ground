# PR #3 `perf/match-sync-and-startup` — 측정 결과 + 잔여 작업

> 이 문서는 PR #3의 7개 커밋에 대한 두 폰 실측 결과와, **PR-03b로 분리된 잔여 작업**을 정리합니다. Codex의 audit/roadmap 작성 시 baseline 참고용.

---

## 측정 환경

- **호스트**: 갤럭시 와이드 6 (SM-A136S, Android 14, Dimensity 700급 보급형)
- **게스트**: 갤럭시 A9 Pro (SM-G887N, Android 10, 구형 플래그십)
- 패키지: `com.minheee.runnigapp.development`
- 빌드: `./gradlew :app:assembleRelease`
- 측정: `adb logcat` (Choreographer Skipped frames, ActivityTaskManager Displayed, FATAL/ANR)
- 두 폰 같은 와이파이, 같은 시점에 1대1 대결 실제 진행

---

## 빌드별 추이

| 측정 | 시작 (Step 1 적용 전) | Step 1 (clock) | Step 2-1 (tabs+card) | Step 2-2-b (phase fallback) | Step 2-2-d (grace) | Step 2-2-e (window 확장) | Step 2-2-g (polling) |
|------|-----|-----|-----|-----|-----|-----|-----|
| S8 콜드 스타트 | — | 380ms | 336ms | ~340ms | ~340ms | ~340ms | **332ms** |
| Wide 6 콜드 스타트 | — | 344ms | 324ms | ~325ms | ~325ms | ~325ms | **303ms** |
| Wide 6 hot/warm | — | — | — | — | — | — | **152ms** ✨ |
| **Choreographer Skip worst** | **124 frames (~2s)** | 40-90 | 32 | 31 | ~30 | ~33 | **31-33 (~500ms)** |
| FATAL / ANR | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

### 두 폰 카운트다운 sync 차이 (체감 측정)
- Step 1 이전: 한쪽 카운트다운, 다른쪽 매치 진행 (단계 자체 어긋남)
- Step 2-2-b 이후: 한 폰 29 vs 다른 폰 12 (**17초 차이** 사례)
- Step 2-2-e 이후: 28 vs 21 (**7초 차이**)
- Step 2-2-g 이후: **1-2초 이내**로 좁혀짐. 사용자 체감 "많이 괜찮아졌다"

---

## 잡힌 것

### Step 1: server clock threshold 3s → 500ms
- `serverClockSync.SERVER_CLOCK_OFFSET_APPLY_THRESHOLD_MS`
- NTP 동기화된 두 폰의 sub-second offset도 보정 → 카운트다운 숫자 sync 향상
- 효과: 클럭 자체는 잘 맞음. 다만 다음 lifecycle 문제가 더 크다는 게 측정에서 드러남.

### Step 2-1: Tab lazy/freezeOnBlur + Card platform 분기
- `app/(tabs)/_layout.tsx` — `lazy: true`, `freezeOnBlur: true`, tab bar `elevation: 10 → 6`
- `src/components/Card.tsx` — `Platform.select`로 iOS shadow / Android elevation 분리
- 효과: **콜드 스타트 -13%, Choreographer Skipped 124 → 32 frames** (가장 큰 단일 효과)
- 사용자 체감: "탭 전환 확실히 빨라짐"

### Step 2-2-a/b/d/e: derivePartyRunStartPhase fallback
- `PartyRunStartPhaseInput`에 `linkedMatchId`, `linkedMatchSlotStartAt` 추가 (plumbing)
- 서버 `linkedMatchStatus = 'matched'` 신호 없어도 slot 60s 이내면 'matched-equivalent'
- Slot fire 직후 0~120s grace에서 'active'로 추론 → 매치 화면 unmount 방지
- 효과: 호스트가 시작 응답 기다리는 동안 카운트다운 화면 진입. sync 17s → 7s
- 한계: phase 진동(retreat)은 여전 (잔여 작업)

### Step 2-2-g: status polling idle 15s → 5s
- `useBlockingMatchStatusPolling` idle interval
- 게스트가 server 'matched' 신호 받기까지 평균 7.5s → 2.5s
- 효과: 게스트 측 매치 보드 진입 시점 빨라짐. sync 7s → 1-2s

---

## 잔여 작업 — PR-03b 후보

PR #3은 PR-03 (Live match navigation/recovery) 영역의 **perf 부분**만 다룸. 다음 작업은 별도 PR로 분리.

### 1. Phase monotonic guard (가장 임팩트 큼)
**증상**: 사용자 측정에서 본 "매치 화면이 메인 탭으로 사라짐" — 카운트다운 도중에도 phase가 `arenaHandoff`/`active`에서 `arming`/`waiting`으로 후퇴해서 매치 보드 unmount.

**원인**: `derivePartyRunStartPhase`는 pure function이라 매번 fresh derive. 일시적인 polling fluctuation이나 server status 부재로 phase가 뒤로 돌아갈 수 있음.

**제안**:
- `PartyRunStartPhaseInput`에 `previousPhase` optional 추가
- function에 `rankPhase(derived) < rankPhase(previousPhase)` + 명시적 reset 신호 없으면 retreat 차단
- `buildPartyRunFlowSnapshot` 호출처 4-5곳에 useRef로 previousPhase 유지
- 영향: matchStateMachine.ts, useMatchCountdownModel.ts, useMatchRoomLobbyEffects.ts, useMatchRoomLobbyViewModel.ts, useLinkedMatchSync.ts

**위험도**: Medium-High. 회귀 위험 있어서 신중한 단계별 적용 필요.

### 2. 호스트 낙관적 transition
**증상**: 와이드 6 (호스트)가 시작 버튼 누른 후 `/running/rooms/start` 응답까지 한참 대기실 로딩 상태.

**제안**: `useRoomStartActions`에서 시작 버튼 누른 즉시 client-local state를 'matched' 추론 상태로. 응답 도착 시 server state로 reconcile.

**위험도**: High. lifecycle state 직접 push, 응답 실패 시 rollback 정책 필요.

### 3. Live match navigation executor 단일화
**대상**: `useLiveMatchNavigationExecutor`, `useLiveMatchRecoveryPolicy`, `liveMatchMountedRegistry`
**목표**: routeStateOnly/recovery/mounted cleanup 테스트 강화, navigation 트리거 일관성
**위험도**: High. audit 결과 보고 작업하는 게 안전.

### 4. useStableCountdownSeconds — 의도적 변경 안 함
사용자가 본 "2초씩 가기"는 hook 자체의 문제가 아니라 **JS thread block의 증상**. tick interval은 1초인데 main thread가 무거우면 tick 늦어짐. monotonic guard + 매치 화면 mount 비용 분산으로 풀려야 정상. hook 자체 변경은 정확도 trade-off만 발생.

### 5. Legacy Architecture
- `app.json`의 `newArchEnabled`는 현재 oauth-flow에서 false (PR #3은 base가 다른 PR이고 그 변경이 안 들어옴)
- Hermes는 SDK 54 기본값 사용 중
- 별도 검증 PR로 New Architecture 활성화 검토 (third-party 호환성 검증 필요)

---

## Codex audit 시 참고

- PR #3 변경 사항은 위에 정리된 코드 위치에 적용됨 — audit 결과에 이미 반영된 상태로 가정
- PR-03b로 분리된 잔여 작업(monotonic guard, 호스트 낙관적 transition, navigation executor 단일화)은 audit 결과의 P0/P1 분류에 따라 우선순위 재조정 가능
- 측정 방법: `./gradlew :app:assembleRelease` + `adb logcat` 필터 `FATAL EXCEPTION|AndroidRuntime: (E|F)|^E ReactNativeJS|Choreographer.*Skipped [0-9]{2,}|ANR in com.minheee|Displayed com.minheee`
