import { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { colors, spacing, fontSizes, fontWeights } from '@/theme/tokens';

type RunningMetric = {
  label: string;
  value: string;
};

type RunningMetricGridProps = {
  elapsedLabel: string;
  distanceLabel: string;
  averagePaceLabel: string;
  currentPaceLabel: string;
  cadenceLabel: string;
  elevationLabel: string;
};

const RunningMetricCard = memo(function RunningMetricCard({ metric }: { metric: RunningMetric }) {
  return (
    <Card style={styles.card}>
      <Text style={styles.label}>{metric.label}</Text>
      <Text style={styles.value}>{metric.value}</Text>
    </Card>
  );
});

export function RunningMetricGrid({
  elapsedLabel,
  distanceLabel,
  averagePaceLabel,
  currentPaceLabel,
  cadenceLabel,
  elevationLabel,
}: RunningMetricGridProps) {
  const metrics = useMemo<RunningMetric[]>(() => [
    { label: '시간', value: elapsedLabel },
    { label: '거리', value: distanceLabel },
    { label: '평균 페이스', value: averagePaceLabel },
    { label: '현재 페이스', value: currentPaceLabel },
    { label: '케이던스', value: cadenceLabel },
    { label: '고도 상승', value: elevationLabel },
  ], [
    averagePaceLabel,
    cadenceLabel,
    currentPaceLabel,
    distanceLabel,
    elapsedLabel,
    elevationLabel,
  ]);

  const metricCards = useMemo(() => (
    metrics.map((metric) => (
      <RunningMetricCard key={metric.label} metric={metric} />
    ))
  ), [metrics]);

  return (
    <View style={styles.grid}>
      {metricCards}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s10,
  },
  card: {
    width: '48.5%',
    minHeight: 96,
    justifyContent: 'space-between',
    backgroundColor: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.darkMuted,
  },
  label: {
    color: colors.textTertiary,
    fontWeight: fontWeights.bold,
  },
  value: {
    color: colors.white,
    fontSize: fontSizes.comingSoon,
    fontWeight: fontWeights.extraBold,
  },
});
