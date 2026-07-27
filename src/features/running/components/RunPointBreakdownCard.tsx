import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import type { RunDetailResponse } from '@/lib/api/types';
import { colors, spacing, fontSizes, fontWeights } from '@/theme/tokens';

type PointBreakdown = RunDetailResponse['pointBreakdown'];

type RunPointBreakdownCardProps = {
  pointBreakdown: PointBreakdown;
  matchBonusLabel: string;
};

export function RunPointBreakdownCard({ pointBreakdown, matchBonusLabel }: RunPointBreakdownCardProps) {
  return (
    <Card style={styles.pointBreakdownCard}>
      <Text style={styles.sectionTitle}>포인트</Text>
      <PointBreakdownRow label="레벨 보너스" value={`+${pointBreakdown.levelPoints}P`} />
      <PointBreakdownRow label="연속 러닝 보너스" value={`+${pointBreakdown.streakPoints}P`} />
      <PointBreakdownRow label="성장 보너스" value={`+${pointBreakdown.growthPoints}P`} />
      <PointBreakdownRow
        label={matchBonusLabel}
        value={`+${pointBreakdown.matchBonusPoints}P`}
        highlight={pointBreakdown.matchBonusPoints > 0}
      />
      {(pointBreakdown.chasePoints ?? 0) > 0 ? (
        <PointBreakdownRow
          label="경찰과 도둑"
          value={`+${pointBreakdown.chasePoints}P`}
          highlight
        />
      ) : null}
      <View style={styles.pointBreakdownTotalRow}>
        <Text style={styles.pointBreakdownTotalLabel}>총 획득 포인트</Text>
        <Text style={styles.pointBreakdownTotalValue}>+{pointBreakdown.totalPoints}P</Text>
      </View>
    </Card>
  );
}

type PointBreakdownRowProps = {
  label: string;
  value: string;
  highlight?: boolean;
};

function PointBreakdownRow({ label, value, highlight = false }: PointBreakdownRowProps) {
  return (
    <View style={styles.pointBreakdownRow}>
      <Text style={styles.pointBreakdownLabel}>{label}</Text>
      <Text style={[styles.pointBreakdownValue, highlight ? styles.pointBreakdownValueHighlight : null]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pointBreakdownCard: {
    // Fill the stretched 50/50 row so the points card matches the match-result
    // card's height (they sit side by side in RunDetailScreen.recordDuoRow).
    flex: 1,
    gap: spacing.s10,
  },
  sectionTitle: {
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
    color: colors.textPrimary,
  },
  pointBreakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pointBreakdownLabel: {
    color: colors.textMuted,
    fontWeight: fontWeights.bold,
  },
  pointBreakdownValue: {
    color: colors.textPrimary,
    fontWeight: fontWeights.extraBold,
  },
  pointBreakdownValueHighlight: {
    color: colors.blueStrong,
  },
  pointBreakdownTotalRow: {
    // Pin the total to the bottom so it lines up with the match card's bottom row
    // when the card is stretched taller than its content.
    marginTop: 'auto',
    paddingTop: spacing.s12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pointBreakdownTotalLabel: {
    color: colors.textPrimary,
    fontWeight: fontWeights.extraBold,
  },
  pointBreakdownTotalValue: {
    color: colors.textPrimary,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.black,
  },
});
