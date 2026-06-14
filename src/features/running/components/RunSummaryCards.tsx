import { StyleSheet, Text } from 'react-native';

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
});
