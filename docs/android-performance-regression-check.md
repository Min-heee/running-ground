# Android 성능 회귀 방지 체크

생성 시각: 2026-05-27T17:00:05.222Z

이 문서는 `scripts/check-performance-smells.mjs`가 앱 코드의 성능 회귀 후보를 정적으로 점검한 결과입니다. 자동 수정은 하지 않고, Android 실기기 QA 전에 확인할 위험 후보만 모읍니다.

## 실행 방법

```bash
npm run performance:smells
```

## 점검 기준

- `ScrollView` 내부에서 `.map()`으로 긴 리스트를 렌더링하는 후보
- 렌더링 경로 근처의 `.sort()`, `.filter()`, `.map()` 반복 계산 후보
- 위치/센서 watcher 중복 등록 후보
- timer/subscription/watcher가 있는 `useEffect` cleanup 누락 후보
- 출시 코드에 남은 `console.log`, `console.warn`, `console.error` 후보
- `react-native-maps`의 마커/폴리라인/region 과다 업데이트 후보

## 요약

- 전체 감지 항목: 17개
- High: 0개
- Medium: 16개
- Low: 1개

| 항목 | 개수 |
| --- | --- |
| 개발 로그 | 1 |
| 렌더 중 sort/filter/map 계산 | 15 |
| react-native-maps 사용 파일 | 1 |

## High

현재 휴리스틱 기준으로 감지된 항목이 없습니다.

## Medium

