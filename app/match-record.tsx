import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Link, useFocusEffect } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { fetchMyActivity } from '@/lib/api/services';
import { MyActivityResponse } from '@/lib/api/types';
import { formatDuration } from '@/features/runs/tracking';

export default function MatchRecordScreen() {
  const [activity, setActivity] = useState<MyActivityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadActivity = useCallback(() => {
    setLoading(true);
    setError(null);

    fetchMyActivity()
      .then((data) => setActivity(data))
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : '전적을 불러오지 못했어요.'))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(useCallback(() => {
    loadActivity();
  }, [loadActivity]));

  const matchRuns = useMemo(
    () => (activity?.runs ?? []).filter((run) => run.matchResult),
    [activity],
  );
  const duelRuns = useMemo(
    () => matchRuns.filter((run) => run.matchResult?.mode === 'duel'),
    [matchRuns],
  );
  const groupRuns = useMemo(
    () => matchRuns.filter((run) => run.matchResult?.mode === 'group'),
    [matchRuns],
  );
  const duelWins = duelRuns.filter((run) => run.matchResult?.resultTone === 'win').length;
  const duelLosses = duelRuns.filter((run) => run.matchResult?.resultTone === 'lose').length;
  const duelDraws = duelRuns.filter((run) => run.matchResult?.resultTone === 'draw').length;
  const groupPodiumCount = groupRuns.filter((run) => {
    const rank = run.matchResult?.rank;
    return typeof rank === 'number' && rank <= 3;
  }).length;

  return (
    <Screen>
      <AuthHeader
        title="전적 보기"
        subtitle="매칭과 친구 방 대결 결과를 한 번에 모아봤어요."
        showBack
        backHref="/(tabs)/mypage"
      />

      {loading ? <ActivityIndicator size="large" color="#6D5EF7" /> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {activity ? (
        <>
          <View style={styles.summaryRow}>
            <Card style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>총 대결 수</Text>
              <Text style={styles.summaryValue}>{matchRuns.length}전</Text>
            </Card>
            <Card style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>1대1 전적</Text>
              <Text style={styles.summaryValueSmall}>{duelWins}승 {duelLosses}패 {duelDraws}무</Text>
            </Card>
          </View>

          <Card style={styles.summaryWideCard}>
            <Text style={styles.summaryLabel}>그룹 대결</Text>
            <Text style={styles.summaryValueSmall}>총 {groupRuns.length}전 · 3위 안 {groupPodiumCount}번</Text>
          </Card>

          <Card style={styles.historyCard}>
            <Text style={styles.sectionTitle}>최근 전적</Text>
            {matchRuns.length ? matchRuns.map((run) => {
              const result = run.matchResult!;
              const title = result.mode === 'duel'
                ? `1대1 대결 · ${result.badgeLabel}`
                : `그룹 대결 · ${typeof result.rank === 'number' ? `${result.rank}위` : result.badgeLabel}`;
              const meta = result.mode === 'duel'
                ? `${result.opponentName ?? '상대'} · 페이스 ${run.pace}`
                : `${typeof result.participantCount === 'number' ? `${result.participantCount}명` : '그룹'} · 페이스 ${run.pace}`;
              const detail = [
                typeof run.durationSeconds === 'number' ? `시간 ${formatDuration(run.durationSeconds)}` : null,
                typeof result.gapKm === 'number' ? `거리 차이 ${result.gapKm.toFixed(2)}km` : null,
              ].filter(Boolean).join(' · ');

              return (
                <Link key={run.id} href={{ pathname: '/run-detail', params: { runId: run.id } }} asChild>
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
            }) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>아직 저장된 대결 전적이 없어요.</Text>
                <Text style={styles.emptyText}>매칭이나 친구 방 대결을 저장하면 여기서 바로 볼 수 있어요.</Text>
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
    gap: 10,
  },
  summaryCard: {
    flex: 1,
  },
  summaryWideCard: {
    gap: 6,
  },
  summaryLabel: {
    color: '#667085',
    fontWeight: '700',
  },
  summaryValue: {
    color: '#111827',
    fontSize: 24,
    fontWeight: '800',
  },
  summaryValueSmall: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 24,
  },
  historyCard: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  recordRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EAECF0',
  },
  recordCopy: {
    flex: 1,
    gap: 3,
  },
  recordDate: {
    color: '#6D5EF7',
    fontSize: 12,
    fontWeight: '800',
  },
  recordTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
  },
  recordMeta: {
    color: '#475467',
    lineHeight: 20,
  },
  recordSubMeta: {
    color: '#667085',
    fontSize: 12,
    lineHeight: 18,
  },
  recordBadge: {
    overflow: 'hidden',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  recordBadgeWin: {
    backgroundColor: '#16A34A',
  },
  recordBadgeLose: {
    backgroundColor: '#DC2626',
  },
  recordBadgeNeutral: {
    backgroundColor: '#475467',
  },
  emptyState: {
    paddingTop: 6,
    gap: 6,
  },
  emptyTitle: {
    color: '#111827',
    fontWeight: '800',
  },
  emptyText: {
    color: '#667085',
    lineHeight: 20,
  },
  errorText: {
    color: '#B42318',
    fontWeight: '700',
  },
});
