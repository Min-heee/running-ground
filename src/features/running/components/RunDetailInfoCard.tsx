// 기록 상세 지표 (오너 2026-08-01: 나이키식 '탁 트인' 상세) — 지표마다 카드 상자를 씌우던
// 이전 모습이 답답하다는 피드백으로, 맨바닥 3열 그리드(값 크게 위 / 라벨 아래)로 바꿨다.
// 거리는 히어로가 크게 보여주므로 여기서 뺀다.

import { StyleSheet, Text, View } from 'react-native';

import { formatDuration } from '@/features/runs/tracking';
import { formatRunStartTime } from '@/features/running/utils/runStartLabel';
import type { RunDetailResponse } from '@/lib/api/types';
import { resolveRunDurationSeconds } from '@/utils/runDuration';
import { colors, spacing, fontSizes, fontWeights } from '@/theme/tokens';

type RunRecord = RunDetailResponse['run'];

type RunDetailInfoCardProps = {
  run: RunRecord;
};

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      {/* 3열 칸 폭(~101pt@360dp)에서 '오후 10:44' 같은 값이 잘리지 않게 자동 축소. */}
      <Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
        {value}
      </Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

export function RunDetailInfoCard({ run }: RunDetailInfoCardProps) {
  // durationSeconds 없는 기록(예전 수동 추가)은 페이스 × 거리로 도출해 표시.
  const resolvedDurationSeconds = resolveRunDurationSeconds(run);
  const durationLabel = resolvedDurationSeconds !== null
    ? formatDuration(resolvedDurationSeconds)
    : '--';
  const startTimeLabel = formatRunStartTime(run.startedAt) ?? '--';
  const cadenceLabel = run.cadenceSpm ? `${run.cadenceSpm}spm` : '--';
  const elevationLabel = typeof run.elevationGainM === 'number' ? `${run.elevationGainM}m` : '--';

  return (
    <View style={styles.grid}>
      <View style={styles.row}>
        <Metric label="페이스" value={run.pace ?? '--'} />
        <Metric label="시간" value={durationLabel} />
        <Metric label="출발 시간" value={startTimeLabel} />
      </View>
      <View style={styles.row}>
        <Metric label="케이던스" value={cadenceLabel} />
        <Metric label="고도 상승" value={elevationLabel} />
        <View style={styles.metric} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    gap: spacing.s16,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.s12,
  },
  metric: {
    flex: 1,
    gap: spacing.xxs,
  },
  metricValue: {
    color: colors.textPrimary,
    fontSize: fontSizes.metric,
    fontWeight: fontWeights.extraBold,
  },
  metricLabel: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
});
