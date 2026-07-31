// 기간 그래프 (오너 2026-08-01, 나이키 활동 화면 스타일 확정).
//
// 구성: y축 눈금 3줄(가로선 + 우측 km 라벨) + 기록 평균 점선(값 라벨) + 거리 막대.
// 막대 위 값 라벨은 주(7칸) 모드에서만 — 일별 31칸/월별 12칸에선 겹쳐서 못 읽는다.
// 색은 우리 브랜드: 기록 칸 연보라, '지금' 칸 진보라, 지금인데 비었으면 워시 테두리.

import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { RunPeriodChartModel } from '@/features/home/utils/runPeriodBars';
import { colors, fontSizes, fontWeights, radii, spacing } from '@/theme/tokens';

const CHART_HEIGHT = 120;
const LABEL_ROW_HEIGHT = 18;
// 값 라벨(막대 위 숫자)이 차트 위 눈금선 밖으로 나가지 않게 확보하는 머리 공간.
const VALUE_LABEL_HEIGHT = 14;

type RunPeriodBarChartProps = {
  model: RunPeriodChartModel;
};

function formatTickKm(valueKm: number) {
  return Number.isInteger(valueKm) ? String(valueKm) : valueKm.toFixed(1);
}

export const RunPeriodBarChart = memo(function RunPeriodBarChart({ model }: RunPeriodBarChartProps) {
  const { bars, averageKm, tickStepKm } = model;

  if (!bars.length) {
    return null;
  }

  const chartMaxKm = tickStepKm * 3;
  const showValueLabels = bars.length <= 7;
  const barAreaHeight = CHART_HEIGHT - VALUE_LABEL_HEIGHT;

  return (
    <View style={styles.container}>
      <View style={styles.plot}>
        {/* y축 눈금: 0은 바닥선, 그 위로 step×1..3 가로선 + 우측 라벨 */}
        {[0, 1, 2, 3].map((tickIndex) => {
          const tickKm = tickStepKm * tickIndex;
          const bottom = (tickKm / chartMaxKm) * barAreaHeight;

          return (
            <View key={`tick-${tickIndex}`} style={[styles.gridLine, { bottom }]} pointerEvents="none">
              <Text style={styles.gridLabel}>{tickIndex === 0 ? '0km' : formatTickKm(tickKm)}</Text>
            </View>
          );
        })}

        {/* 기록 평균 점선 — 나이키의 그 선. 기록이 없으면 생략 */}
        {averageKm !== null && averageKm <= chartMaxKm ? (
          <View
            style={[styles.averageLine, { bottom: (averageKm / chartMaxKm) * barAreaHeight }]}
            pointerEvents="none"
          >
            <Text style={styles.averageLabel}>{formatTickKm(averageKm)}</Text>
          </View>
        ) : null}

        <View style={styles.barRow}>
          {bars.map((bar) => {
            const barHeight = bar.distanceKm > 0
              ? Math.max(4, (Math.min(bar.distanceKm, chartMaxKm) / chartMaxKm) * barAreaHeight)
              : 0;

            return (
              <View key={bar.key} style={styles.barColumn}>
                {showValueLabels && bar.distanceKm > 0 ? (
                  <Text style={styles.valueLabel} numberOfLines={1}>
                    {bar.distanceKm.toFixed(1)}
                  </Text>
                ) : null}
                {bar.distanceKm > 0 ? (
                  <View
                    style={[
                      styles.bar,
                      { height: barHeight },
                      bar.isCurrent ? styles.barCurrent : styles.barFilled,
                    ]}
                  />
                ) : (
                  // 빈 칸: 자리는 지키되 막대는 없다 (나이키와 동일). 오늘/이번 달이 비어
                  // 있으면 워시 스텁으로 '아직 안 뛰었다'를 보여준다 (H안의 신호 유지).
                  <View style={[styles.emptyStub, bar.isCurrent ? styles.emptyStubCurrent : null]} />
                )}
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.labelRow}>
        {bars.map((bar) => (
          <View key={`label-${bar.key}`} style={styles.labelColumn}>
            {bar.label ? (
              <Text style={bar.isCurrent ? styles.axisLabelCurrent : styles.axisLabel} numberOfLines={1}>
                {bar.label}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    paddingTop: spacing.xxl,
  },
  plot: {
    height: CHART_HEIGHT,
    justifyContent: 'flex-end',
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderMuted,
  },
  gridLabel: {
    position: 'absolute',
    right: 0,
    top: -14,
    color: colors.textTertiary,
    fontSize: fontSizes.xxs,
  },
  averageLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderTopColor: colors.brandLight,
  },
  averageLabel: {
    position: 'absolute',
    right: 0,
    top: -16,
    color: colors.brand,
    fontSize: fontSizes.xxs,
    fontWeight: fontWeights.extraBold,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    // 우측 눈금 라벨과 겹치지 않게 오른쪽을 살짝 비운다.
    paddingRight: 26,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.xxs,
  },
  bar: {
    width: '100%',
    maxWidth: 18,
    borderRadius: radii.xs,
  },
  barFilled: {
    backgroundColor: colors.brandLight,
  },
  barCurrent: {
    backgroundColor: colors.brand,
  },
  emptyStub: {
    width: '100%',
    maxWidth: 18,
    height: 0,
  },
  emptyStubCurrent: {
    height: 6,
    borderRadius: radii.xs,
    backgroundColor: colors.brandWash,
    borderWidth: 1,
    borderColor: colors.brandSoftBorder,
  },
  valueLabel: {
    color: colors.textSecondary,
    fontSize: fontSizes.xxs,
    fontWeight: fontWeights.bold,
  },
  labelRow: {
    flexDirection: 'row',
    gap: 2,
    paddingRight: 26,
    height: LABEL_ROW_HEIGHT,
    alignItems: 'flex-start',
    paddingTop: spacing.xs,
  },
  labelColumn: {
    flex: 1,
    alignItems: 'center',
  },
  axisLabel: {
    color: colors.textTertiary,
    fontSize: fontSizes.xxs,
  },
  axisLabelCurrent: {
    color: colors.brand,
    fontSize: fontSizes.xxs,
    fontWeight: fontWeights.extraBold,
  },
});
