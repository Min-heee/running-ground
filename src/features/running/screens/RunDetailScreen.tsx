import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { RunDetailInfoCard } from '@/features/running/components/RunDetailInfoCard';
import { RunMatchResultCard } from '@/features/running/components/RunMatchResultCard';
import { RunPointBreakdownCard } from '@/features/running/components/RunPointBreakdownCard';
import { RunHeroCard } from '@/features/running/components/RunSummaryCards';
import { useRunDetail } from '@/features/running/hooks/useRunDetail';
import { formatRunStartLabel } from '@/features/running/utils/runStartLabel';
import { RunRouteMap } from '@/features/runs/RunRouteMap';
import { forceResetRunningMatchState, getApiErrorMessage } from '@/services';
import { colors, spacing, radii } from '@/theme/tokens';

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
  const navigation = useNavigation();

  // After a match the run-detail is pushed ON TOP of the (now-stale) live match
  // screen, so popping back — via a header chevron OR the iOS swipe-back gesture —
  // would surface that dead 대결 화면. In that flow disable swipe-back; the only
  // way out is the bottom 나가기 button (which resets match state + replaces home).
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !showMatchResultExit });
  }, [navigation, showMatchResultExit]);

  const handleExitMatchResult = async () => {
    if (isExitingMatchResult) {
      return;
    }

    setIsExitingMatchResult(true);
    setExitMatchResultError(null);
    try {
      // Best-effort server-side cleanup. This match-result view intentionally has
      // no back button / swipe-back (popping would surface the stale 대결 화면),
      // so we must leave even if the reset call fails — otherwise a failed/offline
      // reset would strand the user here with no way out.
      await forceResetRunningMatchState();
    } catch (exitError) {
      setExitMatchResultError(getApiErrorMessage(exitError, '매칭 상태 정리에 실패했어. 그래도 나갈게.'));
    } finally {
      setIsExitingMatchResult(false);
      router.replace('/(tabs)/home');
    }
  };

  return (
    <Screen>
      {loading ? <ActivityIndicator size="large" color={colors.brand} /> : null}
      {error ? <Text>{error}</Text> : null}
      {exitMatchResultError ? <Text>{exitMatchResultError}</Text> : null}

      {runDetail ? (
        <>
          <AuthHeader showBack={!showMatchResultExit} backHref={backHref} />

          <RunHeroCard
            startedLabel={formatRunStartLabel(runDetail.run)}
            distanceKm={runDetail.run.distanceKm}
          />

          {matchResult ? (
            <View style={styles.recordDuoRow}>
              <View style={styles.recordDuoItem}>
                <RunPointBreakdownCard pointBreakdown={runDetail.pointBreakdown} matchBonusLabel={matchBonusLabel} />
              </View>
              <View style={styles.recordDuoItem}>
                <RunMatchResultCard
                  matchResult={matchResult}
                  myPaceLabel={runDetail.run.pace}
                  myDurationSeconds={runDetail.run.durationSeconds}
                  matchId={matchId}
                  mode={matchMode === 'duel' || matchMode === 'group' ? matchMode : null}
                />
              </View>
            </View>
          ) : (
            <RunPointBreakdownCard pointBreakdown={runDetail.pointBreakdown} matchBonusLabel={matchBonusLabel} />
          )}

          {mapRegion && Platform.OS !== 'android' ? (
            <Card style={styles.mapCard}>
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

          <RunDetailInfoCard run={runDetail.run} />

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
  mapCard: {
    gap: spacing.s12,
  },
  mapWrap: {
    height: 240,
    borderRadius: radii.xl,
    overflow: 'hidden',
    backgroundColor: colors.borderMuted,
  },
  recordDuoRow: {
    flexDirection: 'row',
    gap: spacing.s10,
    alignItems: 'stretch',
  },
  recordDuoItem: {
    flex: 1,
  },
});
