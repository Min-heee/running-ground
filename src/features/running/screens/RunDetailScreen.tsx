import { useState } from 'react';
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
import { formatRunStartLabel } from '@/features/running/utils/runStartLabel';
import { RunRouteMap } from '@/features/runs/RunRouteMap';
import { forceResetRunningMatchState, getApiErrorMessage } from '@/services';
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
    matchResult,
    routeCoordinates,
    runDetail,
    showMatchResultExit,
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
  const [isExitingMatchResult, setIsExitingMatchResult] = useState(false);
  const [exitMatchResultError, setExitMatchResultError] = useState<string | null>(null);

  const handleExitMatchResult = async () => {
    if (isExitingMatchResult) {
      return;
    }

    setIsExitingMatchResult(true);
    setExitMatchResultError(null);
    try {
      await forceResetRunningMatchState();
      router.replace('/(tabs)/home');
    } catch (exitError) {
      setExitMatchResultError(getApiErrorMessage(exitError, '매칭 상태 정리에 실패했어. 잠시 후 다시 시도해줘.'));
    } finally {
      setIsExitingMatchResult(false);
    }
  };

  return (
    <Screen>
      {loading ? <ActivityIndicator size="large" color={colors.brand} /> : null}
      {error ? <Text>{error}</Text> : null}
      {exitMatchResultError ? <Text>{exitMatchResultError}</Text> : null}

      {runDetail ? (
        <>
          <AuthHeader showBack backHref={backHref} />

          <RunHeroCard
            startedLabel={formatRunStartLabel(runDetail.run)}
            distanceKm={runDetail.run.distanceKm}
          />

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

          {showMatchResultExit ? (
            <SecondaryButton
              label={isExitingMatchResult ? '정리 중...' : '나가기'}
              disabled={isExitingMatchResult}
              onPress={handleExitMatchResult}
            />
          ) : (
            <SecondaryButton
              label={backLabel}
              onPress={() => router.replace(backHref)}
            />
          )}
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
