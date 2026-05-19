import { StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { colors, spacing, fontSizes, fontWeights } from '@/theme/tokens';

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
    paddingVertical: spacing.s14,
  },
  statusMetric: {
    flex: 1,
    gap: spacing.sm,
    alignItems: 'center',
  },
  statusLabel: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
  },
  statusValue: {
    color: colors.textPrimary,
    fontSize: fontSizes.metric,
    fontWeight: fontWeights.extraBold,
  },
  statusDivider: {
    width: 1,
    height: 32,
    backgroundColor: colors.borderMuted,
  },
});
