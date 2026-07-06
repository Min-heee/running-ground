import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { ScrollView } from 'react-native';
import { recordLiveMatchForfeitPoll } from '@/features/runs/debug/liveMatchForfeitDiagnostics';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import {
  buildMatchTransitionNotice,
  type PartyRunLinkedMatchContext,
} from '@/features/runs/lifecycle/matchStateMachine';
import {
  advanceMatchStatusVanishState,
  buildVanishedMatchStatusFallback,
  isMatchStatusVanishConfirmed,
  isMatchStatusVanishError,
  resetMatchStatusVanishState,
  shouldTeardownVanishedLinkedMatch,
  type MatchStatusVanishState,
} from '@/features/runs/sync/matchStatusVanish';
import { shouldAcceptServerSnapshot } from '@/features/runs/sync/serverClockSync';
import type { LastSyncedMatchProgress } from '@/features/runs/viewModels/matchProgress';
import type {
  RequestDuelMatchResponse,
  RequestGroupMatchResponse,
  RunningMatchRoom,
  RunningMatchStatusResponse,
  UpcomingRunningMatchItem,
} from '@/lib/api/types';
import {
  fetchRunningMatchStatus,
  fetchUpcomingRunningMatches,
} from '@/services';
import { rgDiagLog, rgPerfMark } from '@/utils/rgPerfTrace';

type UseTrackRunMatchStatusLoadersInput = {
  activeDuelSlotStartAt: string;
  activeGroupSlotStartAt: string;
  commitMatchRoom: (room: RunningMatchRoom | null) => void;
  currentUserId: string;
  duelDistanceKm: number;
  duelMatchStatus: RunningMatchStatusResponse | null;
  focusedDuelMatchIdRef: MutableRefObject<string | null>;
  focusedGroupMatchIdRef: MutableRefObject<string | null>;
  forfeitedMatchIdsRef: MutableRefObject<Set<string>>;
  groupDistanceKm: number;
  groupMatchStatus: RunningMatchStatusResponse | null;
  hasMatchResultPageRef: MutableRefObject<boolean>;
  isDuelTestFlow: boolean;
  isGroupTestFlow: boolean;
  lastMatchStatusAppliedAtMsRef: MutableRefObject<number>;
  latestDuelStatusServerNowMsRef: MutableRefObject<number>;
  latestGroupStatusServerNowMsRef: MutableRefObject<number>;
  latestUpcomingServerNowMsRef: MutableRefObject<number>;
  linkedMatchVanishStateRef: MutableRefObject<Record<'duel' | 'group', MatchStatusVanishState>>;
  livePagerRef: MutableRefObject<ScrollView | null>;
  matchRoom: RunningMatchRoom | null;
  roomLinkedMatchContextRef: MutableRefObject<PartyRunLinkedMatchContext | null>;
  setDuelMatchNotice: Dispatch<SetStateAction<string | null>>;
  setDuelMatchResult: Dispatch<SetStateAction<RequestDuelMatchResponse | null>>;
  setDuelMatchStatus: Dispatch<SetStateAction<RunningMatchStatusResponse | null>>;
  setDuelSlotCounts: Dispatch<SetStateAction<Record<string, number>>>;
  setForceOpenActiveMatch: Dispatch<SetStateAction<boolean>>;
  setGroupMatchNotice: Dispatch<SetStateAction<string | null>>;
  setGroupMatchResult: Dispatch<SetStateAction<RequestGroupMatchResponse | null>>;
  setGroupMatchStatus: Dispatch<SetStateAction<RunningMatchStatusResponse | null>>;
  setLastSyncedMatchProgress: Dispatch<SetStateAction<LastSyncedMatchProgress | null>>;
  setLiveArenaPage: Dispatch<SetStateAction<number>>;
  setMatchMode: Dispatch<SetStateAction<RunMatchMode>>;
  setUpcomingMatches: Dispatch<SetStateAction<UpcomingRunningMatchItem[]>>;
  syncServerClock: (serverNow?: string, timingSource?: unknown) => void;
  upcomingMatches: UpcomingRunningMatchItem[];
  visibleMatchRoom: RunningMatchRoom | null;
};

