import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { SectionTitle } from '@/components/SectionTitle';
import { districtBattleRanks, weeklySummary } from '@/data/mock';
import { PageHeader } from '@/components/ui/PageHeader';
import { InfoCard } from '@/components/ui/InfoCard';

export default function LeagueScreen() {
  const myDistrict = weeklySummary.districtBattle;

  return (
    <Screen>
      <PageHeader title="지역 배틀" subtitle="우리 지역의 평균 거리와 참여율을 기준으로 경쟁하는 핵심 공간." />

      <InfoCard title="현재 상태">지역 경쟁은 총합보다 참여 멤버 평균 거리 중심으로 보는 게 핵심이야.</InfoCard>

      <Card style={styles.heroCard}>
        <Text style={styles.heroLabel}>우리 지역</Text>
        <Text style={styles.heroTitle}>{myDistrict.myDistrict}</Text>
        <View style={styles.heroMetrics}>
          <View style={styles.heroMetricBox}>
            <Text style={styles.heroMetricValue}>{myDistrict.districtRank}위</Text>
            <Text style={styles.heroMetricLabel}>현재 순위</Text>
          </View>
          <View style={styles.heroMetricBox}>
            <Text style={styles.heroMetricValue}>{myDistrict.averageDistancePerMember}km</Text>
            <Text style={styles.heroMetricLabel}>평균 거리</Text>
          </View>
        </View>
      </Card>

      <Card>
        <SectionTitle>참여 현황</SectionTitle>
        <View style={styles.summaryGrid}>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryValue}>{myDistrict.totalDistanceKm}km</Text>
            <Text style={styles.summaryLabel}>총 거리</Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryValue}>{myDistrict.participationRate}%</Text>
            <Text style={styles.summaryLabel}>참여율</Text>
          </View>
        </View>
      </Card>

      <Card>
        <SectionTitle>상위 지역 순위</SectionTitle>
        {districtBattleRanks.map((district) => (
          <View key={district.rank} style={[styles.rankRow, district.districtName === myDistrict.myDistrict && styles.myDistrictRow]}>
            <Text style={styles.rankNumber}>{district.rank}</Text>
            <View style={styles.rankMeta}>
              <Text style={styles.rankName}>{district.districtName}</Text>
              <Text style={styles.rankDetail}>평균 {district.averageDistanceKm}km · 참여율 {district.participationRate}% · {district.participants}명</Text>
            </View>
          </View>
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    backgroundColor: '#6D5EF7',
    gap: 10,
  },
  heroLabel: {
    color: '#E9E7FF',
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
    backgroundColor: 'rgba(255,255,255,0.14)',
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
    color: '#E9E7FF',
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  summaryBox: {
    flex: 1,
    backgroundColor: '#F2F4F7',
    borderRadius: 16,
    padding: 14,
    gap: 4,
  },
  summaryValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
  },
  summaryLabel: {
    color: '#667085',
  },
  rankRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EAECF0',
  },
  myDistrictRow: {
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
});
