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

  return (
    <View style={styles.root}>
      <Screen>
        <View style={styles.contentWrap}>
          <HomeHeader />
          {notices.map((notice) => (
            <HomeNoticeCard key={notice.id} notice={notice} />
          ))}
          {loading ? <ActivityIndicator size="large" color="#6D5EF7" /> : null}
          {error ? <Text>{error}</Text> : null}
          <HomeUpcomingMatchesCard
            matches={visibleUpcomingMatches}
            nowMs={nowMs}
            cancelingMatchId={cancelingMatchId}
            onCancelMatch={(match) => {
              void handleCancelUpcomingMatch(match);
            }}
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
