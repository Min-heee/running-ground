import { memo, useCallback, useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import { liveMatchPagerStyles as styles } from '@/features/runs/components/liveMatchPager/styles';
import type { PagerTab } from '@/features/runs/components/liveMatchPager/types';
import { colors } from '@/theme/tokens';

// Tab 0's label is mode-aware: a 1:1 duel reads "듀얼로드", a group match reads
// "그룹로드" (matching the arena's DUEL ROAD / GROUP ROAD content).
function buildArenaTabLabel(matchMode: RunMatchMode): string {
  return matchMode === 'group' ? '그룹로드' : '듀얼로드';
}

const RACE_BOARD_TAB: PagerTab = { index: 1, label: '레이스보드' };
const STATS_TAB: PagerTab = { index: 2, label: '기록' };
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
  matchMode,
  onTabPress,
}: {
  // Local active-tab index owned by LiveMatchPager; set synchronously on press
  // so the highlight is instant and not blocked by the deferred page commit.
  activeTab: number;
  hasResultPage: boolean;
  matchMode: RunMatchMode;
  onTabPress: (index: number) => void;
}) {
  const arenaTab = useMemo<PagerTab>(
    () => ({ index: 0, label: buildArenaTabLabel(matchMode) }),
    [matchMode],
  );

  return (
    <View style={styles.tabRow}>
      <PagerTabButton
        tab={arenaTab}
        selected={activeTab === arenaTab.index}
        onPress={onTabPress}
      />
      <PagerTabButton
        tab={RACE_BOARD_TAB}
        selected={activeTab === RACE_BOARD_TAB.index}
        onPress={onTabPress}
      />
      <PagerTabButton
        tab={STATS_TAB}
        selected={activeTab === STATS_TAB.index}
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
