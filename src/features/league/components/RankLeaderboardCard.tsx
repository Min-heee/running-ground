import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { RankingItemRow } from '@/components/ranking/RankingItemRow';
import { RankMarker } from '@/features/league/components/LeagueRankBadges';
import { useRankLeaderboard } from '@/features/league/hooks/useRankLeaderboard';
import type { RankLeaderboardTier, RankLeaderboardUser } from '@/features/league/types/league';
import {
  resolveDefaultSelectedTier,
  resolveOrderedRankTiers,
} from '@/features/league/utils/rankLeaderboardView';
import { RANK_TIERS, RANK_TIER_COLOR } from '@/features/rank/rankDisplay';
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
        <Text style={styles.emptyTierText}>
          {tierGroup.tier === RANK_TIERS[0]
            // 입문 0 LP는 뷰에서 걸러지므로(공개처형 방지) 빈 목록이 기본 상태다.
            ? '랭크 대결에서 첫 LP를 얻으면 이곳에 올라와요.'
            : '아직 이 랭크에 진입한 사람이 없어요.'}
        </Text>
      ) : (
        <View style={styles.tierRows}>{rows}</View>
      )}
    </View>
  );
});

const RankTierSelectorChip = memo(function RankTierSelectorChip({
  active,
  onSelect,
  tierGroup,
}: {
  active: boolean;
  onSelect: (tier: string) => void;
  tierGroup: RankLeaderboardTier;
}) {
  const accentColor = RANK_TIER_COLOR[tierGroup.tier] ?? colors.brand;
  const handlePress = useCallback(() => {
    onSelect(tierGroup.tier);
  }, [onSelect, tierGroup.tier]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[
        styles.tierSelectorChip,
        active ? { backgroundColor: accentColor, borderColor: accentColor } : null,
      ]}
      onPress={handlePress}
    >
      <Text style={[styles.tierSelectorText, active ? styles.tierSelectorTextActive : null]}>
        {tierGroup.tier}
      </Text>
      <Text style={[styles.tierSelectorCount, active ? styles.tierSelectorTextActive : null]}>
        {tierGroup.users.length}명
      </Text>
    </Pressable>
  );
});

export function RankLeaderboardCard() {
  const { data, error, loadRankLeaderboard, loading } = useRankLeaderboard();
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const handleRetry = useCallback(() => {
    loadRankLeaderboard();
  }, [loadRankLeaderboard]);
  const orderedTiers = useMemo(() => resolveOrderedRankTiers(data), [data]);
  const defaultSelectedTier = useMemo(() => resolveDefaultSelectedTier(data), [data]);
  const effectiveSelectedTier = useMemo(() => {
    if (selectedTier && orderedTiers.some((tierGroup) => tierGroup.tier === selectedTier)) {
      return selectedTier;
    }

    return defaultSelectedTier;
  }, [defaultSelectedTier, orderedTiers, selectedTier]);
  const selectedTierGroup = useMemo(() => (
    orderedTiers.find((tierGroup) => tierGroup.tier === effectiveSelectedTier) ?? null
  ), [effectiveSelectedTier, orderedTiers]);
  const handleSelectTier = useCallback((tier: string) => {
    setSelectedTier(tier);
  }, []);

  useEffect(() => {
    if (selectedTier !== effectiveSelectedTier) {
      setSelectedTier(effectiveSelectedTier);
    }
  }, [effectiveSelectedTier, selectedTier]);

  const tierSelectorChips = useMemo(() => {
    const items: ReactNode[] = [];

    for (const tierGroup of orderedTiers) {
      items.push(
        <RankTierSelectorChip
          key={tierGroup.tier}
          active={tierGroup.tier === effectiveSelectedTier}
          onSelect={handleSelectTier}
          tierGroup={tierGroup}
        />,
      );
    }

    return items;
  }, [effectiveSelectedTier, handleSelectTier, orderedTiers]);

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>랭크별 랭킹</Text>
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
        <View style={styles.tierList}>
          {orderedTiers.length > 0 ? (
            <>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.tierSelectorContent}
                style={styles.tierSelector}
              >
                {tierSelectorChips}
              </ScrollView>
              {selectedTierGroup ? (
                <RankTierSection
                  currentUserId={data.currentUserId}
                  tierGroup={selectedTierGroup}
                />
              ) : null}
            </>
          ) : (
            <View style={styles.stateBlock}>
              <Text style={styles.emptyTitle}>아직 랭크 랭킹이 없어요</Text>
              <Text style={styles.stateText}>첫 LP 기록이 생기면 이곳에 바로 반영돼요.</Text>
            </View>
          )}
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
    gap: spacing.sm,
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
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
    backgroundColor: colors.inkPill,
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
  tierSelector: {
    marginHorizontal: -spacing.sm,
  },
  tierSelectorContent: {
    gap: spacing.s10,
    paddingHorizontal: spacing.sm,
  },
  tierSelectorChip: {
    alignItems: 'center',
    backgroundColor: colors.surfaceSoft,
    borderColor: colors.borderSoft,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.s14,
    paddingVertical: spacing.s10,
  },
  tierSelectorText: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  tierSelectorCount: {
    color: colors.textTertiary,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
  },
  tierSelectorTextActive: {
    color: colors.white,
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
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
});
