import { memo, useCallback, useMemo, useState } from 'react';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import type { MyRunRecord } from '@/domain';
import { RunPeriodPickerSheet } from '@/features/home/components/overview/RunPeriodPickerSheet';
import { buildRunPeriodBars, type RunPeriodBar } from '@/features/home/utils/runPeriodBars';
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
  // 기간 그래프 (오너 2026-08-01): 주=요일별, 월=1~12월, 년=연도별 거리 막대.
  const periodBars = useMemo(
    () => buildRunPeriodBars(runs, mode, selectedOption, nowMs),
    [mode, nowMs, runs, selectedOption],
  );
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

      <RunPeriodBarChart bars={periodBars} />

      <View style={styles.metricRow}>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>거리</Text>
          <Text style={styles.metricValue}>{formatRunPeriodDistanceKm(periodSummary.distanceKm)}km</Text>
        </View>
        <View style={styles.metricDivider} />
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>횟수</Text>
          <Text style={styles.metricValue}>{periodSummary.runCount}회</Text>
        </View>
        <View style={styles.metricDivider} />
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>시간</Text>
          <Text style={styles.metricValue}>{formatRunPeriodDurationLabel(periodSummary.durationSeconds)}</Text>
        </View>
      </View>

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

// 혼자 탭 H안에서 확정했던 막대 스타일 그대로: 기록 있는 칸은 브랜드 라이트, '지금' 칸은
// 브랜드 진하게, 지금인데 비어 있으면 브랜드 워시 테두리(오늘 아직 안 뛰었다는 신호),
// 나머지 빈 칸은 낮은 회색. 최대 막대를 기준으로 상대 높이.
const BAR_MAX_HEIGHT = 64;
const BAR_EMPTY_HEIGHT = 6;

const RunPeriodBarChart = memo(function RunPeriodBarChart({ bars }: { bars: RunPeriodBar[] }) {
  if (!bars.length) {
    return null;
  }

  const maxDistanceKm = Math.max(...bars.map((bar) => bar.distanceKm));

  return (
    <View style={styles.barRow}>
      {bars.map((bar) => {
        const ratio = maxDistanceKm > 0 ? bar.distanceKm / maxDistanceKm : 0;
        const barHeight = bar.distanceKm > 0
          ? Math.max(BAR_EMPTY_HEIGHT, Math.round(ratio * BAR_MAX_HEIGHT))
          : BAR_EMPTY_HEIGHT;

        return (
          <View key={bar.key} style={styles.barColumn}>
            <View
              style={[
                styles.bar,
                { height: barHeight },
                bar.distanceKm > 0
                  ? (bar.isCurrent ? styles.barCurrent : styles.barFilled)
                  : (bar.isCurrent ? styles.barCurrentEmpty : styles.barEmpty),
              ]}
            />
            <Text style={bar.isCurrent ? styles.barLabelCurrent : styles.barLabel} numberOfLines={1}>
              {bar.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
});

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
  barRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    height: BAR_MAX_HEIGHT + 22,
    paddingTop: spacing.xxl,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xxs,
  },
  bar: {
    width: '100%',
    borderRadius: radii.xs,
  },
  barFilled: {
    backgroundColor: colors.brandLight,
  },
  barCurrent: {
    backgroundColor: colors.brand,
  },
  barEmpty: {
    backgroundColor: colors.borderMuted,
  },
  barCurrentEmpty: {
    backgroundColor: colors.brandWash,
    borderWidth: 1,
    borderColor: colors.brandSoftBorder,
  },
  barLabel: {
    color: colors.textTertiary,
    fontSize: fontSizes.xxs,
  },
  barLabelCurrent: {
    color: colors.brand,
    fontSize: fontSizes.xxs,
    fontWeight: fontWeights.extraBold,
  },
  metricRow: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingVertical: spacing.s10,
  },
  metric: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.sm,
  },
  metricLabel: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
  },
  metricValue: {
    color: colors.textPrimary,
    fontSize: fontSizes.metric,
    fontWeight: fontWeights.extraBold,
  },
  metricDivider: {
    backgroundColor: colors.borderMuted,
    height: 32,
    width: 1,
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
