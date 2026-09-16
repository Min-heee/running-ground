import { useCallback } from 'react';
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
              weeklyDistanceKm={summary.totalDistanceKm}
              weeklyRunCount={summary.totalRuns}
              weeklyGoalRate={summary.goalAchievementRate}
              weeklyGoalKm={summary.weeklyGoalKm}
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
    gap: spacing.s16,
  },
});
