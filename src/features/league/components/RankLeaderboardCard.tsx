import { memo, useCallback, useMemo, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { RankingItemRow } from '@/components/ranking/RankingItemRow';
import { RankMarker } from '@/features/league/components/LeagueRankBadges';
import { useRankLeaderboard } from '@/features/league/hooks/useRankLeaderboard';
import type { RankLeaderboardTier, RankLeaderboardUser } from '@/features/league/types/league';
import { RANK_TIER_COLOR } from '@/features/rank/rankDisplay';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

const RankLeaderboardRow = memo(function RankLeaderboardRow({
  currentUserId,
  user,
}: {
  currentUserId: string;
  user: RankLeaderboardUser;
}) {
  const isCurrentUser = user.id === currentUserId;

  return (
    <RankingItemRow
      leading={<RankMarker rank={user.rankInTier} />}
      name={user.name}
      detail={`${user.lp} LP`}
      highlighted={isCurrentUser}
      friendLabel={isCurrentUser ? '나' : undefined}
    />
  );
});

const RankTierSection = memo(function RankTierSection({
  currentUserId,
  tierGroup,
}: {
  currentUserId: string;
  tierGroup: RankLeaderboardTier;
}) {
  const accentColor = RANK_TIER_COLOR[tierGroup.tier] ?? colors.brand;
  const rows = useMemo(() => {
    const items: ReactNode[] = [];

    for (const user of tierGroup.users) {
      items.push(
        <RankLeaderboardRow
          key={user.id}
          currentUserId={currentUserId}
          user={user}
        />,
      );
    }

    return items;
  }, [currentUserId, tierGroup.users]);

  return (
    <View style={styles.tierSection}>
      <View style={[styles.tierHeader, { backgroundColor: accentColor }]}>
        <Text style={styles.tierName}>{tierGroup.tier}</Text>
        <Text style={styles.tierCount}>{tierGroup.users.length}명</Text>
      </View>
      {tierGroup.users.length === 0 ? (
        <Text style={styles.emptyTierText}>아직 이 랭크에 진입한 사람이 없어요.</Text>
      ) : (
        <View style={styles.tierRows}>{rows}</View>
      )}
    </View>
  );
});

export function RankLeaderboardCard() {
  const { data, error, loadRankLeaderboard, loading } = useRankLeaderboard();
  const handleRetry = useCallback(() => {
    loadRankLeaderboard();
  }, [loadRankLeaderboard]);
  const tierSections = useMemo(() => {
    const items: ReactNode[] = [];

    for (const tierGroup of data?.tiers ?? []) {
      items.push(
        <RankTierSection
          key={tierGroup.tier}
          currentUserId={data?.currentUserId ?? ''}
          tierGroup={tierGroup}
        />,
      );
    }

    return items;
  }, [data?.currentUserId, data?.tiers]);

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>랭크</Text>
        <Text style={styles.title}>랭크별 랭킹</Text>
        <Text style={styles.description}>같은 랭크 안에서 LP가 높은 러너부터 보여줘요.</Text>
      </View>

      {loading && !data ? (
        <View style={styles.stateBlock}>
          <ActivityIndicator size="small" color={colors.brand} />
          <Text style={styles.stateText}>랭크 랭킹을 불러오는 중이에요.</Text>
        </View>
      ) : null}

      {!loading && error ? (
        <View style={styles.stateBlock}>
          <Text style={styles.errorTitle}>랭크 랭킹을 아직 못 불러왔어</Text>
          <Text style={styles.stateText}>{error}</Text>
          <Pressable style={styles.retryButton} onPress={handleRetry}>
            <Text style={styles.retryButtonText}>다시 불러오기</Text>
          </Pressable>
        </View>
      ) : null}

      {!loading && !error && data ? (
        <View style={styles.tierList}>{tierSections}</View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.s16,
  },
  header: {
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
  tierList: {
    gap: spacing.s16,
  },
  tierSection: {
    gap: spacing.xxl,
  },
  tierHeader: {
    alignItems: 'center',
    borderRadius: radii.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s14,
    paddingVertical: spacing.s10,
  },
  tierName: {
    color: colors.white,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.black,
  },
  tierCount: {
    color: colors.white,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  tierRows: {
    gap: spacing.sm,
  },
  emptyTierText: {
    color: colors.textSecondary,
    lineHeight: 20,
    paddingHorizontal: spacing.s10,
  },
});
