import { useMemo, useRef } from 'react';
import type {
  RunningMatchRoom,
  RunningMatchStatusResponse,
  UpcomingRunningMatchItem,
} from '@/lib/api/types';
import {
  findNextStartingMatchedMatch,
  getMatchStartRemainingSeconds,
  MATCH_OVERLAY_COUNTDOWN_WINDOW_SECONDS,
  MATCH_ROOM_HOST_COUNTDOWN_VISIBLE_SECONDS,
} from '@/lib/matchCountdown';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import { useStableCountdownSeconds } from '@/features/runs/lifecycle/hooks/useStableCountdownSeconds';
import {
  buildPartyRunFlowSnapshot,
} from '@/features/runs/lifecycle/matchStateMachine';
import { selectLinkedRuntimeRoom } from '@/features/runs/lifecycle/matchRuntimeStateSelector';

type CountdownEntry = {
  title: string;
  subtitle: string;
  remainingSeconds: number;
  targetMs?: number | null;
  countdownKey?: string | null;
};

type MonotonicCountdownTracker = {
  key: string;
  displayedRemainingSeconds: number;
  displayedAtMs: number;
};

type HostStartCountdownLock = {
  localTargetMs: number;
};

const HOST_START_COUNTDOWN_LOCK_MAX_ENTRIES = 8;
const hostStartCountdownLocks = new Map<string, HostStartCountdownLock>();

function clearHostStartCountdownLock(key: string | null) {
  if (key) {
    hostStartCountdownLocks.delete(key);
  }
}

function writeHostStartCountdownLock(key: string, lock: HostStartCountdownLock) {
  hostStartCountdownLocks.delete(key);
  hostStartCountdownLocks.set(key, lock);

  while (hostStartCountdownLocks.size > HOST_START_COUNTDOWN_LOCK_MAX_ENTRIES) {
    const oldestKey = hostStartCountdownLocks.keys().next().value;
    if (typeof oldestKey !== 'string') {
      break;
    }
    hostStartCountdownLocks.delete(oldestKey);
  }
}

export function readPersistentHostStartCountdownTargetMs(key: string | null) {
  return key ? hostStartCountdownLocks.get(key)?.localTargetMs ?? null : null;
}

type UseMatchCountdownModelInput = {
  matchMode: RunMatchMode;
  nowMs: number;
  syncedNowMs: number;
  visibleUpcomingMatches: UpcomingRunningMatchItem[];
  duelMatchState: RunningMatchStatusResponse['state'];
  groupMatchState: RunningMatchStatusResponse['state'];
  duelMatchStatus: RunningMatchStatusResponse | null;
  groupMatchStatus: RunningMatchStatusResponse | null;
  activeDuelSlotStartAt: string;
  activeGroupSlotStartAt: string;
  visibleMatchRoom: RunningMatchRoom | null;
  matchRoom: RunningMatchRoom | null;
  currentRoomParticipantIsCountdownReady?: boolean | null;
};

export function resolveShouldShowRoomArmingOverlay({
  linkedMatchId,
  linkedMatchSlotStartAt,
  matchMode,
  remainingSeconds,
  shouldShowLoading,
  startMode,
  syncedNowMs,
}: {
  linkedMatchId?: string | null;
  linkedMatchSlotStartAt?: string | null;
  matchMode: RunMatchMode;
  remainingSeconds?: number | null;
  shouldShowLoading: boolean;
  startMode?: RunningMatchRoom['startMode'] | null;
  syncedNowMs: number;
}) {
  const linkedSlotStartMs = linkedMatchSlotStartAt ? Date.parse(linkedMatchSlotStartAt) : NaN;
  const hasLinkedMatchSlotElapsed = Number.isFinite(linkedSlotStartMs) && syncedNowMs >= linkedSlotStartMs;
  const shouldShowHostStartPollInLoading = Boolean(
    startMode === 'host'
    && typeof remainingSeconds === 'number'
    && remainingSeconds > MATCH_ROOM_HOST_COUNTDOWN_VISIBLE_SECONDS,
  );

  return Boolean(
    linkedMatchId
    && (shouldShowLoading || shouldShowHostStartPollInLoading)
    && (matchMode === 'duel' || matchMode === 'group')
    && !hasLinkedMatchSlotElapsed,
  );
}

