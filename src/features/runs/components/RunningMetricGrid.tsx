// 러닝 중 지표 (오너 2026-08-02, 시안 A+D 확정: 히어로 거리 + 페이스 링).
//
// 어두운 카드 6장 그리드가 난잡하다는 피드백으로 걷어냈다. 구성:
//   시간(위) → 페이스 링(20칸 틱, 평균 대비 현재 페이스만큼 채움) 안에 거리 히어로 +
//   현재 페이스 → 상태 문구 → 맨바닥 3열(평균 페이스/케이던스/고도).
// SVG 없이 뷰 20개를 원 둘레에 돌려 배치한다 — 1초 갱신에도 가볍다.
// 솔로·매치 트래킹이 같은 컴포넌트를 쓰므로 양쪽 다 이 모습이 된다.

import { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  PACE_RING_TICK_COUNT,
  buildPaceRingModel,
  splitDistanceLabel,
} from '@/features/runs/components/paceRingModel';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

const RING_SIZE = 220;
const TICK_WIDTH = 4;
const TICK_HEIGHT = 14;
// 틱 중심이 도는 반지름 — 링 상자 안쪽에 딱 붙게.
const TICK_RADIUS = (RING_SIZE - TICK_HEIGHT) / 2;

type RunningMetricGridProps = {
  elapsedLabel: string;
  distanceLabel: string;
  averagePaceLabel: string;
  currentPaceLabel: string;
  cadenceLabel: string;
  elevationLabel: string;
};

const TICK_ANGLES = Array.from(
  { length: PACE_RING_TICK_COUNT },
  (unused, index) => (index / PACE_RING_TICK_COUNT) * 360,
);

const PaceRingTicks = memo(function PaceRingTicks({ filledTicks }: { filledTicks: number }) {
  return (
    <>
      {TICK_ANGLES.map((angle, index) => (
        <View
          key={angle}
          style={[
            styles.tick,
            index < filledTicks ? styles.tickFilled : null,
            { transform: [{ rotate: `${angle}deg` }, { translateY: -TICK_RADIUS }] },
          ]}
        />
      ))}
    </>
  );
});

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
        {value}
      </Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

export function RunningMetricGrid({
  elapsedLabel,
  distanceLabel,
  averagePaceLabel,
  currentPaceLabel,
  cadenceLabel,
  elevationLabel,
}: RunningMetricGridProps) {
  const ring = useMemo(
    () => buildPaceRingModel(averagePaceLabel, currentPaceLabel),
    [averagePaceLabel, currentPaceLabel],
  );
  const distance = useMemo(() => splitDistanceLabel(distanceLabel), [distanceLabel]);

  return (
    <View style={styles.container}>
      <Text style={styles.elapsed}>
        <Text style={styles.elapsedLabel}>시간 </Text>
        {elapsedLabel}
      </Text>

      <View style={styles.ring}>
        <PaceRingTicks filledTicks={ring.filledTicks} />
        <Text style={styles.heroDistance} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
          {distance.number}
        </Text>
        <Text style={styles.heroUnit}>{distance.unit || 'km'}</Text>
        <Text style={styles.heroPace}>{currentPaceLabel}</Text>
      </View>

      <Text style={styles.statusLine}>{ring.statusLine}</Text>

      <View style={styles.metricRow}>
        <Metric label="평균 페이스" value={averagePaceLabel} />
        <Metric label="케이던스" value={cadenceLabel} />
        <Metric label="고도 상승" value={elevationLabel} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: spacing.s12,
    paddingVertical: spacing.s10,
  },
  elapsed: {
    color: colors.textPrimary,
    fontSize: fontSizes.large,
    fontWeight: fontWeights.extraBold,
  },
  elapsedLabel: {
    color: colors.textSecondary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
  },
  ring: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tick: {
    position: 'absolute',
    left: RING_SIZE / 2 - TICK_WIDTH / 2,
    top: RING_SIZE / 2 - TICK_HEIGHT / 2,
    width: TICK_WIDTH,
    height: TICK_HEIGHT,
    borderRadius: radii.xs,
    backgroundColor: colors.borderMuted,
  },
  tickFilled: {
    backgroundColor: colors.brand,
  },
  heroDistance: {
    color: colors.textPrimary,
    fontSize: 52,
    fontWeight: fontWeights.black,
    lineHeight: 56,
    maxWidth: RING_SIZE - TICK_HEIGHT * 2 - spacing.s16 * 2,
  },
  heroUnit: {
    color: colors.textSecondary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.extraBold,
  },
  heroPace: {
    color: colors.brand,
    fontSize: fontSizes.large,
    fontWeight: fontWeights.extraBold,
    marginTop: spacing.xs,
  },
  statusLine: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  metricRow: {
    flexDirection: 'row',
    gap: spacing.s12,
    alignSelf: 'stretch',
  },
  metric: {
    flex: 1,
    alignItems: 'center',
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
