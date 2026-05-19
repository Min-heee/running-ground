import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import type { RunDetailResponse } from '@/lib/api/types';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

type PointBreakdown = RunDetailResponse['pointBreakdown'];

type RunPointBreakdownCardProps = {
  pointBreakdown: PointBreakdown;
  matchBonusLabel: string;
};

export function RunPointBreakdownCard({ pointBreakdown, matchBonusLabel }: RunPointBreakdownCardProps) {
  return (
    <Card style={styles.pointBreakdownCard}>
      <View style={styles.pointBreakdownHeader}>
        <Text style={styles.sectionTitle}>포인트 내역</Text>
        {pointBreakdown.matchBonusPoints > 0 ? (
          <View style={styles.matchBonusPill}>
            <Text style={styles.matchBonusPillText}>매치 보너스 +{pointBreakdown.matchBonusPoints}P</Text>
          </View>
        ) : null}
      </View>
      <PointBreakdownRow label="레벨 보너스" value={`+${pointBreakdown.levelPoints}P`} />
      <PointBreakdownRow label="연속 러닝 보너스" value={`+${pointBreakdown.streakPoints}P`} />
      <PointBreakdownRow label="성장 보너스" value={`+${pointBreakdown.growthPoints}P`} />
      <PointBreakdownRow
        label={matchBonusLabel}
        value={`+${pointBreakdown.matchBonusPoints}P`}
        highlight={pointBreakdown.matchBonusPoints > 0}
      />
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
    gap: spacing.s10,
  },
  pointBreakdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.s12,
  },
  sectionTitle: {
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
    color: colors.textPrimary,
  },
  matchBonusPill: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.s10,
    paddingVertical: spacing.lg,
    backgroundColor: colors.blueWashSoft,
  },
  matchBonusPillText: {
    color: colors.blueStrong,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
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
    marginTop: spacing.sm,
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
