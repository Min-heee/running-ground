# Android 실시간 대결 렌더 진단

실시간 대결 화면에서 Android 렉 원인을 좁히기 위해 개발 모드 전용 렌더 카운터를 둡니다. 이 카운터는 `__DEV__`에서만 동작하므로 Preview/production 빌드에는 로그와 interval이 남지 않습니다.

## 사용 방법

1. 개발 빌드 또는 Expo dev 환경에서 Android 실기기로 앱을 실행합니다.
2. 파티런 또는 1대1/그룹 대결을 시작해서 실시간 러닝 화면으로 진입합니다.
3. Metro/Logcat 콘솔에서 아래 형식의 로그를 10초 단위로 확인합니다.

```text
[RG render/10s] LiveMatchArena:duel: 8 renders (total 24)
```

## 로그 해석

| 로그 라벨 | 확인하려는 영역 |
| --- | --- |
| `TrackRunExperience` | 러닝 화면 전체 컨테이너가 과도하게 다시 그려지는지 확인 |
| `LiveMatchContainer:arena` | 대결 화면 컨테이너 렌더 빈도 확인 |
| `LiveMatchPager:page-*` | 대결 보기/순위 보기/기록 보기 탭 전환과 탭별 렌더 빈도 확인 |
| `LiveMatchArena:duel` / `LiveMatchArena:group` | 대결 도로 카드 전체 렌더 빈도 확인 |
| `RoadMotion:duel` / `RoadMotion:group` | 도로 배경/차선 애니메이션 영역 렌더 빈도 확인 |
| `LiveMatchTrackingPage:*` | 기록 보기 탭의 측정 카드 렌더 빈도 확인 |
| `RunRouteMap.native:*` | 네이티브 지도 mount와 route/marker 업데이트 빈도 확인 |
| `LiveMatchExitActionCard:*` | 기권/상대 기권/결과 보기 CTA 렌더 빈도 확인 |

## QA 기준

- `대결 보기` 탭에 있을 때 `LiveMatchTrackingPage`와 `RunRouteMap.native` 로그가 계속 증가하면 탭 lazy mount가 깨진 것입니다.
- `기록 보기` 탭에 있을 때 `RoadMotion` 로그가 계속 증가하면 대결 도로가 비선택 탭에서도 살아 있는 것입니다.
- `LiveMatchArena`보다 `RoadMotion` 또는 token 관련 하위 컴포넌트 렌더가 훨씬 적어야 Android에서 유리합니다.
- 10초 동안 `TrackRunExperience`가 수십 회 이상 반복 렌더링되면 상위 state 업데이트 범위를 더 줄여야 합니다.

## 주의

- 이 카운터는 진단용 코드입니다. 기능 판단이나 사용자 화면에는 영향을 주지 않습니다.
- Preview/production 빌드에서는 `__DEV__`가 false라서 로그가 출력되지 않습니다.
- 렌더 카운터는 원인을 좁히는 신호일 뿐입니다. 실제 체감 렉은 `ANDROID QA PERF` 패널의 FPS/diagnosis와 함께 확인합니다.
