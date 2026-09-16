import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { SegmentSwitch } from '@/components/ui/SegmentSwitch';
import type { MyRunRecord } from '@/domain';
import { RunPeriodBarChart } from '@/features/home/components/overview/RunPeriodBarChart';
import { RunPeriodPickerSheet } from '@/features/home/components/overview/RunPeriodPickerSheet';
import { buildRunPeriodChartModel } from '@/features/home/utils/runPeriodBars';
import {
  buildRunPeriodOptions,
  formatRunPeriodDistanceKm,
  formatRunPeriodDurationLabel,
  parseRunDateMs,
  resolveCurrentPeriodKey,
  summarizeRunsForPeriod,
  type RunPeriodMode,
} from '@/features/home/utils/runPeriodSummary';
import { buildAveragePaceLabel } from '@/features/profile/utils/activityMonthGroups';
import { colors, spacing, fontSizes, fontWeights } from '@/theme/tokens';

// 기간 블록 (오너 2026-09-16: "홈에 있는 내 러닝 기록을 기록탭으로 옮기자").
// 홈의 HomeActivityStatusCard가 하던 일 — 주/월/년 + 기간 고르기 + 거리·횟수·시간 + 막대
// 그래프 — 을 기록 탭 언어로 다시 그렸다: 세그먼트는 공용 SegmentSwitch, 요약은 카드 안
// 3열 대신 맨바닥 히어로(거리가 주인공, 횟수·시간·평균 페이스는 메타 한 줄), 그래프만
// 흰 블록 한 겹. 'ACTIVITY' 오버라인·보라 알약 기간 버튼·'기록 보기' 링크는 없앴다
// (여기가 기록 탭이다). 기간 고르기 시트(RunPeriodPickerSheet)와 그래프는 홈 것을 그대로
// 쓴다 — 계산·차트는 홈 유틸에 남겨 두고 import만 한다.

const PERIOD_MODE_ITEMS: readonly { id: RunPeriodMode; label: string }[] = [
  { id: 'week', label: '주' },
  { id: 'month', label: '월' },
  { id: 'year', label: '년' },
];

export const ActivityPeriodBlock = memo(function ActivityPeriodBlock({
  runs,
  nowMs,
}: {
  runs: readonly MyRunRecord[];
  nowMs: number;
}) {
  const [mode, setMode] = useState<RunPeriodMode>('week');
  const [selectedKey, setSelectedKey] = useState(() => resolveCurrentPeriodKey('week', nowMs));
  const [pickerOpen, setPickerOpen] = useState(false);

  // 모드가 바뀌면 그 모드의 '지금' 기간으로 되돌아간다 (홈 카드와 같은 동작).
  useEffect(() => {
    setSelectedKey(resolveCurrentPeriodKey(mode, nowMs));
  }, [mode, nowMs]);

  const periodOptions = useMemo(() => buildRunPeriodOptions(runs, mode, nowMs), [mode, nowMs, runs]);
  const selectedOption = useMemo(() => (
    periodOptions.find((option) => option.key === selectedKey) ?? periodOptions.at(-1) ?? null
  ), [periodOptions, selectedKey]);
  const summary = useMemo(() => summarizeRunsForPeriod(runs, selectedOption), [runs, selectedOption]);
  const averagePaceLabel = useMemo(() => {
    if (!selectedOption) {
      return null;
    }

    const periodRuns = runs.filter((run) => {
      const runDateMs = parseRunDateMs(run);
      return runDateMs !== null && runDateMs >= selectedOption.startMs && runDateMs < selectedOption.endMs;
    });

    return buildAveragePaceLabel(periodRuns);
  }, [runs, selectedOption]);
  const chartModel = useMemo(
    () => buildRunPeriodChartModel(runs, mode, selectedOption, nowMs),
    [mode, nowMs, runs, selectedOption],
  );

  const handleSelectMode = useCallback((id: string) => setMode(id as RunPeriodMode), []);
  const handleOpenPicker = useCallback(() => setPickerOpen(true), []);
  const handleClosePicker = useCallback(() => setPickerOpen(false), []);
  const handleSelectPeriod = useCallback((key: string) => {
    setSelectedKey(key);
    setPickerOpen(false);
  }, []);

  const metaText = [
    `${summary.runCount}회`,
    formatRunPeriodDurationLabel(summary.durationSeconds),
    averagePaceLabel ? `평균 ${averagePaceLabel}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <View style={styles.block}>
      <SegmentSwitch items={PERIOD_MODE_ITEMS} activeId={mode} onSelect={handleSelectMode} />

      <View style={styles.hero}>
        {/* 기간 라벨이 곧 기간 고르기 버튼 — 알약 없이 글자와 ▾ 하나. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`기간 선택, 현재 ${selectedOption?.label ?? ''}`}
          onPress={handleOpenPicker}
          style={styles.heroLabelRow}
          hitSlop={8}
        >
          <Text style={styles.heroLabel}>{selectedOption?.label ?? '기간 선택'}</Text>
          <Text style={styles.heroChevron}>▾</Text>
        </Pressable>
        <Text style={styles.heroValue}>
          {formatRunPeriodDistanceKm(summary.distanceKm)}
          <Text style={styles.heroUnit}>km</Text>
        </Text>
        <Text style={styles.heroMeta}>{metaText}</Text>
      </View>

      <Card style={styles.chartCard}>
        <RunPeriodBarChart model={chartModel} />
      </Card>

      <RunPeriodPickerSheet
        onClose={handleClosePicker}
        onSelect={handleSelectPeriod}
        options={periodOptions}
        selectedKey={selectedOption?.key ?? selectedKey}
        visible={pickerOpen}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  block: {
    gap: spacing.s12,
  },
  hero: {
    gap: spacing.xs,
  },
  heroLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.sm,
  },
  heroLabel: {
    color: colors.textSecondary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.extraBold,
  },
  heroChevron: {
    color: colors.textSecondary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.extraBold,
  },
  heroValue: {
    color: colors.textPrimary,
    fontSize: fontSizes.heroLarge,
    fontWeight: fontWeights.black,
    lineHeight: fontSizes.heroLarge + 6,
    includeFontPadding: false,
  },
  heroUnit: {
    color: colors.textSecondary,
    fontSize: fontSizes.metric,
    fontWeight: fontWeights.extraBold,
  },
  heroMeta: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
  },
  chartCard: {
    gap: 0,
  },
});
