import { memo, useCallback, useMemo, useState } from 'react';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import type { MyRunRecord } from '@/domain';
import { RunPeriodPickerSheet } from '@/features/home/components/overview/RunPeriodPickerSheet';
import { selectRecentRuns } from '@/features/home/utils/homeRecentRuns';
import {
  buildRunPeriodOptions,
  formatRunPeriodDistanceKm,
  formatRunPeriodDurationLabel,
  resolveCurrentPeriodKey,
  summarizeRunsForPeriod,
  type RunPeriodMode,
} from '@/features/home/utils/runPeriodSummary';
import { getRunSourceLabel } from '@/features/runs/utils/sourceLabel';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

type HomeActivityStatusCardProps = {
  runs: MyRunRecord[];
};

const periodModes: { key: RunPeriodMode; label: string }[] = [
  { key: 'week', label: '주' },
  { key: 'month', label: '월' },
  { key: 'year', label: '년' },
];

const HomeActivityRunRow = memo(function HomeActivityRunRow({ run }: { run: MyRunRecord }) {
  return (
    <Link href={{ pathname: '/run-detail', params: { runId: run.id } }} asChild>
      <Pressable style={styles.recordRow}>
        <View style={styles.recordMeta}>
          <Text style={styles.recordDate}>{run.date}</Text>
          <Text style={styles.recordDetail}>
            {run.distanceKm}km · 페이스 {run.pace} · {getRunSourceLabel(run)}
          </Text>
        </View>
        <Text style={styles.recordLink}>보기</Text>
      </Pressable>
    </Link>
  );
});

function HomeActivityStatusCardImpl({ runs }: HomeActivityStatusCardProps) {
  const [expanded, setExpanded] = useState(false);
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
  const recentRuns = useMemo(() => selectRecentRuns(runs), [runs]);
  const recentRunRows = useMemo(() => recentRuns.map((run) => (
    <HomeActivityRunRow key={run.id} run={run} />
  )), [recentRuns]);
  const handleToggleExpanded = useCallback(() => {
    setExpanded((current) => !current);
  }, []);
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

      <View style={styles.summaryPanel}>
        <Text style={styles.distanceValue}>{formatRunPeriodDistanceKm(periodSummary.distanceKm)}km</Text>
        <Text style={styles.summaryText}>
          러닝 {periodSummary.runCount}회 · 시간 {formatRunPeriodDurationLabel(periodSummary.durationSeconds)}
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={handleToggleExpanded}
        style={styles.detailToggleButton}
      >
        <Text style={styles.detailToggleText}>{expanded ? '최근 기록 접기' : '최근 기록 자세히'}</Text>
      </Pressable>

      {expanded ? (
        <View style={styles.detailPanel}>
          {recentRuns.length > 0 ? (
            <View>{recentRunRows}</View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>아직 저장된 러닝 기록이 없어.</Text>
              <Text style={styles.emptyText}>혼자 뛰거나 앱을 연동하면 여기에 기록이 쌓여.</Text>
            </View>
          )}
          <Link href="/my-activity" asChild>
            <Pressable accessibilityRole="button" style={styles.fullLinkButton}>
              <Text style={styles.fullLinkText}>전체 보기</Text>
            </Pressable>
          </Link>
        </View>
      ) : null}
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
    backgroundColor: colors.textPrimary,
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
  summaryPanel: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.s10,
  },
  distanceValue: {
    color: colors.textPrimary,
    fontSize: 34,
    fontWeight: fontWeights.extraBold,
  },
  summaryText: {
    color: colors.textSecondary,
    fontWeight: fontWeights.bold,
  },
  detailToggleButton: {
    alignItems: 'center',
    borderTopColor: colors.borderSoft,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.s12,
  },
  detailToggleText: {
    color: colors.brand,
    fontWeight: fontWeights.extraBold,
  },
  detailPanel: {
    borderTopColor: colors.borderSoft,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.s12,
    paddingTop: spacing.s12,
  },
  recordRow: {
    alignItems: 'center',
    borderBottomColor: colors.borderSoft,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.s12,
    justifyContent: 'space-between',
    paddingVertical: spacing.s12,
  },
  recordMeta: {
    flex: 1,
    gap: spacing.xxs,
  },
  recordDate: {
    color: colors.textPrimary,
    fontWeight: fontWeights.bold,
  },
  recordDetail: {
    color: colors.textSecondary,
    lineHeight: 20,
  },
  recordLink: {
    color: colors.brand,
    fontWeight: fontWeights.extraBold,
  },
  emptyState: {
    gap: spacing.sm,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontWeight: fontWeights.extraBold,
  },
  emptyText: {
    color: colors.textSecondary,
    lineHeight: 20,
  },
  fullLinkButton: {
    alignItems: 'center',
    borderTopColor: colors.borderSoft,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.s12,
  },
  fullLinkText: {
    color: colors.brand,
    fontWeight: fontWeights.extraBold,
  },
});
