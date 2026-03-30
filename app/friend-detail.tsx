import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { weeklySummary, friendRanks } from '@/data/mock';

export default function FriendDetailScreen() {
  const friend = friendRanks[0];
  const gapKm = Math.abs(friend.distanceKm - weeklySummary.totalDistanceKm).toFixed(1);
  const gapPoint = Math.abs(friend.points - weeklySummary.districtPoints);

  return (
    <Screen>
      <AuthHeader title="친구 비교" subtitle={`${friend.name}와 이번 주 기록을 나란히 비교할 수 있어.`} />

      <Card style={styles.heroCard}>
        <Text style={styles.heroLabel}>현재 비교 중</Text>
        <Text style={styles.heroTitle}>{friend.name}</Text>
        <Text style={styles.heroTag}>{friend.tag}</Text>
      </Card>

      <View style={styles.compareRow}>
        <Card style={styles.compareCard}>
          <Text style={styles.compareLabel}>나</Text>
          <Text style={styles.compareValue}>{weeklySummary.totalDistanceKm}km</Text>
          <Text style={styles.compareSub}>{weeklySummary.districtPoints}P</Text>
        </Card>
        <Card style={styles.compareCard}>
          <Text style={styles.compareLabel}>{friend.name}</Text>
          <Text style={styles.compareValue}>{friend.distanceKm}km</Text>
          <Text style={styles.compareSub}>{friend.points}P</Text>
        </Card>
      </View>

      <Card>
        <Text style={styles.sectionTitle}>이번 주 차이</Text>
        <Text style={styles.resultText}>거리 차이 {gapKm}km · 포인트 차이 {gapPoint}P</Text>
        <Text style={styles.resultSub}>친구와의 차이를 줄이면 바로 순위 경쟁이 더 재밌어져.</Text>
      </Card>
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
  compareRow: {
    flexDirection: 'row',
    gap: 10,
  },
  compareCard: {
    flex: 1,
    minHeight: 120,
  },
  compareLabel: {
    color: '#667085',
    fontWeight: '700',
  },
  compareValue: {
    color: '#111827',
    fontSize: 24,
    fontWeight: '800',
  },
  compareSub: {
    color: '#6D5EF7',
    fontWeight: '800',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  resultText: {
    color: '#111827',
    fontWeight: '700',
    marginTop: 8,
  },
  resultSub: {
    color: '#667085',
    lineHeight: 20,
    marginTop: 4,
  },
});