| 우선순위 | 항목 | 위치 | 이유 | 권장 확인 |
| --- | --- | --- | --- | --- |
| Medium | 렌더 중 sort/filter/map 계산 | src/features/friends/components/FriendListCard.tsx:102 | 렌더링 경로 근처에서 반복 계산이 감지됐어요. 데이터가 많아질수록 Android에서 매 렌더 비용이 커질 수 있습니다. | 정렬/필터링 결과는 useMemo로 빼고, renderItem은 useCallback으로 고정하세요. |
| Medium | 렌더 중 sort/filter/map 계산 | src/features/friends/components/FriendRequestsCard.tsx:111 | 렌더링 경로 근처에서 반복 계산이 감지됐어요. 데이터가 많아질수록 Android에서 매 렌더 비용이 커질 수 있습니다. | 정렬/필터링 결과는 useMemo로 빼고, renderItem은 useCallback으로 고정하세요. |
| Medium | 렌더 중 sort/filter/map 계산 | src/features/friends/components/FriendRequestsCard.tsx:120 | 렌더링 경로 근처에서 반복 계산이 감지됐어요. 데이터가 많아질수록 Android에서 매 렌더 비용이 커질 수 있습니다. | 정렬/필터링 결과는 useMemo로 빼고, renderItem은 useCallback으로 고정하세요. |
| Medium | 렌더 중 sort/filter/map 계산 | src/features/friends/FriendsRanking.tsx:75 | 렌더링 경로 근처에서 반복 계산이 감지됐어요. 데이터가 많아질수록 Android에서 매 렌더 비용이 커질 수 있습니다. | 정렬/필터링 결과는 useMemo로 빼고, renderItem은 useCallback으로 고정하세요. |
| Medium | 렌더 중 sort/filter/map 계산 | src/features/friends/screens/FriendDetailScreen.tsx:94 | 렌더링 경로 근처에서 반복 계산이 감지됐어요. 데이터가 많아질수록 Android에서 매 렌더 비용이 커질 수 있습니다. | 정렬/필터링 결과는 useMemo로 빼고, renderItem은 useCallback으로 고정하세요. |
| Medium | 렌더 중 sort/filter/map 계산 | src/features/league/components/DistrictMemberRankingCard.tsx:76 | 렌더링 경로 근처에서 반복 계산이 감지됐어요. 데이터가 많아질수록 Android에서 매 렌더 비용이 커질 수 있습니다. | 정렬/필터링 결과는 useMemo로 빼고, renderItem은 useCallback으로 고정하세요. |
| Medium | 렌더 중 sort/filter/map 계산 | src/features/league/components/LeagueRegionSelectorCard.tsx:126 | 렌더링 경로 근처에서 반복 계산이 감지됐어요. 데이터가 많아질수록 Android에서 매 렌더 비용이 커질 수 있습니다. | 정렬/필터링 결과는 useMemo로 빼고, renderItem은 useCallback으로 고정하세요. |
| Medium | 렌더 중 sort/filter/map 계산 | src/features/league/screens/DistrictPersonalScreen.tsx:67 | 렌더링 경로 근처에서 반복 계산이 감지됐어요. 데이터가 많아질수록 Android에서 매 렌더 비용이 커질 수 있습니다. | 정렬/필터링 결과는 useMemo로 빼고, renderItem은 useCallback으로 고정하세요. |
| Medium | 렌더 중 sort/filter/map 계산 | src/features/league/screens/DistrictPersonalScreen.tsx:76 | 렌더링 경로 근처에서 반복 계산이 감지됐어요. 데이터가 많아질수록 Android에서 매 렌더 비용이 커질 수 있습니다. | 정렬/필터링 결과는 useMemo로 빼고, renderItem은 useCallback으로 고정하세요. |
| Medium | 렌더 중 sort/filter/map 계산 | src/features/match/screens/MatchRecordScreen.tsx:105 | 렌더링 경로 근처에서 반복 계산이 감지됐어요. 데이터가 많아질수록 Android에서 매 렌더 비용이 커질 수 있습니다. | 정렬/필터링 결과는 useMemo로 빼고, renderItem은 useCallback으로 고정하세요. |
| Medium | 렌더 중 sort/filter/map 계산 | src/features/profile/screens/MyActivityScreen.tsx:63 | 렌더링 경로 근처에서 반복 계산이 감지됐어요. 데이터가 많아질수록 Android에서 매 렌더 비용이 커질 수 있습니다. | 정렬/필터링 결과는 useMemo로 빼고, renderItem은 useCallback으로 고정하세요. |
| Medium | 렌더 중 sort/filter/map 계산 | src/features/runs/components/MatchResultPanel.tsx:48 | 렌더링 경로 근처에서 반복 계산이 감지됐어요. 데이터가 많아질수록 Android에서 매 렌더 비용이 커질 수 있습니다. | 정렬/필터링 결과는 useMemo로 빼고, renderItem은 useCallback으로 고정하세요. |
| Medium | 렌더 중 sort/filter/map 계산 | src/features/runs/components/MatchResultPanel.tsx:72 | 렌더링 경로 근처에서 반복 계산이 감지됐어요. 데이터가 많아질수록 Android에서 매 렌더 비용이 커질 수 있습니다. | 정렬/필터링 결과는 useMemo로 빼고, renderItem은 useCallback으로 고정하세요. |
| Medium | 렌더 중 sort/filter/map 계산 | src/features/runs/components/PartyRunParticipantListCard.tsx:73 | 렌더링 경로 근처에서 반복 계산이 감지됐어요. 데이터가 많아질수록 Android에서 매 렌더 비용이 커질 수 있습니다. | 정렬/필터링 결과는 useMemo로 빼고, renderItem은 useCallback으로 고정하세요. |
| Medium | 렌더 중 sort/filter/map 계산 | src/features/settings/admin/components/AdminPrimitives.tsx:199 | 렌더링 경로 근처에서 반복 계산이 감지됐어요. 데이터가 많아질수록 Android에서 매 렌더 비용이 커질 수 있습니다. | 정렬/필터링 결과는 useMemo로 빼고, renderItem은 useCallback으로 고정하세요. |
| Medium | 개발 로그 | src/utils/rgPerfTrace.ts:85 | 런타임 로그가 감지됐어요. 반복 렌더/위치 업데이트 구간이면 Android 성능과 로그 노이즈에 영향을 줄 수 있습니다. | 출시 코드에서는 제거하거나 __DEV__ 조건/QA 전용 logger로 감싸세요. |

## Low

| 우선순위 | 항목 | 위치 | 이유 | 권장 확인 |
| --- | --- | --- | --- | --- |
| Low | react-native-maps 사용 파일 | src/features/runs/RunRouteMap.native.tsx:1 | 지도 사용 파일입니다. Android에서 위치 업데이트와 함께 렌더 비용이 커질 수 있어 QA 관찰 대상입니다. | 실기기에서 지도 이동, 마커 갱신, 폴리라인 갱신 시 FPS와 입력 지연을 확인하세요. |

## 해석 규칙

- 이 스크립트는 정적 휴리스틱이라 false positive가 있을 수 있습니다.
- High 항목은 Android 렉/화면 튐과 직접 연결될 수 있어 먼저 확인합니다.
- Medium 항목은 데이터가 늘 때 문제가 될 가능성이 있는 구조입니다.
- Low 항목은 실기기 QA 때 관찰 대상으로 남깁니다.
- 자동 수정은 하지 않습니다. 기능/UI 변경 없이 사람이 확인한 뒤 별도 리팩토링합니다.
