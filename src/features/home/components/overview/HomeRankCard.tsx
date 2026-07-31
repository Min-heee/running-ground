import { useCallback, useMemo, useState } from 'react';
import { Link, type Href } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
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
} from '@/features/rank/rankDisplay';
import { RANK_TIER_SYMBOL } from '@/features/rank/rankSymbols';
import { colors, fixedColors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

type HomeRankCardProps = {
  rankState?: RankState;
  recordHref: Href;
};

// 랭크 안내 (오너 2026-07-31) — 지역 '순위 기준'과 같은 결의 펼침 설명.
// 각 티어의 문양을 함께 보여줘서 대결 화면에서 본 문양이 무엇인지 바로 알 수 있게 한다.
function RankGuidePanel({ currentTier }: { currentTier: string }) {
  return (
    <View style={styles.guidePanel}>
      <Text style={styles.guideHeadline}>대결에서 이기면 LP가 올라 랭크가 올라갑니다</Text>

      {RANK_TIERS.map((tier) => {
        const isCurrent = tier === currentTier;
        const symbol = RANK_TIER_SYMBOL[tier];

        return (
          <View key={tier} style={[styles.guideRow, isCurrent ? styles.guideRowCurrent : null]}>
            {symbol ? (
              <Image source={symbol} style={styles.guideSymbol} resizeMode="contain" />
            ) : null}
            <Text
              style={[
                styles.guideTierName,
                { color: RANK_TIER_COLOR[tier] ?? colors.textPrimary },
              ]}
            >
              {tier}
            </Text>
            {isCurrent ? <Text style={styles.guideCurrentBadge}>지금</Text> : null}
          </View>
        );
      })}

      <Text style={styles.guideLine}>
        한 랭크는 <Text style={styles.guideEmphasis}>{LP_PER_TIER} LP</Text>이고, 다 채우면 다음 랭크로
        올라갑니다. 1대1은 이기면 +LP, 지면 -LP이고 그룹 대결은 순위가 높을수록 많이 받습니다.
      </Text>
      <Text style={styles.guideFootnote}>
        LP는 앱에서 측정한 대결 기록으로만 오르내립니다. 매달 초기화되지 않고 계속 쌓입니다.
      </Text>
    </View>
  );
}

export function HomeRankCard({ rankState, recordHref }: HomeRankCardProps) {
  const normalizedRankState = useMemo(() => normalizeRankStateForDisplay(rankState), [rankState]);
  const rankLabel = useMemo(() => formatRankLabel(normalizedRankState), [normalizedRankState]);
  const accentColor = RANK_TIER_COLOR[normalizedRankState.tier] ?? colors.brand;
  const softColor = RANK_TIER_SOFT_COLOR[normalizedRankState.tier] ?? fixedColors.surfaceSubtle;
  const tierSymbol = RANK_TIER_SYMBOL[normalizedRankState.tier];
  const progressPercent = Math.max(0, Math.min(100, (normalizedRankState.lp / LP_PER_TIER) * 100));
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
  const [guideExpanded, setGuideExpanded] = useState(false);
  const toggleGuide = useCallback(() => setGuideExpanded((current) => !current), []);
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
        <Pressable
          style={styles.guideChip}
          onPress={toggleGuide}
          accessibilityRole="button"
          accessibilityLabel="랭크 설명 보기"
          hitSlop={8}
        >
          <Text style={styles.guideChipText}>랭크 안내</Text>
          <Feather
            name={guideExpanded ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={colors.textSecondary}
          />
        </Pressable>
      </View>

      {guideExpanded ? <RankGuidePanel currentTier={normalizedRankState.tier} /> : null}

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

      <Link href={recordHref} asChild>
        <Pressable accessibilityRole="button" accessibilityLabel="전적 보기" style={styles.recordFooter}>
          <Text style={styles.recordTitle}>전적</Text>
          <Text style={styles.recordChevron}>›</Text>
        </Pressable>
      </Link>
    </Card>
  );
}

const styles = StyleSheet.create({
  rankCard: {
    borderWidth: 1,
    // 위아래로 낮게 (오너 2026-08-01) — 홈 첫 화면에서 기록 카드가 함께 보이게.
    gap: spacing.s10,
  },
  guideChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: fixedColors.surfaceSubtle,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.s10,
    paddingVertical: spacing.sm,
  },
  guideChipText: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  guidePanel: {
    gap: spacing.lg,
    padding: spacing.s12,
    borderRadius: radii.lg,
    backgroundColor: fixedColors.surfaceSubtleAlt,
  },
  guideHeadline: {
    color: colors.textPrimary,
    fontWeight: fontWeights.extraBold,
  },
  guideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s10,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
  },
  guideRowCurrent: {
    backgroundColor: fixedColors.brandWash,
  },
  guideSymbol: {
    width: 26,
    height: 26,
  },
  guideTierName: {
    flex: 1,
    fontWeight: fontWeights.extraBold,
  },
  guideCurrentBadge: {
    color: fixedColors.brand,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  guideLine: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    lineHeight: 19,
  },
  guideEmphasis: {
    color: colors.textPrimary,
    fontWeight: fontWeights.bold,
  },
  guideFootnote: {
    color: colors.textTertiary,
    fontSize: fontSizes.sm,
    lineHeight: 18,
  },
  rankHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.s12,
    justifyContent: 'space-between',
  },
  sectionEyebrow: {
    color: fixedColors.textSecondary,
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
    height: 76,
    width: 57,
  },
  tierBadge: {
    backgroundColor: fixedColors.white,
    borderRadius: radii.cardLarge,
    borderWidth: 2,
    paddingHorizontal: spacing.s16,
    paddingVertical: spacing.s10,
  },
  rankLabel: {
    fontSize: fontSizes.pageTitle,
    fontWeight: fontWeights.extraBold,
  },
  lpText: {
    color: fixedColors.textPrimary,
    fontSize: fontSizes.heroLarge,
    fontWeight: fontWeights.black,
    paddingBottom: spacing.sm,
  },
  lpUnit: {
    color: fixedColors.textSecondary,
    fontSize: fontSizes.rank,
    fontWeight: fontWeights.bold,
  },
  lpProgressTrack: {
    backgroundColor: fixedColors.borderMuted,
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
    borderTopColor: fixedColors.borderSoft,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'flex-end',
    paddingTop: spacing.s10,
  },
  recordTitle: {
    color: fixedColors.textPrimary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  recordChevron: {
    color: fixedColors.textTertiary,
    fontSize: fontSizes.metric,
    fontWeight: fontWeights.extraBold,
  },
});
