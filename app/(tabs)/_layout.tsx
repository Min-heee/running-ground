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
    tabBarActiveTintColor: '#111827',
    tabBarInactiveTintColor: '#98A2B3',
    tabBarStyle: {
      height: tabBarHeight,
      paddingTop: 8,
      paddingBottom: tabBarBottomPadding,
      backgroundColor: '#FFFFFF',
      borderTopWidth: 1,
      borderTopColor: '#EAECF0',
      elevation: 10,
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
    race: buildTabInputListeners('race'),
    running: buildTabInputListeners('running'),
  }), []);
  const tabOptions = useMemo(() => ({
    friends: getTabScreenOptions('friends'),
    home: getTabScreenOptions('home'),
    league: getTabScreenOptions('league'),
    market: getTabScreenOptions('market'),
    mypage: getTabScreenOptions('mypage'),
    race: getTabScreenOptions('race'),
    running: getTabScreenOptions('running'),
  }), []);
  const hiddenTabOptions = useMemo(() => ({ href: null }), []);

  return (
    <Tabs
      screenOptions={screenOptions}
    >
      <Tabs.Screen name="league" options={tabOptions.league} listeners={tabListeners.league} />
      <Tabs.Screen name="friends" options={tabOptions.friends} listeners={tabListeners.friends} />
      <Tabs.Screen name="running" options={tabOptions.running} listeners={tabListeners.running} />
      <Tabs.Screen name="home" options={tabOptions.home} listeners={tabListeners.home} />
      <Tabs.Screen name="race" options={tabOptions.race} listeners={tabListeners.race} />
      <Tabs.Screen name="market" options={tabOptions.market} listeners={tabListeners.market} />
      <Tabs.Screen name="mypage" options={tabOptions.mypage} listeners={tabListeners.mypage} />
      <Tabs.Screen name="integrations" options={hiddenTabOptions} />
    </Tabs>
  );
}
