import { StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';

type HomeWeeklyStatusCardProps = {
  totalDistanceKm: number;
  totalRuns: number;
  streakDays: number;
};

export function HomeWeeklyStatusCard({
  totalDistanceKm,
  totalRuns,
  streakDays,
}: HomeWeeklyStatusCardProps) {
  return (
    <Card style={styles.statusCard}>
      <View style={styles.statusMetric}>
        <Text style={styles.statusLabel}>이번 주 거리</Text>
        <Text style={styles.statusValue}>{totalDistanceKm}km</Text>
      </View>
      <View style={styles.statusDivider} />
      <View style={styles.statusMetric}>
        <Text style={styles.statusLabel}>러닝</Text>
        <Text style={styles.statusValue}>{totalRuns}회</Text>
      </View>
      <View style={styles.statusDivider} />
      <View style={styles.statusMetric}>
        <Text style={styles.statusLabel}>연속</Text>
        <Text style={styles.statusValue}>{streakDays}일</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
    paddingVertical: 14,
  },
  statusMetric: {
    flex: 1,
    gap: 4,
    alignItems: 'center',
  },
  statusLabel: {
    color: '#667085',
    fontSize: 12,
    fontWeight: '600',
  },
  statusValue: {
    color: '#111827',
    fontSize: 20,
    fontWeight: '800',
  },
  statusDivider: {
    width: 1,
    height: 32,
    backgroundColor: '#E5E7EB',
  },
});