export function shouldShowRoomCountdownNumbers({
  remainingSeconds,
  startMode,
}: {
  remainingSeconds: number | null;
  startMode?: RunningMatchRoom['startMode'] | null;
}) {
  if (startMode === 'host') {
    return (
      typeof remainingSeconds === 'number'
      && remainingSeconds <= MATCH_ROOM_HOST_COUNTDOWN_VISIBLE_SECONDS
    );
  }

  return (
    typeof remainingSeconds !== 'number'
    || remainingSeconds <= MATCH_OVERLAY_COUNTDOWN_WINDOW_SECONDS
  );
}

export function resolveMonotonicCountdownRemainingSeconds({
  key,
  maxStartSeconds,
  nowMs,
  rawRemainingSeconds,
  tracker,
}: {
  key: string | null;
  maxStartSeconds: number;
  nowMs: number;
  rawRemainingSeconds: number | null;
  tracker: { current: MonotonicCountdownTracker | null };
}) {
  if (!key || typeof rawRemainingSeconds !== 'number') {
    tracker.current = null;
    return rawRemainingSeconds;
  }

  const rawDisplaySeconds = Math.max(0, Math.min(maxStartSeconds, rawRemainingSeconds));
  const current = tracker.current;

  if (!current || current.key !== key) {
    tracker.current = {
      key,
      displayedRemainingSeconds: rawDisplaySeconds,
      displayedAtMs: nowMs,
    };
    return rawDisplaySeconds;
  }

  const elapsedSeconds = Math.max(0, Math.floor((nowMs - current.displayedAtMs) / 1000));
  const slowestAllowedNext = Math.max(0, current.displayedRemainingSeconds - elapsedSeconds);
  const nextDisplayedSeconds = Math.min(
    current.displayedRemainingSeconds,
    Math.max(rawDisplaySeconds, slowestAllowedNext),
  );

  if (nextDisplayedSeconds < current.displayedRemainingSeconds) {
    tracker.current = {
      key,
      displayedRemainingSeconds: nextDisplayedSeconds,
      displayedAtMs: nowMs,
    };
  }

  return nextDisplayedSeconds;
}

export function resolvePersistentHostStartCountdownRemainingSeconds({
  key,
  maxStartSeconds,
  nowMs,
  rawRemainingSeconds,
}: {
  key: string | null;
  maxStartSeconds: number;
  nowMs: number;
  rawRemainingSeconds: number | null;
}) {
  if (!key) {
    return null;
  }

  let lock = hostStartCountdownLocks.get(key) ?? null;
  if (!lock) {
    if (
      typeof rawRemainingSeconds !== 'number'
      || rawRemainingSeconds <= 0
      || rawRemainingSeconds > maxStartSeconds
    ) {
      return null;
    }

    lock = {
      localTargetMs: nowMs + Math.min(maxStartSeconds, rawRemainingSeconds) * 1000,
    };
    writeHostStartCountdownLock(key, lock);
  }

  const remainingMs = lock.localTargetMs - nowMs;
  if (remainingMs <= 0) {
    clearHostStartCountdownLock(key);
    return null;
  }

  return Math.max(
    1,
    Math.min(maxStartSeconds, Math.ceil(remainingMs / 1000)),
  );
}

export function resetPersistentHostStartCountdownForTest() {
  hostStartCountdownLocks.clear();
}

function useHostStartCountdownSeconds({
  key,
  maxStartSeconds,
  nowMs,
  rawRemainingSeconds,
}: {
  key: string | null;
  maxStartSeconds: number;
  nowMs: number;
  rawRemainingSeconds: number | null;
}) {
  const previousKeyRef = useRef<string | null>(null);
  if (previousKeyRef.current !== key) {
    clearHostStartCountdownLock(previousKeyRef.current);
    previousKeyRef.current = key;
  }

  return resolvePersistentHostStartCountdownRemainingSeconds({
    key,
    maxStartSeconds,
    nowMs,
    rawRemainingSeconds,
  });
}

export function normalizePartyRunFlowRemainingSeconds(remainingSeconds: number | null) {
  if (typeof remainingSeconds !== 'number') {
    return null;
  }

  if (remainingSeconds <= 20) {
    return 20;
  }

  if (remainingSeconds <= 30) {
    return 30;
  }

  if (remainingSeconds <= 60) {
    return 60;
  }

  return 61;
}

function shouldTrackDirectMatchCountdown(state: RunningMatchStatusResponse['state']) {
  return state === 'matched' || state === 'active';
}

