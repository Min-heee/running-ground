# Android Live Match Performance Budget

이 문서는 Android 실기기에서 파티런/1대1 대결 화면이 먹통처럼 느려지지 않도록 지켜야 할 성능 기준입니다. 새 기능을 넣을 때는 아래 예산을 넘기지 않는지 `[RG perf]` 로그로 먼저 확인합니다.

## 목표 시간

| 구간 | 목표 | 경고 기준 | 실패 기준 |
| --- | ---: | ---: | ---: |
| 방 생성 버튼 터치 -> 대기실 이동 | 1.5초 이내 | 3초 초과 | 5초 초과 |
| 초대코드 입력 -> 대기실 이동 | 1.5초 이내 | 3초 초과 | 5초 초과 |
| 방장 시작 -> 로딩/카운트다운 표시 | 1초 이내 | 2초 초과 | 4초 초과 |
| 대결 시작 -> live match 화면 mount | 1.5초 이내 | 3초 초과 | 5초 초과 |
| 기권/나가기 버튼 터치 -> 화면 반응 | 300ms 이내 | 800ms 초과 | 2초 초과 |

## UI Block 금지 규칙

- GPS tracking start, foreground watcher start, background task start는 화면 navigation을 기다리게 만들면 안 됩니다.
- live match 화면은 먼저 mount되어야 하고, GPS/background task는 뒤에서 비동기로 시작되어야 합니다.
- background task start가 3초를 넘으면 warning 로그만 남기고 UI 흐름은 계속 진행해야 합니다.
- GPS/background task 완료 여부로 live match navigation success/failure를 판단하면 안 됩니다.
- appState active/background가 짧게 흔들릴 때 watcher/task start/stop을 반복하면 안 됩니다.

## Runtime Resource Budget

| 리소스 | 정상 기준 | 경고 기준 | 실패 기준 |
| --- | ---: | ---: | ---: |
| polling activeKindCount | 1개 | 2개 | 3개 이상 |
| heartbeat activeKindCount | 1개 | 1개 초과 | 2개 이상 |
| watcher activeKindCount | 0~1개 | 2개 순간 발생 | 2개 이상 지속 |
| 같은 roomId party room polling | 1개 이하 | 2개 | 2개 이상 지속 |
| 같은 matchId linked status polling | 1개 이하 | 2개 | 2개 이상 지속 |
| 같은 matchId progress heartbeat | 1개 이하 | 2개 | 2개 이상 지속 |

## 10초 Render Count 기준

| 컴포넌트 | 정상 기준 | 경고 기준 | 실패 기준 |
| --- | ---: | ---: | ---: |
| `TrackRunExperience` | 10회 이하 | 20회 초과 | 30회 초과 |
| `LiveMatchContainer:arena` | 10회 이하 | 15회 초과 | 25회 초과 |
| `LiveMatchPager:page-0` | 10회 이하 | 15회 초과 | 25회 초과 |
| `LiveMatchExitActionCard` | 3회 이하 | 10회 초과 | 20회 초과 |
| `LiveMatchArena` | 10회 이하 | 15회 초과 | 25회 초과 |
| `RoadMotion` | 1~3회 | 5회 초과 | 10회 초과 |
| `RunRouteMap.native` | 기록 보기 탭에서만 mount | 비선택 탭에서 render | 대결 보기 중 지속 render |

## Live Match Navigation 실패 허용 기준

- 같은 `matchId`에 대한 `live match navigation begin`은 1회가 정상입니다.
- 같은 `matchId`가 이미 `navigating` 또는 `mounted`이면 추가 navigation은 `skipped duplicate` 또는 `suppressed because mounted`로 끝나야 합니다.
- `live match screen mount` 또는 `RoadMotion mount`가 확인된 뒤에는 navigation을 success로 간주해야 합니다.
- `success:false`는 네트워크/API 실패처럼 실제 화면 진입이 안 된 경우에만 허용합니다.
- 같은 `matchId`에서 `success:false`가 2회 이상 반복되면 실패 기준입니다.
- `preferArena:false`와 `preferArena:true`가 충돌할 때는 active 상태의 `preferArena:true`가 우선이며, 중복 navigation 대신 upgrade/defer로 처리해야 합니다.

## 새 기능 추가 시 금지 패턴

- 화면 render 또는 `useEffect` 재실행만으로 active room check를 새로 시작하지 않습니다.
- polling, heartbeat, watcher는 registry/single-flight 없이 직접 `setInterval` 또는 start 함수를 만들지 않습니다.
- GPS/background task start를 navigation promise와 직렬로 묶지 않습니다.
- `ScrollView + map`으로 긴 live list를 렌더링하지 않습니다.
- live match 대결 보기 탭이 아닌데 `RoadMotion`, ranking 계산, 지도 polyline 계산을 계속 돌리지 않습니다.
- 같은 room/match 상태 snapshot을 이미 처리했는데 `setState`, navigation, polling restart를 반복하지 않습니다.
- `success:true`인데 `roomId`, `matchId`, `inviteToken`, `userId` 같은 필수 필드가 없는 API 응답을 성공으로 처리하지 않습니다.
- dev trace 로그를 production release에서 켜지 않도록 유지합니다.

## 성능 로그 확인 체크리스트

1. Android dev build에서 파티런 1대1 방을 생성합니다.
2. Metro 로그에서 `[RG env]`로 API 서버와 계정이 의도한 값인지 확인합니다.
3. 방 생성, 초대코드 입장, 방장 시작, live match 화면 진입 로그를 복사합니다.
4. `300ms` 이상 warning 로그가 어느 구간에 집중되는지 확인합니다.
5. 10초 resource summary를 최소 3개 이상 확인합니다.
6. `polling`, `heartbeat`, `watcher` activeKindCount가 예산 안에 있는지 확인합니다.
7. render counter에서 `TrackRunExperience`, `LiveMatchContainer`, `LiveMatchPager`, `RoadMotion` 횟수를 확인합니다.
8. 같은 `matchId`의 live match navigation이 반복 begin/end 되는지 확인합니다.
9. 기권/나가기 버튼을 눌렀을 때 300ms 안에 화면 반응이 있는지 확인합니다.
10. 필요하면 로그 파일을 저장한 뒤 `npm run perf:trace-analyze -- <log-file>`로 위험 패턴을 요약합니다.

## 출시 전 판정

- 실패 기준이 하나라도 나오면 Android preview 배포 전에 원인을 먼저 줄입니다.
- 경고 기준만 나온 경우에는 같은 시나리오를 2회 이상 반복해 재현성을 확인합니다.
- iOS가 정상이어도 Android 기준을 따로 통과해야 합니다.
