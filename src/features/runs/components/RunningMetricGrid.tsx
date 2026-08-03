// 러닝 중 지표 (오너 2026-08-03 재해석: 링 둘레 = 목표 거리).
//
// 구성: 시간(크게) → 목표 링(20칸 틱, 뛴 거리 ÷ 목표만큼 12시부터 시계방향으로 채움)
// 안에 거리 히어로 + 현재 페이스 → 목표 상태 문구 → 맨바닥 3열(평균 페이스/케이던스/
// 고도, 크게). 목표는 혼자 탭 RUN 블록에서 고른 값(soloRunGoalStore).
// SVG 없이 뷰 20개를 원 둘레에 돌려 배치한다 — 1초 갱신에도 가볍다.

import { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  GOAL_RING_TICK_COUNT,
  buildGoalRingModel,
  splitDistanceLabel,
} from '@/features/runs/components/runGoalRing';
import { useSoloRunGoalKm } from '@/features/runs/soloGoal/soloRunGoalStore';
import { colors, fontSizes, fontWeights, radii, spacing } from '@/theme/tokens';

const RING_SIZE = 292;
const TICK_WIDTH = 5;
const TICK_HEIGHT = 18;
// 틱 중심이 도는 반지름 — 링 상자 안쪽에 딱 붙게.
const TICK_RADIUS = (RING_SIZE - TICK_HEIGHT) / 2;

type RunningMetricGridProps = {
  elapsedLabel: string;
  distanceLabel: string;
  averagePaceLabel: string;
  currentPaceLabel: string;
  cadenceLabel: string;
  elevationLabel: string;
  // 매치 러닝은 매치 목표 거리를 내려보낸다 — 솔로 목표 스토어가 매치 화면으로 새서
  // 3km 듀얼에 '목표 5km'가 뜨던 충돌 방지 (적대 리뷰 발견).
  goalKmOverride?: number;
};

const TICK_ANGLES = Array.from(
  { length: GOAL_RING_TICK_COUNT },
  (unused, index) => (index / GOAL_RING_TICK_COUNT) * 360,
);

const GoalRingTicks = memo(function GoalRingTicks({ filledTicks }: { filledTicks: number }) {
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
      <Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
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
  goalKmOverride,
}: RunningMetricGridProps) {
  const soloGoalKm = useSoloRunGoalKm();
  const goalKm = typeof goalKmOverride === 'number' && goalKmOverride > 0 ? goalKmOverride : soloGoalKm;
  const distance = useMemo(() => splitDistanceLabel(distanceLabel), [distanceLabel]);
  const ring = useMemo(
    () => buildGoalRingModel(Number(distance.number), goalKm),
    [distance.number, goalKm],
  );

  return (
    <View style={styles.container}>
      <Text style={styles.elapsed}>{elapsedLabel}</Text>

      {/* 남은 거리 문구는 화면에서 뺐지만(오너 2026-08-03) 보조기술에는 statusLine으로
          목표 대비 상황을 읽어준다. 거리 숫자의 자동 축소(adjustsFontSizeToFit)는 iOS에서
          lineHeight와 엮여 좁쌀만 하게 과축소되는 버그가 있어 고정 크기로 뒀다 — 실사용
          거리(≤99.99km)는 링 안에 안전하게 들어간다. */}
      <View style={styles.ring} accessibilityLabel={ring.statusLine}>
        <GoalRingTicks filledTicks={ring.filledTicks} />
        <Text style={styles.heroDistance} numberOfLines={1}>
          {distance.number}
        </Text>
        <Text style={styles.heroUnit}>{distance.unit || 'km'}</Text>
        <Text style={styles.heroPace}>{currentPaceLabel}</Text>
      </View>

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
    fontSize: fontSizes.heroLarge,
    fontWeight: fontWeights.black,
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
    fontSize: 64,
    fontWeight: fontWeights.black,
  },
  heroUnit: {
    color: colors.textSecondary,
    fontSize: fontSizes.large,
    fontWeight: fontWeights.extraBold,
  },
  heroPace: {
    color: colors.brand,
    fontSize: fontSizes.comingSoon,
    fontWeight: fontWeights.extraBold,
    marginTop: spacing.xs,
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
    fontSize: fontSizes.pageTitle,
    fontWeight: fontWeights.extraBold,
  },
  metricLabel: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
  },
});
