import { memo, useCallback, useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { liveMatchPagerStyles as styles } from '@/features/runs/components/liveMatchPager/styles';
import type { PagerTab } from '@/features/runs/components/liveMatchPager/types';
import { colors } from '@/theme/tokens';

const BASE_TABS: PagerTab[] = [
  { index: 0, label: '대결 보기' },
  { index: 1, label: '순위 보기' },
  { index: 2, label: '기록 보기' },
];
const RESULT_TAB: PagerTab = { index: 3, label: '결과 보기' };
const ANDROID_TAB_RIPPLE = { color: colors.pagerTabRipple, borderless: false } as const;

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
  const tabBaseStyle = useMemo(
    () => [styles.tab, selected ? styles.tabSelected : undefined],
    [selected],
  );
  // Synchronous press feedback: Pressable paints `pressed` on the UI side the
  // instant a finger lands, so the tap is acknowledged even before the highlight
  // (driven by local active-tab state in LiveMatchPager) repaints.
  const tabStyle = useCallback(
    ({ pressed }: { pressed: boolean }) => (
      pressed ? [...tabBaseStyle, styles.tabPressed] : tabBaseStyle
    ),
    [tabBaseStyle],
  );
  const tabTextStyle = useMemo(
    () => [styles.tabText, selected ? styles.tabTextSelected : undefined],
    [selected],
  );

  return (
    <Pressable
      style={tabStyle}
      onPress={handlePress}
      android_ripple={ANDROID_TAB_RIPPLE}
    >
      <Text style={tabTextStyle}>
        {tab.label}
      </Text>
    </Pressable>
  );
});

export const LiveMatchPagerTabs = memo(function LiveMatchPagerTabs({
  activeTab,
  hasResultPage,
  onTabPress,
}: {
  // Local active-tab index owned by LiveMatchPager; set synchronously on press
  // so the highlight is instant and not blocked by the deferred page commit.
  activeTab: number;
  hasResultPage: boolean;
  onTabPress: (index: number) => void;
}) {
  return (
    <View style={styles.tabRow}>
      <PagerTabButton
        tab={BASE_TABS[0]}
        selected={activeTab === BASE_TABS[0].index}
        onPress={onTabPress}
      />
      <PagerTabButton
        tab={BASE_TABS[1]}
        selected={activeTab === BASE_TABS[1].index}
        onPress={onTabPress}
      />
      <PagerTabButton
        tab={BASE_TABS[2]}
        selected={activeTab === BASE_TABS[2].index}
        onPress={onTabPress}
      />
      {hasResultPage ? (
        <PagerTabButton
          tab={RESULT_TAB}
          selected={activeTab === RESULT_TAB.index}
          onPress={onTabPress}
        />
      ) : null}
    </View>
  );
});
