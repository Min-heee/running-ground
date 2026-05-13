import { useCallback, useEffect, useMemo, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import type { AppNotice, UserProfile, WeeklySummary } from '@/domain';
import { shouldHidePastUpcomingMatch } from '@/features/home/utils/homeUpcomingMatches';
import {
  findNextStartingMatchedMatch,
} from '@/lib/matchCountdown';
import { syncScheduledMatchNotifications } from '@/lib/matchNotifications';
import { getCurrentUserProfile } from '@/lib/session';
import type { MyActivityResponse, UpcomingRunningMatchItem } from '@/lib/api/types';
import {
  cancelRunningMatch,
  fetchActiveNotices,
  fetchHomeSummary,
  fetchMyActivity,
  fetchMyProfile,
  fetchNotificationSettings,
  fetchUpcomingRunningMatches,
  getApiErrorMessage,
} from '@/services';

export function useHomeScreenModel() {
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

      const [
        summaryResult,
        profileResult,
        activityResult,
        noticesResult,
        upcomingMatchesResult,
        notificationSettingsResult,
      ] = await Promise.allSettled([
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

  const handleCancelUpcomingMatch = useCallback(async (match: UpcomingRunningMatchItem) => {
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
      setError(getApiErrorMessage(cancelError, '예약을 취소하지 못했어.'));
    } finally {
      setCancelingMatchId(null);
    }
  }, []);

  const handleOpenRunningMatch = useCallback((match: UpcomingRunningMatchItem) => {
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
  }, []);

  return {
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
  };
}
