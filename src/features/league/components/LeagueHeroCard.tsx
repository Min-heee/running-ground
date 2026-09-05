import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import type { RegionDrilldownNode } from '@/domain';
import { formatLeagueDistanceValue } from '@/features/league/utils/leagueRanking';
import { colors, fixedColors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

type LeagueHeroCardProps = {
  node: RegionDrilldownNode;
  isMyRegion: boolean;
};

export function LeagueHeroCard({ node, isMyRegion }: LeagueHeroCardProps) {
  return (
    <Card style={styles.heroCard}>
      <View style={styles.heroLabelRow}>
        <Text style={styles.heroLabel}>현재 선택 지역</Text>
        {isMyRegion ? (
          <View style={styles.myRegionBadgeOnDark}>
            <Text style={styles.myRegionBadgeOnDarkText}>내 지역</Text>
          </View>
        ) : null}
      </View>
      {/* 전남광주통합특별시(9자)도 한 줄에 들어가도록 긴 이름은 폰트를 줄여 맞춘다. */}
      <View style={styles.heroTitleRow}>
        <Text style={styles.heroTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
          {node.name}
        </Text>
        {/* 월간 지역 우승 별 (오너 2026-09-05: "우리 지역도 별") — 랭킹 행과 같은 표기. */}
        {typeof node.stars === 'number' && node.stars > 0 ? (
          <Text style={styles.heroStars}>{node.stars <= 3 ? '★'.repeat(node.stars) : `★${node.stars}`}</Text>
        ) : null}
      </View>
      <View style={styles.heroMetrics}>
        <View style={styles.heroMetricColumn}>
          <Text style={styles.heroMetricLabel}>이번 달 총거리</Text>
          <Text style={styles.heroMetricValue}>
            {formatLeagueDistanceValue(node.totalDistanceKm)}
            <Text style={styles.heroMetricUnitInline}> km</Text>
          </Text>
        </View>
        <View style={styles.heroMetricDivider} />
        <View style={styles.heroMetricColumn}>
          <Text style={styles.heroMetricLabel}>회원수</Text>
          <Text style={styles.heroMetricValue}>
            {node.participants}
            <Text style={styles.heroMetricUnitInline}> 명</Text>
          </Text>
        </View>
        <View style={styles.heroMetricDivider} />
        <View style={styles.heroMetricColumn}>
          <Text style={styles.heroMetricLabel}>인당 평균</Text>
          <Text style={styles.heroMetricValue}>
            {formatLeagueDistanceValue(node.averageDistanceKm)}
            <Text style={styles.heroMetricUnitInline}> km</Text>
          </Text>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    backgroundColor: colors.dark,
    gap: spacing.s10,
  },
  heroLabel: {
    color: colors.indigoSoft,
    fontWeight: fontWeights.bold,
    fontSize: fontSizes.sm,
  },
  heroLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxl,
  },
  heroTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s10,
  },
  heroTitle: {
    color: colors.white,
    fontSize: fontSizes.hero,
    fontWeight: fontWeights.extraBold,
    flexShrink: 1,
  },
  // 어두운 히어로 배경 위 금색 별 — 지역/회원 랭킹 행의 ★ 표기와 동일 관례.
  heroStars: {
    color: colors.podiumGold,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
  },
  heroMetrics: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  heroMetricColumn: {
    flex: 1,
    gap: spacing.lg,
  },
  heroMetricDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.translucentWhite18,
    marginHorizontal: spacing.s10,
  },
  heroMetricValue: {
    color: colors.white,
    fontSize: fontSizes.metric,
    fontWeight: fontWeights.extraBold,
  },
  heroMetricLabel: {
    color: fixedColors.border,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
  },
  heroMetricUnitInline: {
    color: colors.indigoSoft,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
  },
  myRegionBadgeOnDark: {
    backgroundColor: colors.translucentWhite18,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.sm,
  },
  myRegionBadgeOnDarkText: {
    color: colors.white,
    fontSize: fontSizes.xxs,
    fontWeight: fontWeights.extraBold,
  },
});
