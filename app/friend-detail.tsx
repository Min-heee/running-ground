import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, Pressable, ActivityIndicator } from 'react-native';
import { Link, router, useLocalSearchParams } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { fetchFriendActivity } from '@/lib/api/services';
import { FriendActivityResponse } from '@/lib/api/types';

export default function FriendDetailScreen() {
  const { friendId } = useLocalSearchParams<{ friendId?: string }>();
  const [activity, setActivity] = useState<FriendActivityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchFriendActivity(friendId)
      .then((data) => setActivity(data))
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : '친구 활동 정보를 불러오지 못했어.'))
      .finally(() => setLoading(false));
  }, [friendId]);

  return (
    <Screen>
      {loading ? <ActivityIndicator size="large" color="#6D5EF7" /> : null}
      {error ? <Text>{error}</Text> : null}

      {activity ? (
        <>
          <AuthHeader
            title="친구 활동"
            subtitle={`${activity.friend.name}가 최근에 뛴 기록과 이번 달 누적 거리를 볼 수 있어.`}
            showBack
            backHref="/(tabs)/friends"
          />

          <Card style={styles.heroCard}>
            <Text style={styles.heroLabel}>친구 프로필</Text>
            <Text style={styles.heroTitle}>{activity.friend.name}</Text>
            <Text style={styles.heroTag}>{activity.friend.tag}</Text>
          </Card>

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
            {activity.runs.map((run) => (
              <Link
                key={run.id}
                href={{ pathname: '/run-detail', params: { runId: run.id, friendId: activity.friend.id } }}
                asChild
              >
                <Pressable style={styles.recordRow}>
                  <View style={styles.recordMeta}>
                    <Text style={styles.recordDate}>{run.date}</Text>
                    <Text style={styles.recordDetail}>{run.distanceKm}km · 페이스 {run.pace}</Text>
                  </View>
                  <Text style={styles.recordLink}>보기</Text>
                </Pressable>
              </Link>
            ))}
          </Card>

          <SecondaryButton label="친구 화면으로 돌아가기" onPress={() => router.replace('/(tabs)/friends')} />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    backgroundColor: '#111827',
    gap: 8,
  },
  heroLabel: {
    color: '#C7D2FE',
    fontSize: 12,
    fontWeight: '700',
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
  },
  heroTag: {
    color: '#98A2B3',
    fontWeight: '700',
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
});
