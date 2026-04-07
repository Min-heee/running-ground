import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { fetchDistrictPersonal } from '@/lib/api/services';
import { DistrictPersonalResponse } from '@/lib/api/types';

export default function DistrictPersonalScreen() {
  const [competition, setCompetition] = useState<DistrictPersonalResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCompetition = () => {
    setLoading(true);
    setError(null);

    fetchDistrictPersonal()
      .then((data) => setCompetition(data))
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : '구 내 개인 경쟁 정보를 불러오지 못했어.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadCompetition();
  }, []);

  return (
    <Screen>
      <PageHeader
        title="구 내 개인 경쟁"
        subtitle={`${competition?.districtName ?? '내 지역'} 안에서 개인 랭킹과 포인트를 비교하는 공간.`}
      />

      {loading ? <ActivityIndicator size="large" color="#6D5EF7" /> : null}

      {!loading && error ? (
        <Card>
          <Text style={styles.stateTitle}>구 내 개인 경쟁을 아직 못 불러왔어</Text>
          <Text style={styles.errorText}>{error}</Text>
          <PrimaryButton label="다시 불러오기" onPress={loadCompetition} />
        </Card>
      ) : null}

      {competition ? (
        <>
          <Card style={styles.heroCard}>
            <Text style={styles.heroLabel}>내 현재 위치</Text>
            <Text style={styles.heroTitle}>{competition.districtName}</Text>
            <View style={styles.heroMetrics}>
              <View style={styles.heroMetricBox}>
                <Text style={styles.heroMetricValue}>{competition.myRank?.rank ?? '-'}위</Text>
                <Text style={styles.heroMetricLabel}>내 순위</Text>
              </View>
              <View style={styles.heroMetricBox}>
                <Text style={styles.heroMetricValue}>{competition.myPoints}P</Text>
                <Text style={styles.heroMetricLabel}>내 포인트</Text>
              </View>
            </View>
            <Text style={styles.heroFootnote}>{competition.weeklyDistanceKm}km · 이번 주 기준</Text>
          </Card>

          <Card>
            <Text style={styles.sectionTitle}>내 앞뒤 경쟁</Text>
            {competition.focusRanks.length > 0 ? competition.focusRanks.map((runner) => (
              <View key={runner.id} style={[styles.rankRow, runner.isMe && styles.meRow]}>
                <Text style={styles.rankNumber}>{runner.rank}</Text>
                <View style={styles.rankMeta}>
                  <Text style={styles.rankName}>{runner.name}</Text>
                  <Text style={styles.rankDetail}>{runner.distanceKm}km / {runner.points}P</Text>
                </View>
              </View>
            )) : <Text style={styles.emptyText}>아직 내 앞뒤 경쟁 데이터를 준비하지 못했어.</Text>}
          </Card>

          <Card>
            <Text style={styles.sectionTitle}>{competition.districtName} 전체 랭킹</Text>
            {competition.ranks.length > 0 ? competition.ranks.map((runner) => (
              <View key={runner.id} style={[styles.rankRow, runner.isMe && styles.meRow]}>
                <Text style={styles.rankNumber}>{runner.rank}</Text>
                <View style={styles.rankMeta}>
                  <Text style={styles.rankName}>{runner.name}</Text>
                  <Text style={styles.rankDetail}>{runner.distanceKm}km / {runner.points}P</Text>
                </View>
              </View>
            )) : <Text style={styles.emptyText}>아직 이 지역 개인 랭킹이 없어.</Text>}
          </Card>
        </>
      ) : null}

      {!loading && !error && !competition ? (
        <Card>
          <Text style={styles.stateTitle}>구 내 개인 경쟁 데이터가 아직 없어</Text>
          <Text style={styles.emptyText}>실백엔드에서 응답이 오면 내 순위와 주변 경쟁자를 바로 보여줄 수 있어.</Text>
          <PrimaryButton label="다시 확인하기" onPress={loadCompetition} />
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    backgroundColor: '#111827',
    gap: 10,
  },
  heroLabel: {
    color: '#C7D2FE',
    fontWeight: '700',
    fontSize: 12,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '800',
  },
  heroMetrics: {
    flexDirection: 'row',
    gap: 10,
  },
  heroMetricBox: {
    flex: 1,
    backgroundColor: '#1F2937',
    borderRadius: 16,
    padding: 14,
    gap: 4,
  },
  heroMetricValue: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
  },
  heroMetricLabel: {
    color: '#D0D5DD',
  },
  heroFootnote: {
    color: '#98A2B3',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  rankRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EAECF0',
  },
  meRow: {
    backgroundColor: '#F5F3FF',
    borderRadius: 14,
    paddingHorizontal: 10,
  },
  rankNumber: {
    width: 24,
    fontWeight: '800',
    color: '#344054',
  },
  rankMeta: {
    flex: 1,
    gap: 2,
  },
  rankName: {
    color: '#111827',
    fontWeight: '700',
  },
  rankDetail: {
    color: '#667085',
  },
  stateTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
  },
  errorText: {
    color: '#B42318',
    fontWeight: '700',
    lineHeight: 20,
  },
  emptyText: {
    color: '#667085',
    lineHeight: 20,
  },
});
