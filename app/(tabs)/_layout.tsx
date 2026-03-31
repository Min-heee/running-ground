import { Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#6D5EF7',
        tabBarInactiveTintColor: '#98A2B3',
        tabBarStyle: {
          height: 72,
          paddingTop: 10,
          paddingBottom: 10,
          backgroundColor: '#FFFFFF',
          borderTopWidth: 0,
          elevation: 12,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '700',
        },
      }}
    >
      <Tabs.Screen name="friends" options={{ title: '친구' }} />
      <Tabs.Screen name="home" options={{ title: '홈' }} />
      <Tabs.Screen name="mypage" options={{ title: '마이' }} />
      <Tabs.Screen name="league" options={{ href: null }} />
      <Tabs.Screen name="market" options={{ href: null }} />
      <Tabs.Screen name="integrations" options={{ href: null }} />
    </Tabs>
  );
}