export function resolvePartyRunFlowSyncedNowMs({
  room,
  remainingSeconds,
  syncedNowMs,
}: {
  room: RunningMatchRoom | null;
  remainingSeconds: number | null;
  syncedNowMs: number;
}) {
  if (typeof remainingSeconds === 'number') {
    return null;
  }

  const linkedSlotStartAt = room?.linkedMatchSlotStartAt ?? room?.slotStartAt;
  const linkedSlotStartMs = linkedSlotStartAt ? Date.parse(linkedSlotStartAt) : NaN;

  if (!Number.isFinite(linkedSlotStartMs) || syncedNowMs < linkedSlotStartMs) {
    return null;
  }

  return linkedSlotStartMs + 1;
}

export function useMatchCountdownModel({
  matchMode,
  nowMs,
  syncedNowMs,
  visibleUpcomingMatches,
  duelMatchState,
  groupMatchState,
  duelMatchStatus,
  groupMatchStatus,
  activeDuelSlotStartAt,
  activeGroupSlotStartAt,
  visibleMatchRoom,
  matchRoom,
  currentRoomParticipantIsCountdownReady,
}: UseMatchCountdownModelInput) {
  const rawDuelStartCountdownSeconds =
    shouldTrackDirectMatchCountdown(duelMatchState)
      ? getMatchStartRemainingSeconds(duelMatchStatus?.slotStartAt ?? activeDuelSlotStartAt, syncedNowMs)
      : null;
  const duelStartCountdownSeconds = useStableCountdownSeconds({
    key: shouldTrackDirectMatchCountdown(duelMatchState)
      ? `${duelMatchStatus?.matchId ?? 'duel'}:${duelMatchStatus?.slotStartAt ?? activeDuelSlotStartAt}`
      : null,
    rawRemainingSeconds: rawDuelStartCountdownSeconds,
    nowMs,
  });
  const rawGroupStartCountdownSeconds =
    shouldTrackDirectMatchCountdown(groupMatchState)
      ? getMatchStartRemainingSeconds(groupMatchStatus?.slotStartAt ?? activeGroupSlotStartAt, syncedNowMs)
      : null;
  const groupStartCountdownSeconds = useStableCountdownSeconds({
    key: shouldTrackDirectMatchCountdown(groupMatchState)
      ? `${groupMatchStatus?.matchId ?? 'group'}:${groupMatchStatus?.slotStartAt ?? activeGroupSlotStartAt}`
      : null,
    rawRemainingSeconds: rawGroupStartCountdownSeconds,
    nowMs,
  });
  const nextStartingMatch = useMemo(
    () => findNextStartingMatchedMatch(visibleUpcomingMatches, syncedNowMs),
    [syncedNowMs, visibleUpcomingMatches],
  );
  const stableNextStartingMatchKey = useMemo(
    () => nextStartingMatch
      ? `${nextStartingMatch.match.matchId}:${nextStartingMatch.match.slotStartAt}`
      : null,
    [nextStartingMatch],
  );
  const stableNextStartingMatchRemainingSeconds = useStableCountdownSeconds({
    key: stableNextStartingMatchKey,
    rawRemainingSeconds: nextStartingMatch?.remainingSeconds ?? null,
    nowMs,
  });
  const stableNextStartingMatch = useMemo(() => {
    if (!nextStartingMatch || stableNextStartingMatchRemainingSeconds === null) {
      return null;
    }

    return {
      ...nextStartingMatch,
      remainingSeconds: stableNextStartingMatchRemainingSeconds,
    };
  }, [nextStartingMatch, stableNextStartingMatchRemainingSeconds]);
  const activeUpcomingMatch = useMemo(
    () => visibleUpcomingMatches.find((match) => match.status === 'active') ?? null,
    [visibleUpcomingMatches],
  );
  const fallbackCountdownEntry = useMemo<CountdownEntry | null>(() => {
    if (
      matchMode === 'duel'
      && shouldTrackDirectMatchCountdown(duelMatchState)
      && duelMatchStatus
      && typeof duelStartCountdownSeconds === 'number'
    ) {
      return {
        title: '1대1 대결 곧 시작',
        subtitle: `${duelMatchStatus.opponent?.name ?? '상대'} · ${duelMatchStatus.distanceKm.toFixed(1)}km`,
        remainingSeconds: duelStartCountdownSeconds,
      };
    }

    if (
      matchMode === 'group'
      && shouldTrackDirectMatchCountdown(groupMatchState)
      && groupMatchStatus
      && typeof groupStartCountdownSeconds === 'number'
    ) {
      return {
        title: '그룹 대결 곧 시작',
        subtitle: `${groupMatchStatus.participantCount}명 그룹 · ${groupMatchStatus.distanceKm.toFixed(1)}km`,
        remainingSeconds: groupStartCountdownSeconds,
      };
    }

    return null;
  }, [
    duelMatchState,
    duelMatchStatus,
    duelStartCountdownSeconds,
    groupMatchState,
    groupMatchStatus,
    groupStartCountdownSeconds,
    matchMode,
  ]);
  const rawVisibleRoomCountdownRemainingSeconds = visibleMatchRoom?.linkedMatchSlotStartAt
    ? getMatchStartRemainingSeconds(visibleMatchRoom.linkedMatchSlotStartAt, syncedNowMs)
    : null;
  const visibleRoomCountdownRemainingSeconds = useStableCountdownSeconds({
    key: visibleMatchRoom?.linkedMatchId
      ? `${visibleMatchRoom.linkedMatchId}:${visibleMatchRoom.linkedMatchSlotStartAt ?? visibleMatchRoom.slotStartAt}`
      : null,
    rawRemainingSeconds: rawVisibleRoomCountdownRemainingSeconds,
    nowMs,
  });
  const rawMatchRoomCountdownRemainingSeconds = matchRoom?.linkedMatchSlotStartAt
    ? getMatchStartRemainingSeconds(matchRoom.linkedMatchSlotStartAt, syncedNowMs)
    : null;
  const matchRoomCountdownRemainingSeconds = useStableCountdownSeconds({
    key: matchRoom?.linkedMatchId
      ? `${matchRoom.linkedMatchId}:${matchRoom.linkedMatchSlotStartAt ?? matchRoom.slotStartAt}`
      : null,
    rawRemainingSeconds: rawMatchRoomCountdownRemainingSeconds,
    nowMs,
  });
  const runtimeRoom = useMemo(
    () => selectLinkedRuntimeRoom({ matchRoom, visibleMatchRoom }),
    [matchRoom, visibleMatchRoom],
  );
  const roomCountdownRemainingSeconds = runtimeRoom === matchRoom
    ? matchRoomCountdownRemainingSeconds
    : visibleRoomCountdownRemainingSeconds;
  const rawRoomCountdownRemainingSeconds = runtimeRoom === matchRoom
    ? rawMatchRoomCountdownRemainingSeconds
    : rawVisibleRoomCountdownRemainingSeconds;
  const shouldShowRuntimeRoomCountdownNumbers = shouldShowRoomCountdownNumbers({
    remainingSeconds: rawRoomCountdownRemainingSeconds,
    startMode: runtimeRoom?.startMode,
  });
  const shouldUseHostStartCountdownClamp = runtimeRoom?.startMode === 'host';
  const hostStartCountdownKey = runtimeRoom?.linkedMatchId && shouldUseHostStartCountdownClamp
    ? `${runtimeRoom.linkedMatchId}:host-display`
    : null;
  const hostRoomCountdownDisplayRemainingSeconds = useHostStartCountdownSeconds({
    key: hostStartCountdownKey,
    maxStartSeconds: MATCH_ROOM_HOST_COUNTDOWN_VISIBLE_SECONDS,
    rawRemainingSeconds: rawRoomCountdownRemainingSeconds,
    nowMs,
  });
  const hostRoomCountdownTargetMs = readPersistentHostStartCountdownTargetMs(hostStartCountdownKey);
  const stableRoomCountdownDisplayRemainingSeconds = useStableCountdownSeconds({
    key: runtimeRoom?.linkedMatchId && !shouldUseHostStartCountdownClamp && shouldShowRuntimeRoomCountdownNumbers
      ? `${runtimeRoom.linkedMatchId}:${runtimeRoom.linkedMatchSlotStartAt ?? runtimeRoom.slotStartAt}:display`
      : null,
    rawRemainingSeconds: shouldShowRuntimeRoomCountdownNumbers
      ? rawRoomCountdownRemainingSeconds
      : null,
    nowMs,
  });
  const roomCountdownDisplayRemainingSeconds = shouldUseHostStartCountdownClamp
    ? hostRoomCountdownDisplayRemainingSeconds
    : stableRoomCountdownDisplayRemainingSeconds;
  const visiblePartyRunFlowRemainingSeconds = normalizePartyRunFlowRemainingSeconds(visibleRoomCountdownRemainingSeconds);
  const visiblePartyRunFlowSyncedNowMs = resolvePartyRunFlowSyncedNowMs({
    room: visibleMatchRoom,
    remainingSeconds: visibleRoomCountdownRemainingSeconds,
    syncedNowMs,
  });
  const matchRoomFlowRemainingSeconds = normalizePartyRunFlowRemainingSeconds(matchRoomCountdownRemainingSeconds);
  const matchRoomFlowSyncedNowMs = resolvePartyRunFlowSyncedNowMs({
    room: matchRoom,
    remainingSeconds: matchRoomCountdownRemainingSeconds,
    syncedNowMs,
  });
  const visiblePartyRunFlow = useMemo(() => buildPartyRunFlowSnapshot({
    room: visibleMatchRoom,
    isCountdownReady: currentRoomParticipantIsCountdownReady ?? undefined,
    remainingSeconds: visiblePartyRunFlowRemainingSeconds,
    syncedNowMs: visiblePartyRunFlowSyncedNowMs,
  }), [
    currentRoomParticipantIsCountdownReady,
    visiblePartyRunFlowRemainingSeconds,
    visiblePartyRunFlowSyncedNowMs,
    visibleMatchRoom,
  ]);
  const matchRoomFlow = useMemo(() => buildPartyRunFlowSnapshot({
    room: matchRoom,
    isCountdownReady: currentRoomParticipantIsCountdownReady ?? undefined,
    remainingSeconds: matchRoomFlowRemainingSeconds,
    syncedNowMs: matchRoomFlowSyncedNowMs,
  }), [
    currentRoomParticipantIsCountdownReady,
    matchRoom,
    matchRoomFlowRemainingSeconds,
    matchRoomFlowSyncedNowMs,
  ]);
  const roomCountdownEntry = useMemo<CountdownEntry | null>(() => {
    if (
      !runtimeRoom?.linkedMatchId
      || typeof roomCountdownDisplayRemainingSeconds !== 'number'
      || !['arming', 'countdown', 'active'].includes(runtimeRoom.state)
    ) {
      return null;
    }

    return {
      title: runtimeRoom.mode === 'duel' ? '1대1 대결 곧 시작' : '그룹 대결 곧 시작',
      subtitle: `${runtimeRoom.hostName}님 방 · ${(runtimeRoom.linkedMatchDistanceKm ?? runtimeRoom.distanceKm).toFixed(1)}km`,
      remainingSeconds: roomCountdownDisplayRemainingSeconds,
      targetMs: shouldUseHostStartCountdownClamp ? hostRoomCountdownTargetMs : null,
      countdownKey: runtimeRoom.linkedMatchId ?? null,
    };
  }, [
    hostRoomCountdownTargetMs,
    roomCountdownDisplayRemainingSeconds,
    runtimeRoom,
    shouldUseHostStartCountdownClamp,
  ]);
  const fallbackVisibleCountdownEntry = shouldShowRuntimeRoomCountdownNumbers
    ? (stableNextStartingMatch
      ? {
          title: stableNextStartingMatch.match.mode === 'duel' ? '1대1 대결 곧 시작' : '그룹 대결 곧 시작',
          subtitle: `${stableNextStartingMatch.match.counterpartLabel} · ${stableNextStartingMatch.match.summary}`,
          remainingSeconds: stableNextStartingMatch.remainingSeconds,
          countdownKey: stableNextStartingMatch.match.matchId ?? null,
        }
      : fallbackCountdownEntry)
    : null;
  const visibleCountdownEntry = roomCountdownEntry ?? fallbackVisibleCountdownEntry;

  return {
    duelStartCountdownSeconds,
    groupStartCountdownSeconds,
    roomCountdownRemainingSeconds,
    visiblePartyRunFlow,
    matchRoomFlow,
    roomCountdownEntry,
    visibleCountdownEntry,
    nextStartingMatch,
    activeUpcomingMatch,
    shouldShowRoomArmingOverlay: resolveShouldShowRoomArmingOverlay({
      linkedMatchId: matchRoom?.linkedMatchId,
      linkedMatchSlotStartAt: matchRoom?.linkedMatchSlotStartAt,
      matchMode,
      remainingSeconds: matchRoomCountdownRemainingSeconds,
      shouldShowLoading: matchRoomFlow.shouldShowLoading,
      startMode: matchRoom?.startMode,
      syncedNowMs,
    }),
    canOpenRoomArena: visiblePartyRunFlow.shouldOpenArena,
  };
}
