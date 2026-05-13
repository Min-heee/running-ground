# Android Performance Report

작성일: 2026-05-13

## 점검 범위

- `running`: `src/features/running/screens/RunningScreen.tsx`, `src/features/runs/TrackRunExperience.tsx`
- `track-run`: `src/features/running/screens/TrackRunScreen.tsx`, `src/features/runs/TrackRunExperience.tsx`
- `match-room`: `src/features/match/screens/MatchRoomScreen.tsx`, `src/features/runs/components/matchRoom/*`, `src/features/runs/hooks/useMatchRoomLobby.ts`
- 실시간 대결 화면: `src/features/runs/components/LiveMatchPages.tsx`, `src/features/runs/components/LiveMatchPager.tsx`, `src/components/matches/LiveMatchArena.tsx`, `src/components/matches/LiveMatchRaceBoard.tsx`, `src/components/matches/liveMatchArena/*`
- `race`: `src/features/match/screens/RaceScreen.tsx`
- `league`: `src/features/league/screens/LeagueScreen.tsx`, `src/features/league/screens/DistrictPersonalScreen.tsx`, `src/features/league/components/*`
- `friends`: `src/features/friends/screens/FriendsScreen.tsx`, `src/features/friends/FriendsRanking.tsx`, `src/features/friends/components/*`
- `market`: `src/features/market/screens/MarketScreen.tsx`
- 위치/지도: `src/features/runs/backgroundTracking.ts`, `src/features/runs/hooks/useRunTrackingFlow.ts`, `src/features/runs/RunRouteMap.native.tsx`, `src/features/running/screens/RunDetailScreen.tsx`

## 실행한 검증

- `npm run typecheck`: 통과
- `npm run lint`: 통과, 기존 warning 47개 유지
- `npm run test`: 통과, 94개 테스트 통과
- `rg "console\.(log|debug|info|warn)" app src -g"*.ts" -g"*.tsx"`: 앱 코드 기준 개발용 콘솔 로그 없음
- `rg "ScrollView|FlatList|\.map\(|\.sort\(|\.filter\(|watchPositionAsync|startLocationUpdatesAsync|Pedometer.watchStepCount|setInterval|setTimeout|MapView|Polyline|Marker" ...`: Android 위험 후보 재점검

## 발견한 병목

1. 라이브 대결과 러닝 측정 중 위치 snapshot이 자주 갱신되며 route 배열이 커질수록 복제 비용이 커질 수 있었다.
2. 위치 업데이트마다 고도 상승을 전체 route 기준으로 재계산하면 러닝 시간이 길어질수록 비용이 증가할 수 있었다.
3. pedometer subscription이 비동기 권한 요청 이후 중복 등록될 여지가 있었다.
4. 저장된 러닝 상세 지도에서 route 좌표, marker, polyline element가 렌더마다 새로 생성될 수 있었다.
5. 친구 랭킹, 러닝 기록, 매치 기록, 지역 랭킹, 파티런 참가자 명단처럼 데이터가 늘어날 수 있는 UI가 `map` 기반 렌더링에 의존하던 부분이 있었다.
6. 일부 화면은 최상위 `Screen`이 `ScrollView` 기반이므로, 내부 `FlatList`는 `scrollEnabled={false}`로 렌더 비용을 줄였지만 완전한 화면 단위 virtualization은 아직 아니다.

## 수정한 내용

1. `backgroundTracking.ts`
   - snapshot 구독자가 `cloneRoute: false`를 선택할 수 있게 했다.
   - 실시간 화면 구독에서는 route 전체 복제를 피하고, 저장이 필요한 흐름에서는 기존처럼 clone을 유지할 수 있게 했다.
   - 고도 상승을 전체 route 재계산 대신 segment 단위 누적 방식으로 바꿨다.
   - 위치 watcher 시작 전 기존 foreground/background task를 정리하는 기존 구조를 유지했다.

2. `useRunTrackingFlow.ts`
   - background tracking 구독을 `cloneRoute: false`로 전환해 매 위치 업데이트마다 커지는 route 복제 비용을 줄였다.
   - pedometer subscription이 이미 있거나 status가 running이 아니면 추가 등록하지 않도록 방어했다.
   - cleanup 흐름은 기존처럼 focus/unmount 시 subscription, timer, countdown helper를 정리한다.

3. `RunRouteMap.native.tsx`
   - 지도 컴포넌트를 `memo`로 감쌌다.
   - planned route, actual route, latest marker element를 `useMemo`로 고정했다.
   - 기본 빈 좌표 배열을 상수로 빼서 prop 기본값이 매번 새 배열이 되지 않게 했다.

4. `RunDetailScreen.tsx`
   - 저장된 route 좌표 변환과 map region 계산을 `useMemo`로 고정했다.
   - 지도 marker에 넘기는 latest coordinate 계산도 안정화했다.

5. 리스트 렌더링
   - 친구 랭킹, 친구 목록, 친구 요청, 내 러닝 기록, 친구 러닝 기록, 매치 기록, 지역 개인 랭킹, 지역 회원 랭킹, 대결 결과, 파티런 참가자 명단을 row memo + `FlatList` + 안정적인 `keyExtractor`/`renderItem` 구조로 정리했다.
   - 그룹 대결 순위판은 이미 `FlatList` 기반이었고, render/key/getItemLayout callback을 고정했다.

## 화면별 현재 판단

### running / track-run

