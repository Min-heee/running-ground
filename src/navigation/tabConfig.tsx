import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';

const TAB_TITLES = {
  league: '랭킹',
  friends: '\uCE5C\uAD6C',
  home: '\uD648',
  race: '\uB808\uC774\uC2A4',
  running: '\uB7EC\uB2DD',
  market: '\uB9C8\uCF13',
  mypage: '\uB9C8\uC774',
} as const;

const TAB_ICONS = {
  league: 'award',
  friends: 'users',
  home: 'home',
  market: 'shopping-bag',
  race: 'flag',
  mypage: 'user',
} as const;

type TabName = keyof typeof TAB_TITLES;

export function getTabScreenOptions(name: TabName) {
  return {
    title: TAB_TITLES[name],
    tabBarIcon: ({ color, size }: { color: string; size?: number }) => {
      if (name === 'running') {
        return <MaterialCommunityIcons name="run" size={(size ?? 18) + 1} color={color} />;
      }

      return <Feather name={TAB_ICONS[name]} size={size ?? 18} color={color} />;
    },
  };
}
