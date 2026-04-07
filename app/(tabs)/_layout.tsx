import { Tabs } from 'expo-router';

const TAB_TITLES = {
  league: '\uB9AC\uADF8',
  friends: '\uCE5C\uAD6C',
  home: '\uD648',
  market: '\uB9C8\uCF13',
  mypage: '\uB9C8\uC774',
} as const;

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#6D5EF7',
        tabBarInactiveTintColor: '#98A2B3',
        tabBarStyle: {
          height: 78,
          paddingTop: 8,
          paddingBottom: 12,
          backgroundColor: '#FFFFFF',
          borderTopWidth: 1,
          borderTopColor: '#EAECF0',
          elevation: 12,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '700',
        },
        tabBarIconStyle: {
          display: 'none',
        },
      }}
    >
      <Tabs.Screen
        name="league"
        options={{
          title: TAB_TITLES.league,
        }}
      />
      <Tabs.Screen
        name="friends"
        options={{
          title: TAB_TITLES.friends,
        }}
      />
      <Tabs.Screen
        name="home"
        options={{
          title: TAB_TITLES.home,
        }}
      />
      <Tabs.Screen
        name="market"
        options={{
          title: TAB_TITLES.market,
        }}
      />
      <Tabs.Screen
        name="mypage"
        options={{
          title: TAB_TITLES.mypage,
        }}
      />
      <Tabs.Screen name="integrations" options={{ href: null }} />
    </Tabs>
  );
}
