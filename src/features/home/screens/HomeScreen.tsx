import { useCallback, useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { MatchStartCountdownOverlay } from '@/components/matches/MatchStartCountdownOverlay';
import { Screen } from '@/components/Screen';
import { HomeHeader } from '@/features/home/components/HomeHeader';
import { HomeNoticeCard } from '@/features/home/components/HomeNoticeCard';
import { HomeUpcomingMatchesCard } from '@/features/home/components/HomeUpcomingMatchesCard';
import { useHomeScreenModel } from '@/features/home/hooks/useHomeScreenModel';
import { HomeOverview } from '@/features/home/HomeOverview';
import { shouldShowMatchStartOverlay } from '@/lib/matchCountdown';

export default function HomeScreen() {
  const {
    activity,
    cancelingMatchId,
    error,
    handleCancelUpcomingMatch,
    handleOpenRunningMatch,
    loading,
    nextStartingMatch,
    notices,
    nowMs,
    profile,
    summary,
    visibleUpcomingMatches,
  } = useHomeScreenModel();
  const noticeCards = useMemo(() => notices.map((notice) => (
    <HomeNoticeCard key={notice.id} notice={notice} />
  )), [notices]);
  const handleCancelMatch = useCallback((match: Parameters<typeof handleCancelUpcomingMatch>[0]) => {
    void handleCancelUpcomingMatch(match);
  }, [handleCancelUpcomingMatch]);

  return (
    <View style={styles.root}>
      <Screen>
          <View style={styles.contentWrap}>
          <HomeHeader />
          {noticeCards}
          {loading ? <ActivityIndicator size="large" color="#6D5EF7" /> : null}
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
              summary={summary}
              lifetimeDistanceKm={profile?.lifetimeDistanceKm}
              runs={activity?.runs ?? []}
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
    gap: 16,
  },
});
