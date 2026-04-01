import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, Pressable, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { FriendsRanking } from '@/features/friends/FriendsRanking';
import { fetchFriendLeaderboard, fetchMyProfile } from '@/lib/api/services';
import { FriendLeaderboardResponse, MyProfileResponse } from '@/lib/api/types';
import { InfoCard } from '@/components/ui/InfoCard';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/Card';
import { FriendRequest } from '@/domain/types';

export default function FriendsScreen() {
  const [leaderboard, setLeaderboard] = useState<FriendLeaderboardResponse | null>(null);
  const [profile, setProfile] = useState<MyProfileResponse | null>(null);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchFriendLeaderboard(), fetchMyProfile()])
      .then(([leaderboardData, profileData]) => {
        setLeaderboard(leaderboardData);
        setProfile(profileData);
        setRequests(leaderboardData.requests);
      })
      .catch(() => setError('친구 정보를 불러오지 못했어.'))
      .finally(() => setLoading(false));
  }, []);

  const pending = useMemo(() => requests.filter((request) => request.status === 'pending'), [requests]);
  const received = useMemo(() => requests.filter((request) => request.status === 'received'), [requests]);
  const accepted = useMemo(() => requests.filter((request) => request.status === 'accepted'), [requests]);

  const handleAccept = (requestId: string) => {
    setRequests((prev) => prev.map((request) => (
      request.id === requestId ? { ...request, status: 'accepted' } : request
    )));
  };

  return (
    <Screen>
      <View style={styles.headerWrap}>
        <PageHeader title="친구 랭킹" subtitle="친구들과 주간 거리와 포인트를 비교해볼 수 있어." />
        <Pressable style={styles.addButton} onPress={() => router.push('/add-friend')}>
          <Text style={styles.addButtonText}>친구 추가하기</Text>
        </Pressable>
      </View>

      {loading ? <ActivityIndicator size="large" color="#6D5EF7" /> : null}
      {error ? <Text>{error}</Text> : null}

      {leaderboard && profile ? (
        <>
          <Card style={styles.heroRankingCard}>
            <Text style={styles.heroLabel}>이번 주 메인 경쟁</Text>
            <Text style={styles.heroTitle}>친구 경쟁 순위표</Text>
            <Text style={styles.heroSub}>가장 많이 뛰고, 가장 높은 포인트를 쌓은 친구가 위로 올라가.</Text>
          </Card>

          <FriendsRanking ranks={leaderboard.ranks} />

          <InfoCard title="내 태그">{`${profile.publicTag} · 친구에게 공유해서 쉽게 추가할 수 있어.`}</InfoCard>

          <Card>
            <Text style={styles.sectionTitle}>친구 요청 상태</Text>
            {received.map((request) => (
              <View key={request.id} style={styles.requestRow}>
                <View style={styles.requestMeta}>
                  <Text style={styles.requestName}>{request.name}</Text>
                  <Text style={styles.requestDetail}>{request.tag} · 나에게 친구 요청 보냄</Text>
                </View>
                <Pressable style={styles.acceptButton} onPress={() => handleAccept(request.id)}>
                  <Text style={styles.acceptButtonText}>수락</Text>
                </Pressable>
              </View>
            ))}
            {pending.map((request) => (
              <View key={request.id} style={styles.requestRow}>
                <View style={styles.requestMeta}>
                  <Text style={styles.requestName}>{request.name}</Text>
                  <Text style={styles.requestDetail}>{request.tag} · 수락 대기중</Text>
                </View>
                <View style={styles.pendingBadge}>
                  <Text style={styles.pendingBadgeText}>대기중</Text>
                </View>
              </View>
            ))}
            {received.length === 0 && pending.length === 0 ? (
              <Text style={styles.emptyText}>처리할 친구 요청이 없어.</Text>
            ) : null}
          </Card>

          <Card>
            <Text style={styles.sectionTitle}>친구 구경가기</Text>
            {accepted.map((request) => (
              <Pressable key={request.id} style={styles.compareRow} onPress={() => router.push('/friend-detail')}>
                <View style={styles.requestMeta}>
                  <Text style={styles.requestName}>{request.name}</Text>
                  <Text style={styles.requestDetail}>{request.tag} · 친구가 뛴 기록 보러가기</Text>
                </View>
                <Text style={styles.compareLink}>보기</Text>
              </Pressable>
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerWrap: { gap: 12 },
  addButton: {
    backgroundColor: '#6D5EF7',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  addButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
  heroRankingCard: {
    backgroundColor: '#111827',
    gap: 6,
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
  heroSub: {
    color: '#D0D5DD',
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  requestRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EAECF0',
  },
  compareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EAECF0',
  },
  requestMeta: {
    flex: 1,
    gap: 2,
  },
  requestName: {
    color: '#111827',
    fontWeight: '700',
  },
  requestDetail: {
    color: '#667085',
  },
  acceptButton: {
    backgroundColor: '#6D5EF7',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  acceptButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  pendingBadge: {
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  pendingBadgeText: {
    color: '#4F46E5',
    fontWeight: '800',
  },
  compareLink: {
    color: '#6D5EF7',
    fontWeight: '800',
  },
  emptyText: {
    color: '#667085',
    marginTop: 10,
  },
});
