import { StyleSheet, Text, View, Pressable } from 'react-native';
import { Link } from 'expo-router';
import { Screen } from '@/components/Screen';
import { FriendsRanking } from '@/features/friends/FriendsRanking';
import { friendRanks, myProfile, friendRequests } from '@/data/mock';
import { InfoCard } from '@/components/ui/InfoCard';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/Card';

export default function FriendsScreen() {
  const pending = friendRequests.filter((request) => request.status === 'pending');
  const received = friendRequests.filter((request) => request.status === 'received');

  return (
    <Screen>
      <View style={styles.headerWrap}>
        <PageHeader title="친구 랭킹" subtitle="친구들과 주간 거리와 포인트를 비교해볼 수 있어." />
        <Link href="/add-friend" asChild>
          <Pressable style={styles.addButton}>
            <Text style={styles.addButtonText}>친구 추가하기</Text>
          </Pressable>
        </Link>
      </View>

      <InfoCard title="내 태그">{`${myProfile.publicTag} · 친구에게 공유해서 쉽게 추가할 수 있어.`}</InfoCard>

      <Card>
        <Text style={styles.sectionTitle}>친구 요청 상태</Text>
        {received.map((request) => (
          <View key={request.id} style={styles.requestRow}>
            <View style={styles.requestMeta}>
              <Text style={styles.requestName}>{request.name}</Text>
              <Text style={styles.requestDetail}>{request.tag} · 나에게 친구 요청 보냄</Text>
            </View>
            <Pressable style={styles.acceptButton}>
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
      </Card>

      <InfoCard title="추천">친구를 추가하면 서로의 주간 기록, 포인트, 순위를 바로 비교할 수 있어.</InfoCard>

      <FriendsRanking ranks={friendRanks} />
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
});
