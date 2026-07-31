import { memo, useCallback, useMemo, useState } from 'react';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import type { MyRunRecord } from '@/domain';
import { RunPeriodPickerSheet } from '@/features/home/components/overview/RunPeriodPickerSheet';
import { RunPeriodBarChart } from '@/features/home/components/overview/RunPeriodBarChart';
import { buildRunPeriodChartModel } from '@/features/home/utils/runPeriodBars';
import { formatPaceFromSecondsPerKm } from '@/features/runs/tracking';
import {
  buildRunPeriodOptions,
  formatRunPeriodDistanceKm,
  formatRunPeriodDurationLabel,
  resolveCurrentPeriodKey,
  summarizeRunsForPeriod,
  type RunPeriodMode,
} from '@/features/home/utils/runPeriodSummary';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

type HomeActivityStatusCardProps = {
  runs: MyRunRecord[];
};

const periodModes: { key: RunPeriodMode; label: string }[] = [
  { key: 'week', label: '주' },
  { key: 'month', label: '월' },
  { key: 'year', label: '년' },
];

function HomeActivityStatusCardImpl({ runs }: HomeActivityStatusCardProps) {
  const [nowMs] = useState(() => Date.now());
  const [mode, setMode] = useState<RunPeriodMode>('week');
  const [selectedKey, setSelectedKey] = useState(() => resolveCurrentPeriodKey('week', Date.now()));
  const [pickerOpen, setPickerOpen] = useState(false);
  const periodOptions = useMemo(() => buildRunPeriodOptions(runs, mode, nowMs), [mode, nowMs, runs]);
  const selectedOption = useMemo(() => (
    periodOptions.find((option) => option.key === selectedKey) ?? periodOptions.at(-1) ?? null
  ), [periodOptions, selectedKey]);
  const periodSummary = useMemo(
    () => summarizeRunsForPeriod(runs, selectedOption),
    [runs, selectedOption],
  );
  // 기간 그래프 (오너 2026-08-01, 나이키 스타일): 주=요일별, 월=일별, 년=월별.
  const chartModel = useMemo(
    () => buildRunPeriodChartModel(runs, mode, selectedOption, nowMs),
    [mode, nowMs, runs, selectedOption],
  );
  // 나이키의 세 줄: N러닝 · 평균 페이스 · 시간. 평균 페이스는 합산에서 파생.
  const averagePaceLabel = periodSummary.distanceKm > 0 && periodSummary.durationSeconds > 0
    ? formatPaceFromSecondsPerKm(periodSummary.durationSeconds / periodSummary.distanceKm)
    : '--:--/km';
  const handleOpenPicker = useCallback(() => {
    setPickerOpen(true);
  }, []);
  const handleClosePicker = useCallback(() => {
    setPickerOpen(false);
  }, []);
  const handleSelectPeriod = useCallback((key: string) => {
    setSelectedKey(key);
    setPickerOpen(false);
  }, []);
  const periodModeButtons = useMemo(() => periodModes.map((periodMode) => {
    const selected = mode === periodMode.key;
    const handlePress = () => {
      setMode(periodMode.key);
      setSelectedKey(resolveCurrentPeriodKey(periodMode.key, nowMs));
    };

    return (
      <Pressable
        key={periodMode.key}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        onPress={handlePress}
        style={[styles.segmentButton, selected ? styles.segmentButtonActive : null]}
      >
        <Text style={[styles.segmentText, selected ? styles.segmentTextActive : null]}>{periodMode.label}</Text>
      </Pressable>
    );
  }), [mode, nowMs]);

  return (
    <Card style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>ACTIVITY</Text>
          <Text style={styles.sectionTitle}>내 러닝 기록</Text>
        </View>
      </View>

      <View style={styles.segmentRow}>{periodModeButtons}</View>

      <Pressable accessibilityRole="button" onPress={handleOpenPicker} style={styles.periodButton}>
        <Text style={styles.periodLabel}>{selectedOption?.label ?? '기간 선택'}</Text>
        <Text style={styles.periodChevron}>▾</Text>
      </Pressable>

      {/* 나이키 활동 화면 배치 (오너 2026-08-01 확정): 큰 거리 숫자 → 작은 지표 줄 → 그래프 */}
      <View style={styles.heroBlock}>
        <Text style={styles.heroValue}>
          {formatRunPeriodDistanceKm(periodSummary.distanceKm)}
          <Text style={styles.heroUnit}> km</Text>
        </Text>
        <View style={styles.statRow}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{periodSummary.runCount}</Text>
            <Text style={styles.statLabel}>러닝</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{averagePaceLabel}</Text>
            <Text style={styles.statLabel}>평균 페이스</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{formatRunPeriodDurationLabel(periodSummary.durationSeconds)}</Text>
            <Text style={styles.statLabel}>시간</Text>
          </View>
        </View>
      </View>

      <RunPeriodBarChart model={chartModel} />

      <Link href="/my-activity" asChild>
        <Pressable accessibilityRole="button" style={styles.recordButton}>
          <Text style={styles.recordButtonText}>기록 보기</Text>
        </Pressable>
      </Link>
      <RunPeriodPickerSheet
        onClose={handleClosePicker}
        onSelect={handleSelectPeriod}
        options={periodOptions}
        selectedKey={selectedOption?.key ?? selectedKey}
        visible={pickerOpen}
      />
    </Card>
  );
}

export const HomeActivityStatusCard = memo(HomeActivityStatusCardImpl);

const styles = StyleSheet.create({
  card: {
    gap: spacing.s12,
  },
  headerRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.s12,
    justifyContent: 'space-between',
  },
  headerCopy: {
    flex: 1,
    gap: spacing.xxs,
  },
  eyebrow: {
    color: colors.brand,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.extraBold,
    letterSpacing: 0.6,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
  },
  segmentRow: {
    backgroundColor: colors.surfaceSoft,
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  segmentButton: {
    alignItems: 'center',
    borderRadius: radii.pill,
    flex: 1,
    paddingVertical: spacing.s10,
  },
  segmentButtonActive: {
    backgroundColor: colors.inkPill,
  },
  segmentText: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  segmentTextActive: {
    color: colors.white,
  },
  periodButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.brandSoft,
    borderColor: colors.brandSoftBorder,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.s10,
  },
  periodLabel: {
    color: colors.brand,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  periodChevron: {
    color: colors.brand,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  heroBlock: {
    gap: spacing.s10,
    paddingTop: spacing.sm,
  },
  heroValue: {
    color: colors.textPrimary,
    fontSize: 44,
    fontWeight: fontWeights.black,
    letterSpacing: -1,
  },
  heroUnit: {
    color: colors.textSecondary,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
    letterSpacing: 0,
  },
  statRow: {
    flexDirection: 'row',
    gap: spacing.s24,
  },
  stat: {
    gap: spacing.xxs,
  },
  statValue: {
    color: colors.textPrimary,
    fontSize: fontSizes.button,
    fontWeight: fontWeights.extraBold,
  },
  statLabel: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
  },
  recordButton: {
    alignItems: 'center',
    borderTopColor: colors.borderSoft,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.s12,
  },
  recordButtonText: {
    color: colors.brand,
    fontWeight: fontWeights.extraBold,
  },
});