// The duel/group/upcoming status-poll loader cluster. Every function here is an
// intentionally UN-memoized per-render closure (no React hooks inside): downstream
// consumers (the navigation adapter, the runtime match actions, the runtime effects
// config, and the wedged-loading watchdog's loaders ref) all rely on capturing
// current-render values from fresh closures each render.
export function useTrackRunMatchStatusLoaders({
  activeDuelSlotStartAt,
  activeGroupSlotStartAt,
  commitMatchRoom,
  currentUserId,
  duelDistanceKm,
  duelMatchStatus,
  focusedDuelMatchIdRef,
  focusedGroupMatchIdRef,
  forfeitedMatchIdsRef,
  groupDistanceKm,
  groupMatchStatus,
  hasMatchResultPageRef,
  isDuelTestFlow,
  isGroupTestFlow,
  lastMatchStatusAppliedAtMsRef,
  latestDuelStatusServerNowMsRef,
  latestGroupStatusServerNowMsRef,
  latestUpcomingServerNowMsRef,
  linkedMatchVanishStateRef,
  livePagerRef,
  matchRoom,
  roomLinkedMatchContextRef,
  setDuelMatchNotice,
  setDuelMatchResult,
  setDuelMatchStatus,
  setDuelSlotCounts,
  setForceOpenActiveMatch,
  setGroupMatchNotice,
  setGroupMatchResult,
  setGroupMatchStatus,
  setLastSyncedMatchProgress,
  setLiveArenaPage,
  setMatchMode,
  setUpcomingMatches,
  syncServerClock,
  upcomingMatches,
  visibleMatchRoom,
}: UseTrackRunMatchStatusLoadersInput) {
  const clearLocalDuelMatchState = (notice?: string | null) => {
    focusedDuelMatchIdRef.current = null;
    setDuelMatchResult(null);
    rgDiagLog('duel match status set local clear', {
      currentMatchId: duelMatchStatus?.matchId ?? null,
      currentState: duelMatchStatus?.state ?? null,
      notice: notice ?? null,
      source: 'clearLocalDuelMatchState',
    });
    setDuelMatchStatus(null);
    setDuelMatchNotice(notice ?? null);
  };

  const clearLocalGroupMatchState = (notice?: string | null) => {
    focusedGroupMatchIdRef.current = null;
    setGroupMatchResult(null);
    setGroupMatchStatus(null);
    setGroupMatchNotice(notice ?? null);
  };

  const resetLinkedMatchVanishState = (source: 'duel' | 'group', matchId?: string | null) => {
    linkedMatchVanishStateRef.current[source] = resetMatchStatusVanishState(
      linkedMatchVanishStateRef.current[source],
      matchId,
    );
  };

  const clearVanishedLinkedMatch = (source: 'duel' | 'group', matchId: string) => {
    rgPerfMark('linked match vanished confirmed', {
      matchId,
      source,
    });

    if (matchRoom?.linkedMatchId === matchId || visibleMatchRoom?.linkedMatchId === matchId) {
      commitMatchRoom(null);
    }

    if (roomLinkedMatchContextRef.current?.matchId === matchId) {
      roomLinkedMatchContextRef.current = null;
    }

    setForceOpenActiveMatch(false);
    setLastSyncedMatchProgress(null);
    setUpcomingMatches((currentItems) => currentItems.filter((match) => match.matchId !== matchId));
    if (source === 'duel') {
      clearLocalDuelMatchState(null);
    } else {
      clearLocalGroupMatchState(null);
    }
    setMatchMode('solo');
    setLiveArenaPage(0);
    livePagerRef.current?.scrollTo({ x: 0, animated: false });
  };

  const handleLinkedMatchStatusVanishError = ({
    distanceKm: requestedDistanceKm,
    error: statusError,
    matchId,
    mode: statusMode,
    previousStatus,
    slotStartAt,
  }: {
    distanceKm: number;
    error: unknown;
    matchId?: string | null;
    mode: 'duel' | 'group';
    previousStatus: RunningMatchStatusResponse | null;
    slotStartAt: string;
  }) => {
    if (!matchId || !isMatchStatusVanishError(statusError, matchId)) {
      return null;
    }

    const nextState = advanceMatchStatusVanishState(linkedMatchVanishStateRef.current[statusMode], matchId);
    linkedMatchVanishStateRef.current[statusMode] = nextState;
    rgPerfMark('linked match vanish signal observed', {
      count: nextState.count,
      matchId,
      source: statusMode,
    });

    const vanishConfirmed = isMatchStatusVanishConfirmed(nextState);
    if (vanishConfirmed) {
      if (!shouldTeardownVanishedLinkedMatch({
        hasMatchResultPage: hasMatchResultPageRef.current,
        vanishConfirmed,
      })) {
        rgPerfMark('linked match vanish teardown skipped for visible result page', {
          matchId,
          source: statusMode,
        });
        return previousStatus ?? buildVanishedMatchStatusFallback({
          distanceKm: requestedDistanceKm,
          mode: statusMode,
          slotStartAt,
        });
      }

      clearVanishedLinkedMatch(statusMode, matchId);
      return buildVanishedMatchStatusFallback({
        distanceKm: requestedDistanceKm,
        mode: statusMode,
        slotStartAt,
      });
    }

    return previousStatus ?? buildVanishedMatchStatusFallback({
      distanceKm: requestedDistanceKm,
      mode: statusMode,
      slotStartAt,
    });
  };

  const loadDuelMatchStatus = async (
    slotStartAt = activeDuelSlotStartAt,
    options?: { testMode?: boolean; distanceKm?: number; matchId?: string; forceAccept?: boolean },
  ) => {
    const requestedDistanceKm = options?.distanceKm ?? duelDistanceKm;
    const requestedMatchId = options?.matchId ?? focusedDuelMatchIdRef.current ?? undefined;
    let payload: RunningMatchStatusResponse;
    recordLiveMatchForfeitPoll(options?.forceAccept ? 'duel:linked-force' : 'duel:poll');
    try {
      payload = await fetchRunningMatchStatus({
        mode: 'duel',
        distanceKm: requestedDistanceKm,
        slotStartAt,
        testMode: options?.testMode ?? isDuelTestFlow,
        matchId: requestedMatchId,
      });
      resetLinkedMatchVanishState('duel', requestedMatchId);
    } catch (statusError) {
      const vanishedFallback = handleLinkedMatchStatusVanishError({
        distanceKm: requestedDistanceKm,
        error: statusError,
        matchId: requestedMatchId,
        mode: 'duel',
        previousStatus: duelMatchStatus,
        slotStartAt,
      });
      if (vanishedFallback) {
        return vanishedFallback;
      }
      throw statusError;
    }
    // Bundle A2 step 2 — the monotonic serverNow guard now applies to the party LINKED poll too
    // (forceAccept no longer bypasses it). Backend evidence: the direct AND the linked status
    // responses are both built by the SAME buildRunningMatchStatusResponse (matchResponseBuilders.mjs)
    // off a SINGLE `const now = new Date()` stamped as serverNow at every return, so the linked
    // snapshot's serverNow is consistent/monotonic with the direct one and the guard can never
    // wrongly drop a fresh linked snapshot. forceAccept keeps its OTHER meanings (accept this
    // matchId / skip the mounted-match poll skip); it just no longer skips the clock guard.
    if (!shouldAcceptServerSnapshot(latestDuelStatusServerNowMsRef, payload.serverNow)) {
      return duelMatchStatus ?? payload;
    }

    syncServerClock(payload.serverNow, payload);
    if (payload.matchId && forfeitedMatchIdsRef.current.has(payload.matchId)) {
      clearLocalDuelMatchState(null);
      return payload;
    }

    focusedDuelMatchIdRef.current = payload.matchId ?? focusedDuelMatchIdRef.current;
    // STAGE 2 (clean core): NO client-side state clamp. The server is now the single slot gate —
    // buildRunningMatchStatusResponse reports 'matched' (with countdownRemainingSeconds) until this
    // match's slot passes, then 'active' — so an early SHARED-session 'active' (host warm-up) never
    // reaches this phone before its slot. The countdown/arena/GPS are themselves slot-gated client-
    // side (selectCountdownDigit, deriveSlotPhase, useSlotGatedArenaOpen), so no consumer can skip
    // the guest past their countdown even if a stray pre-slot 'active' ever arrived.
    const clampedPayload = payload;
    const transitionNotice = duelMatchStatus
      && duelMatchStatus.slotStartAt === clampedPayload.slotStartAt
      && Math.abs(duelMatchStatus.distanceKm - clampedPayload.distanceKm) < 0.15
      ? buildMatchTransitionNotice('duel', duelMatchStatus.state, clampedPayload.state)
      : null;

    if (clampedPayload.state === 'idle') {
      setDuelMatchResult(null);
    } else if (clampedPayload.state === 'waiting' && duelMatchStatus && duelMatchStatus.state !== 'waiting') {
      setDuelMatchResult(null);
    }

    if (transitionNotice) {
      setDuelMatchNotice(transitionNotice);
    } else if (clampedPayload.state !== 'idle') {
      setDuelMatchNotice(null);
    }

    rgDiagLog('duel match status set from poll', {
      currentUserId,
      hasOpponent: Boolean(clampedPayload.opponent),
      nextMatchId: clampedPayload.matchId ?? null,
      nextState: clampedPayload.state ?? null,
      serverState: payload.state ?? null,
      clampedBeforeSlot: false,
      opponentId: clampedPayload.opponent?.id ?? null,
      opponentLiveDistanceKm: clampedPayload.opponent?.liveDistanceKm ?? null,
      opponentLiveUpdatedAt: clampedPayload.opponent?.liveUpdatedAt ?? null,
      requestedDistanceKm: options?.distanceKm ?? duelDistanceKm,
      requestedMatchId: options?.matchId ?? focusedDuelMatchIdRef.current ?? null,
      requestedSlotStartAt: slotStartAt,
      source: options?.forceAccept ? 'force-accept' : 'poll',
    });
    setDuelMatchStatus(clampedPayload);
    // Opponent-sync lifeline stamp (Piece 2) — mark the wall-clock time of this ACCEPTED apply.
    // Guard-dropped snapshots (stale serverNow / forfeited matchId) returned above without
    // stamping, so a silent channel leaves the stamp stale and trips the lifeline.
    lastMatchStatusAppliedAtMsRef.current = Date.now();
    return clampedPayload;
  };

  const loadGroupMatchStatus = async (
    slotStartAt = activeGroupSlotStartAt,
    options?: { testMode?: boolean; distanceKm?: number; matchId?: string; forceAccept?: boolean },
  ) => {
    const requestedDistanceKm = options?.distanceKm ?? groupDistanceKm;
    const requestedMatchId = options?.matchId ?? focusedGroupMatchIdRef.current ?? undefined;
    let payload: RunningMatchStatusResponse;
    recordLiveMatchForfeitPoll(options?.forceAccept ? 'group:linked-force' : 'group:poll');
    try {
      payload = await fetchRunningMatchStatus({
        mode: 'group',
        distanceKm: requestedDistanceKm,
        slotStartAt,
        testMode: options?.testMode ?? isGroupTestFlow,
        matchId: requestedMatchId,
      });
      resetLinkedMatchVanishState('group', requestedMatchId);
    } catch (statusError) {
      const vanishedFallback = handleLinkedMatchStatusVanishError({
        distanceKm: requestedDistanceKm,
        error: statusError,
        matchId: requestedMatchId,
        mode: 'group',
        previousStatus: groupMatchStatus,
        slotStartAt,
      });
      if (vanishedFallback) {
        return vanishedFallback;
      }
      throw statusError;
    }
    // Bundle A2 step 2 — same unification as duel above: the party LINKED group poll now obeys the
    // monotonic serverNow guard because the linked status response shares buildRunningMatchStatusResponse's
    // single serverNow stamp with the direct response. forceAccept retains its non-clock meanings only.
    if (!shouldAcceptServerSnapshot(latestGroupStatusServerNowMsRef, payload.serverNow)) {
      return groupMatchStatus ?? payload;
    }

    syncServerClock(payload.serverNow, payload);
    if (payload.matchId && forfeitedMatchIdsRef.current.has(payload.matchId)) {
      clearLocalGroupMatchState(null);
      return payload;
    }

    focusedGroupMatchIdRef.current = payload.matchId ?? focusedGroupMatchIdRef.current;
    // STAGE 2 (clean core): NO client-side state clamp — identical rationale to loadDuelMatchStatus.
    // The backend status endpoint slot-gates the reported state ('matched' until the slot passes),
    // and the countdown/arena/GPS are slot-gated client-side, so the guest can never be skipped past
    // their countdown.
    const clampedPayload = payload;
    const transitionNotice = groupMatchStatus
      && groupMatchStatus.slotStartAt === clampedPayload.slotStartAt
      && Math.abs(groupMatchStatus.distanceKm - clampedPayload.distanceKm) < 0.15
      ? buildMatchTransitionNotice('group', groupMatchStatus.state, clampedPayload.state)
      : null;

    if (clampedPayload.state === 'idle') {
      setGroupMatchResult(null);
    } else if (clampedPayload.state === 'waiting' && groupMatchStatus && groupMatchStatus.state !== 'waiting') {
      setGroupMatchResult(null);
    }

    if (transitionNotice) {
      setGroupMatchNotice(transitionNotice);
    } else if (clampedPayload.state !== 'idle') {
      setGroupMatchNotice(null);
    }

    setGroupMatchStatus(clampedPayload);
    // Opponent-sync lifeline stamp (Piece 2) — accepted applies only, same as the duel loader.
    lastMatchStatusAppliedAtMsRef.current = Date.now();
    return clampedPayload;
  };

  const loadUpcomingMatches = async () => {
    const payload = await fetchUpcomingRunningMatches();
    if (!shouldAcceptServerSnapshot(latestUpcomingServerNowMsRef, payload.serverNow)) {
      return upcomingMatches;
    }

    syncServerClock(payload.serverNow, payload);
    setUpcomingMatches(payload.items);
    setDuelSlotCounts(payload.duelSlotCounts ?? {});
    return payload.items;
  };

  return {
    clearLocalDuelMatchState,
    clearLocalGroupMatchState,
    loadDuelMatchStatus,
    loadGroupMatchStatus,
    loadUpcomingMatches,
  };
}
