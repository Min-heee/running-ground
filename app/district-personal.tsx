import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { districtPersonalRanks, myProfile, weeklySummary } from '@/data/mock';
import { colors, radius } from '@/theme';

export default function DistrictPersonalScreen() {
  const myRank = districtPersonalRanks.find((runner) => runner.isMe);

  return (
    <Screen>
      <PageHeader title="구 내 개인 경쟁" subtitle={`${myProfile.districtName} 안에서 개인 랭킹과 포인트를 비교하는 공간.`} />

      <Card style={styles.heroCard}>
        <Text style={styles.heroLabel}>내 현재 위치</Text>
        <Text style={styles.heroTitle}>{myProfile.districtName}</Text>
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
        <Text style={styles.sectionTitle}>{myProfile.districtName} 전체 랭킹</Text>
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
    backgroundColor: colors.inkBg,
    gap: 10,
  },
  heroLabel: {
    color: colors.brandPrimaryMuted,
    fontWeight: '700',
    fontSize: 12,
  },
  heroTitle: {
    color: colors.textOnDark,
    fontSize: 30,
    fontWeight: '800',
  },
  heroMetrics: {
    flexDirection: 'row',
    gap: 10,
  },
  heroMetricBox: {
    flex: 1,
    backgroundColor: colors.inkBgAlt,
    borderRadius: radius.lg,
    padding: 14,
    gap: 4,
  },
  heroMetricValue: {
    color: colors.textOnDark,
    fontSize: 22,
    fontWeight: '800',
  },
  heroMetricLabel: {
    color: colors.textOnDarkMuted,
  },
  heroFootnote: {
    color: colors.textOnDarkSubtle,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  rankRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  meRow: {
    backgroundColor: colors.brandPrimaryAlt,
    borderRadius: radius.md,
    paddingHorizontal: 10,
  },
  rankNumber: {
    width: 24,
    fontWeight: '800',
    color: colors.textBody,
  },
  rankMeta: {
    flex: 1,
    gap: 2,
  },
  rankName: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  rankDetail: {
    color: colors.textMuted,
  },
});
