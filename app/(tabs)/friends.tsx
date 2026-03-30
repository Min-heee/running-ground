import { StyleSheet, Text } from 'react-native';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { SectionTitle } from '@/components/SectionTitle';
import { friendRanks } from '@/data/mock';

export default function FriendsScreen() {
  return (
    <Screen>
      <Text style={styles.title}>친구 랭킹</Text>
      <Card>
        <SectionTitle>이번 주 순위</SectionTitle>
        {friendRanks.map((runner) => (
          <Text key={runner.id} style={styles.row}>{runner.rank}위 {runner.name} · {runner.distanceKm}km / {runner.points}P</Text>
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 28, fontWeight: '800', color: '#101828' },
  row: { color: '#344054', paddingVertical: 8, fontWeight: '600' },
});
