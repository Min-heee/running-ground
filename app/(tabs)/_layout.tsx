import { useMemo } from 'react';
import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { TourOverlay } from '@/features/tour/TourOverlay';
import { useDrainPendingRunSaves } from '@/features/runs/save/useDrainPendingRunSaves';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getTabScreenOptions } from '@/navigation/tabConfig';
import { colors } from '@/theme/tokens';
import { beginRgInputTrace } from '@/utils/rgInputTrace';

function buildTabInputListeners(tab: string) {
  return {
    tabPress: () => {
      const trace = beginRgInputTrace('tab press', { tab });
      trace.markFeedback('navigation begin');
    },
  };
}

export default function TabsLayout() {
  // 저장 대기열 드레인 — 앱 진입/포그라운드 복귀 때 못 보낸 러닝 기록을 자동 재전송.
  useDrainPendingRunSaves();
  const insets = useSafeAreaInsets();
  const tabBarBottomPadding = Math.max(insets.bottom, 12);
  const tabBarHeight = 58 + tabBarBottomPadding + 8;
  const screenOptions = useMemo(() => ({
    headerShown: false,
    // `lazy` defers mounting a tab's screen until first focus, so initial app
    // entry only pays for the home tab; `freezeOnBlur` parks inactive tabs
    // (react-native-screens) so their JS work doesn't compete with the active
    // tab. Both target the "탭 전환 처음에 로딩이 꽤 걸림" symptom on Wide 6.
    lazy: true,
    freezeOnBlur: true,
    // Themed: this object is built at render time (post theme gate), so the tab bar
    // follows the applied palette without a StyleSheet bake.
    tabBarActiveTintColor: colors.textPrimary,
    tabBarInactiveTintColor: colors.textTertiary,
    tabBarStyle: {
      height: tabBarHeight,
      paddingTop: 8,
      paddingBottom: tabBarBottomPadding,
      // 네이티브 탭바는 흰 바탕과 합성되므로 반투명 유리(surface) 금지 — 불투명 크롬.
      backgroundColor: colors.surfaceChrome,
      borderTopWidth: 1,
      borderTopColor: colors.borderSoft,
      // Lower than 10 — Android elevation contributes to per-frame overdraw,
      // and the tab bar visual was nearly identical at 6 in our PR comparison.
      elevation: 6,
    },
    tabBarLabelStyle: {
      fontSize: 10,
      fontWeight: '700' as const,
      marginTop: 2,
    },
    tabBarItemStyle: {
      paddingHorizontal: 0,
    },
    tabBarIconStyle: {
      marginTop: 2,
    },
  }), [tabBarBottomPadding, tabBarHeight]);
  // 스페이스는 탭바를 숨긴다 (오너 2026-08-22). 우주를 보는 화면 아래에 밝은 흰 띠가
  // 깔려 있으면 몰입이 끊기고, 세로 공간도 그만큼 하늘에서 뺏긴다. 나가는 길은 화면
  // 안의 '나가기' 버튼이 대신한다 — 그게 없으면 탭바를 숨기는 순간 갇힌다.
  const universeOptions = useMemo(() => ({
    ...getTabScreenOptions('universe'),
    tabBarStyle: { display: 'none' as const },
  }), []);
  const tabListeners = useMemo(() => ({
    friends: buildTabInputListeners('friends'),
    home: buildTabInputListeners('home'),
    universe: buildTabInputListeners('universe'),
    league: buildTabInputListeners('league'),
    market: buildTabInputListeners('market'),
    race: buildTabInputListeners('race'),
    mypage: buildTabInputListeners('mypage'),
    running: buildTabInputListeners('running'),
  }), []);
  const tabOptions = useMemo(() => ({
    friends: getTabScreenOptions('friends'),
    home: getTabScreenOptions('home'),
    universe: getTabScreenOptions('universe'),
    league: getTabScreenOptions('league'),
    // 마켓·레이스 탭 숨김 (오너 2026-08-25): 탭바에서만 뺀다 — href: null은 버튼을
    // 제거할 뿐 라우트는 남아서, 딥링크·프로그램 내비게이션·복귀는 그대로 동작한다.
    // 되살릴 땐 href만 지우면 된다.
    market: { ...getTabScreenOptions('market'), href: null as null },
    race: { ...getTabScreenOptions('race'), href: null as null },
    mypage: getTabScreenOptions('mypage'),
    running: getTabScreenOptions('running'),
  }), []);
  return (
    <View style={{ flex: 1 }}>
    <Tabs
      screenOptions={screenOptions}
    >
      {/* 탭바 순서 = 자식 선언 순서 (오너 2026-09-01): 스페이스·랭킹·러닝·홈·친구·마이.
          초기 진입 탭은 app/index.tsx의 /(tabs)/home 리다이렉트가 정하므로 영향 없음. */}
      <Tabs.Screen name="universe" options={universeOptions} listeners={tabListeners.universe} />
      <Tabs.Screen name="league" options={tabOptions.league} listeners={tabListeners.league} />
      <Tabs.Screen name="running" options={tabOptions.running} listeners={tabListeners.running} />
      <Tabs.Screen name="home" options={tabOptions.home} listeners={tabListeners.home} />
      <Tabs.Screen name="friends" options={tabOptions.friends} listeners={tabListeners.friends} />
      <Tabs.Screen name="mypage" options={tabOptions.mypage} listeners={tabListeners.mypage} />
      <Tabs.Screen name="race" options={tabOptions.race} listeners={tabListeners.race} />
      <Tabs.Screen name="market" options={tabOptions.market} listeners={tabListeners.market} />
    </Tabs>
    <TourOverlay />
    </View>
  );
}
