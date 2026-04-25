import { useCallback, useState } from 'react';
import { ActivityIndicator, Text, View, StyleSheet } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { HomeOverview } from '@/features/home/HomeOverview';
import { AppNotice, OfflineRaceEvent, UserProfile, WeeklySummary } from '@/domain/types';
import { fetchActiveNotices, fetchFriendLeaderboard, fetchHomeSummary, fetchMyActivity, fetchMyProfile, fetchOfflineRaceHub } from '@/lib/api/services';
import { getCurrentUserProfile } from '@/lib/session';
import { MyActivityResponse } from '@/lib/api/types';

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
  const [notices, setNotices] = useState<AppNotice[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(getCurrentUserProfile());
  const [activity, setActivity] = useState<MyActivityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadHome = useCallback(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError(null);

      const [summaryResult, leaderboardResult, raceHubResult, profileResult, activityResult, noticesResult] = await Promise.allSettled([
        fetchHomeSummary(),
        fetchFriendLeaderboard(),
        fetchOfflineRaceHub(),
        fetchMyProfile(),
        fetchMyActivity(),
        fetchActiveNotices(),
      ]);

      if (!active) {
        return;
      }

      if (noticesResult.status === 'fulfilled') {
        setNotices(noticesResult.value.items.slice(0, 2));
      } else {
        setNotices([]);
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

      if (profileResult.status === 'fulfilled') {
        setProfile(profileResult.value);
      } else {
        setProfile(getCurrentUserProfile());
      }

      if (activityResult.status === 'fulfilled') {
        setActivity(activityResult.value);
      } else {
        setActivity(null);
      }

      if (leaderboardResult.status === 'fulfilled') {
        const currentProfile = profileResult.status === 'fulfilled' ? profileResult.value : getCurrentUserProfile();
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
          .filter((event): event is OfflineRaceEvent => Boolean(event))
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

  useFocusEffect(loadHome);

  return (
    <Screen>
      <View style={styles.contentWrap}>
        <View style={styles.headerWrap}>
          <Text style={styles.headerLabel}>홈</Text>
          <Text style={styles.headerBrand}>RunningGround</Text>
        </View>
        {notices.map((notice) => (
          <Card key={notice.id} style={styles.noticeCard}>
            <Text style={styles.noticeLabel}>운영 공지</Text>
            <Text style={styles.noticeTitle}>{notice.title}</Text>
            <Text style={styles.noticeMessage}>{notice.message}</Text>
          </Card>
        ))}
        {loading ? <ActivityIndicator size="large" color="#6D5EF7" /> : null}
        {error ? <Text>{error}</Text> : null}
        {summary ? (
          <HomeOverview
            summary={summary}
            lifetimeDistanceKm={profile?.lifetimeDistanceKm}
            runs={activity?.runs ?? []}
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
  noticeCard: {
    backgroundColor: '#111827',
    gap: 6,
  },
  noticeLabel: {
    color: '#C7D2FE',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  noticeTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
  },
  noticeMessage: {
    color: '#D0D5DD',
    lineHeight: 21,
  },
});
