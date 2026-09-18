import { useCallback, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BrandLoadingView } from '@/components/BrandLoadingView';
import { MatchStartCountdownOverlay } from '@/components/matches/MatchStartCountdownOverlay';
import { Screen } from '@/components/Screen';
import { HomeHeader } from '@/features/home/components/HomeHeader';
import { HomeOtaUpdateCard } from '@/features/home/components/HomeOtaUpdateCard';
import { HomeThemeTipBubble } from '@/features/home/components/HomeThemeTipBubble';
import { HomeUpcomingMatchesCard } from '@/features/home/components/HomeUpcomingMatchesCard';
import { useHomeScreenModel } from '@/features/home/hooks/useHomeScreenModel';
import { useOtaUpdatePrompt } from '@/features/home/hooks/useOtaUpdatePrompt';
import { HomeOverview } from '@/features/home/HomeOverview';
import { buildActivityMonthGroups } from '@/features/profile/utils/activityMonthGroups';
import { shouldShowMatchStartOverlay } from '@/lib/matchCountdown';
import { useTabWarmupTrace } from '@/utils/useTabWarmupTrace';
import { spacing } from '@/theme/tokens';

export default function HomeScreen() {
  useTabWarmupTrace('home');
  const {
    activity,
    cancelingMatchId,
    error,
    handleCancelUpcomingMatch,
    handleOpenRunningMatch,
    loading,
    nextStartingMatch,
    nowMs,
    profile,
    summary,
    visibleUpcomingMatches,
  } = useHomeScreenModel();
  const { showUpdatePrompt, applyUpdate } = useOtaUpdatePrompt();
  // '이번 달' 카드의 횟수 폴백 — 서버가 monthRunCount를 주기 전(구백엔드)에만 쓰인다. 기록 탭의
  // 달 묶음과 같은 함수라 두 화면의 '이번 달 N회'가 어긋나지 않는다. (서버 값은 차량 판정 러닝을
  // 빼고 세므로 더 정확하다 — 있으면 항상 서버 값이 이긴다.)
  const fallbackMonthRunCount = useMemo(() => (
    buildActivityMonthGroups(activity?.runs ?? [], Date.now()).find((group) => group.isCurrentMonth)?.runCount ?? 0
  ), [activity]);
  const handleCancelMatch = useCallback((match: Parameters<typeof handleCancelUpcomingMatch>[0]) => {
    void handleCancelUpcomingMatch(match);
  }, [handleCancelUpcomingMatch]);

  if (loading) {
    return <BrandLoadingView />;
  }

  return (
    <View style={styles.root}>
      <Screen>
        <View style={styles.contentWrap}>
          <HomeHeader />
          <HomeThemeTipBubble />
          {showUpdatePrompt ? <HomeOtaUpdateCard onApply={applyUpdate} /> : null}
          {error ? <Text>{error}</Text> : null}
          <HomeUpcomingMatchesCard
            matches={visibleUpcomingMatches}
            nowMs={nowMs}
            cancelingMatchId={cancelingMatchId}
            onCancelMatch={handleCancelMatch}
            onOpenMatch={handleOpenRunningMatch}
          />
          {summary ? (
            <HomeOverview
              rankState={profile?.rankState}
              runs={activity?.runs ?? []}
              weeklyStreakWeeks={summary.weeklyStreakWeeks ?? 0}
              weeklyStreakRanThisWeek={summary.weeklyStreakRanThisWeek ?? false}
              weeklyStreakMinWeekDistanceKm={summary.weeklyStreakMinWeekDistanceKm ?? 3}
              monthDistanceKm={summary.monthDistanceKm ?? activity?.monthlyDistanceKm ?? 0}
              monthRunCount={summary.monthRunCount ?? fallbackMonthRunCount}
              monthPoints={summary.monthPoints ?? activity?.monthlyPoints ?? 0}
            />
          ) : null}
        </View>
      </Screen>
      {nextStartingMatch && shouldShowMatchStartOverlay(nextStartingMatch.remainingSeconds) ? (
        <MatchStartCountdownOverlay
          title={nextStartingMatch.match.mode === 'duel' ? '1대1 대결 곧 시작' : '그룹 대결 곧 시작'}
          subtitle={`${nextStartingMatch.match.counterpartLabel} · ${nextStartingMatch.match.summary}`}
          secondsRemaining={nextStartingMatch.remainingSeconds}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  contentWrap: {
    // Screen.inner와 같은 20 — 홈만 자체 래퍼를 써서 따로 맞춘다.
    gap: spacing.s20,
  },
});
