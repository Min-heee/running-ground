import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { MatchStartCountdownOverlay } from '@/components/matches/MatchStartCountdownOverlay';
import { Screen } from '@/components/Screen';
import { HomeHeader } from '@/features/home/components/HomeHeader';
import { HomeNoticeCard } from '@/features/home/components/HomeNoticeCard';
import { HomeUpcomingMatchesCard } from '@/features/home/components/HomeUpcomingMatchesCard';
import { HomeOverview } from '@/features/home/HomeOverview';
import { AppNotice, UserProfile, WeeklySummary } from '@/domain';
import { syncScheduledMatchNotifications } from '@/lib/matchNotifications';
import {
  findNextStartingMatchedMatch,
  shouldShowMatchStartOverlay,
} from '@/lib/matchCountdown';
import { cancelRunningMatch, fetchActiveNotices, fetchHomeSummary, fetchMyActivity, fetchMyProfile, fetchNotificationSettings, fetchUpcomingRunningMatches } from '@/services';
import { getCurrentUserProfile } from '@/lib/session';
import { MyActivityResponse, UpcomingRunningMatchItem } from '@/lib/api/types';

const STALE_RENDER_MATCHED_MATCH_MS = 10 * 60 * 1000;
const STALE_RENDER_ACTIVE_MATCH_MS = 8 * 60 * 60 * 1000;

function shouldHidePastUpcomingMatch(
  match: Pick<UpcomingRunningMatchItem, 'slotStartAt' | 'status'>,
  nowMs: number,
) {
  const slotStartMs = new Date(match.slotStartAt).getTime();

  if (!Number.isFinite(slotStartMs)) {
    return false;
  }

  const elapsedMs = nowMs - slotStartMs;

  if (match.status === 'active') {
    return elapsedMs > STALE_RENDER_ACTIVE_MATCH_MS;
  }

  return elapsedMs > STALE_RENDER_MATCHED_MATCH_MS;
}

export default function HomeScreen() {
  const [summary, setSummary] = useState<WeeklySummary | null>(null);
  const [notices, setNotices] = useState<AppNotice[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(getCurrentUserProfile());
  const [activity, setActivity] = useState<MyActivityResponse | null>(null);
  const [upcomingMatches, setUpcomingMatches] = useState<UpcomingRunningMatchItem[]>([]);
  const [matchRemindersEnabled, setMatchRemindersEnabled] = useState(true);
  const [cancelingMatchId, setCancelingMatchId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadHome = useCallback(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError(null);

      const [summaryResult, profileResult, activityResult, noticesResult, upcomingMatchesResult, notificationSettingsResult] = await Promise.allSettled([
        fetchHomeSummary(),
        fetchMyProfile(),
        fetchMyActivity(),
        fetchActiveNotices(),
        fetchUpcomingRunningMatches(),
        fetchNotificationSettings(),
      ]);

      if (!active) {
        return;
      }

      if (noticesResult.status === 'fulfilled') {
        setNotices(noticesResult.value.items.slice(0, 2));
      } else {
        setNotices([]);
      }

      if (upcomingMatchesResult.status === 'fulfilled') {
        setUpcomingMatches(upcomingMatchesResult.value.items);
      } else {
        setUpcomingMatches([]);
      }

      if (notificationSettingsResult.status === 'fulfilled') {
        setMatchRemindersEnabled(notificationSettingsResult.value.matchReminders);
      }

      if (summaryResult.status === 'rejected') {
        setSummary(null);
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

      setLoading(false);
    };

    void load();

    return () => {
      active = false;
    };
  }, []);

  useFocusEffect(loadHome);

  useEffect(() => {
    void syncScheduledMatchNotifications(upcomingMatches, matchRemindersEnabled);
  }, [matchRemindersEnabled, upcomingMatches]);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const visibleUpcomingMatches = useMemo(
    () => upcomingMatches.filter((match) => !shouldHidePastUpcomingMatch(match, nowMs)),
    [nowMs, upcomingMatches],
  );

  const nextStartingMatch = useMemo(
    () => findNextStartingMatchedMatch(visibleUpcomingMatches, nowMs),
    [nowMs, visibleUpcomingMatches],
  );

  const handleCancelUpcomingMatch = async (match: UpcomingRunningMatchItem) => {
    try {
      setError(null);
      setCancelingMatchId(match.matchId);
      await cancelRunningMatch({
        mode: match.mode,
        distanceKm: match.distanceKm,
        slotStartAt: match.slotStartAt,
        matchId: match.matchId,
      });
      const payload = await fetchUpcomingRunningMatches();
      setUpcomingMatches(payload.items);
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : '예약을 취소하지 못했어.');
    } finally {
      setCancelingMatchId(null);
    }
  };

  const handleOpenRunningMatch = (match: UpcomingRunningMatchItem) => {
    router.push({
      pathname: '/(tabs)/running',
      params: {
        focusMatchMode: match.mode,
        focusMatchId: match.matchId,
        focusMatchDistanceKm: String(match.distanceKm),
        focusMatchSlotStartAt: match.slotStartAt,
        focusMatchIsTest: match.isTestMatch ? '1' : '0',
        focusMatchNonce: String(Date.now()),
      },
    });
  };

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
