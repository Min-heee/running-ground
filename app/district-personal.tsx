import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { districtPersonalRanks, myProfile, weeklySummary } from '@/data/mock';
import { getCurrentUserProfile } from '@/lib/session';

export default function DistrictPersonalScreen() {
  const myRank = districtPersonalRanks.find((runner) => runner.isMe);
  const profile = getCurrentUserProfile() ?? myProfile;

  return (
    <Screen>
      <PageHeader title="구 내 개인 경쟁" subtitle={`${profile.districtName} 안에서 개인 랭킹과 포인트를 비교하는 공간.`} />

      <Card style={styles.heroCard}>
        <Text style={styles.heroLabel}>내 현재 위치</Text>
        <Text style={styles.heroTitle}>{profile.districtName}</Text>
        <View style={styles.heroMetrics}>
          <View style={styles.heroMetricBox}>
            <Text style={styles.heroMetricValue}>{myRank?.rank ?? '-'}위</Text>
            <Text style={styles.heroMetricLabel}>내 순위</Text>
          </View>
          <View style={styles.heroMetricBox}>
            <Text style={styles.heroMetricValue}>{weeklySummary.districtPoints}P</Text>
            <Text style={styles.heroMetricLabel}>내 포인트</Text>
          </View>
        </View>
        <Text style={styles.heroFootnote}>{weeklySummary.totalDistanceKm}km · 이번 주 기준</Text>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>내 앞뒤 경쟁</Text>
        {districtPersonalRanks.slice(1, 5).map((runner) => (
          <View key={runner.id} style={[styles.rankRow, runner.isMe && styles.meRow]}>
            <Text style={styles.rankNumber}>{runner.rank}</Text>
            <View style={styles.rankMeta}>
              <Text style={styles.rankName}>{runner.name}</Text>
              <Text style={styles.rankDetail}>{runner.distanceKm}km / {runner.points}P</Text>
            </View>
          </View>
        ))}
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>{profile.districtName} 전체 랭킹</Text>
        {districtPersonalRanks.map((runner) => (
          <View key={runner.id} style={[styles.rankRow, runner.isMe && styles.meRow]}>
            <Text style={styles.rankNumber}>{runner.rank}</Text>
            <View style={styles.rankMeta}>
              <Text style={styles.rankName}>{runner.name}</Text>
              <Text style={styles.rankDetail}>{runner.distanceKm}km / {runner.points}P</Text>
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
});
