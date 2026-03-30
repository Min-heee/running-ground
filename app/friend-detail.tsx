import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { friendRanks, friendRunRecords } from '@/data/mock';

export default function FriendDetailScreen() {
  const friend = friendRanks[0];
  const monthlyTotalKm = friendRunRecords.reduce((sum, run) => sum + run.distanceKm, 0).toFixed(1);

  return (
    <Screen>
      <AuthHeader title="친구 활동" subtitle={`${friend.name}가 최근에 뛴 기록과 이번 달 누적 거리를 볼 수 있어.`} />

      <Card style={styles.heroCard}>
        <Text style={styles.heroLabel}>친구 프로필</Text>
        <Text style={styles.heroTitle}>{friend.name}</Text>
        <Text style={styles.heroTag}>{friend.tag}</Text>
      </Card>

      <View style={styles.summaryRow}>
        <Card style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>이번 달 총 거리</Text>
          <Text style={styles.summaryValue}>{monthlyTotalKm}km</Text>
        </Card>
        <Card style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>이번 달 포인트</Text>
          <Text style={styles.summaryValue}>{friend.points}P</Text>
        </Card>
      </View>

      <Card>
        <Text style={styles.sectionTitle}>최근 러닝 기록</Text>
        {friendRunRecords.map((run) => (
          <View key={run.id} style={styles.recordRow}>
            <View style={styles.recordMeta}>
              <Text style={styles.recordDate}>{run.date}</Text>
              <Text style={styles.recordDetail}>{run.distanceKm}km · 페이스 {run.pace}</Text>
            </View>
          </View>
        ))}
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
  },
  recordMeta: {
    gap: 2,
  },
  recordDate: {
    color: '#111827',
    fontWeight: '700',
  },
  recordDetail: {
    color: '#667085',
  },
});
