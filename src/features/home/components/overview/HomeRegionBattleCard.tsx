import { StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';

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
    backgroundColor: '#111827',
    gap: 10,
  },
  darkEyebrow: {
    color: '#C7D2FE',
    fontWeight: '700',
    fontSize: 12,
  },
  regionTitle: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '800',
  },
  regionMetricRow: {
    flexDirection: 'row',
    gap: 10,
  },
  regionMetricBox: {
    flex: 1,
    backgroundColor: '#1F2937',
    borderRadius: 16,
    padding: 14,
    gap: 4,
  },
  regionMetricLabel: {
    color: '#D0D5DD',
    fontSize: 12,
  },
  regionMetricValue: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
  },
});
