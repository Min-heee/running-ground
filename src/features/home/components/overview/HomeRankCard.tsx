import { useMemo } from 'react';
import { Link, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
  const progressPercent = Math.max(0, Math.min(100, (normalizedRankState.lp / LP_PER_TIER) * 100));
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
    <Card style={styles.rankCard}>
      <View style={styles.rankHeader}>
        <Text style={styles.sectionEyebrow}>내 랭크</Text>
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
  tierBadge: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radii.cardLarge,
    borderWidth: 1,
    paddingHorizontal: spacing.s16,
    paddingVertical: spacing.s12,
  },
  rankLabel: {
    fontSize: fontSizes.pageTitle,
    fontWeight: fontWeights.extraBold,
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
    backgroundColor: colors.borderMuted,
    borderRadius: radii.pill,
    height: spacing.s10,
    overflow: 'hidden',
  },
  lpProgressFill: {
    borderRadius: radii.pill,
    height: '100%',
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
