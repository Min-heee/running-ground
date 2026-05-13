# Android 성능 회귀 방지 체크

생성 시각: 2026-05-13T10:09:56.036Z

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

- 전체 감지 항목: 58개
- High: 3개
- Medium: 55개
- Low: 0개

| 항목 | 개수 |
| --- | --- |
| 렌더 중 sort/filter/map 계산 | 47 |
| 위치/센서 watcher 중복 후보 | 2 |
| react-native-maps 업데이트 후보 | 4 |
| ScrollView + map 리스트 | 5 |

## High

| 우선순위 | 항목 | 위치 | 이유 | 권장 확인 |
| --- | --- | --- | --- | --- |
| High | 위치/센서 watcher 중복 후보 | src/features/runs/backgroundTracking.ts:531 | 한 파일에서 watcher 후보가 3개 감지됐어요. 조건 없이 동시에 등록되면 Android에서 병목이 커질 수 있습니다. | 화면 focus 상태, match 상태, tracker 상태에 따라 단 하나만 활성화되는지 확인하세요. |
| High | 위치/센서 watcher 중복 후보 | src/features/runs/hooks/useRunTrackingFlow.ts:356 | 한 파일에서 watcher 후보가 2개 감지됐어요. 조건 없이 동시에 등록되면 Android에서 병목이 커질 수 있습니다. | 화면 focus 상태, match 상태, tracker 상태에 따라 단 하나만 활성화되는지 확인하세요. |
| High | ScrollView + map 리스트 | src/features/settings/screens/AdminScreen.tsx:372 | ScrollView 내부에서 5개의 map 렌더링이 감지됐어요. 데이터가 늘면 Android에서 프레임 드랍 위험이 커집니다. | 긴 목록 가능성이 있으면 FlatList/SectionList로 바꾸고 keyExtractor/renderItem/useMemo를 사용하세요. |

## Medium

