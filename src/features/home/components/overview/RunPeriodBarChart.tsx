// 기간 그래프 (오너 2026-08-01, 나이키 활동 화면 스타일 확정).
//
// 구성: y축 눈금 3줄(가로선 + 우측 km 라벨) + 기록 평균 점선(값 라벨) + 거리 막대.
// 막대 위 값 라벨은 주(7칸) 모드에서만 — 일별 31칸/월별 12칸에선 겹쳐서 못 읽는다.
// 대신 막대를 탭하면 말풍선으로 그 칸의 거리를 보여준다 (좁은 칸 모드의 값 읽기 수단).
// 색은 우리 브랜드: 기록 칸 연보라, '지금' 칸 진보라, 지금인데 비었으면 워시 테두리.

import { memo, useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { RunPeriodChartModel } from '@/features/home/utils/runPeriodBars';
import { colors, fixedColors, fontSizes, fontWeights, radii, spacing } from '@/theme/tokens';

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
  // 탭한 막대 — 말풍선으로 그 칸의 거리를 보여준다. 같은 막대를 다시 탭하면 닫힌다.
  // 모드를 바꾸면 키 체계가 달라져 말풍선은 자연히 사라진다.
  const [selectedBarKey, setSelectedBarKey] = useState<string | null>(null);
  const toggleBar = useCallback((key: string) => {
    setSelectedBarKey((current) => (current === key ? null : key));
  }, []);

  if (!bars.length) {
    return null;
  }

  const chartMaxKm = tickStepKm * 3;
  const showValueLabels = bars.length <= 7;
  const barAreaHeight = CHART_HEIGHT - VALUE_LABEL_HEIGHT;
  const barHeightFor = (distanceKm: number) => (distanceKm > 0
    ? Math.max(4, (Math.min(distanceKm, chartMaxKm) / chartMaxKm) * barAreaHeight)
    : 0);
  const selectedIndex = bars.findIndex((bar) => bar.key === selectedBarKey && bar.distanceKm > 0);
  const selectedBar = selectedIndex >= 0 ? bars[selectedIndex] : null;

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

        {/* 기록 평균 점선 — 나이키의 그 선. 라벨은 왼쪽: 오른쪽 눈금 라벨과 같은 높이에
            오면(평균≈눈금값) 숫자 두 개가 겹쳐 보였다. 기록이 없으면 생략 */}
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
            const barHeight = barHeightFor(bar.distanceKm);

            return (
              <Pressable
                key={bar.key}
                style={styles.barColumn}
                disabled={bar.distanceKm <= 0}
                onPress={() => toggleBar(bar.key)}
                accessibilityRole="button"
                accessibilityLabel={`${bar.label ? `${bar.label} ` : ''}${bar.distanceKm.toFixed(1)}km`}
              >
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
              </Pressable>
            );
          })}
        </View>

        {/* 탭한 막대의 말풍선 — 막대 머리 위에 거리를 띄운다. */}
        {selectedBar ? (
          <View style={styles.bubbleLayer} pointerEvents="none">
            <View
              style={[
                styles.bubbleAnchor,
                {
                  left: `${((selectedIndex + 0.5) / bars.length) * 100}%`,
                  bottom: barHeightFor(selectedBar.distanceKm) + 4,
                },
              ]}
            >
              <View style={styles.bubble}>
                <Text style={styles.bubbleText}>{selectedBar.distanceKm.toFixed(1)}km</Text>
              </View>
              <View style={styles.bubbleCaret} />
            </View>
          </View>
        ) : null}
      </View>

      {/* x축 라벨: 칸 안에 가두면 월 모드(31칸)에서 칸 폭이 ~10px라 두 자리 수가 '1..'로
          잘린다 — 칸 중앙 위치에 절대배치한 고정폭 라벨로 띄운다. */}
      <View style={styles.labelRow}>
        {bars.map((bar, index) => (bar.label ? (
          <View
            key={`label-${bar.key}`}
            style={[styles.labelAnchor, { left: `${((index + 0.5) / bars.length) * 100}%` }]}
          >
            <Text style={bar.isCurrent ? styles.axisLabelCurrent : styles.axisLabel}>
              {bar.label}
            </Text>
          </View>
        ) : null))}
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
    left: 0,
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
  bubbleLayer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    // 막대 영역과 같은 폭 (barRow paddingRight와 동일).
    right: 26,
  },
  bubbleAnchor: {
    position: 'absolute',
    width: 72,
    // left%가 칸 중앙을 가리키므로 절반을 되돌려 말풍선을 중앙 정렬한다.
    marginLeft: -36,
    alignItems: 'center',
  },
  bubble: {
    backgroundColor: colors.brand,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  bubbleText: {
    color: fixedColors.white,
    fontSize: fontSizes.xxs,
    fontWeight: fontWeights.extraBold,
  },
  bubbleCaret: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 5,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: colors.brand,
  },
  labelRow: {
    position: 'relative',
    height: LABEL_ROW_HEIGHT,
    // 막대 영역과 같은 폭이 되도록 눈금 라벨 여백만큼 오른쪽을 비운다.
    marginRight: 26,
    marginTop: spacing.xs,
  },
  labelAnchor: {
    position: 'absolute',
    top: 0,
    width: 32,
    // left%가 칸 중앙을 가리키므로 절반을 되돌려 라벨을 중앙 정렬한다.
    marginLeft: -16,
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
