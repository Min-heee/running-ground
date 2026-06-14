import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { formatDuration } from '@/features/runs/tracking';
import { formatRunStartTime } from '@/features/running/utils/runStartLabel';
import type { RunDetailResponse } from '@/lib/api/types';
import { colors, spacing, fontSizes, fontWeights } from '@/theme/tokens';

type RunRecord = RunDetailResponse['run'];

type RunDetailInfoCardProps = {
  run: RunRecord;
};

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue} numberOfLines={1}>{value}</Text>
    </Card>
  );
}

export function RunDetailInfoCard({ run }: RunDetailInfoCardProps) {
  const durationLabel = typeof run.durationSeconds === 'number'
    ? formatDuration(run.durationSeconds)
    : '--';
  const startTimeLabel = formatRunStartTime(run.startedAt) ?? '--';
  const cadenceLabel = run.cadenceSpm ? `${run.cadenceSpm}spm` : '--';
  const elevationLabel = typeof run.elevationGainM === 'number' ? `${run.elevationGainM}m` : '--';

  return (
    <View style={styles.grid}>
      <View style={styles.row}>
        <MetricCard label="거리" value={`${run.distanceKm}km`} />
        <MetricCard label="페이스" value={run.pace ?? '--'} />
      </View>
      <View style={styles.row}>
        <MetricCard label="시간" value={durationLabel} />
        <MetricCard label="출발 시간" value={startTimeLabel} />
      </View>
      <View style={styles.row}>
        <MetricCard label="케이던스" value={cadenceLabel} />
        <MetricCard label="고도 상승" value={elevationLabel} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    gap: spacing.s10,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.s10,
  },
  metricCard: {
    flex: 1,
  },
  metricLabel: {
    color: colors.textSecondary,
    fontWeight: fontWeights.bold,
  },
  metricValue: {
    color: colors.textPrimary,
    fontSize: fontSizes.metric,
    fontWeight: fontWeights.extraBold,
  },
});
