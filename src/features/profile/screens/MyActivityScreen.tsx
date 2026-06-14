import { memo, useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Link, router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { SegmentedTabs } from '@/components/ui/SegmentedTabs';
import { RunPeriodPickerSheet } from '@/features/home/components/overview/RunPeriodPickerSheet';
import { useMyActivity } from '@/features/profile/hooks/useMyActivity';
import type { ActivityRun } from '@/features/profile/hooks/useMyActivity';
import { getRunKind } from '@/features/runs/utils/runKind';
import type { RunKind } from '@/features/runs/utils/runKind';
import { getRunSourceLabel } from '@/features/runs/utils/sourceLabel';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

type ActivityKindFilter = 'all' | RunKind;
type ActivityModeFilter = 'all' | 'duel' | 'group';
type ActivityMonthFilter = 'all' | string;
type ActivePicker = 'year' | 'month' | null;

const ACTIVITY_KIND_FILTER_OPTIONS = [
  { key: 'all', label: '전체' },
  { key: 'solo', label: '혼자러닝' },
  { key: 'party', label: '파티런' },
  { key: 'match', label: '매칭대결' },
] as const;

const ACTIVITY_MODE_FILTER_OPTIONS = [
  { key: 'all', label: '전체' },
  { key: 'duel', label: '1대1' },
  { key: 'group', label: '그룹' },
] as const;

// '전체' + 1월~12월. Keys are the zero-padded month strings that match run.date (YYYY-MM-DD).
const ACTIVITY_MONTH_FILTER_OPTIONS: readonly { key: ActivityMonthFilter; label: string }[] = [
  { key: 'all', label: '전체' },
  ...Array.from({ length: 12 }, (_, index) => {
    const month = String(index + 1).padStart(2, '0');
    return { key: month, label: `${index + 1}월` };
  }),
];

const ActivityRunRow = memo(function ActivityRunRow({ run }: { run: ActivityRun }) {
  return (
    <Link href={{ pathname: '/run-detail', params: { runId: run.id } }} asChild>
      <Pressable style={styles.recordRow}>
        <View style={styles.recordMeta}>
          <Text style={styles.recordDate}>{run.date}</Text>
          <Text style={styles.recordDetail}>{run.distanceKm}km · 페이스 {run.pace} · {getRunSourceLabel(run)}</Text>
        </View>
        <Text style={styles.recordLink}>보기</Text>
      </Pressable>
    </Link>
  );
});

export default function MyActivityScreen() {
  const { activity, activityRuns, error, loading } = useMyActivity();
  const [kindFilter, setKindFilter] = useState<ActivityKindFilter>('all');
  const [modeFilter, setModeFilter] = useState<ActivityModeFilter>('all');
  const [yearFilter, setYearFilter] = useState<string | null>(null);
  const [monthFilter, setMonthFilter] = useState<ActivityMonthFilter>('all');
  const [activePicker, setActivePicker] = useState<ActivePicker>(null);
  const showModeFilter = kindFilter === 'party' || kindFilter === 'match';
  const handleKindChange = useCallback((next: ActivityKindFilter) => {
    setKindFilter(next);
    setModeFilter('all');
  }, []);

  // Years present in the records, newest first. The active year follows the user's pick
  // when it's still available, otherwise it falls back to the newest year — so it stays
  // valid as data loads or changes without needing a sync effect.
  const availableYears = useMemo(
    () => Array.from(new Set(activityRuns.map((run) => run.date.slice(0, 4))))
      .sort((a, b) => b.localeCompare(a)),
    [activityRuns],
  );
  const selectedYear = (yearFilter && availableYears.includes(yearFilter))
    ? yearFilter
    : (availableYears[0] ?? null);
  const yearOptions = useMemo(
    () => availableYears.map((year) => ({ key: year, label: `${year}년` })),
    [availableYears],
  );
  const selectedMonthLabel = ACTIVITY_MONTH_FILTER_OPTIONS.find((option) => option.key === monthFilter)?.label ?? '전체';

  const visibleRuns = useMemo(() => {
    const periodRuns = activityRuns.filter((run) => {
      if (selectedYear && run.date.slice(0, 4) !== selectedYear) {
        return false;
      }
      if (monthFilter !== 'all' && run.date.slice(5, 7) !== monthFilter) {
        return false;
      }
      return true;
    });

    const baseRuns = kindFilter === 'all'
      ? periodRuns
      : periodRuns.filter((run) => getRunKind(run) === kindFilter);

    if (!showModeFilter || modeFilter === 'all') {
      return baseRuns;
    }

    return baseRuns.filter((run) => run.matchResult?.mode === modeFilter);
  }, [activityRuns, kindFilter, modeFilter, monthFilter, selectedYear, showModeFilter]);
  const noRunsAtAll = activityRuns.length === 0;
  const emptyTitle = noRunsAtAll
    ? '아직 저장된 러닝 기록이 없어.'
    : '해당 조건의 기록이 없어.';
  const emptyText = noRunsAtAll
    ? '첫 기록을 추가하면 홈 게이지와 친구 순위가 바로 움직이기 시작해.'
    : '다른 연도·월이나 종류를 선택해봐.';

  const handlePickerSelect = useCallback((key: string) => {
    setActivePicker((picker) => {
      if (picker === 'year') {
        setYearFilter(key);
      } else if (picker === 'month') {
        setMonthFilter(key);
      }
      return null;
    });
  }, []);
  const closePicker = useCallback(() => setActivePicker(null), []);

  return (
    <Screen>
      <AuthHeader
        title="내 활동"
        showBack
        backHref="/(tabs)/mypage"
      />

      {loading ? <ActivityIndicator size="large" color={colors.brand} /> : null}
      {error ? <Text>{error}</Text> : null}

      {activity ? (
        <>
          <View style={styles.summaryRow}>
            <Card style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>이번 달 총 거리</Text>
              <Text style={styles.summaryValue}>{activity.monthlyDistanceKm}km</Text>
            </Card>
            <Card style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>이번 달 포인트</Text>
              <Text style={styles.summaryValue}>{activity.monthlyPoints}P</Text>
            </Card>
          </View>

          <Card style={styles.historyCard}>
            <Text style={styles.sectionTitle}>최근 러닝 기록</Text>
            {availableYears.length > 0 ? (
              <View style={styles.periodRow}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setActivePicker('year')}
                  style={styles.periodButton}
                >
                  <Text style={styles.periodLabel}>{selectedYear ? `${selectedYear}년` : '년도'}</Text>
                  <Text style={styles.periodChevron}>▾</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setActivePicker('month')}
                  style={styles.periodButton}
                >
                  <Text style={styles.periodLabel}>{selectedMonthLabel}</Text>
                  <Text style={styles.periodChevron}>▾</Text>
                </Pressable>
              </View>
            ) : null}
            <SegmentedTabs
              options={ACTIVITY_KIND_FILTER_OPTIONS}
              value={kindFilter}
              onChange={handleKindChange}
            />
            {showModeFilter ? (
              <SegmentedTabs
                options={ACTIVITY_MODE_FILTER_OPTIONS}
                value={modeFilter}
                onChange={setModeFilter}
              />
            ) : null}
            {visibleRuns.length > 0 ? (
              visibleRuns.map((run) => (
                <ActivityRunRow key={run.id} run={run} />
              ))
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>{emptyTitle}</Text>
                <Text style={styles.emptyText}>{emptyText}</Text>
              </View>
            )}
          </Card>

          <SecondaryButton label="마이페이지로 돌아가기" onPress={() => router.replace('/(tabs)/mypage')} />

          <RunPeriodPickerSheet
            visible={activePicker !== null}
            title={activePicker === 'year' ? '년도 선택' : '월 선택'}
            options={activePicker === 'year' ? yearOptions : ACTIVITY_MONTH_FILTER_OPTIONS}
            selectedKey={activePicker === 'year' ? (selectedYear ?? '') : monthFilter}
            onSelect={handlePickerSelect}
            onClose={closePicker}
          />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  summaryRow: {
    flexDirection: 'row',
    gap: spacing.s10,
  },
  summaryCard: {
    flex: 1,
  },
  summaryLabel: {
    color: colors.textSecondary,
    fontWeight: fontWeights.bold,
  },
  summaryValue: {
    color: colors.textPrimary,
    fontSize: fontSizes.summaryValue,
    fontWeight: fontWeights.extraBold,
  },
  historyCard: {
    gap: spacing.s10,
  },
  periodRow: {
    flexDirection: 'row',
    gap: spacing.s10,
  },
  periodButton: {
    alignItems: 'center',
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
  sectionTitle: {
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
    color: colors.textPrimary,
  },
  recordRow: {
    paddingVertical: spacing.s12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSoft,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.s12,
  },
  recordMeta: {
    gap: spacing.xxs,
    flex: 1,
  },
  recordDate: {
    color: colors.textPrimary,
    fontWeight: fontWeights.bold,
  },
  recordDetail: {
    color: colors.textSecondary,
  },
  recordLink: {
    color: colors.brand,
    fontWeight: fontWeights.extraBold,
  },
  emptyState: {
    paddingTop: spacing.s10,
    gap: spacing.lg,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontWeight: fontWeights.extraBold,
  },
  emptyText: {
    color: colors.textSecondary,
    lineHeight: 20,
  },
});
