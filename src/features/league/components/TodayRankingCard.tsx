import { memo, useCallback, useMemo, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { RankingItemRow } from '@/components/ranking/RankingItemRow';
import { RankMarker } from '@/features/league/components/LeagueRankBadges';
import { useTodayRankings } from '@/features/league/hooks/useTodayRankings';
import {
  hasTodayRankingEntries,
  todayRankingCategoryDescriptions,
  todayRankingCategoryLabels,
} from '@/features/league/utils/todayRanking';
import type { TodayRankingCategory, TodayRankingEntry } from '@/domain';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

type TodayRankingTabProps = {
  active: boolean;
  category: TodayRankingCategory;
  onSelect: (category: TodayRankingCategory) => void;
};

const TodayRankingTab = memo(function TodayRankingTab({
  active,
  category,
  onSelect,
}: TodayRankingTabProps) {
  const handlePress = useCallback(() => {
    onSelect(category);
  }, [category, onSelect]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.tabButton, active ? styles.tabButtonActive : null]}
      onPress={handlePress}
    >
      <Text style={[styles.tabButtonText, active ? styles.tabButtonTextActive : null]}>
        {todayRankingCategoryLabels[category]}
      </Text>
    </Pressable>
  );
});

const TodayRankingRow = memo(function TodayRankingRow({ entry }: { entry: TodayRankingEntry }) {
  return (
    <RankingItemRow
      leading={<RankMarker rank={entry.rank} />}
      name={entry.name}
      detail={`${entry.tag} · ${entry.value}`}
      highlighted={entry.isCurrentUser}
      friendLabel={entry.isCurrentUser ? '나' : undefined}
    />
  );
});

export function TodayRankingCard() {
  const {
    categories,
    category,
    error,
    loadTodayRanking,
    loading,
    ranking,
    setCategory,
  } = useTodayRankings();
  const hasEntries = hasTodayRankingEntries(ranking);
  const handleRetry = useCallback(() => {
    loadTodayRanking(category);
  }, [category, loadTodayRanking]);
  const tabItems = useMemo(() => {
    const items: ReactNode[] = [];

    for (const entry of categories) {
      items.push(
        <TodayRankingTab
          key={entry}
          active={entry === category}
          category={entry}
          onSelect={setCategory}
        />,
      );
    }

    return items;
  }, [categories, category, setCategory]);
  const rankingRows = useMemo(() => {
    const rows: ReactNode[] = [];

    for (const entry of ranking?.entries ?? []) {
      rows.push(<TodayRankingRow key={entry.userId} entry={entry} />);
    }

    return rows;
  }, [ranking?.entries]);

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.titleBlock}>
          <Text style={styles.eyebrow}>오늘</Text>
          <Text style={styles.title}>오늘의 랭킹</Text>
          <Text style={styles.description}>{todayRankingCategoryDescriptions[category]}</Text>
        </View>
      </View>

      <View style={styles.tabs}>
        {tabItems}
      </View>

      {loading && !ranking ? (
        <View style={styles.stateBlock}>
          <ActivityIndicator size="small" color={colors.brand} />
          <Text style={styles.stateText}>오늘의 랭킹을 불러오는 중이에요.</Text>
        </View>
      ) : null}

      {!loading && error ? (
        <View style={styles.stateBlock}>
          <Text style={styles.errorTitle}>오늘의 랭킹을 아직 못 불러왔어</Text>
          <Text style={styles.stateText}>{error}</Text>
          <Pressable style={styles.retryButton} onPress={handleRetry}>
            <Text style={styles.retryButtonText}>다시 불러오기</Text>
          </Pressable>
        </View>
      ) : null}

      {!loading && !error && !hasEntries ? (
        <View style={styles.stateBlock}>
          <Text style={styles.emptyTitle}>오늘은 아직 기록한 사람이 없어요</Text>
          <Text style={styles.stateText}>첫 기록을 남기면 이곳에 바로 반영돼요.</Text>
        </View>
      ) : null}

      {ranking && ranking.entries.length > 0 ? (
        <View style={styles.list}>
          {rankingRows}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.s16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.s12,
  },
  titleBlock: {
    flex: 1,
    gap: spacing.sm,
  },
  eyebrow: {
    color: colors.brand,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.extraBold,
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
  },
  description: {
    color: colors.textSecondary,
    lineHeight: 20,
  },
  tabs: {
    backgroundColor: colors.surfaceSoft,
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  tabButton: {
    alignItems: 'center',
    borderRadius: radii.pill,
    flex: 1,
    paddingVertical: spacing.s10,
  },
  tabButtonActive: {
    backgroundColor: colors.dark,
  },
  tabButtonText: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  tabButtonTextActive: {
    color: colors.white,
  },
  stateBlock: {
    alignItems: 'center',
    backgroundColor: colors.surfaceSoft,
    borderRadius: radii.md,
    gap: spacing.s10,
    paddingHorizontal: spacing.s16,
    paddingVertical: spacing.s20,
  },
  stateText: {
    color: colors.textSecondary,
    lineHeight: 20,
    textAlign: 'center',
  },
  errorTitle: {
    color: colors.danger,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
  retryButton: {
    backgroundColor: colors.dark,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.s16,
    paddingVertical: spacing.s10,
  },
  retryButtonText: {
    color: colors.white,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  list: {
    gap: spacing.sm,
  },
});
