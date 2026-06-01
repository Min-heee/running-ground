import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { DimensionValue, StyleProp, TextStyle, ViewStyle } from 'react-native';
import { Card } from '@/components/Card';
import type { RankState } from '@/domain';
import {
  formatRankLabel,
  LP_PER_TIER,
  normalizeRankStateForDisplay,
  RANK_TIER_COLOR,
} from '@/features/rank/rankDisplay';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

type HomeRankCardProps = {
  rankState?: RankState;
  compact?: boolean;
};

export function HomeRankCard({ rankState, compact = false }: HomeRankCardProps) {
  const normalizedRankState = useMemo(() => normalizeRankStateForDisplay(rankState), [rankState]);
  const rankLabel = useMemo(() => formatRankLabel(normalizedRankState), [normalizedRankState]);
  const accentColor = RANK_TIER_COLOR[normalizedRankState.tier] ?? colors.brand;
  const progressPercent = Math.max(0, Math.min(100, (normalizedRankState.lp / LP_PER_TIER) * 100));
  const tierBadgeStyle = useMemo<StyleProp<ViewStyle>>(() => [
    styles.tierBadge,
    compact ? styles.tierBadgeCompact : null,
    { borderColor: accentColor },
  ], [accentColor, compact]);
  const rankLabelStyle = useMemo<StyleProp<TextStyle>>(() => [
    styles.rankLabel,
    compact ? styles.rankLabelCompact : null,
    { color: accentColor },
  ], [accentColor, compact]);
  const progressFillStyle = useMemo<StyleProp<ViewStyle>>(() => [
    styles.lpProgressFill,
    {
      backgroundColor: accentColor,
      width: `${progressPercent}%` as DimensionValue,
    },
  ], [accentColor, progressPercent]);

  return (
    <Card style={styles.rankCard}>
      <View style={styles.rankHeader}>
        <Text style={styles.sectionEyebrow}>내 랭크</Text>
        {compact ? null : <Text style={styles.rankHelper}>대결 결과가 LP에 반영돼요</Text>}
      </View>

      <View style={styles.rankBody}>
        <View style={tierBadgeStyle}>
          <Text style={rankLabelStyle}>{rankLabel}</Text>
        </View>
        <Text style={styles.lpText}>
          {normalizedRankState.lp}
          <Text style={styles.lpUnit}> LP</Text>
        </Text>
      </View>

      <View style={styles.lpProgressTrack}>
        <View style={progressFillStyle} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  rankCard: {
    gap: spacing.s12,
    justifyContent: 'space-between',
  },
  rankHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.s12,
  },
  sectionEyebrow: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  rankHelper: {
    color: colors.textTertiary,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
  },
  rankBody: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.s12,
  },
  tierBadge: {
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderRadius: radii.cardLarge,
    paddingHorizontal: spacing.s16,
    paddingVertical: spacing.s12,
  },
  tierBadgeCompact: {
    paddingHorizontal: spacing.s12,
  },
  rankLabel: {
    fontSize: fontSizes.pageTitle,
    fontWeight: fontWeights.extraBold,
  },
  rankLabelCompact: {
    fontSize: fontSizes.comingSoon,
  },
  lpText: {
    color: colors.textPrimary,
    fontSize: fontSizes.display,
    fontWeight: fontWeights.extraBold,
    paddingBottom: spacing.sm,
  },
  lpUnit: {
    color: colors.textSecondary,
    fontSize: fontSizes.rank,
    fontWeight: fontWeights.bold,
  },
  lpProgressTrack: {
    height: spacing.s10,
    backgroundColor: colors.borderMuted,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  lpProgressFill: {
    height: '100%',
    borderRadius: radii.pill,
  },
});
