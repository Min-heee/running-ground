# Android High Risk Performance Plan

생성 기준: `npm run perf:smells` 최신 결과

## 요약

- 최신 감지 결과: High 1개, Medium 40개, Low 1개
- 남은 High 항목: `src/features/runs/tracking/background/subscriptions.ts`의 위치 watcher 중복 후보
- 결론: 완전한 false positive는 아니지만, 무제한 중복 등록 버그로 보이지는 않습니다. 현재 구조는 foreground `watchPositionAsync`와 background `startLocationUpdatesAsync`를 러닝 중 동시에 켜는 의도된 이중 위치 소스입니다.
- 실제 위험: Android에서 foreground watcher와 background location task가 동시에 위치 이벤트를 만들 수 있어, 저사양 기기나 파티런/대결 화면처럼 렌더링 부담이 큰 화면에서는 CPU, JS bridge, 배터리 부담이 커질 수 있습니다.

## High 항목

| 우선순위 | 항목 | 위치 | 판정 |
| --- | --- | --- | --- |
| High | 위치/센서 watcher 중복 후보 | `src/features/runs/tracking/background/subscriptions.ts:46` | 부분 true positive |

## 원인 분석

`startLocationTask()`는 시작 시 `stopLocationTaskIfNeeded()`를 먼저 호출합니다. 그래서 동일 foreground watcher가 여러 개 쌓이는 구조는 아닙니다.

```ts
await stopLocationTaskIfNeeded();
foregroundLocationSubscription = await Location.watchPositionAsync(...);
await Location.startLocationUpdatesAsync(BACKGROUND_RUN_TASK_NAME, ...);
```

현재 동시에 살아날 수 있는 위치 소스는 다음 2개입니다.

- Foreground watcher: `Location.watchPositionAsync(...)`
- Background task: `Location.startLocationUpdatesAsync(BACKGROUND_RUN_TASK_NAME, ...)`

둘 다 `appendTrackedLocation`으로 들어오지만, `routeAccumulator`에서 다음 필터가 있어 중복 거리 누적 가능성은 낮습니다.

- `MIN_LOCATION_TIME_DELTA_MS = 900`
- 정확도/속도/텔레포트/정지 노이즈 필터
- snapshot 상태가 `running`이 아니면 위치 무시

다만 필터는 거리 오염을 줄이는 장치이지, Android 위치 이벤트 발생 비용 자체를 줄이지는 않습니다.

## 파일별 확인

### `src/features/runs/backgroundTracking.ts`

판정: false positive에 가까움

이 파일은 현재 실제 구현이 아니라 background tracking 모듈을 re-export하는 얇은 호환 파일입니다.

```ts
export * from '@/features/runs/tracking/background';
```

수정 필요성은 낮고, 실제 위험 분석 대상은 `src/features/runs/tracking/background/**`입니다.

### `src/features/runs/tracking/background/subscriptions.ts`

판정: 부분 true positive

위험 이유:

- foreground watcher와 background task가 러닝 중 동시에 켜집니다.
- `startLocationTask()`가 호출될 때마다 기존 watcher/task를 먼저 정리하므로 누적 등록은 방어되어 있습니다.
- 그래도 Android에서는 두 위치 소스가 동시에 OS 위치 업데이트를 요청할 수 있어 성능 부담이 생길 수 있습니다.

현재 cleanup 경로:

- `stopLocationTaskIfNeeded()`
  - `foregroundLocationSubscription?.remove()`
  - `Location.stopLocationUpdatesAsync(BACKGROUND_RUN_TASK_NAME)`
  - `Location.stopLocationUpdatesAsync(LEGACY_BACKGROUND_RUN_TASK_NAME)`
- `pauseBackgroundRunTracking()`
  - `stopLocationTaskIfNeeded()` 호출
- `resetBackgroundRunTracking()`
  - `stopLocationTaskIfNeeded()` 호출
- abandoned tracking 자동 정리
  - `resetAbandonedTrackingIfNeeded()`에서 오래된 tracking 상태를 reset하고 `stopLocationTaskIfNeeded()` 호출

남은 위험:

- 화면이 foreground인 동안에도 background task가 같이 살아 있습니다.
- Expo background location task가 foreground에서도 이벤트를 계속 보낼 수 있다면, foreground watcher와 background task가 같은 위치를 중복 처리할 수 있습니다.
- 현재 중복 등록은 막고 있지만, 이중 소스 자체는 Android 렉 후보입니다.

### `src/features/runs/hooks/useRunTrackingFlow.ts`

판정: 직접 중복 watcher 등록 파일은 아님

역할:

- `handleStartTracking()`에서 `resetBackgroundRunTracking()` 후 `startBackgroundRunTracking()` 호출
- `handlePauseTracking()`에서 `pauseBackgroundRunTracking()` 호출
- `handleResumeTracking()`에서 `resumeBackgroundRunTracking()` 호출
- 자동 대결 시작 effect에서 `startMatchTrackingAutomatically()`로 시작 중복을 방어

