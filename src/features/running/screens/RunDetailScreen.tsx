import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { Screen } from '@/components/Screen';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { ChaseResultCard } from '@/features/running/components/ChaseResultCard';
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
    reload,
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
      setExitMatchResultError(getApiErrorMessage(exitError, '매칭 상태 정리에 실패했어요. 그래도 나갈게요.'));
    } finally {
      setIsExitingMatchResult(false);
      router.replace('/(tabs)/home');
    }
  };

  return (
    <Screen>
      {/*
        C-5 skeleton-first: the header renders IMMEDIATELY, before the run detail arrives.
        Post-save the fetch used to leave this screen a blank page with a lone spinner for
        seconds (convoy-delayed backend) — now the frame is always recognizable.
      */}
      <AuthHeader showBack={!showMatchResultExit} backHref={backHref} />

      {loading ? (
        <>
          <View style={[styles.skeletonBlock, styles.skeletonHero]} />
          <View style={styles.recordDuoRow}>
            <View style={[styles.skeletonBlock, styles.skeletonHalfCard]} />
            <View style={[styles.skeletonBlock, styles.skeletonHalfCard]} />
          </View>
          <View style={[styles.skeletonBlock, styles.skeletonInfoCard]} />
        </>
      ) : null}
      {!loading && error ? (
        <>
          <Text style={styles.errorText}>{error}</Text>
          {/* Failed first load (no content at all) → actionable retry instead of a dead end. */}
          {!runDetail ? <SecondaryButton label="다시 불러오기" onPress={() => { void reload(); }} /> : null}
        </>
      ) : null}
      {exitMatchResultError ? <Text>{exitMatchResultError}</Text> : null}

      {runDetail ? (
        <>
          {/* 나이키식 '탁 트인' 상세 (오너 2026-08-01): 히어로·지표는 카드 없이 맨바닥,
              지도는 화면 가장자리까지 풀폭 — 상자·순서 모두 답답하다는 피드백의 수술. */}
          <RunHeroCard
            startedLabel={formatRunStartLabel(runDetail.run)}
            distanceKm={runDetail.run.distanceKm}
          />

          <RunDetailInfoCard run={runDetail.run} />

          {/* 대결 기록은 결과 카드가 먼저다 — 400pt 지도 뒤에 두면 승패와 유일한 출구
              (나가기)가 폴드 아래로 밀린다 (적대 리뷰 발견). 솔로는 지도 먼저. */}
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
          ) : null}

          {mapRegion && Platform.OS !== 'android' ? (
            <View style={styles.mapWrap}>
              <RunRouteMap
                actualCoordinates={routeCoordinates}
                latestCoordinate={latestCoordinate}
                initialRegion={mapRegion}
                emptyTitle="저장된 러닝 경로를 불러오는 중이에요."
                emptyText="이 기록에는 지도 경로가 함께 저장돼 있어요."
              />
            </View>
          ) : null}

          {!matchResult ? (
            <RunPointBreakdownCard pointBreakdown={runDetail.pointBreakdown} matchBonusLabel={matchBonusLabel} />
          ) : null}

          {runDetail.run.chase ? <ChaseResultCard chase={runDetail.run.chase} /> : null}

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
  errorText: {
    color: colors.danger,
  },
  skeletonBlock: {
    backgroundColor: colors.borderMuted,
    borderRadius: radii.xl,
  },
  skeletonHero: {
    height: 140,
  },
  skeletonHalfCard: {
    flex: 1,
    height: 120,
  },
  skeletonInfoCard: {
    height: 180,
  },
  mapWrap: {
    height: 400,
    // Screen의 좌우 패딩(s16)을 뚫고 화면 가장자리까지 — 카드에 가두면 답답하다.
    marginHorizontal: -spacing.s16,
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
