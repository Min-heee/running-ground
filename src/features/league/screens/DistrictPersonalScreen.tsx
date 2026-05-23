import { memo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { type DistrictPersonalRank, useDistrictPersonal } from '@/features/league/hooks/useDistrictPersonal';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

const DistrictPersonalRankRow = memo(function DistrictPersonalRankRow({ runner }: { runner: DistrictPersonalRank }) {
  return (
    <View style={[styles.rankRow, runner.isMe && styles.meRow]}>
      <Text style={styles.rankNumber}>{runner.rank}</Text>
      <View style={styles.rankMeta}>
        <Text style={styles.rankName}>{runner.name}</Text>
        <Text style={styles.rankDetail}>{runner.distanceKm}km / {runner.points}P</Text>
      </View>
    </View>
  );
});

export default function DistrictPersonalScreen() {
  const { competition, error, loadCompetition, loading } = useDistrictPersonal();

  return (
    <Screen>
      <PageHeader
        title="구 내 개인 경쟁"
        subtitle={`${competition?.districtName ?? '내 지역'} 안에서 개인 랭킹과 포인트를 비교하는 공간.`}
        showBack
        backHref="/(tabs)/league"
      />

      {loading ? <ActivityIndicator size="large" color={colors.brand} /> : null}

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
            {competition.focusRanks.length > 0 ? (
              competition.focusRanks.map((runner) => (
                <DistrictPersonalRankRow key={runner.id} runner={runner} />
              ))
            ) : <Text style={styles.emptyText}>아직 내 앞뒤 경쟁 데이터를 준비하지 못했어.</Text>}
          </Card>

          <Card>
            <Text style={styles.sectionTitle}>{competition.districtName} 전체 랭킹</Text>
            {competition.ranks.length > 0 ? (
              competition.ranks.map((runner) => (
                <DistrictPersonalRankRow key={runner.id} runner={runner} />
              ))
            ) : <Text style={styles.emptyText}>아직 이 지역 개인 랭킹이 없어.</Text>}
          </Card>

          <SecondaryButton label="랭킹으로 돌아가기" onPress={() => router.replace('/(tabs)/league')} />
        </>
      ) : null}

      {!loading && !error && !competition ? (
        <Card>
          <Text style={styles.stateTitle}>구 내 개인 경쟁 데이터가 아직 없어</Text>
          <Text style={styles.emptyText}>실백엔드에서 응답이 오면 내 순위와 주변 경쟁자를 바로 보여줄 수 있어.</Text>
          <PrimaryButton label="다시 확인하기" onPress={loadCompetition} />
          <SecondaryButton label="랭킹으로 돌아가기" onPress={() => router.replace('/(tabs)/league')} />
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    backgroundColor: colors.textPrimary,
    gap: spacing.s10,
  },
  heroLabel: {
    color: colors.brandLighter,
    fontWeight: fontWeights.bold,
    fontSize: fontSizes.sm,
  },
  heroTitle: {
    color: colors.white,
    fontSize: fontSizes.hero,
    fontWeight: fontWeights.extraBold,
  },
  heroMetrics: {
    flexDirection: 'row',
    gap: spacing.s10,
  },
  heroMetricBox: {
    flex: 1,
    backgroundColor: colors.darkMuted,
    borderRadius: radii.md,
    padding: spacing.s14,
    gap: spacing.sm,
  },
  heroMetricValue: {
    color: colors.white,
    fontSize: fontSizes.comingSoon,
    fontWeight: fontWeights.extraBold,
  },
  heroMetricLabel: {
    color: colors.border,
  },
  heroFootnote: {
    color: colors.textTertiary,
  },
  sectionTitle: {
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
    color: colors.textPrimary,
  },
  rankRow: {
    flexDirection: 'row',
    gap: spacing.s12,
    alignItems: 'center',
    paddingVertical: spacing.s12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSoft,
  },
  meRow: {
    backgroundColor: colors.purpleRow,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.s10,
  },
  rankNumber: {
    width: 24,
    fontWeight: fontWeights.extraBold,
    color: colors.textStrongMuted,
  },
  rankMeta: {
    flex: 1,
    gap: spacing.xxs,
  },
  rankName: {
    color: colors.textPrimary,
    fontWeight: fontWeights.bold,
  },
  rankDetail: {
    color: colors.textSecondary,
  },
  stateTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
  },
  errorText: {
    color: colors.danger,
    fontWeight: fontWeights.bold,
    lineHeight: 20,
  },
  emptyText: {
    color: colors.textSecondary,
    lineHeight: 20,
  },
});