중복 방어:

- `autoStartingMatchTrackingRef.current`가 true면 자동 시작 재진입 차단
- `autoStartedMatchIdRef.current`로 같은 match 자동 시작 반복 차단
- `startBackgroundRunTracking()` 내부에서 `startLocationTask()`가 다시 `stopLocationTaskIfNeeded()`를 먼저 호출

타이머 cleanup:

- 솔로 시작 카운트다운: `finishSoloStartCountdown(false)`가 interval 정리
- elapsed ticker: `useElapsedTicker.clearElapsedTicker()`가 interval 정리
- pedometer: `usePedometerTracking.stopPedometerSubscription()`이 subscription 정리
- AppState/background snapshot subscription: `useTrackingAppStateSync` cleanup에서 unsubscribe/remove 실행

남은 위험:

- `useTrackingAppStateSync` cleanup은 foreground helper와 countdown은 정리하지만, active running 자체를 중단하지 않습니다. 이는 백그라운드 측정을 유지하려는 의도일 수 있으나, 사용자가 대결 화면을 벗어난 뒤에도 러닝이 살아 있는 경우 Android 부담이 계속될 수 있습니다.
- 자동 대결 warmup과 active 전환 시 `handleStartTracking()`이 연속 호출될 수 있는 경로는 ref guard로 막고 있지만, 실기기에서 카운트다운/방 상태 polling 지연과 함께 재진입이 발생하지 않는지 QA 로그로 확인이 필요합니다.

## 수정 계획

### 1. 런타임 watcher 상태 진단 추가

목표:

- Android 실기기에서 실제로 foreground watcher와 background task가 동시에 몇 번 시작/중지되는지 확인합니다.
- 중복 등록인지, 의도된 1 foreground + 1 background 조합인지 로그로 구분합니다.

예상 수정 위치:

- `src/features/runs/tracking/background/subscriptions.ts`
- `src/features/runs/liveMatchPerfDiagnostics.ts` 또는 Android QA perf log 계층

예상 영향:

- 기능 변화 없음
- QA/debug 빌드에서 원인 추적 쉬워짐

### 2. foreground/background 위치 소스 정책 분리 검토

목표:

- 앱이 active일 때는 foreground watcher 중심으로 측정합니다.
- 앱이 background/inactive일 때만 background location task를 유지하는 구조를 검토합니다.

후보 방향:

- `startLocationTask({ appState: 'active' | 'background' })` 형태로 정책 인자를 추가
- active 상태에서는 foreground watcher를 우선 사용
- background 전환 시 background task 보장
- foreground 복귀 시 background task 유지/중단 여부를 플랫폼별로 결정

예상 영향:

- Android 위치 이벤트 중복 비용 감소 기대
- 백그라운드 전환 순간 위치 누락 가능성 검증 필요
- iOS background permission/indicator 동작 회귀 검증 필요

### 3. Android 전용 경량 위치 정책 검토

목표:

- Android에서 파티런/대결 중 UI 렉을 줄이기 위해 위치 source 비용을 줄입니다.

후보 방향:

- Android active 상태에서 background task를 시작하지 않고 foreground watcher만 유지
- app background 전환 시 background task 시작
- app active 복귀 시 background task 중지 후 foreground watcher 재시작

예상 영향:

- Android foreground 렉 감소 가능성 큼
- background 전환 직전/직후 위치 누락 가능성 있음
- 실제 기기 QA 필수

### 4. start/stop idempotency 테스트 추가

목표:

- `startBackgroundRunTracking()`이 연속 호출되어도 watcher가 누적되지 않는지 순수 로직/adapter 테스트로 고정합니다.

후보 테스트:

- start -> start 연속 호출 시 stop이 먼저 호출되는지
- pause/reset 시 foreground remove와 background stop이 호출되는지
- legacy task도 stop 대상에 포함되는지

예상 영향:

- 기능 변화 없음
- 이후 위치 정책 변경 시 회귀 방어

## 우선순위

1. High: watcher 상태 진단 로그 추가
2. High: Android active/background 위치 source 정책 분리 설계
3. Medium: idempotency 테스트 추가
4. Medium: 실기기 QA에서 파티런 1대1, 그룹, 기권, 화면 이탈 시 위치 source 정리 확인

## 실기기 확인 체크리스트

- Android에서 혼자 러닝 시작 후 10초 동안 FPS/버튼 반응 확인
- Android + iOS 파티런 1대1 카운트다운 중 위치 source 시작 횟수 확인
- 대결 active 전환 후 Android 렉이 심해지는지 확인
- 앱을 background로 보낸 뒤 거리 측정이 유지되는지 확인
- 앱을 foreground로 복귀했을 때 watcher가 추가로 쌓이지 않는지 확인
- 기권/종료/저장 후 background task가 정리되는지 확인

