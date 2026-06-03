import { useMemo } from 'react';
import { Link, type Href } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { DimensionValue, StyleProp, TextStyle, ViewStyle } from 'react-native';
import { Card } from '@/components/Card';
import type { RankState } from '@/domain';
import {
  formatRankLabel,
  LP_PER_TIER,
  normalizeRankStateForDisplay,
  RANK_TIERS,
  RANK_TIER_COLOR,
  RANK_TIER_SOFT_COLOR,
  RANK_TIER_SYMBOL,
} from '@/features/rank/rankDisplay';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

type HomeRankCardProps = {
  rankState?: RankState;
  matchRecord: {
    totalCount: number;
    duelCount: number;
    groupCount: number;
  };
  recordHref: Href;
};

export function HomeRankCard({ rankState, matchRecord, recordHref }: HomeRankCardProps) {
  const normalizedRankState = useMemo(() => normalizeRankStateForDisplay(rankState), [rankState]);
  const rankLabel = useMemo(() => formatRankLabel(normalizedRankState), [normalizedRankState]);
  const accentColor = RANK_TIER_COLOR[normalizedRankState.tier] ?? colors.brand;
  const softColor = RANK_TIER_SOFT_COLOR[normalizedRankState.tier] ?? colors.surfaceSubtle;
  const tierSymbol = RANK_TIER_SYMBOL[normalizedRankState.tier];
  const progressPercent = Math.max(0, Math.min(100, (normalizedRankState.lp / LP_PER_TIER) * 100));
  const tierIndex = RANK_TIERS.indexOf(normalizedRankState.tier as (typeof RANK_TIERS)[number]);
  const isMaxTier = tierIndex === RANK_TIERS.length - 1;
  const lpToNext = Math.max(0, LP_PER_TIER - normalizedRankState.lp);
  const nextTierLabel = isMaxTier ? '최고 티어' : `다음 티어까지 ${lpToNext} LP`;
  const rankCardStyle = useMemo<StyleProp<ViewStyle>>(() => [
    styles.rankCard,
    {
      backgroundColor: softColor,
      borderColor: accentColor,
    },
  ], [accentColor, softColor]);
  const tierBadgeStyle = useMemo<StyleProp<ViewStyle>>(() => [
    styles.tierBadge,
    { borderColor: accentColor },
  ], [accentColor]);
  const rankLabelStyle = useMemo<StyleProp<TextStyle>>(() => [
    styles.rankLabel,
    { color: accentColor },
  ], [accentColor]);
  const progressFillStyle = useMemo<StyleProp<ViewStyle>>(() => [
    styles.lpProgressFill,
    {
      backgroundColor: accentColor,
      width: `${progressPercent}%` as DimensionValue,
    },
  ], [accentColor, progressPercent]);

  return (
    <Card style={rankCardStyle}>
      <View style={styles.rankHeader}>
        <Text style={styles.sectionEyebrow}>내 랭크</Text>
      </View>

      <View style={styles.rankBody}>
        <View style={styles.tierGroup}>
          {tierSymbol ? (
            <Image source={tierSymbol} style={styles.tierSymbol} resizeMode="contain" />
          ) : null}
          <View style={tierBadgeStyle}>
            <Text style={rankLabelStyle}>{rankLabel}</Text>
          </View>
        </View>
        <Text style={styles.lpText}>
          {normalizedRankState.lp}
          <Text style={styles.lpUnit}> LP</Text>
        </Text>
      </View>

      <View style={styles.lpProgressTrack}>
        <View style={progressFillStyle} />
      </View>
      <Text style={styles.nextTierLabel}>{nextTierLabel}</Text>

      <Link href={recordHref} asChild>
        <Pressable accessibilityRole="button" style={styles.recordFooter}>
          <View style={styles.recordCopy}>
            <Text style={styles.recordTitle}>전적</Text>
            <Text style={styles.recordDetail}>
              {matchRecord.totalCount}번 대결 · 1대1 {matchRecord.duelCount} · 그룹 {matchRecord.groupCount}
            </Text>
          </View>
          <Text style={styles.recordChevron}>›</Text>
        </Pressable>
      </Link>
    </Card>
  );
}

const styles = StyleSheet.create({
  rankCard: {
    borderWidth: 1,
    gap: spacing.s12,
  },
  rankHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.s12,
    justifyContent: 'space-between',
  },
  sectionEyebrow: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  rankBody: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: spacing.s12,
    justifyContent: 'space-between',
  },
  tierGroup: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    gap: spacing.s10,
  },
  tierSymbol: {
    height: 96,
    width: 72,
  },
  tierBadge: {
    backgroundColor: colors.white,
    borderRadius: radii.cardLarge,
    borderWidth: 2,
    paddingHorizontal: spacing.s16,
    paddingVertical: spacing.s12,
  },
  rankLabel: {
    fontSize: fontSizes.pageTitle,
    fontWeight: fontWeights.extraBold,
  },
  lpText: {
    color: colors.textPrimary,
    fontSize: fontSizes.heroLarge,
    fontWeight: fontWeights.black,
    paddingBottom: spacing.sm,
  },
  lpUnit: {
    color: colors.textSecondary,
    fontSize: fontSizes.rank,
    fontWeight: fontWeights.bold,
  },
  lpProgressTrack: {
    backgroundColor: colors.borderMuted,
    borderRadius: radii.pill,
    height: spacing.s10,
    overflow: 'hidden',
  },
  lpProgressFill: {
    borderRadius: radii.pill,
    height: '100%',
  },
  nextTierLabel: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  recordFooter: {
    alignItems: 'center',
    borderTopColor: colors.borderSoft,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.s12,
    justifyContent: 'space-between',
    paddingTop: spacing.s12,
  },
  recordCopy: {
    flex: 1,
    gap: spacing.xxs,
  },
  recordTitle: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  recordDetail: {
    color: colors.textPrimary,
    fontWeight: fontWeights.extraBold,
    lineHeight: 20,
  },
  recordChevron: {
    color: colors.textTertiary,
    fontSize: fontSizes.metric,
    fontWeight: fontWeights.extraBold,
  },
});
