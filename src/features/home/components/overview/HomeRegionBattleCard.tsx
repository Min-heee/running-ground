import { StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { colors } from '@/theme/tokens';

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
    gap: 10,
  },
  darkEyebrow: {
    color: colors.brandLighter,
    fontWeight: '700',
    fontSize: 12,
  },
  regionTitle: {
    color: colors.white,
    fontSize: 30,
    fontWeight: '800',
  },
  regionMetricRow: {
    flexDirection: 'row',
    gap: 10,
  },
  regionMetricBox: {
    flex: 1,
    backgroundColor: colors.darkMuted,
    borderRadius: 16,
    padding: 14,
    gap: 4,
  },
  regionMetricLabel: {
    color: colors.border,
    fontSize: 12,
  },
  regionMetricValue: {
    color: colors.white,
    fontSize: 22,
    fontWeight: '800',
  },
});
