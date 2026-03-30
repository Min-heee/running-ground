import { StyleSheet, Text, View, Pressable } from 'react-native';
import { Link } from 'expo-router';
import { Screen } from '@/components/Screen';
import { FriendsRanking } from '@/features/friends/FriendsRanking';
import { friendRanks, myProfile } from '@/data/mock';
import { InfoCard } from '@/components/ui/InfoCard';
import { PageHeader } from '@/components/ui/PageHeader';

export default function FriendsScreen() {
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
});
