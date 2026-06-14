import { memo, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { SegmentedTabs } from '@/components/ui/SegmentedTabs';
import { YearMonthFilterRow } from '@/components/ui/YearMonthFilterRow';
import { useMatchRecords } from '@/features/match/hooks/useMatchRecords';
import type { MatchRecordRun } from '@/features/match/utils/matchRecordStats';
import { formatDuration } from '@/features/runs/tracking';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

type MatchModeFilter = 'all' | 'duel' | 'group';

const MATCH_MODE_FILTER_OPTIONS = [
  { key: 'all', label: '전체' },
  { key: 'duel', label: '1대1' },
  { key: 'group', label: '그룹' },
] as const;

const MatchRecordRow = memo(function MatchRecordRow({ run }: { run: MatchRecordRun }) {
  const result = run.matchResult;
  const detail = useMemo(
    () => (result ? buildMatchRecordDetail(run.durationSeconds, result.gapKm) : ''),
    [result, run.durationSeconds],
  );

  if (!result) {
    return null;
  }

  const title = result.mode === 'duel'
    ? `1대1 대결 · ${result.badgeLabel}`
    : `그룹 대결 · ${typeof result.rank === 'number' ? `${result.rank}위` : result.badgeLabel}`;
  const meta = result.mode === 'duel'
    ? `${result.opponentName ?? '상대'} · 페이스 ${run.pace}`
    : `${typeof result.participantCount === 'number' ? `${result.participantCount}명` : '그룹'} · 페이스 ${run.pace}`;
  return (
    <Link href={{ pathname: '/run-detail', params: { runId: run.id } }} asChild>
      <Pressable style={styles.recordRow}>
        <View style={styles.recordCopy}>
          <Text style={styles.recordDate}>{run.date}</Text>
          <Text style={styles.recordTitle}>{title}</Text>
          <Text style={styles.recordMeta}>{meta}</Text>
          {detail ? <Text style={styles.recordSubMeta}>{detail}</Text> : null}
        </View>
        <Text
          style={[
            styles.recordBadge,
            result.resultTone === 'win'
              ? styles.recordBadgeWin
              : result.resultTone === 'lose'
                ? styles.recordBadgeLose
                : styles.recordBadgeNeutral,
          ]}
        >
          {result.badgeLabel}
        </Text>
      </Pressable>
    </Link>
  );
});

function buildMatchRecordDetail(durationSeconds: number | null | undefined, gapKm: number | null | undefined) {
  const detailParts: string[] = [];

  if (typeof durationSeconds === 'number') {
    detailParts.push(`시간 ${formatDuration(durationSeconds)}`);
  }

  if (typeof gapKm === 'number') {
    detailParts.push(`거리 차이 ${gapKm.toFixed(2)}km`);
  }

  return detailParts.join(' · ');
}

export default function MatchRecordScreen() {
  const { activity, error, loading, stats } = useMatchRecords();
  const [modeFilter, setModeFilter] = useState<MatchModeFilter>('all');
  const [yearFilter, setYearFilter] = useState<string | null>(null);
  const [monthFilter, setMonthFilter] = useState<string>('all');

  // Years present in the records, newest first; the active year follows the user's pick
  // and falls back to the newest year so it stays valid as data loads/changes. When there
  // are no official 전적 records yet, fall back to the current year so the year/month picker
  // still shows (otherwise it would hide itself and look like nothing changed).
  const availableYears = useMemo(() => {
    const recordYears = Array.from(new Set(stats.matchRuns.map((run) => run.date.slice(0, 4))))
      .sort((a, b) => b.localeCompare(a));
    return recordYears.length > 0 ? recordYears : [String(new Date().getFullYear())];
  }, [stats.matchRuns]);
  const selectedYear = (yearFilter && availableYears.includes(yearFilter))
    ? yearFilter
    : (availableYears[0] ?? null);

  const visibleMatchRuns = useMemo(
    () => stats.matchRuns.filter((run) => {
      if (selectedYear && run.date.slice(0, 4) !== selectedYear) {
        return false;
      }
      if (monthFilter !== 'all' && run.date.slice(5, 7) !== monthFilter) {
        return false;
      }
      if (modeFilter !== 'all' && run.matchResult?.mode !== modeFilter) {
        return false;
      }
      return true;
    }),
    [modeFilter, monthFilter, selectedYear, stats.matchRuns],
  );
  const noMatchesAtAll = stats.matchRuns.length === 0;
  const emptyTitle = noMatchesAtAll ? '아직 저장된 대결 전적이 없어요.' : '해당 전적이 없어요.';
  const emptyText = noMatchesAtAll
    ? null
    : '다른 연도·월이나 전적 필터를 선택해보세요.';

  return (
    <Screen>
      <AuthHeader
        title="전적 보기"
        showBack
        backHref="/(tabs)/mypage"
      />

      {loading ? <ActivityIndicator size="large" color={colors.brand} /> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {activity ? (
        <>
          <View style={styles.summaryRow}>
            <Card style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>총 대결 수</Text>
              <Text style={styles.summaryValue}>{stats.matchRuns.length}전</Text>
            </Card>
            <Card style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>1대1 전적</Text>
              <Text style={styles.summaryValueSmall}>{stats.duelWins}승 {stats.duelLosses}패 {stats.duelDraws}무</Text>
            </Card>
          </View>

          <Card style={styles.summaryWideCard}>
            <Text style={styles.summaryLabel}>그룹 대결</Text>
            <Text style={styles.summaryValueSmall}>총 {stats.groupRuns.length}전 · 3위 안 {stats.groupPodiumCount}번</Text>
          </Card>

          <Card style={styles.historyCard}>
            <Text style={styles.sectionTitle}>최근 전적</Text>
            <YearMonthFilterRow
              availableYears={availableYears}
              selectedYear={selectedYear}
              monthFilter={monthFilter}
              onSelectYear={(year) => setYearFilter(year)}
              onSelectMonth={(month) => setMonthFilter(month)}
            />
            <SegmentedTabs
              options={MATCH_MODE_FILTER_OPTIONS}
              value={modeFilter}
              onChange={setModeFilter}
            />
            {visibleMatchRuns.length ? (
              visibleMatchRuns.map((run) => (
                <MatchRecordRow key={run.id} run={run} />
              ))
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>{emptyTitle}</Text>
                {emptyText ? <Text style={styles.emptyText}>{emptyText}</Text> : null}
              </View>
            )}
          </Card>
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
  summaryWideCard: {
    gap: spacing.lg,
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
  summaryValueSmall: {
    color: colors.textPrimary,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
    lineHeight: 24,
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.s12,
    paddingVertical: spacing.s12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSoft,
  },
  recordCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  recordDate: {
    color: colors.brand,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  recordTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.button,
    fontWeight: fontWeights.extraBold,
  },
  recordMeta: {
    color: colors.textMuted,
    lineHeight: 20,
  },
  recordSubMeta: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    lineHeight: 18,
  },
  recordBadge: {
    overflow: 'hidden',
    borderRadius: radii.pill,
    paddingHorizontal: spacing.s10,
    paddingVertical: spacing.lg,
    color: colors.white,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.extraBold,
  },
  recordBadgeWin: {
    backgroundColor: colors.green,
  },
  recordBadgeLose: {
    backgroundColor: colors.dangerVivid,
  },
  recordBadgeNeutral: {
    backgroundColor: colors.textMuted,
  },
  emptyState: {
    paddingTop: spacing.lg,
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
  errorText: {
    color: colors.danger,
    fontWeight: fontWeights.bold,
  },
});
