import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { formatDuration } from '@/features/runs/tracking';
import type { RunDetailResponse } from '@/lib/api/types';
import { colors, spacing, fontSizes, fontWeights } from '@/theme/tokens';

type RunRecord = RunDetailResponse['run'];

type RunDetailInfoCardProps = {
  run: RunRecord;
  sourceLabel: string;
  weeklyDistanceKm: number;
};

export function RunDetailInfoCard({ run, sourceLabel, weeklyDistanceKm }: RunDetailInfoCardProps) {
  return (
    <Card>
      <Text style={styles.sectionTitle}>상세 정보</Text>
      <DetailRow label="날짜" value={run.date} />
      <DetailRow label="거리" value={`${run.distanceKm}km`} />
      <DetailRow label="페이스" value={run.pace} />
      {typeof run.durationSeconds === 'number' ? (
        <DetailRow label="측정 시간" value={formatDuration(run.durationSeconds)} />
      ) : null}
      {run.startedAt ? <DetailRow label="시작 시각" value={run.startedAt.slice(11, 16)} /> : null}
      {run.endedAt ? <DetailRow label="종료 시각" value={run.endedAt.slice(11, 16)} /> : null}
      <DetailRow label="기록 소스" value={sourceLabel} />
      <DetailRow label="주간 누적 거리" value={`${weeklyDistanceKm}km`} />
    </Card>
  );
}

type DetailRowProps = {
  label: string;
  value: string;
};

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
    color: colors.textPrimary,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.s10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSoft,
  },
  detailLabel: {
    color: colors.textSecondary,
    fontWeight: fontWeights.bold,
  },
  detailValue: {
    color: colors.textPrimary,
    fontWeight: fontWeights.bold,
  },
});
