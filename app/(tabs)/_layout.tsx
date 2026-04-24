import { Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const TAB_TITLES = {
  league: '\uB9AC\uADF8',
  friends: '\uCE5C\uAD6C',
  home: '\uD648',
  running: '\uB7F0\uB2DD',
  race: '\uB808\uC774\uC2A4',
  market: '\uB9C8\uCF13',
  mypage: '\uB9C8\uC774',
} as const;

const TAB_ICONS = {
  league: 'award',
  friends: 'users',
  home: 'home',
  race: 'flag',
  market: 'shopping-bag',
  mypage: 'user',
} as const;

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#111827',
        tabBarInactiveTintColor: '#98A2B3',
        tabBarStyle: {
          height: 78,
          paddingTop: 8,
          paddingBottom: 12,
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
      <Tabs.Screen
        name="league"
        options={{
          title: TAB_TITLES.league,
          tabBarIcon: ({ color, size }) => <Feather name={TAB_ICONS.league} size={size ?? 18} color={color} />,
        }}
      />
      <Tabs.Screen
        name="friends"
        options={{
          title: TAB_TITLES.friends,
          tabBarIcon: ({ color, size }) => <Feather name={TAB_ICONS.friends} size={size ?? 18} color={color} />,
        }}
      />
      <Tabs.Screen
        name="running"
        options={{
          title: TAB_TITLES.running,
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="run" size={(size ?? 18) + 1} color={color} />,
        }}
      />
      <Tabs.Screen
        name="home"
        options={{
          title: TAB_TITLES.home,
          tabBarIcon: ({ color, size }) => <Feather name={TAB_ICONS.home} size={size ?? 18} color={color} />,
        }}
      />
      <Tabs.Screen
        name="race"
        options={{
          title: TAB_TITLES.race,
          tabBarIcon: ({ color, size }) => <Feather name={TAB_ICONS.race} size={size ?? 18} color={color} />,
        }}
      />
      <Tabs.Screen
        name="market"
        options={{
          title: TAB_TITLES.market,
          tabBarIcon: ({ color, size }) => <Feather name={TAB_ICONS.market} size={size ?? 18} color={color} />,
        }}
      />
      <Tabs.Screen
        name="mypage"
        options={{
          title: TAB_TITLES.mypage,
          tabBarIcon: ({ color, size }) => <Feather name={TAB_ICONS.mypage} size={size ?? 18} color={color} />,
        }}
      />
      <Tabs.Screen name="integrations" options={{ href: null }} />
    </Tabs>
  );
}
