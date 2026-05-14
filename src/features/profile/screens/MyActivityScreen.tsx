import { memo, useCallback } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ListRenderItem } from 'react-native';
import { Link, router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { ActivityRun, useMyActivity } from '@/features/profile/hooks/useMyActivity';
import { getRunSourceLabel } from '@/features/runs/utils/sourceLabel';

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
  const keyExtractor = useCallback((run: ActivityRun) => run.id, []);
  const renderRunItem = useCallback<ListRenderItem<ActivityRun>>(({ item }) => (
    <ActivityRunRow run={item} />
  ), []);

  return (
    <Screen>
      <AuthHeader
        title="내 활동"
        subtitle="내가 최근에 뛴 기록과 이번 달 누적 거리를 볼 수 있어."
        showBack
        backHref="/(tabs)/mypage"
      />

      {loading ? <ActivityIndicator size="large" color="#6D5EF7" /> : null}
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

          <Card>
            <Text style={styles.sectionTitle}>최근 러닝 기록</Text>
            {activityRuns.length > 0 ? (
              <FlatList
                data={activityRuns}
                keyExtractor={keyExtractor}
                renderItem={renderRunItem}
                scrollEnabled={false}
                initialNumToRender={10}
                maxToRenderPerBatch={10}
              />
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>아직 저장된 러닝 기록이 없어.</Text>
                <Text style={styles.emptyText}>첫 기록을 추가하면 홈 게이지와 친구 순위가 바로 움직이기 시작해.</Text>
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
    gap: 10,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  summaryCard: {
    flex: 1,
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  recordRow: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EAECF0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  recordMeta: {
    gap: 2,
    flex: 1,
  },
  recordDate: {
    color: '#111827',
    fontWeight: '700',
  },
  recordDetail: {
    color: '#667085',
  },
  recordLink: {
    color: '#6D5EF7',
    fontWeight: '800',
  },
  emptyState: {
    paddingTop: 10,
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
});
