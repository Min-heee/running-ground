import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { formatDuration } from '@/features/runs/tracking';
import { colors, spacing, fontSizes, fontWeights } from '@/theme/tokens';

type RunHeroCardProps = {
  startedLabel: string;
  distanceKm: number;
};

export function RunHeroCard({ startedLabel, distanceKm }: RunHeroCardProps) {
  return (
    <Card style={styles.heroCard}>
      <Text style={styles.heroDate}>{startedLabel}</Text>
      <Text style={styles.heroDistance}>{distanceKm}km</Text>
    </Card>
  );
}

type RunSummaryMetricRowProps = {
  durationSeconds?: number;
  estimatedMinutes: number;
  earnedPoint: number;
};

export function RunSummaryMetricRow({
  durationSeconds,
  estimatedMinutes,
  earnedPoint,
}: RunSummaryMetricRowProps) {
  return (
    <View style={styles.summaryRow}>
      <Card style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>예상 소요 시간</Text>
        <Text style={styles.summaryValue}>
          {typeof durationSeconds === 'number' ? formatDuration(durationSeconds) : `${estimatedMinutes}분`}
        </Text>
      </Card>
      <Card style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>획득 포인트</Text>
        <Text style={styles.summaryValue}>{earnedPoint}P</Text>
      </Card>
    </View>
  );
}

type RunExtraMetricsRowProps = {
  cadenceSpm?: number | null;
  elevationGainM?: number | null;
};

export function RunExtraMetricsRow({ cadenceSpm, elevationGainM }: RunExtraMetricsRowProps) {
  return (
    <View style={styles.summaryRow}>
      <Card style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>케이던스</Text>
        <Text style={styles.summaryValueSmall}>
          {cadenceSpm ? `${cadenceSpm}spm` : '--'}
        </Text>
      </Card>
      <Card style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>고도 상승</Text>
        <Text style={styles.summaryValueSmall}>
          {typeof elevationGainM === 'number' ? `${elevationGainM}m` : '--'}
        </Text>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    backgroundColor: colors.textPrimary,
    gap: spacing.xs,
  },
  heroDate: {
    color: colors.textTertiary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
  },
  heroDistance: {
    color: colors.white,
    fontSize: fontSizes.heroLarge,
    fontWeight: fontWeights.black,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: spacing.s10,
  },
  summaryCard: {
    flex: 1,
  },
  summaryLabel: {
    color: colors.textSecondary,
    fontWeight: fontWeights.bold,
  },
  summaryValue: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: fontWeights.extraBold,
  },
  summaryValueSmall: {
    color: colors.textPrimary,
    fontSize: fontSizes.metric,
    fontWeight: fontWeights.extraBold,
  },
});
