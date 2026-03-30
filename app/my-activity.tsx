import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { myRunRecords, weeklySummary } from '@/data/mock';

export default function MyActivityScreen() {
  const monthlyTotalKm = myRunRecords.reduce((sum, run) => sum + run.distanceKm, 0).toFixed(1);

  return (
    <Screen>
      <AuthHeader title="내 활동" subtitle="내가 최근에 뛴 기록과 이번 달 누적 거리를 볼 수 있어." />

      <View style={styles.summaryRow}>
        <Card style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>이번 달 총 거리</Text>
          <Text style={styles.summaryValue}>{monthlyTotalKm}km</Text>
        </Card>
        <Card style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>이번 달 포인트</Text>
          <Text style={styles.summaryValue}>{weeklySummary.districtPoints}P</Text>
        </Card>
      </View>

      <Card>
        <Text style={styles.sectionTitle}>최근 러닝 기록</Text>
        {myRunRecords.map((run) => (
          <View key={run.id} style={styles.recordRow}>
            <View style={styles.recordMeta}>
              <Text style={styles.recordDate}>{run.date}</Text>
              <Text style={styles.recordDetail}>{run.distanceKm}km · 페이스 {run.pace} · {run.source}</Text>
            </View>
          </View>
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
