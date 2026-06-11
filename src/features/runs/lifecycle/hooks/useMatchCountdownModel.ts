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
  // Where the slot start sits on the LOCAL clock as implied by rawRemainingSeconds at
  // lock time (nowMs + raw*1000). rawRemainingSeconds is computed from syncedNow, so if
  // the server-clock offset converges after we locked, the implied slot shifts — letting
  // us detect that the frozen target was built on a stale offset.
  impliedSlotLocalMs: number;
  hasRelocked: boolean;
};

// A lock created while the server-clock offset was still converging (cold start; mostly
// Android, whose hardware clock can be seconds off) freezes the wrong target and ends
// the countdown seconds late. Allow ONE re-lock when the implied slot has drifted by
// clearly more than handoff/raw jitter (the lock must still absorb ~2s remount swings)
// and there is comfortably enough time left that the corrected digit just steps down
// (the overlay's monotonic floor forbids upward jumps, so it can never count back up).
const HOST_START_COUNTDOWN_RELOCK_MIN_DRIFT_MS = 2500;
const HOST_START_COUNTDOWN_RELOCK_MIN_REMAINING_MS = 4000;

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
  rawRemainingMs = null,
}: {
  key: string | null;
  maxStartSeconds: number;
  nowMs: number;
  rawRemainingSeconds: number | null;
  // Millisecond-precise remaining (slotStartMs - syncedNowMs). The whole-second raw
  // gates WHEN to lock, but the target itself must use the exact remaining: locking to
  // nowMs + raw*1000 quantizes the target by the phase of the render tick that crossed
  // the gate, putting the two phones' second boundaries up to ~1s apart even when their
  // clocks agree. With the exact remaining, every device's boundaries align to the same
  // server instants — same moment to appear, same moment per digit, same moment to end.
  rawRemainingMs?: number | null;
}) {
  if (!key) {
    return null;
  }

  const resolveTargetRemainingMs = (rawSeconds: number) => Math.min(
    maxStartSeconds * 1000,
    typeof rawRemainingMs === 'number' && rawRemainingMs > 0 ? rawRemainingMs : rawSeconds * 1000,
  );

  let lock = hostStartCountdownLocks.get(key) ?? null;
  if (!lock) {
    if (
      typeof rawRemainingSeconds !== 'number'
      || rawRemainingSeconds <= 0
      || rawRemainingSeconds > maxStartSeconds
    ) {
      return null;
    }

    const targetRemainingMs = resolveTargetRemainingMs(rawRemainingSeconds);
    lock = {
      localTargetMs: nowMs + targetRemainingMs,
      impliedSlotLocalMs: nowMs + targetRemainingMs,
      hasRelocked: false,
    };
    writeHostStartCountdownLock(key, lock);
  } else if (
    !lock.hasRelocked
    && typeof rawRemainingSeconds === 'number'
    && rawRemainingSeconds > 0
    && rawRemainingSeconds <= maxStartSeconds
  ) {
    const targetRemainingMs = resolveTargetRemainingMs(rawRemainingSeconds);
    const impliedSlotLocalMs = nowMs + targetRemainingMs;
    const driftMs = impliedSlotLocalMs - lock.impliedSlotLocalMs;
    const lockedRemainingMs = lock.localTargetMs - nowMs;

    if (
      Math.abs(driftMs) > HOST_START_COUNTDOWN_RELOCK_MIN_DRIFT_MS
      && lockedRemainingMs >= HOST_START_COUNTDOWN_RELOCK_MIN_REMAINING_MS
      && targetRemainingMs >= HOST_START_COUNTDOWN_RELOCK_MIN_REMAINING_MS
    ) {
      lock = {
        localTargetMs: nowMs + targetRemainingMs,
        impliedSlotLocalMs,
        hasRelocked: true,
      };
      writeHostStartCountdownLock(key, lock);
    }
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
  rawRemainingMs,
}: {
  key: string | null;
  maxStartSeconds: number;
  nowMs: number;
  rawRemainingSeconds: number | null;
  rawRemainingMs?: number | null;
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
    rawRemainingMs,
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
  const runtimeRoomSlotStartMs = runtimeRoom?.linkedMatchSlotStartAt
    ? Date.parse(runtimeRoom.linkedMatchSlotStartAt)
    : NaN;
  const hostRoomCountdownDisplayRemainingSeconds = useHostStartCountdownSeconds({
    key: hostStartCountdownKey,
    maxStartSeconds: MATCH_ROOM_HOST_COUNTDOWN_VISIBLE_SECONDS,
    rawRemainingSeconds: rawRoomCountdownRemainingSeconds,
    rawRemainingMs: Number.isFinite(runtimeRoomSlotStartMs) ? runtimeRoomSlotStartMs - syncedNowMs : null,
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
    // TEMP diagnostic: surfaces WHY the arming overlay is stuck (link id / slot start
    // present?, phase, start mode, remaining). Shown on the overlay; remove later.
    roomArmingDebugInfo: `L${matchRoom?.linkedMatchId ? 1 : 0} S${matchRoom?.linkedMatchSlotStartAt ? 1 : 0} ${matchRoomFlow.phase ?? '-'} sm:${matchRoom?.startMode ?? '-'} r:${matchRoomCountdownRemainingSeconds ?? '-'} n:${Math.floor(nowMs / 1000) % 1000}`,
    canOpenRoomArena: visiblePartyRunFlow.shouldOpenArena,
  };
}
