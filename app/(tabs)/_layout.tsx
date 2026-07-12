import { useMemo } from 'react';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getTabScreenOptions } from '@/navigation/tabConfig';
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
    tabBarActiveTintColor: '#111827',
    tabBarInactiveTintColor: '#98A2B3',
    tabBarStyle: {
      height: tabBarHeight,
      paddingTop: 8,
      paddingBottom: tabBarBottomPadding,
      backgroundColor: '#FFFFFF',
      borderTopWidth: 1,
      borderTopColor: '#EAECF0',
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
  const tabListeners = useMemo(() => ({
    friends: buildTabInputListeners('friends'),
    home: buildTabInputListeners('home'),
    league: buildTabInputListeners('league'),
    market: buildTabInputListeners('market'),
    mypage: buildTabInputListeners('mypage'),
    running: buildTabInputListeners('running'),
  }), []);
  const tabOptions = useMemo(() => ({
    friends: getTabScreenOptions('friends'),
    home: getTabScreenOptions('home'),
    league: getTabScreenOptions('league'),
    market: getTabScreenOptions('market'),
    mypage: getTabScreenOptions('mypage'),
    running: getTabScreenOptions('running'),
  }), []);
  return (
    <Tabs
      screenOptions={screenOptions}
    >
      <Tabs.Screen name="league" options={tabOptions.league} listeners={tabListeners.league} />
      <Tabs.Screen name="friends" options={tabOptions.friends} listeners={tabListeners.friends} />
      <Tabs.Screen name="running" options={tabOptions.running} listeners={tabListeners.running} />
      <Tabs.Screen name="home" options={tabOptions.home} listeners={tabListeners.home} />
      <Tabs.Screen name="market" options={tabOptions.market} listeners={tabListeners.market} />
      <Tabs.Screen name="mypage" options={tabOptions.mypage} listeners={tabListeners.mypage} />
    </Tabs>
  );
}
