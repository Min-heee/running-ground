import { StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

type HomeRegionBattleCardProps = {
  districtName: string;
  districtRank: number;
  totalDistanceKm: number;
};

export function HomeRegionBattleCard({
  districtName,
  districtRank,
  totalDistanceKm,
}: HomeRegionBattleCardProps) {
  return (
    <Card style={styles.regionCard}>
      <Text style={styles.darkEyebrow}>우리 지역 배틀</Text>
      <Text style={styles.regionTitle}>{districtName}</Text>
      <View style={styles.regionMetricRow}>
        <View style={styles.regionMetricBox}>
          <Text style={styles.regionMetricLabel}>현재 순위</Text>
          <Text style={styles.regionMetricValue}>{districtRank}위</Text>
        </View>
        <View style={styles.regionMetricBox}>
          <Text style={styles.regionMetricLabel}>총거리</Text>
          <Text style={styles.regionMetricValue}>{totalDistanceKm}km</Text>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  regionCard: {
    backgroundColor: colors.textPrimary,
    gap: spacing.s10,
  },
  darkEyebrow: {
    color: colors.brandLighter,
    fontWeight: fontWeights.bold,
    fontSize: fontSizes.sm,
  },
  regionTitle: {
    color: colors.white,
    fontSize: fontSizes.hero,
    fontWeight: fontWeights.extraBold,
  },
  regionMetricRow: {
    flexDirection: 'row',
    gap: spacing.s10,
  },
  regionMetricBox: {
    flex: 1,
    backgroundColor: colors.darkMuted,
    borderRadius: radii.md,
    padding: spacing.s14,
    gap: spacing.sm,
  },
  regionMetricLabel: {
    color: colors.border,
    fontSize: fontSizes.sm,
  },
  regionMetricValue: {
    color: colors.white,
    fontSize: fontSizes.comingSoon,
    fontWeight: fontWeights.extraBold,
  },
});
