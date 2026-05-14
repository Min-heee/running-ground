# Android Live Match Performance Budget

Android 실시간 대결 화면은 iOS보다 JS thread와 native location task 병목에 민감합니다. 이 문서는 파티런/1대1 대결 관련 새 기능을 추가하거나 리팩토링할 때 지켜야 할 성능 예산입니다.

## 목표 시간

| 구간 | 목표 | 초과 시 확인할 것 |
| --- | --- | --- |
| 대결방 입장 | 버튼 입력 후 1초 이내 대기실 UI 반응 | active room check 중복, stale cleanup blocking, room snapshot polling 중복 |
| 초대코드 입장 | 코드 제출 후 1.5초 이내 성공/실패 피드백 | join API 중복 호출, cleanup-stale 선행 blocking, roomId 없는 성공 응답 |
| 방장 시작 후 로딩 진입 | 시작 버튼 후 500ms 이내 로딩/카운트다운 상태 표시 | start API 중복, active room result 반복 처리 |
| 대결 화면 진입 | official start 전후 1초 이내 live match 최소 UI mount | live match navigation 중복, RoadMotion mount/unmount 반복 |
| 기권/나가기 버튼 반응 | 탭 후 300ms 이내 버튼 상태 변화 또는 화면 이동 | save/forfeit 중복 요청, cleanup을 navigation보다 먼저 기다리는 흐름 |

## GPS/Tracking 규칙

- GPS 원본 수집 정확도는 유지하되, `GPS tracking start`와 `background task start`는 UI navigation을 block하면 안 됩니다.
- 대결 화면은 먼저 mount하고, foreground watcher/background task 시작은 비동기 detached 작업으로 처리합니다.
- `background task start`가 3~5초 이상 걸리면 warning 로그만 남기고 UI thread를 기다리게 만들지 않습니다.
- app state가 `active/background/inactive` 사이에서 짧게 흔들릴 때 watcher/task start-stop을 반복하지 않도록 debounce를 유지합니다.
- 같은 `matchId` 또는 task name으로 tracking start가 이미 진행 중이면 새 start를 만들지 않습니다.

## 동시 실행 허용 개수

| 리소스 | 허용 예산 | 비고 |
| --- | --- | --- |
| party room polling | 동일 `roomId` 기준 1개 | match-room snapshot과 역할이 겹치면 한쪽만 owner |
| linked match status polling | 동일 `matchId` 기준 1개 | arming/countdown/active 상태 감지용 |
| 전체 polling | 일반적으로 1~2개 이하 | 상태 전환 순간에도 3개 이상이 오래 유지되면 문제 |
| match progress heartbeat | 동일 `matchId` 기준 1개 | active + running 상태에서만 허용 |
| foreground location watcher | 0~1개 | active foreground에서 우선 |
| background location task | task name 기준 0~1개 | background 전환 시에만 보장 |
| live share heartbeat | 러닝 공유가 켜진 경우 1개 | idle 상태에서는 0개 |

## 10초 Render Count 기준

`[RG perf]` render counter로 10초 단위 샘플을 볼 때 아래 기준을 목표로 합니다.

| 컴포넌트 | 목표 render count / 10s | 위험 신호 |
| --- | --- | --- |
| `TrackRunExperience` | 10회 이하 | idle인데 20회 이상이면 상위 state/effect 확인 |
| `LiveMatchPager` | 선택 탭 기준 10회 이하 | 선택 안 된 탭까지 렌더되면 lazy render 점검 |
| `LiveMatchContainer:arena` | 10회 이하 | distance update가 전체 arena를 다시 그리면 props 안정화 |
| `LiveMatchExitActionCard` | 3회 이하 | visible/action state 변화 없이 반복되면 memo comparator 확인 |
| `LiveMatchArena` | 10회 이하 | 참가자 token만 바뀌는데 road/card가 같이 리렌더되면 분리 |
| `RoadMotion` | 1~3회 이하 | mount/unmount 반복 또는 정적 road UI 리렌더링 확인 |
| `RunRouteMap.native` | 기록 보기 탭 진입 시에만 mount | 대결 보기에서 mount되면 지도 lazy mount 실패 |

## 금지 규칙

- render 중에 긴 `sort/filter/map` 계산을 직접 돌리지 않습니다.
- live match 화면에서 선택되지 않은 탭의 무거운 컴포넌트를 mount하지 않습니다.
- `useEffect` 재실행만으로 polling, heartbeat, watcher를 새로 만들지 않습니다.
- `roomId`, `matchId`, `source`가 null인 상태에서 대결 관련 interval을 시작하지 않습니다.
- `success:true` 응답이라도 `roomId`, `matchId`, `inviteToken` 같은 필수 필드가 없으면 성공으로 처리하지 않습니다.
- 방 나가기/삭제/기권 화면 이동을 서버 cleanup 완료까지 block하지 않습니다.
- Android 최적화를 위해 GPS 기록 정확도, 승패 판정, 저장 포맷을 바꾸지 않습니다.
- 운영/preview release에 dev-only perf 로그가 노출되면 안 됩니다.

## 성능 로그 체크리스트

Android 실기기 QA에서 `[RG perf]` 로그를 복사해 아래 항목을 확인합니다.

- `active room check begin`이 같은 `requestId` 없이 연속 폭주하지 않는가?
- `active room check reuse/skipped`가 찍히고, 같은 room snapshot은 중복 처리되지 않는가?
- `live match navigation begin`이 같은 `matchId`로 반복되지 않는가?
- live screen이 mount된 뒤 `navigation end success:false`가 늦게 찍히지 않는가?
- `polling activeKindCount`가 일반적으로 1~2 이하인가?
- `heartbeat activeKindCount`가 같은 `matchId`에서 1을 넘지 않는가?
- `watcher count`가 foreground/background 합산 0~1 수준으로 유지되는가?
- `GPS tracking start end`가 길어져도 탭/기권/나가기 버튼이 즉시 반응하는가?
- `RoadMotion mount`가 대결 중 반복되지 않는가?
- 기록 보기 탭이 아닐 때 `RunRouteMap.native` render 로그가 찍히지 않는가?

## 출시 전 기준

Android preview 또는 dev build로 파티런 1대1을 2대 기기에서 확인합니다.

- 방 생성, 초대, 코드 입장, 방장 시작, 카운트다운, 대결 화면 진입, 기록 반영, 기권, 결과 저장을 한 흐름으로 테스트합니다.
- 위 예산을 크게 초과하는 로그가 있으면 OTA/빌드 전에 원인 분석 문서에 남기고 수정합니다.
- 성능 최적화 후에는 `npm run typecheck`, `npm run lint`, `npm run test`, `npm run perf:smells`를 실행합니다.
