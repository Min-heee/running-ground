import { StyleSheet, Text } from 'react-native';
import { Card } from '@/components/Card';
import { SectionTitle } from '@/components/SectionTitle';
import { FriendRank } from '@/domain/types';

export function FriendsRanking({ ranks }: { ranks: FriendRank[] }) {
  return (
    <Card>
      <SectionTitle>이번 주 순위</SectionTitle>
      {ranks.map((runner) => (
        <Text key={runner.id} style={styles.row}>{runner.rank}위 {runner.name} · {runner.distanceKm}km / {runner.points}P</Text>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { color: '#344054', paddingVertical: 8, fontWeight: '600' },
});
