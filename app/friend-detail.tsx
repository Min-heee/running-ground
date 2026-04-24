import { useCallback, useState } from 'react';
import { StyleSheet, Text, View, Pressable, ActivityIndicator } from 'react-native';
import { Link, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { fetchFriendActivity } from '@/lib/api/services';
import { FriendActivityResponse } from '@/lib/api/types';

function formatRefreshTime(timestamp: string | null) {
  if (!timestamp) {
    return '방금 갱신 대기 중';
  }

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return '방금 갱신';
  }

  const hours = `${date.getHours()}`.padStart(2, '0');
  const minutes = `${date.getMinutes()}`.padStart(2, '0');
  return `${hours}:${minutes} 기준`;
}

export default function FriendDetailScreen() {
  const { friendId } = useLocalSearchParams<{ friendId?: string }>();
  const [activity, setActivity] = useState<FriendActivityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);

  const loadActivity = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setLoading(true);
      setError(null);
    }

    try {
      const data = await fetchFriendActivity(friendId);
      setActivity(data);
      setLastRefreshedAt(new Date().toISOString());
      if (showLoading) {
        setError(null);
      }
    } catch (loadError) {
      if (showLoading) {
        setError(loadError instanceof Error ? loadError.message : '친구 활동 정보를 불러오지 못했어.');
      }
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }, [friendId]);

  useFocusEffect(useCallback(() => {
    void loadActivity(true);

    const refreshInterval = setInterval(() => {
      void loadActivity(false);
    }, 20000);

    return () => clearInterval(refreshInterval);
  }, [loadActivity]));

  return (
    <Screen>
      {loading ? <ActivityIndicator size="large" color="#6D5EF7" /> : null}
      {error ? <Text>{error}</Text> : null}

      {activity ? (
        <>
          <AuthHeader
            title="친구 활동"
            subtitle={activity.friend.isRunningNow
              ? `${activity.friend.name} 님이 지금 달리는 중이라 최근 기록과 실시간 위치 공유 상태를 함께 볼 수 있어요.`
              : `${activity.friend.name}가 최근에 뛴 기록과 이번 달 누적 거리를 볼 수 있어.`}
            showBack
            backHref="/(tabs)/friends"
          />

          <Card style={styles.heroCard}>
            <Text style={styles.heroLabel}>친구 프로필</Text>
            <Text style={styles.heroTitle}>{activity.friend.name}</Text>
            <Text style={styles.heroTag}>{activity.friend.tag}</Text>
          </Card>

          {activity.friend.isRunningNow ? (
            <Card style={styles.liveCard}>
              <View style={styles.liveHeader}>
                <View style={styles.liveBadge}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveBadgeText}>러닝 중</Text>
                </View>
                <Text style={styles.liveRefreshText}>{formatRefreshTime(lastRefreshedAt)}</Text>
              </View>
              <Text style={styles.liveLocation}>{activity.friend.liveLocationLabel ?? '현재 위치 근처'}</Text>
              <Text style={styles.liveHint}>
                정확한 좌표 대신 동네 단위로만 보여드리고, 이 화면은 20초마다 자동으로 새로고침돼요.
              </Text>
            </Card>
          ) : null}

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
  liveCard: {
    backgroundColor: '#ECFDF3',
    gap: 10,
  },
  liveHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#D1FADF',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#12B76A',
  },
  liveBadgeText: {
    color: '#067647',
    fontSize: 12,
    fontWeight: '800',
    includeFontPadding: false,
  },
  liveRefreshText: {
    color: '#027A48',
    fontSize: 12,
    fontWeight: '700',
    includeFontPadding: false,
  },
  liveLocation: {
    color: '#111827',
    fontSize: 24,
    fontWeight: '800',
    includeFontPadding: false,
  },
  liveHint: {
    color: '#027A48',
    lineHeight: 20,
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
