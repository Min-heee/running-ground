import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';

const TAB_TITLES = {
  league: '랭킹',
  // 크루대전 탭 (오너 2026-09-18): 탭바 글자는 두 자 '크루' — '크루대전'(4자)은 360dp 안드로이드에서
  // 글꼴을 키우면 '크루대…'로 잘린다. 화면 제목(TabHeader)은 '크루대전'.
  crew: '크루',
  records: '기록',
  universe: '스페이스',
  friends: '\uCE5C\uAD6C',
  home: '\uD648',
  race: '\uB808\uC774\uC2A4',
  running: '\uB7EC\uB2DD',
  market: '\uB9C8\uCF13',
  mypage: '\uB9C8\uC774',
} as const;

const TAB_ICONS = {
  league: 'award',
  crew: 'shield',
  records: 'list',
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

      if (name === 'universe') {
        // 회절 십자 별 — 우주 탭의 미학(관측 사진의 4방 스파이크)과 같은 모양.
        return <MaterialCommunityIcons name="star-four-points" size={size ?? 18} color={color} />;
      }

      return <Feather name={TAB_ICONS[name]} size={size ?? 18} color={color} />;
    },
  };
}