- 위치 측정은 `startBackgroundRunTracking`이 호출될 때 시작된다.
- `startLocationTask`는 새 watcher를 만들기 전에 기존 foreground subscription과 background task를 먼저 중지한다.
- 위치 업데이트는 `timeInterval: 2000`, `distanceInterval: 4`로 설정되어 있다.
- route 복제와 고도 전체 재계산 비용을 줄여 장시간 러닝 시 Android 부담을 낮췄다.
- 남은 위험: `TrackRunExperience.tsx`에 hook dependency warning이 남아 있어, 장기적으로는 effect 의존성을 더 명확히 분리하는 것이 좋다.

### match-room

- 대기실 polling/timer는 cleanup이 있는 hook 구조다.
- 참가자 명단은 `FlatList`로 전환했다.
- 친구 초대 카드의 친구 후보는 아직 소량 UI로 보고 유지했다.
- 남은 위험: 방 polling interval이 실제 네트워크 지연과 겹칠 때 Android 저사양 기기에서 버튼 반응성이 떨어지는지 실기기 확인이 필요하다.

### 실시간 대결 화면

- 그룹 도로와 순위판은 `FlatList`, memo row, Android 전용 batch/window 설정이 들어가 있다.
- 대결 화면은 `react-native-maps`를 쓰지 않는다.
- Android display frame throttling과 perf panel 기반 진단 구조가 있다.
- 남은 위험: 실시간 대결 화면의 상위 상태가 1초마다 갱신되므로, 실제 Android에서 FPS/렌더 수를 계속 봐야 한다.

### race

- 현재 준비중 화면이라 대량 렌더링, 위치 watcher, 지도 사용 없음.

### league

- 대학 탭은 준비중 화면이다.
- 지역 selector와 지역 회원 랭킹은 `FlatList` 기반으로 정리했다.
- breadcrumb 같은 소량 UI는 `map` 유지가 타당하다.
- 남은 위험: 최상위 `Screen`이 `ScrollView`라 지역 목록이 매우 커질 경우 화면 단위 virtualization 이점은 제한적이다.

### friends

- 친구 랭킹, 친구 목록, 요청 목록은 `FlatList` 기반으로 정리했다.
- 20초 refresh interval은 `useFocusEffect` cleanup으로 화면 이탈 시 정리된다.
- 남은 위험: 친구가 매우 많아질 경우 `Screen`의 outer `ScrollView` 구조 자체를 SectionList 기반 화면으로 바꾸는 개선이 필요할 수 있다.

### market

- 현재 준비중 화면이라 리스트 병목 없음.
- 마켓 아이템 목록이 실제로 붙으면 FlatList/FlashList 적용이 필요하다.

## 아직 남은 위험 요소

1. 실제 Android 기기 FPS는 코드 검증만으로 확정할 수 없다. 반드시 실기기에서 `ANDROID QA PERF` 패널 값으로 확인해야 한다.
2. 최상위 `Screen`이 `ScrollView` 기반이라, 아주 큰 목록에서는 내부 `FlatList`가 완전한 virtualization 효과를 내지 못한다.
3. `TrackRunExperience.tsx`, `useRunTrackingFlow.ts`, `usePartyRunSync.ts`에 기존 hook dependency warning이 남아 있다.
4. `BestForNavigation` 위치 정확도는 기록 품질에는 좋지만 Android 배터리/CPU 비용이 높다. 출시 QA에서 렉이 계속 보이면 Android 전용 정확도 단계 조절을 검토해야 한다.
5. 파티런/대결 화면은 서버 polling, countdown, progress upload, 화면 렌더가 동시에 일어나므로 실제 네트워크 환경에서만 드러나는 병목이 남을 수 있다.

## 실제 기기 체크리스트

1. Android 단독 혼자 러닝 시작 후 5분 이상 측정하면서 거리, 페이스, 화면 스크롤 반응 확인
2. Android에서 러닝 중 앱을 백그라운드로 보냈다가 돌아왔을 때 watcher 중복 없이 거리 증가가 자연스러운지 확인
3. Android + iOS 파티런 1대1에서 카운트다운, 20초 대결 화면 이동, active 전환 확인
4. Android + iOS 파티런 1대1에서 상대 거리/페이스가 2초 단위로 늦게라도 반영되는지 확인
5. Android 그룹 대결에서 20명 이상 참가자 목록 스크롤과 순위판 FPS 확인
6. 대결 중 `ANDROID QA PERF` 패널의 FPS, render count, hidden/static/diagnosis 값을 기록
7. 대결 화면에서 순위 보기/기록 보기 탭 전환이 즉시 반응하는지 확인
8. 기권 후 내 화면과 상대 화면의 동그라미/버튼 상태가 바뀌는지 확인
9. 러닝 종료 후 저장 상세 지도 진입 시 지연이나 앱 멈춤이 없는지 확인
10. 친구/리그/전적 화면에서 데이터가 많은 계정으로 스크롤 끊김이 있는지 확인

## 결론

자동 검증 기준으로는 Android 성능 최적화가 기능을 깨뜨리지 않았다. 코드상 가장 큰 병목 후보였던 route 복제, 고도 전체 재계산, 리스트 직접 렌더링, 지도 element 재생성은 완화됐다. 다만 실제 Android 체감 성능은 기기 성능, 네트워크 지연, 백그라운드 위치 정책 영향을 크게 받으므로 실기기 QA가 최종 판단 기준이다.
