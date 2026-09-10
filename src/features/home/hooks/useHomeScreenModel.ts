import { useCallback, useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import type { UserProfile, WeeklySummary } from '@/domain';
import { shouldHidePastUpcomingMatch } from '@/features/home/utils/homeUpcomingMatches';
import { confirmUpcomingMatchCancel } from '@/features/runs/components/confirmUpcomingMatchCancel';
import { resolveUpcomingMatchInteraction } from '@/features/runs/components/upcomingMatchInteraction';
import { useReservationArenaHandoff } from '@/features/match/hooks/useReservationArenaHandoff';
import { isGlobalTrackerBusy } from '@/features/runs/tracking/globalTrackerActivity';
import {
  findNextStartingMatchedMatch,
  getMatchStartRemainingSeconds,
} from '@/lib/matchCountdown';
import { syncScheduledMatchNotifications } from '@/lib/matchNotifications';
import { getCurrentUserProfile } from '@/lib/session';
import type { MyActivityResponse, UpcomingRunningMatchItem } from '@/lib/api/types';
import {
  cancelRunningMatch,
  fetchHomeSummary,
  fetchMyActivity,
  fetchMyProfile,
  fetchNotificationSettings,
  fetchUpcomingRunningMatches,
  getApiErrorMessage,
} from '@/services';
import {
  useAndroidDeferredEffect,
  useAndroidDeferredFocusEffect,
} from '@/utils/useAndroidDeferredInteractionEffect';

const HOME_INITIAL_FETCH_DEFER_MS = 120;
const HOME_NOTIFICATION_SYNC_DEFER_MS = 250;
const HOME_TIMER_DEFER_MS = 120;

export function useHomeScreenModel() {
  const [summary, setSummary] = useState<WeeklySummary | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(getCurrentUserProfile());
  const [activity, setActivity] = useState<MyActivityResponse | null>(null);
  const [upcomingMatches, setUpcomingMatches] = useState<UpcomingRunningMatchItem[]>([]);
  const [matchRemindersEnabled, setMatchRemindersEnabled] = useState(true);
  const [cancelingMatchId, setCancelingMatchId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);

  const loadHome = useCallback(() => {
    let active = true;

    const load = async () => {
      if (!hasLoadedRef.current) {
        setLoading(true);
      }
      setError(null);

      const [
        summaryResult,
        profileResult,
        activityResult,
        upcomingMatchesResult,
        notificationSettingsResult,
      ] = await Promise.allSettled([
        fetchHomeSummary(),
        fetchMyProfile(),
        fetchMyActivity(),
        fetchUpcomingRunningMatches(),
        fetchNotificationSettings(),
      ]);

      if (!active) {
        return;
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
        setError('홈 정보를 불러오지 못했어요.');
        hasLoadedRef.current = true;
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

      hasLoadedRef.current = true;
      setLoading(false);
    };

    void load();

    return () => {
      active = false;
    };
  }, []);

  useAndroidDeferredFocusEffect(loadHome, [loadHome], {
    delayMs: HOME_INITIAL_FETCH_DEFER_MS,
    source: 'home screen model',
    tab: 'home',
    traceInitialFetch: true,
    work: 'home data fetch',
  });

  useAndroidDeferredEffect(() => {
    if (!hasLoadedRef.current && upcomingMatches.length === 0) {
      return undefined;
    }

    void syncScheduledMatchNotifications(upcomingMatches, matchRemindersEnabled);
  }, [matchRemindersEnabled, upcomingMatches], {
    delayMs: HOME_NOTIFICATION_SYNC_DEFER_MS,
    source: 'home screen model',
    tab: 'home',
    work: 'match notification sync',
  });

  useAndroidDeferredEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [], {
    delayMs: HOME_TIMER_DEFER_MS,
    source: 'home screen model',
    tab: 'home',
    work: 'countdown clock',
  });

  const visibleUpcomingMatches = useMemo(
    () => upcomingMatches.filter((match) => !shouldHidePastUpcomingMatch(match, nowMs)),
    [nowMs, upcomingMatches],
  );

  const nextStartingMatch = useMemo(
    () => findNextStartingMatchedMatch(visibleUpcomingMatches, nowMs),
    [nowMs, visibleUpcomingMatches],
  );

  // 815 리허설 (2026-08-11): 편성된 그룹 세션의 카운트다운이 홈 카드에서 0까지 내려가도 화면이
  // 홈에 머물렀다 — 아레나 자동 진입(≤25s 핸드오프)이 예약 대기방 화면에만 있었기 때문. 같은
  // 핸드오프를 홈의 다음 출발 매치에도 건다: 출발 25초 전에 러닝 탭으로 교체 진입해 카운트다운
  // 오버레이가 끊김 없이 이어지고, 아레나가 워밍업(사전 GPS 예열)을 켠 채 정각에 출발한다.
  // 발동 범위: freezeOnBlur 때문에 이 효과는 홈이 포커스된 동안(또는 창 안에서 홈으로 복귀한
  // 순간)에만 발동한다 — 다른 탭 대기는 각 탭의 핸드오프(레이스 탭 등)가 맡는다.
  useReservationArenaHandoff({
    mode: nextStartingMatch?.match.mode ?? 'duel',
    matchId: nextStartingMatch?.match.matchId ?? null,
    distanceKm: nextStartingMatch?.match.distanceKm ?? null,
    slotStartAt: nextStartingMatch?.match.slotStartAt ?? null,
    isTestMatch: nextStartingMatch?.match.isTestMatch ?? false,
    remainingSeconds: nextStartingMatch?.remainingSeconds ?? null,
    // 게이트 (적대 검증 2026-08-11): ① 취소 정산 중인 매치는 핸드오프 금지(예약 방과 같은
    // 계약), ② 트래커가 기록 중이면(워밍업 솔로런 등) 자동 진입을 포기한다 — 런타임 자체
    // 핸드오프의 isIdle 게이트(shouldAutoFocusMatchArena)와 같은 계약. 수동 진입은 언제나 가능.
    enabled: (!nextStartingMatch || cancelingMatchId !== nextStartingMatch.match.matchId)
      && !isGlobalTrackerBusy(),
  });

  const runCancelUpcomingMatch = useCallback(async (match: UpcomingRunningMatchItem) => {
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
      setError(getApiErrorMessage(cancelError, '예약을 취소하지 못했어요.'));
    } finally {
      setCancelingMatchId(null);
    }
  }, []);

  // 파티런 예약은 상대 방까지 같이 사라지므로 확인을 거친다; 공식 예약은 지금처럼 바로 취소.
  const handleCancelUpcomingMatch = useCallback(async (match: UpcomingRunningMatchItem) => {
    confirmUpcomingMatchCancel(match, (confirmedMatch) => {
      void runCancelUpcomingMatch(confirmedMatch);
    });
  }, [runCancelUpcomingMatch]);

  const handleOpenRunningMatch = useCallback((match: UpcomingRunningMatchItem) => {
    // 파티런 예약 카드(roomId 동봉)는 출발 전엔 파티런 대기방으로 (오너 2026-09-09) — 그 방이
    // 예약 완료 화면과 카운트다운 핸드오프를 맡는다. 아레나 창(≤20s)/진행 중은 아래 러닝 탭 경로.
    const interaction = resolveUpcomingMatchInteraction(
      match,
      getMatchStartRemainingSeconds(match.slotStartAt),
    );
    if (interaction.opensPartyRoom) {
      router.push('/match-room');
      return;
    }

    // 레이스 편성 세션의 예약 카드는 '출발 전'에만 레이스 대기실로 (오너 2026-08-13) —
    // 출발 25초 전 아레나 자동 진입은 대기실이 그대로 이어받는다. 출발 후(active)에는 기존
    // 러닝 탭 복원 경로 유지 (적대 검증: 앱이 죽었다 살아난 참가자의 아레나 재진입이 이 길이다).
    if (match.raceEventId && match.status === 'matched') {
      router.push({ pathname: '/race-lobby', params: { raceId: match.raceEventId } });
      return;
    }

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
    nowMs,
    profile,
    summary,
    visibleUpcomingMatches,
  };
}
