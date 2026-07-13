import { memo, useCallback, useMemo, useState } from 'react';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import type { MyRunRecord } from '@/domain';
import { RunPeriodPickerSheet } from '@/features/home/components/overview/RunPeriodPickerSheet';
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
