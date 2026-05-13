# Android 실시간 대결 탭 렌더 체크

실시간 러닝 화면의 `대결 보기 / 순위 보기 / 기록 보기` 탭은 선택된 탭만 무거운 컴포넌트를 mount하도록 관리합니다. 이 문서는 코드 기준 검증 내용과 Android 실기기에서 render count를 확인하는 방법을 정리합니다.

## 변경 요약

| 구간 | 이전 동작 | 개선 후 |
| --- | --- | --- |
| Android 탭 렌더 | 선택된 탭만 렌더했지만 selected renderer를 매번 즉시 실행 | 선택된 renderer만 Android branch에서 실행 |
| iOS ScrollView 탭 | 이전/인접 페이지도 mount 가능 | 현재 선택된 페이지 slot만 mount |
| 비활성 페이지 | `renderPage` prop 변경으로 빈 slot도 다시 render 가능 | 비활성 `PagerPageSlot`은 계속 비활성이면 renderPage 변경을 무시 |
| 순위 보기 | 페이지가 mount되면 ranking row 계산 실행 | 순위 보기 선택 시에만 `LiveMatchRaceBoardPage` mount |
| 기록 보기 | 페이지가 mount되면 기록 표시 계산 실행 | 기록 보기 선택 시에만 `LiveMatchTrackingPage` mount |

## 기대 render count

개발 모드에서 10초마다 `[RG render/10s]` 로그가 출력됩니다.

### 대결 보기 선택 중

- 보여야 함: `LiveMatchPager:page-0`, `LiveMatchArena:*`, `RoadMotion:*`
- 보이지 않아야 함: `LiveMatchRaceBoardPage:*`, `LiveMatchTrackingPage:*`
- 의미: RoadMotion은 대결 보기에서만 살아 있어야 합니다.

### 순위 보기 선택 중

- 보여야 함: `LiveMatchPager:page-1`, `LiveMatchRaceBoardPage:*`
- 보이지 않아야 함: `RoadMotion:*`, `LiveMatchTrackingPage:*`
- 의미: 순위 row/ranking 계산은 순위 보기에서만 실행돼야 합니다.

### 기록 보기 선택 중

- 보여야 함: `LiveMatchPager:page-2`, `LiveMatchTrackingPage:*`
- 보이지 않아야 함: `RoadMotion:*`, `LiveMatchRaceBoardPage:*`, `RunRouteMap.native:*`
- 의미: 실시간 대결의 기록 보기에는 지도 컴포넌트가 mount되지 않습니다. `RunRouteMap.native`는 기록 상세 화면에서만 사용됩니다.

## 코드 기준 확인

| 파일 | 확인 내용 |
| --- | --- |
| `src/features/runs/components/LiveMatchPager.tsx` | Android는 active renderer만 실행하고, iOS ScrollView도 선택된 slot만 render합니다. |
| `src/features/runs/components/LiveMatchRaceBoardPage.tsx` | 순위 보기 전용 render counter를 추가했습니다. |
| `src/features/runs/components/LiveMatchTrackingPage.tsx` | 기록 보기 전용 render counter가 이미 있습니다. |
| `src/components/matches/LiveMatchArena.tsx` | 대결 보기 전용 arena render counter가 이미 있습니다. |
| `src/components/matches/liveMatchArena/RoadMotion.tsx` | RoadMotion render counter가 이미 있습니다. |
| `src/features/runs/RunRouteMap.native.tsx` | 지도 render counter가 있지만 실시간 대결 탭에는 mount되지 않습니다. |

## Android QA 절차

1. Android 개발 빌드에서 파티런 또는 1대1 대결을 시작합니다.
2. 대결 화면 진입 후 10초 동안 `RoadMotion` 로그가 나오는지 봅니다.
3. `순위 보기` 탭으로 이동하고 10초 동안 `RoadMotion` 로그가 멈추는지 봅니다.
4. `기록 보기` 탭으로 이동하고 10초 동안 `LiveMatchRaceBoardPage`와 `RoadMotion` 로그가 멈추는지 봅니다.
5. 다시 `대결 보기`로 돌아와 RoadMotion이 다시 mount/render되는지 확인합니다.

## 남은 주의점

- 실제 거리/페이스 state는 부모에서 유지되므로 탭 전환 시 데이터는 사라지지 않습니다.
- 선택되지 않은 탭의 화면 컴포넌트는 unmount되지만, 대결 측정과 서버 동기화는 기존 흐름대로 유지됩니다.
- iOS swipe 중에는 선택된 page 기준으로 mount되므로, 아주 빠른 스와이프 순간에는 다음 페이지 내용이 momentum 이후 나타날 수 있습니다. Android는 탭 버튼 방식이라 이 영향이 없습니다.
