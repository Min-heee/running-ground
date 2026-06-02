import { memo, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Link, router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { SegmentedTabs } from '@/components/ui/SegmentedTabs';
import { useMyActivity } from '@/features/profile/hooks/useMyActivity';
import type { ActivityRun } from '@/features/profile/hooks/useMyActivity';
import { getRunKind } from '@/features/runs/utils/runKind';
import type { RunKind } from '@/features/runs/utils/runKind';
import { getRunSourceLabel } from '@/features/runs/utils/sourceLabel';
import { colors, spacing, fontSizes, fontWeights } from '@/theme/tokens';

type ActivityKindFilter = 'all' | RunKind;

const ACTIVITY_KIND_FILTER_OPTIONS = [
  { key: 'all', label: '전체' },
  { key: 'solo', label: '혼자러닝' },
  { key: 'party', label: '파티런' },
  { key: 'match', label: '매칭대결' },
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
  const visibleRuns = useMemo(
    () => kindFilter === 'all'
      ? activityRuns
      : activityRuns.filter((run) => getRunKind(run) === kindFilter),
    [activityRuns, kindFilter],
  );
  const emptyTitle = kindFilter === 'all' ? '아직 저장된 러닝 기록이 없어.' : '해당 종류의 기록이 없어.';
  const emptyText = kindFilter === 'all'
    ? '첫 기록을 추가하면 홈 게이지와 친구 순위가 바로 움직이기 시작해.'
    : '전체를 선택하거나 다른 종류의 기록을 확인해봐.';

  return (
    <Screen>
      <AuthHeader
        title="내 활동"
        subtitle="내가 최근에 뛴 기록과 이번 달 누적 거리를 볼 수 있어."
        showBack
        backHref="/(tabs)/mypage"
      />

      {loading ? <ActivityIndicator size="large" color={colors.brand} /> : null}
      {error ? <Text>{error}</Text> : null}

      {activity ? (
        <>
          <View style={styles.actionColumn}>
            <PrimaryButton label="런닝 탭으로 이동" onPress={() => router.push('/(tabs)/running')} />
            <SecondaryButton label="수동 기록 추가" onPress={() => router.push('/add-run')} />
          </View>

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
            <SegmentedTabs
              options={ACTIVITY_KIND_FILTER_OPTIONS}
              value={kindFilter}
              onChange={setKindFilter}
            />
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
  actionColumn: {
    gap: spacing.s10,
  },
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
    fontSize: 24,
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
