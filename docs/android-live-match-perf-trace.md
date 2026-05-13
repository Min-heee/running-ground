# Android 실시간 대결 Performance Trace

Android에서 대결 화면 진입 직후 버튼 반응이 30초~1분 늦어지는 현상을 감으로 추측하지 않기 위해 dev 전용 `[RG perf]` trace를 추가했습니다. 이 로그는 `__DEV__` 환경에서만 기본 동작하며, 운영/OTA release 빌드에는 영향을 주지 않습니다.

## 활성화 조건

- Expo dev / development build: `__DEV__`라 자동 출력됩니다.
- 필요할 때만 강제 활성화: `EXPO_PUBLIC_RG_PERF_TRACE=true`
- Preview/production OTA에는 위 플래그를 넣지 않습니다.

## 측정 구간

| 로그 | 의미 |
| --- | --- |
| `room start button press` | 방장이 시작 버튼을 누른 순간 |
| `room start API begin/end` | 방 시작 API 소요 시간 |
| `countdown begin/end` | 솔로/파티런 카운트다운 시작과 종료 |
| `live match navigation begin/end` | 대결 화면 포커싱/이동 처리 시간 |
| `live match screen mount` | `LiveMatchArena` mount 시점 |
| `GPS tracking start begin/end` | 위치 권한, tracking reset, background tracking start 구간 |
| `background task start begin/end` | foreground/background location source 정책 적용 구간 |
| `match polling start` | 대결/방 상태 polling 시작 |
| `progress heartbeat start` | 내 진행률 서버 전송 시도 |
| `progress heartbeat API begin/end` | 진행률 전송 API 소요 시간 |
| `first live progress received` | 내 heartbeat 응답 또는 상대 진행률이 처음 화면에 들어온 시점 |
| `RoadMotion mount` | 도로 애니메이션/정적 도로 mount 시점 |
| `race board mount` | 순위 보기 화면 mount 시점 |
| `forfeit button press` | 기권 버튼 누른 순간 |

## 10초 리소스 요약

활성 polling, heartbeat, watcher 수를 10초마다 출력합니다.

```text
[RG perf] 10s resource summary {"polling":2,"heartbeat":1,"watcher":1,"timer":0,"total":4,"active":"polling:party room polling, heartbeat:match progress heartbeat, watcher:foreground location watch"}
```

해석 기준:

- `polling`이 3개 이상 오래 유지되면 room/status/upcoming polling 중복 가능성을 확인합니다.
- `heartbeat`는 실시간 대결 중 보통 1개가 정상입니다.
- `watcher`는 Android active 화면에서는 foreground 중심 1개가 정상 기대치입니다.
- foreground/background 전환 직후 짧게 변동될 수 있지만, 같은 상태에서 watcher가 2개 이상 오래 유지되면 병목 후보입니다.

## 느린 구간 경고

300ms 이상 걸린 측정 구간은 `console.warn`으로 출력됩니다.

```text
[RG perf] room start API end {"durationMs":512.4,"success":true}
```

이 경우 먼저 확인할 순서:

1. API 지연인지 확인: `room start API`, `progress heartbeat API`
2. 화면 mount 비용인지 확인: `live match navigation`, `live match screen mount`, `RoadMotion mount`
3. 위치 source 비용인지 확인: `GPS tracking start`, `background task start`
4. 중복 루프인지 확인: `10s resource summary`

## Android 실기기 테스트 방법

1. Android development build 또는 Expo dev 환경에서 앱을 실행합니다.
2. iOS 또는 다른 Android와 파티런 1대1 방을 만듭니다.
3. 방장이 시작 버튼을 누른 뒤 Android 콘솔에서 `[RG perf]` 로그를 확인합니다.
4. 카운트다운 30초, 대결 화면 진입, 첫 거리/페이스 표시, 기권 버튼 반응까지 기록합니다.
5. 10초 resource summary에서 polling/heartbeat/watcher 수가 과하게 유지되는지 확인합니다.

## 로그 복사 템플릿

아래 템플릿을 그대로 복사해서 테스트마다 채우면, Android 먹통 구간과 `[RG perf]` 로그를 같이 비교하기 쉽습니다.

````text
## Android Live Match Perf Trace

### 테스트 기본 정보
- 테스트 기기:
- OS 버전:
- 앱 빌드 종류: dev / preview / production / 기타
- 앱 버전 또는 OTA update ID:
- 네트워크 환경: Wi-Fi / LTE / 5G / 기타

### 대결 시각
- 방 생성 시각:
- 대결 시작 버튼 누른 시각:
- 카운트다운 시작 시각:
- 대결 화면 진입 시각:

### 300ms 이상 warning 로그 전체
```text
[RG perf] 여기에 warning 로그 전체 붙여넣기
```

### 10s resource summary
최소 3개 이상 붙여넣기

```text
[RG perf] 10s resource summary ...
[RG perf] 10s resource summary ...
[RG perf] 10s resource summary ...
```

### 기권 버튼 로그
- 기권 버튼 누른 시각:
- 관련 로그:

```text
[RG perf] forfeit button press ...
[RG perf] forfeit match API begin/end ...
```

### 먹통 구간
- 먹통이 시작된 시점:
- 먹통이 풀린 시점:
- 먹통 중 눌렀던 버튼/동작:
- 화면에 보이던 상태:

### 의심 원인 메모
- API 지연 의심:
- watcher 중복 의심:
- polling/heartbeat 과다 의심:
- RoadMotion/화면 mount 의심:
- 기타 메모:
````

## 주의

- 이 trace는 진단용 로그만 추가하며 기능, UI, API 경로를 바꾸지 않습니다.
- release/OTA preview에서 로그를 보고 싶다면 플래그를 켜야 하지만, 일반 배포에는 켜지 않는 것이 원칙입니다.
- 문제가 재현되면 느린 구간의 `[RG perf]` 로그와 화면 녹화를 함께 비교하면 원인 범위를 빠르게 좁힐 수 있습니다.
