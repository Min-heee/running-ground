import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View, StyleSheet } from 'react-native';
import { Screen } from '@/components/Screen';
import { HomeOverview } from '@/features/home/HomeOverview';
import { OfflineRaceEvent, UserProfile, WeeklySummary } from '@/domain/types';
import { fetchFriendLeaderboard, fetchHomeSummary, fetchOfflineRaceHub } from '@/lib/api/services';
import { getCurrentUserProfile } from '@/lib/session';

type HomeFriendOverview = {
  myRank: number | null;
  totalParticipants: number;
  leaderName: string;
};

export default function HomeScreen() {
  const [summary, setSummary] = useState<WeeklySummary | null>(null);
  const [friendOverview, setFriendOverview] = useState<HomeFriendOverview | null>(null);
  const [nextRace, setNextRace] = useState<OfflineRaceEvent | null>(null);
  const [myRace, setMyRace] = useState<OfflineRaceEvent | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(getCurrentUserProfile());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError(null);

      const [summaryResult, leaderboardResult, raceHubResult] = await Promise.allSettled([
        fetchHomeSummary(),
        fetchFriendLeaderboard(),
        fetchOfflineRaceHub(),
      ]);

      if (!active) {
        return;
      }

      if (summaryResult.status === 'rejected') {
        setSummary(null);
        setFriendOverview(null);
        setError('홈 정보를 불러오지 못했어.');
        setLoading(false);
        return;
      }

      const summaryData = summaryResult.value;
      setSummary(summaryData);

      if (leaderboardResult.status === 'fulfilled') {
        const currentProfile = getCurrentUserProfile();
        setProfile(currentProfile);
        const myEntry = leaderboardResult.value.ranks.find((entry) => (
          (currentProfile?.publicTag && entry.tag === currentProfile.publicTag)
          || (currentProfile?.name && entry.name === currentProfile.name)
        )) ?? null;

        setFriendOverview({
          myRank: myEntry?.rank ?? null,
          totalParticipants: leaderboardResult.value.ranks.length,
          leaderName: leaderboardResult.value.ranks[0]?.name ?? summaryData.friendName,
        });
      } else {
        setFriendOverview(null);
      }

      if (raceHubResult.status === 'fulfilled') {
        const raceEvents = [raceHubResult.value.featuredEvent, ...raceHubResult.value.upcomingEvents]
          .filter((event) => event.status !== 'finished')
          .sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime());

        const nextAvailableEvent = raceEvents
          .find((event) => event.status !== 'finished') ?? null;
        const nextRegisteredEvent = raceEvents.find((event) => event.registered) ?? null;

        setNextRace(nextAvailableEvent);
        setMyRace(nextRegisteredEvent);
      } else {
        setNextRace(null);
        setMyRace(null);
      }

      setLoading(false);
    };

    void load();

    return () => {
      active = false;
    };
  }, []);

  return (
    <Screen>
      <View style={styles.contentWrap}>
        <View style={styles.headerWrap}>
          <Text style={styles.headerLabel}>홈</Text>
          <Text style={styles.headerBrand}>RUNNIGAPP</Text>
        </View>
        {loading ? <ActivityIndicator size="large" color="#6D5EF7" /> : null}
        {error ? <Text>{error}</Text> : null}
        {summary ? (
          <HomeOverview
            summary={summary}
            lifetimeDistanceKm={profile?.lifetimeDistanceKm}
            runs={[]}
            friendOverview={friendOverview}
            nextRace={nextRace}
            myRace={myRace}
          />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  contentWrap: {
    gap: 16,
  },
  headerWrap: {
    gap: 4,
    paddingTop: 4,
  },
  headerLabel: {
    color: '#101828',
    fontSize: 28,
    fontWeight: '800',
  },
  headerBrand: {
    color: '#6D5EF7',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
});
