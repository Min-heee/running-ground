import { memo, useCallback } from 'react';
import { Pressable, Text, View } from 'react-native';
import { liveMatchPagerStyles as styles } from '@/features/runs/components/liveMatchPager/styles';
import type { PagerTab } from '@/features/runs/components/liveMatchPager/types';

const BASE_TABS: PagerTab[] = [
  { index: 0, label: '대결 보기' },
  { index: 1, label: '순위 보기' },
  { index: 2, label: '기록 보기' },
];
const RESULT_TAB: PagerTab = { index: 3, label: '결과 보기' };

const PagerTabButton = memo(function PagerTabButton({
  tab,
  selected,
  onPress,
}: {
  tab: PagerTab;
  selected: boolean;
  onPress: (index: number) => void;
}) {
  const handlePress = useCallback(() => {
    onPress(tab.index);
  }, [onPress, tab.index]);

  return (
    <Pressable
      style={[styles.tab, selected ? styles.tabSelected : undefined]}
      onPress={handlePress}
    >
      <Text style={[styles.tabText, selected ? styles.tabTextSelected : undefined]}>
        {tab.label}
      </Text>
    </Pressable>
  );
});

export const LiveMatchPagerTabs = memo(function LiveMatchPagerTabs({
  page,
  hasResultPage,
  onTabPress,
}: {
  page: number;
  hasResultPage: boolean;
  onTabPress: (index: number) => void;
}) {
  return (
    <View style={styles.tabRow}>
      <PagerTabButton
        tab={BASE_TABS[0]}
        selected={page === BASE_TABS[0].index}
        onPress={onTabPress}
      />
      <PagerTabButton
        tab={BASE_TABS[1]}
        selected={page === BASE_TABS[1].index}
        onPress={onTabPress}
      />
      <PagerTabButton
        tab={BASE_TABS[2]}
        selected={page === BASE_TABS[2].index}
        onPress={onTabPress}
      />
      {hasResultPage ? (
        <PagerTabButton
          tab={RESULT_TAB}
          selected={page === RESULT_TAB.index}
          onPress={onTabPress}
        />
      ) : null}
    </View>
  );
});