| 우선순위 | 항목 | 위치 | 이유 | 권장 확인 |
| --- | --- | --- | --- | --- |
| Medium | 렌더 중 sort/filter/map 계산 | src/components/matches/LiveMatchArena.tsx:94 | 렌더링 경로 근처에서 반복 계산이 감지됐어요. 데이터가 많아질수록 Android에서 매 렌더 비용이 커질 수 있습니다. | 정렬/필터링 결과는 useMemo로 빼고, renderItem은 useCallback으로 고정하세요. |
| Medium | 렌더 중 sort/filter/map 계산 | src/components/matches/liveMatchArena/RoadMotion.tsx:64 | 렌더링 경로 근처에서 반복 계산이 감지됐어요. 데이터가 많아질수록 Android에서 매 렌더 비용이 커질 수 있습니다. | 정렬/필터링 결과는 useMemo로 빼고, renderItem은 useCallback으로 고정하세요. |
| Medium | 렌더 중 sort/filter/map 계산 | src/components/matches/liveMatchArena/RoadMotion.tsx:82 | 렌더링 경로 근처에서 반복 계산이 감지됐어요. 데이터가 많아질수록 Android에서 매 렌더 비용이 커질 수 있습니다. | 정렬/필터링 결과는 useMemo로 빼고, renderItem은 useCallback으로 고정하세요. |
| Medium | 렌더 중 sort/filter/map 계산 | src/features/auth/screens/UniversityVerificationScreen.tsx:65 | 렌더링 경로 근처에서 반복 계산이 감지됐어요. 데이터가 많아질수록 Android에서 매 렌더 비용이 커질 수 있습니다. | 정렬/필터링 결과는 useMemo로 빼고, renderItem은 useCallback으로 고정하세요. |
| Medium | 렌더 중 sort/filter/map 계산 | src/features/auth/screens/UniversityVerificationScreen.tsx:101 | 렌더링 경로 근처에서 반복 계산이 감지됐어요. 데이터가 많아질수록 Android에서 매 렌더 비용이 커질 수 있습니다. | 정렬/필터링 결과는 useMemo로 빼고, renderItem은 useCallback으로 고정하세요. |
| Medium | 렌더 중 sort/filter/map 계산 | src/features/auth/screens/UniversityVerificationScreen.tsx:190 | 렌더링 경로 근처에서 반복 계산이 감지됐어요. 데이터가 많아질수록 Android에서 매 렌더 비용이 커질 수 있습니다. | 정렬/필터링 결과는 useMemo로 빼고, renderItem은 useCallback으로 고정하세요. |
| Medium | 렌더 중 sort/filter/map 계산 | src/features/auth/screens/UniversityVerificationScreen.tsx:203 | 렌더링 경로 근처에서 반복 계산이 감지됐어요. 데이터가 많아질수록 Android에서 매 렌더 비용이 커질 수 있습니다. | 정렬/필터링 결과는 useMemo로 빼고, renderItem은 useCallback으로 고정하세요. |
| Medium | 렌더 중 sort/filter/map 계산 | src/features/home/components/HomeUpcomingMatchesCard.tsx:34 | 렌더링 경로 근처에서 반복 계산이 감지됐어요. 데이터가 많아질수록 Android에서 매 렌더 비용이 커질 수 있습니다. | 정렬/필터링 결과는 useMemo로 빼고, renderItem은 useCallback으로 고정하세요. |
| Medium | 렌더 중 sort/filter/map 계산 | src/features/home/components/overview/HomePointCalendar.tsx:50 | 렌더링 경로 근처에서 반복 계산이 감지됐어요. 데이터가 많아질수록 Android에서 매 렌더 비용이 커질 수 있습니다. | 정렬/필터링 결과는 useMemo로 빼고, renderItem은 useCallback으로 고정하세요. |
| Medium | 렌더 중 sort/filter/map 계산 | src/features/home/components/overview/HomePointCalendar.tsx:56 | 렌더링 경로 근처에서 반복 계산이 감지됐어요. 데이터가 많아질수록 Android에서 매 렌더 비용이 커질 수 있습니다. | 정렬/필터링 결과는 useMemo로 빼고, renderItem은 useCallback으로 고정하세요. |
| Medium | 렌더 중 sort/filter/map 계산 | src/features/home/components/overview/HomePointCalendar.tsx:58 | 렌더링 경로 근처에서 반복 계산이 감지됐어요. 데이터가 많아질수록 Android에서 매 렌더 비용이 커질 수 있습니다. | 정렬/필터링 결과는 useMemo로 빼고, renderItem은 useCallback으로 고정하세요. |
| Medium | 렌더 중 sort/filter/map 계산 | src/features/home/components/overview/HomePointGaugeCard.tsx:37 | 렌더링 경로 근처에서 반복 계산이 감지됐어요. 데이터가 많아질수록 Android에서 매 렌더 비용이 커질 수 있습니다. | 정렬/필터링 결과는 useMemo로 빼고, renderItem은 useCallback으로 고정하세요. |
| Medium | 렌더 중 sort/filter/map 계산 | src/features/home/screens/HomeScreen.tsx:32 | 렌더링 경로 근처에서 반복 계산이 감지됐어요. 데이터가 많아질수록 Android에서 매 렌더 비용이 커질 수 있습니다. | 정렬/필터링 결과는 useMemo로 빼고, renderItem은 useCallback으로 고정하세요. |
| Medium | 렌더 중 sort/filter/map 계산 | src/features/integrations/components/IntegrationSourcesCards.tsx:28 | 렌더링 경로 근처에서 반복 계산이 감지됐어요. 데이터가 많아질수록 Android에서 매 렌더 비용이 커질 수 있습니다. | 정렬/필터링 결과는 useMemo로 빼고, renderItem은 useCallback으로 고정하세요. |
| Medium | 렌더 중 sort/filter/map 계산 | src/features/integrations/components/IntegrationSourcesCards.tsx:74 | 렌더링 경로 근처에서 반복 계산이 감지됐어요. 데이터가 많아질수록 Android에서 매 렌더 비용이 커질 수 있습니다. | 정렬/필터링 결과는 useMemo로 빼고, renderItem은 useCallback으로 고정하세요. |
| Medium | 렌더 중 sort/filter/map 계산 | src/features/integrations/IntegrationJourneyCard.tsx:132 | 렌더링 경로 근처에서 반복 계산이 감지됐어요. 데이터가 많아질수록 Android에서 매 렌더 비용이 커질 수 있습니다. | 정렬/필터링 결과는 useMemo로 빼고, renderItem은 useCallback으로 고정하세요. |
| Medium | 렌더 중 sort/filter/map 계산 | src/features/integrations/IntegrationStatus.tsx:18 | 렌더링 경로 근처에서 반복 계산이 감지됐어요. 데이터가 많아질수록 Android에서 매 렌더 비용이 커질 수 있습니다. | 정렬/필터링 결과는 useMemo로 빼고, renderItem은 useCallback으로 고정하세요. |
| Medium | 렌더 중 sort/filter/map 계산 | src/features/integrations/NativeHealthReadinessCard.tsx:31 | 렌더링 경로 근처에서 반복 계산이 감지됐어요. 데이터가 많아질수록 Android에서 매 렌더 비용이 커질 수 있습니다. | 정렬/필터링 결과는 useMemo로 빼고, renderItem은 useCallback으로 고정하세요. |
| Medium | 렌더 중 sort/filter/map 계산 | src/features/integrations/NrcBridgeGuideCard.tsx:94 | 렌더링 경로 근처에서 반복 계산이 감지됐어요. 데이터가 많아질수록 Android에서 매 렌더 비용이 커질 수 있습니다. | 정렬/필터링 결과는 useMemo로 빼고, renderItem은 useCallback으로 고정하세요. |
| Medium | 렌더 중 sort/filter/map 계산 | src/features/integrations/NrcBridgeGuideCard.tsx:133 | 렌더링 경로 근처에서 반복 계산이 감지됐어요. 데이터가 많아질수록 Android에서 매 렌더 비용이 커질 수 있습니다. | 정렬/필터링 결과는 useMemo로 빼고, renderItem은 useCallback으로 고정하세요. |
| Medium | 렌더 중 sort/filter/map 계산 | src/features/integrations/screens/ConnectSourcesScreen.tsx:36 | 렌더링 경로 근처에서 반복 계산이 감지됐어요. 데이터가 많아질수록 Android에서 매 렌더 비용이 커질 수 있습니다. | 정렬/필터링 결과는 useMemo로 빼고, renderItem은 useCallback으로 고정하세요. |
| Medium | 렌더 중 sort/filter/map 계산 | src/features/integrations/screens/ConnectSourcesScreen.tsx:73 | 렌더링 경로 근처에서 반복 계산이 감지됐어요. 데이터가 많아질수록 Android에서 매 렌더 비용이 커질 수 있습니다. | 정렬/필터링 결과는 useMemo로 빼고, renderItem은 useCallback으로 고정하세요. |
| Medium | 렌더 중 sort/filter/map 계산 | src/features/league/components/LeagueRegionSelectorCard.tsx:61 | 렌더링 경로 근처에서 반복 계산이 감지됐어요. 데이터가 많아질수록 Android에서 매 렌더 비용이 커질 수 있습니다. | 정렬/필터링 결과는 useMemo로 빼고, renderItem은 useCallback으로 고정하세요. |
| Medium | 렌더 중 sort/filter/map 계산 | src/features/location/RegionSelection.tsx:50 | 렌더링 경로 근처에서 반복 계산이 감지됐어요. 데이터가 많아질수록 Android에서 매 렌더 비용이 커질 수 있습니다. | 정렬/필터링 결과는 useMemo로 빼고, renderItem은 useCallback으로 고정하세요. |
| Medium | 렌더 중 sort/filter/map 계산 | src/features/match/screens/MatchRecordScreen.tsx:28 | 렌더링 경로 근처에서 반복 계산이 감지됐어요. 데이터가 많아질수록 Android에서 매 렌더 비용이 커질 수 있습니다. | 정렬/필터링 결과는 useMemo로 빼고, renderItem은 useCallback으로 고정하세요. |
| Medium | 렌더 중 sort/filter/map 계산 | src/features/profile/components/ProfileSummaryCard.tsx:29 | 렌더링 경로 근처에서 반복 계산이 감지됐어요. 데이터가 많아질수록 Android에서 매 렌더 비용이 커질 수 있습니다. | 정렬/필터링 결과는 useMemo로 빼고, renderItem은 useCallback으로 고정하세요. |
| Medium | ScrollView + map 리스트 | src/features/runs/components/LiveMatchPager.tsx:91 | ScrollView 내부에서 1개의 map 렌더링이 감지됐어요. 데이터가 늘면 Android에서 프레임 드랍 위험이 커집니다. | 긴 목록 가능성이 있으면 FlatList/SectionList로 바꾸고 keyExtractor/renderItem/useMemo를 사용하세요. |
| Medium | 렌더 중 sort/filter/map 계산 | src/features/runs/components/LiveMatchPager.tsx:91 | 렌더링 경로 근처에서 반복 계산이 감지됐어요. 데이터가 많아질수록 Android에서 매 렌더 비용이 커질 수 있습니다. | 정렬/필터링 결과는 useMemo로 빼고, renderItem은 useCallback으로 고정하세요. |
| Medium | 렌더 중 sort/filter/map 계산 | src/features/runs/components/LiveMatchTrackingPage.tsx:289 | 렌더링 경로 근처에서 반복 계산이 감지됐어요. 데이터가 많아질수록 Android에서 매 렌더 비용이 커질 수 있습니다. | 정렬/필터링 결과는 useMemo로 빼고, renderItem은 useCallback으로 고정하세요. |
| Medium | 렌더 중 sort/filter/map 계산 | src/features/runs/components/MatchOptionSelector.tsx:23 | 렌더링 경로 근처에서 반복 계산이 감지됐어요. 데이터가 많아질수록 Android에서 매 렌더 비용이 커질 수 있습니다. | 정렬/필터링 결과는 useMemo로 빼고, renderItem은 useCallback으로 고정하세요. |
| Medium | 렌더 중 sort/filter/map 계산 | src/features/runs/components/matchRoom/MatchRoomDistanceSettingsCard.tsx:27 | 렌더링 경로 근처에서 반복 계산이 감지됐어요. 데이터가 많아질수록 Android에서 매 렌더 비용이 커질 수 있습니다. | 정렬/필터링 결과는 useMemo로 빼고, renderItem은 useCallback으로 고정하세요. |
| Medium | 렌더 중 sort/filter/map 계산 | src/features/runs/components/matchRoom/MatchRoomFriendInviteCard.tsx:32 | 렌더링 경로 근처에서 반복 계산이 감지됐어요. 데이터가 많아질수록 Android에서 매 렌더 비용이 커질 수 있습니다. | 정렬/필터링 결과는 useMemo로 빼고, renderItem은 useCallback으로 고정하세요. |
| Medium | 렌더 중 sort/filter/map 계산 | src/features/runs/components/matchRoom/MatchRoomFriendInviteCard.tsx:40 | 렌더링 경로 근처에서 반복 계산이 감지됐어요. 데이터가 많아질수록 Android에서 매 렌더 비용이 커질 수 있습니다. | 정렬/필터링 결과는 useMemo로 빼고, renderItem은 useCallback으로 고정하세요. |
| Medium | 렌더 중 sort/filter/map 계산 | src/features/runs/components/matchRoom/MatchRoomStartModeCard.tsx:45 | 렌더링 경로 근처에서 반복 계산이 감지됐어요. 데이터가 많아질수록 Android에서 매 렌더 비용이 커질 수 있습니다. | 정렬/필터링 결과는 useMemo로 빼고, renderItem은 useCallback으로 고정하세요. |
| Medium | ScrollView + map 리스트 | src/features/runs/components/matchRoom/MatchRoomWheelColumn.tsx:47 | ScrollView 내부에서 1개의 map 렌더링이 감지됐어요. 데이터가 늘면 Android에서 프레임 드랍 위험이 커집니다. | 긴 목록 가능성이 있으면 FlatList/SectionList로 바꾸고 keyExtractor/renderItem/useMemo를 사용하세요. |
| Medium | ScrollView + map 리스트 | src/features/runs/components/matchRoom/MatchRoomWheelColumn.tsx:47 | ScrollView 내부에서 1개의 map 렌더링이 감지됐어요. 데이터가 늘면 Android에서 프레임 드랍 위험이 커집니다. | 긴 목록 가능성이 있으면 FlatList/SectionList로 바꾸고 keyExtractor/renderItem/useMemo를 사용하세요. |
| Medium | 렌더 중 sort/filter/map 계산 | src/features/runs/components/matchRoom/MatchRoomWheelColumn.tsx:47 | 렌더링 경로 근처에서 반복 계산이 감지됐어요. 데이터가 많아질수록 Android에서 매 렌더 비용이 커질 수 있습니다. | 정렬/필터링 결과는 useMemo로 빼고, renderItem은 useCallback으로 고정하세요. |
| Medium | 렌더 중 sort/filter/map 계산 | src/features/runs/components/matchSetupCards/GroupMatchSetupCard.tsx:139 | 렌더링 경로 근처에서 반복 계산이 감지됐어요. 데이터가 많아질수록 Android에서 매 렌더 비용이 커질 수 있습니다. | 정렬/필터링 결과는 useMemo로 빼고, renderItem은 useCallback으로 고정하세요. |
| Medium | 렌더 중 sort/filter/map 계산 | src/features/runs/components/matchSetupCards/MatchSetupCommon.tsx:37 | 렌더링 경로 근처에서 반복 계산이 감지됐어요. 데이터가 많아질수록 Android에서 매 렌더 비용이 커질 수 있습니다. | 정렬/필터링 결과는 useMemo로 빼고, renderItem은 useCallback으로 고정하세요. |
| Medium | ScrollView + map 리스트 | src/features/runs/components/matchSetupCards/MatchSetupCommon.tsx:98 | ScrollView 내부에서 1개의 map 렌더링이 감지됐어요. 데이터가 늘면 Android에서 프레임 드랍 위험이 커집니다. | 긴 목록 가능성이 있으면 FlatList/SectionList로 바꾸고 keyExtractor/renderItem/useMemo를 사용하세요. |
| Medium | 렌더 중 sort/filter/map 계산 | src/features/runs/components/matchSetupCards/MatchSetupCommon.tsx:98 | 렌더링 경로 근처에서 반복 계산이 감지됐어요. 데이터가 많아질수록 Android에서 매 렌더 비용이 커질 수 있습니다. | 정렬/필터링 결과는 useMemo로 빼고, renderItem은 useCallback으로 고정하세요. |
| Medium | 렌더 중 sort/filter/map 계산 | src/features/runs/components/matchSetupCards/MatchSetupCommon.tsx:121 | 렌더링 경로 근처에서 반복 계산이 감지됐어요. 데이터가 많아질수록 Android에서 매 렌더 비용이 커질 수 있습니다. | 정렬/필터링 결과는 useMemo로 빼고, renderItem은 useCallback으로 고정하세요. |
| Medium | 렌더 중 sort/filter/map 계산 | src/features/runs/components/matchSetupCards/MatchSetupCommon.tsx:138 | 렌더링 경로 근처에서 반복 계산이 감지됐어요. 데이터가 많아질수록 Android에서 매 렌더 비용이 커질 수 있습니다. | 정렬/필터링 결과는 useMemo로 빼고, renderItem은 useCallback으로 고정하세요. |
| Medium | 렌더 중 sort/filter/map 계산 | src/features/runs/components/PartyRunHomePanel.tsx:72 | 렌더링 경로 근처에서 반복 계산이 감지됐어요. 데이터가 많아질수록 Android에서 매 렌더 비용이 커질 수 있습니다. | 정렬/필터링 결과는 useMemo로 빼고, renderItem은 useCallback으로 고정하세요. |
| Medium | 렌더 중 sort/filter/map 계산 | src/features/runs/components/RunningMetricGrid.tsx:32 | 렌더링 경로 근처에서 반복 계산이 감지됐어요. 데이터가 많아질수록 Android에서 매 렌더 비용이 커질 수 있습니다. | 정렬/필터링 결과는 useMemo로 빼고, renderItem은 useCallback으로 고정하세요. |
| Medium | 렌더 중 sort/filter/map 계산 | src/features/runs/components/UpcomingMatchList.tsx:32 | 렌더링 경로 근처에서 반복 계산이 감지됐어요. 데이터가 많아질수록 Android에서 매 렌더 비용이 커질 수 있습니다. | 정렬/필터링 결과는 useMemo로 빼고, renderItem은 useCallback으로 고정하세요. |
| Medium | react-native-maps 업데이트 후보 | src/features/runs/RunRouteMap.native.tsx:30 | 지도/마커/폴리라인 props가 렌더마다 새 객체/배열로 만들어질 가능성이 있습니다. | coordinates/region/marker props는 useMemo로 안정화하고, 위치 업데이트 주기를 과하게 짧게 잡지 마세요. |
| Medium | react-native-maps 업데이트 후보 | src/features/runs/RunRouteMap.native.tsx:35 | 지도/마커/폴리라인 props가 렌더마다 새 객체/배열로 만들어질 가능성이 있습니다. | coordinates/region/marker props는 useMemo로 안정화하고, 위치 업데이트 주기를 과하게 짧게 잡지 마세요. |
| Medium | react-native-maps 업데이트 후보 | src/features/runs/RunRouteMap.native.tsx:39 | 지도/마커/폴리라인 props가 렌더마다 새 객체/배열로 만들어질 가능성이 있습니다. | coordinates/region/marker props는 useMemo로 안정화하고, 위치 업데이트 주기를 과하게 짧게 잡지 마세요. |
| Medium | react-native-maps 업데이트 후보 | src/features/runs/RunRouteMap.native.tsx:47 | 지도/마커/폴리라인 props가 렌더마다 새 객체/배열로 만들어질 가능성이 있습니다. | coordinates/region/marker props는 useMemo로 안정화하고, 위치 업데이트 주기를 과하게 짧게 잡지 마세요. |
| Medium | 렌더 중 sort/filter/map 계산 | src/features/settings/screens/AdminScreen.tsx:372 | 렌더링 경로 근처에서 반복 계산이 감지됐어요. 데이터가 많아질수록 Android에서 매 렌더 비용이 커질 수 있습니다. | 정렬/필터링 결과는 useMemo로 빼고, renderItem은 useCallback으로 고정하세요. |
| Medium | 렌더 중 sort/filter/map 계산 | src/features/settings/screens/AdminScreen.tsx:404 | 렌더링 경로 근처에서 반복 계산이 감지됐어요. 데이터가 많아질수록 Android에서 매 렌더 비용이 커질 수 있습니다. | 정렬/필터링 결과는 useMemo로 빼고, renderItem은 useCallback으로 고정하세요. |
| Medium | 렌더 중 sort/filter/map 계산 | src/features/settings/screens/AdminScreen.tsx:487 | 렌더링 경로 근처에서 반복 계산이 감지됐어요. 데이터가 많아질수록 Android에서 매 렌더 비용이 커질 수 있습니다. | 정렬/필터링 결과는 useMemo로 빼고, renderItem은 useCallback으로 고정하세요. |
| Medium | 렌더 중 sort/filter/map 계산 | src/features/settings/screens/AdminScreen.tsx:530 | 렌더링 경로 근처에서 반복 계산이 감지됐어요. 데이터가 많아질수록 Android에서 매 렌더 비용이 커질 수 있습니다. | 정렬/필터링 결과는 useMemo로 빼고, renderItem은 useCallback으로 고정하세요. |
| Medium | 렌더 중 sort/filter/map 계산 | src/features/settings/screens/AdminScreen.tsx:626 | 렌더링 경로 근처에서 반복 계산이 감지됐어요. 데이터가 많아질수록 Android에서 매 렌더 비용이 커질 수 있습니다. | 정렬/필터링 결과는 useMemo로 빼고, renderItem은 useCallback으로 고정하세요. |

## Low

현재 휴리스틱 기준으로 감지된 항목이 없습니다.

## 해석 규칙

- 이 스크립트는 정적 휴리스틱이라 false positive가 있을 수 있습니다.
- High 항목은 Android 렉/화면 튐과 직접 연결될 수 있어 먼저 확인합니다.
- Medium 항목은 데이터가 늘 때 문제가 될 가능성이 있는 구조입니다.
- Low 항목은 실기기 QA 때 관찰 대상으로 남깁니다.
- 자동 수정은 하지 않습니다. 기능/UI 변경 없이 사람이 확인한 뒤 별도 리팩토링합니다.
