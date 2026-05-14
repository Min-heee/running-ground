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

  return (
    <Tabs
      screenOptions={{
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
          fontWeight: '700',
          marginTop: 2,
        },
        tabBarItemStyle: {
          paddingHorizontal: 0,
        },
        tabBarIconStyle: {
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen name="league" options={getTabScreenOptions('league')} listeners={buildTabInputListeners('league')} />
      <Tabs.Screen name="friends" options={getTabScreenOptions('friends')} listeners={buildTabInputListeners('friends')} />
      <Tabs.Screen name="running" options={getTabScreenOptions('running')} listeners={buildTabInputListeners('running')} />
      <Tabs.Screen name="home" options={getTabScreenOptions('home')} listeners={buildTabInputListeners('home')} />
      <Tabs.Screen name="race" options={getTabScreenOptions('race')} listeners={buildTabInputListeners('race')} />
      <Tabs.Screen name="market" options={getTabScreenOptions('market')} listeners={buildTabInputListeners('market')} />
      <Tabs.Screen name="mypage" options={getTabScreenOptions('mypage')} listeners={buildTabInputListeners('mypage')} />
      <Tabs.Screen name="integrations" options={{ href: null }} />
    </Tabs>
  );
}
