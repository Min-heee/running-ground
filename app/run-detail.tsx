import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { fetchRunDetail } from '@/lib/api/services';
import { RunDetailResponse } from '@/lib/api/types';

export default function RunDetailScreen() {
  const { runId, friendId } = useLocalSearchParams<{ runId?: string; friendId?: string }>();
  const [runDetail, setRunDetail] = useState<RunDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchRunDetail({ runId, friendId })
      .then((data) => setRunDetail(data))
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : '기록 상세 정보를 불러오지 못했어.'))
      .finally(() => setLoading(false));
  }, [friendId, runId]);

  return (
    <Screen>
      {loading ? <ActivityIndicator size="large" color="#6D5EF7" /> : null}
      {error ? <Text>{error}</Text> : null}

      {runDetail ? (
        <>
          <AuthHeader title="기록 상세" subtitle={`${runDetail.run.date}에 뛴 러닝 기록 상세 정보.`} />

          <Card style={styles.heroCard}>
            <Text style={styles.heroLabel}>기록 요약</Text>
            <Text style={styles.heroTitle}>{runDetail.run.distanceKm}km</Text>
            <Text style={styles.heroSub}>페이스 {runDetail.run.pace} · {runDetail.run.source}</Text>
          </Card>

          <View style={styles.summaryRow}>
            <Card style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>예상 소요 시간</Text>
              <Text style={styles.summaryValue}>{runDetail.estimatedMinutes}분</Text>
            </Card>
            <Card style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>획득 포인트</Text>
              <Text style={styles.summaryValue}>{runDetail.earnedPoint}P</Text>
            </Card>
          </View>

          <Card>
            <Text style={styles.sectionTitle}>상세 정보</Text>
            <View style={styles.detailRow}><Text style={styles.detailLabel}>날짜</Text><Text style={styles.detailValue}>{runDetail.run.date}</Text></View>
            <View style={styles.detailRow}><Text style={styles.detailLabel}>거리</Text><Text style={styles.detailValue}>{runDetail.run.distanceKm}km</Text></View>
            <View style={styles.detailRow}><Text style={styles.detailLabel}>페이스</Text><Text style={styles.detailValue}>{runDetail.run.pace}</Text></View>
            <View style={styles.detailRow}><Text style={styles.detailLabel}>기록 소스</Text><Text style={styles.detailValue}>{runDetail.run.source}</Text></View>
            <View style={styles.detailRow}><Text style={styles.detailLabel}>주간 누적 거리</Text><Text style={styles.detailValue}>{runDetail.weeklyDistanceKm}km</Text></View>
          </Card>
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
  heroSub: {
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
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EAECF0',
  },
  detailLabel: {
    color: '#667085',
    fontWeight: '700',
  },
  detailValue: {
    color: '#111827',
    fontWeight: '700',
  },
});
