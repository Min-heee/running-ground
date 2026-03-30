import { StyleSheet, Text, View, Pressable } from 'react-native';
import { Screen } from '@/components/Screen';
import { FriendsRanking } from '@/features/friends/FriendsRanking';
import { friendRanks } from '@/data/mock';
import { Card } from '@/components/Card';

export default function FriendsScreen() {
  return (
    <Screen>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>친구 랭킹</Text>
          <Text style={styles.subtitle}>친구들과 주간 거리와 포인트를 비교해볼 수 있어.</Text>
        </View>
        <Pressable style={styles.addButton}>
          <Text style={styles.addButtonText}>친구 추가하기</Text>
        </Pressable>
      </View>

      <Card>
        <Text style={styles.tipTitle}>추천</Text>
        <Text style={styles.tipBody}>친구를 추가하면 서로의 주간 기록, 포인트, 순위를 바로 비교할 수 있어.</Text>
      </Card>

      <FriendsRanking ranks={friendRanks} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 12 },
  title: { fontSize: 28, fontWeight: '800', color: '#101828' },
  subtitle: { color: '#475467', lineHeight: 21, marginTop: 4 },
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
  tipTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  tipBody: {
    color: '#475467',
    lineHeight: 21,
    marginTop: 6,
  },
});
