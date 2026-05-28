import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { RunDetailInfoCard } from '@/features/running/components/RunDetailInfoCard';
import { RunMatchResultCard } from '@/features/running/components/RunMatchResultCard';
import { RunPointBreakdownCard } from '@/features/running/components/RunPointBreakdownCard';
import { RunExtraMetricsRow, RunHeroCard, RunSummaryMetricRow } from '@/features/running/components/RunSummaryCards';
import { useRunDetail } from '@/features/running/hooks/useRunDetail';
import { RunRouteMap } from '@/features/runs/RunRouteMap';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

export default function RunDetailScreen() {
  const {
    runId,
    friendId,
    origin,
    matchDistanceKm,
    matchId,
    matchMode,
    matchSlotStartAt,
  } = useLocalSearchParams<{
    friendId?: string;
    matchDistanceKm?: string;
    matchId?: string;
    matchMode?: string;
    matchSlotStartAt?: string;
    origin?: string;
    runId?: string;
  }>();
  const {
    backHref,
    backLabel,
    error,
    latestCoordinate,
    loading,
    mapRegion,
    matchBonusLabel,
    matchRecordTransitionReason,
    matchResult,
    routeCoordinates,
    runDetail,
    sourceLabel,
  } = useRunDetail({
    friendId,
    matchDistanceKm,
    matchId,
    matchMode,
    matchSlotStartAt,
    origin,
    runId,
  });
  const didAutoNavigateToMatchRecordRef = useRef(false);

  useEffect(() => {
    if (!matchRecordTransitionReason || didAutoNavigateToMatchRecordRef.current) {
      return;
    }

    didAutoNavigateToMatchRecordRef.current = true;
    router.replace('/match-record');
  }, [matchRecordTransitionReason]);

  return (
    <Screen>
      {loading ? <ActivityIndicator size="large" color={colors.brand} /> : null}
      {error ? <Text>{error}</Text> : null}

      {runDetail ? (
        <>
          <AuthHeader title="기록 상세" subtitle={`${runDetail.run.date}에 뛴 러닝 기록 상세 정보.`} showBack backHref={backHref} />

          <RunHeroCard distanceKm={runDetail.run.distanceKm} pace={runDetail.run.pace} sourceLabel={sourceLabel} />

          <RunSummaryMetricRow
            durationSeconds={runDetail.run.durationSeconds}
            estimatedMinutes={runDetail.estimatedMinutes}
            earnedPoint={runDetail.earnedPoint}
          />

          <RunPointBreakdownCard pointBreakdown={runDetail.pointBreakdown} matchBonusLabel={matchBonusLabel} />

          {matchResult ? (
            <RunMatchResultCard
              matchResult={matchResult}
              matchBonusPoints={runDetail.pointBreakdown.matchBonusPoints}
            />
          ) : null}

          {mapRegion ? (
            <Card style={styles.mapCard}>
              <Text style={styles.sectionTitle}>러닝 경로</Text>
              <View style={styles.mapWrap}>
                <RunRouteMap
                  actualCoordinates={routeCoordinates}
                  latestCoordinate={latestCoordinate}
                  initialRegion={mapRegion}
                  emptyTitle="저장된 러닝 경로를 불러오는 중이에요."
                  emptyText="이 기록에는 지도 경로가 함께 저장돼 있어요."
                />
              </View>
            </Card>
          ) : null}

          {runDetail.run.durationSeconds || runDetail.run.cadenceSpm || runDetail.run.elevationGainM ? (
            <RunExtraMetricsRow
              cadenceSpm={runDetail.run.cadenceSpm}
              elevationGainM={runDetail.run.elevationGainM}
            />
          ) : null}

          <RunDetailInfoCard run={runDetail.run} sourceLabel={sourceLabel} weeklyDistanceKm={runDetail.weeklyDistanceKm} />

          <SecondaryButton
            label={backLabel}
            onPress={() => router.replace(backHref)}
          />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
    color: colors.textPrimary,
  },
  mapCard: {
    gap: spacing.s12,
  },
  mapWrap: {
    height: 240,
    borderRadius: radii.xl,
    overflow: 'hidden',
    backgroundColor: colors.borderMuted,
  },
});
