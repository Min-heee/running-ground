import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
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
  summaryValueSmall: {
    color: colors.textPrimary,
    fontSize: fontSizes.metric,
    fontWeight: fontWeights.extraBold,
  },
});
