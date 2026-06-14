import { memo, useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Link, router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { SegmentedTabs } from '@/components/ui/SegmentedTabs';
import { YearMonthFilterRow } from '@/components/ui/YearMonthFilterRow';
import { useMyActivity } from '@/features/profile/hooks/useMyActivity';
import type { ActivityRun } from '@/features/profile/hooks/useMyActivity';
import { getRunKind } from '@/features/runs/utils/runKind';
import type { RunKind } from '@/features/runs/utils/runKind';
import { getRunSourceLabel } from '@/features/runs/utils/sourceLabel';
import { colors, spacing, fontSizes, fontWeights } from '@/theme/tokens';

type ActivityKindFilter = 'all' | RunKind;
type ActivityModeFilter = 'all' | 'duel' | 'group';

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
  const [monthFilter, setMonthFilter] = useState<string>('all');
  const showModeFilter = kindFilter === 'party' || kindFilter === 'match';
  const handleKindChange = useCallback((next: ActivityKindFilter) => {
    setKindFilter(next);
    setModeFilter('all');
  }, []);

  // Years present in the records, newest first. The active year follows the user's pick
  // when it's still available, otherwise it falls back to the newest year — so it stays
  // valid as data loads or changes without needing a sync effect. With no records yet,
  // fall back to the current year so the year/month picker still shows.
  const availableYears = useMemo(() => {
    const recordYears = Array.from(new Set(activityRuns.map((run) => run.date.slice(0, 4))))
      .sort((a, b) => b.localeCompare(a));
    return recordYears.length > 0 ? recordYears : [String(new Date().getFullYear())];
  }, [activityRuns]);
  const selectedYear = (yearFilter && availableYears.includes(yearFilter))
    ? yearFilter
    : (availableYears[0] ?? null);

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
            <YearMonthFilterRow
              availableYears={availableYears}
              selectedYear={selectedYear}
              monthFilter={monthFilter}
              onSelectYear={(year) => setYearFilter(year)}
              onSelectMonth={(month) => setMonthFilter(month)}
            />
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
