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

export function readLockedCountdownTargetMs(key: string | null) {
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
  // Once the numeric countdown is on screen (Bundle B reveals it at the uniform 30s
  // window for every start mode), it SUPERSEDES the "로딩중…" arming loader — otherwise
  // the centered countdown number (zIndex 100) would render on top of the dark arming
  // overlay (zIndex 30) for the host's ~12→10s poll-in buffer. So suppress the arming
  // overlay whenever a real countdown digit is showing.
  const isCountdownNumberVisible = typeof remainingSeconds === 'number'
    && remainingSeconds > 0
    && remainingSeconds <= MATCH_OVERLAY_COUNTDOWN_WINDOW_SECONDS;

  return Boolean(
    linkedMatchId
    && (shouldShowLoading || shouldShowHostStartPollInLoading)
    && (matchMode === 'duel' || matchMode === 'group')
    && !hasLinkedMatchSlotElapsed
    && !isCountdownNumberVisible,
  );
}

export function shouldShowRoomCountdownNumbers({
  remainingSeconds,
}: {
  remainingSeconds: number | null;
  // startMode no longer changes WHEN the digit surfaces — every start mode (host,
  // scheduled, …) now reveals the numeric countdown at the same uniform 30s window so
  // host and guest see the same digit at the same t. (Kept in the input shape for the
  // call sites that still pass it; intentionally unused.)
  startMode?: RunningMatchRoom['startMode'] | null;
}) {
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

// The SINGLE producer of a locked, ms-precise countdown target for EVERY runtime
// CountdownEntry (party host AND non-host, matched duel, matched group, and both
// reservation rooms). It locks localTargetMs = nowMs + (slotStartMs - syncedNowMs)
// — i.e. Date.now() + rawRemainingMs — ONCE per countdownKey (module-level lock map),
// so every device that crosses the gate against the same slot derives the SAME
// absolute instant and flips every digit on the same tick. The whole-second
// rawRemainingSeconds only GATES when to lock (within [1, maxStartSeconds]); the
// frozen target itself uses the exact rawRemainingMs so two phones with agreeing
// clocks never land a second boundary ~1s apart. Renamed from the old host-only
// resolvePersistentHostStartCountdownRemainingSeconds; the host path is now just one
// caller of this shared helper.
export function resolveLockedCountdownTarget({
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

export function resetLockedCountdownTargetForTest() {
  hostStartCountdownLocks.clear();
}

// Shared hook over resolveLockedCountdownTarget: locks the ms-precise target once per
// key and returns BOTH the clamped seconds (for the seed) and the locked targetMs (the
// overlay's LOCAL countdown source). Used by every runtime CountdownEntry — host AND
// non-host room, duel AND group fallback — so they all flip on the same absolute tick.
function useLockedCountdownTarget({
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

  const secondsRemaining = resolveLockedCountdownTarget({
    key,
    maxStartSeconds,
    nowMs,
    rawRemainingSeconds,
    rawRemainingMs,
  });

  return {
    secondsRemaining,
    targetMs: readLockedCountdownTargetMs(key),
  };
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
  // Locked ms-precise targets for the DIRECT matched duel/group fallback entries (no
  // room). Same shared `${matchId}:${slotStartAt}` key + same 30s window as the room,
  // so a phone handing off room→runtime (or reservation→running-tab) for the SAME match
  // keeps one continuous countdown locked to one absolute instant — no per-tick rounding
  // divergence between two phones, no re-flash at the boundary.
  const duelFallbackSlotStartAt = duelMatchStatus?.slotStartAt ?? activeDuelSlotStartAt;
  const duelFallbackSlotStartMs = duelFallbackSlotStartAt ? Date.parse(duelFallbackSlotStartAt) : NaN;
  const {
    secondsRemaining: duelFallbackLockedSeconds,
    targetMs: duelFallbackTargetMs,
  } = useLockedCountdownTarget({
    key: shouldTrackDirectMatchCountdown(duelMatchState) && duelMatchStatus
      ? `${duelMatchStatus.matchId ?? 'duel'}:${duelFallbackSlotStartAt}`
      : null,
    maxStartSeconds: MATCH_OVERLAY_COUNTDOWN_WINDOW_SECONDS,
    rawRemainingSeconds: rawDuelStartCountdownSeconds,
    rawRemainingMs: Number.isFinite(duelFallbackSlotStartMs) ? duelFallbackSlotStartMs - syncedNowMs : null,
    nowMs,
  });
  const groupFallbackSlotStartAt = groupMatchStatus?.slotStartAt ?? activeGroupSlotStartAt;
  const groupFallbackSlotStartMs = groupFallbackSlotStartAt ? Date.parse(groupFallbackSlotStartAt) : NaN;
  const {
    secondsRemaining: groupFallbackLockedSeconds,
    targetMs: groupFallbackTargetMs,
  } = useLockedCountdownTarget({
    key: shouldTrackDirectMatchCountdown(groupMatchState) && groupMatchStatus
      ? `${groupMatchStatus.matchId ?? 'group'}:${groupFallbackSlotStartAt}`
      : null,
    maxStartSeconds: MATCH_OVERLAY_COUNTDOWN_WINDOW_SECONDS,
    rawRemainingSeconds: rawGroupStartCountdownSeconds,
    rawRemainingMs: Number.isFinite(groupFallbackSlotStartMs) ? groupFallbackSlotStartMs - syncedNowMs : null,
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
  // Locked ms-precise target for the upcoming-list "next starting matched match" overlay
  // (the duel/group fallback sourced from the upcoming list rather than the live status).
  // Same shared `${matchId}:${slotStartAt}` key + 30s window so it too flips on one
  // absolute instant on both phones and stays continuous if it later hands to the room.
  const nextStartingMatchSlotStartMs = nextStartingMatch?.match.slotStartAt
    ? Date.parse(nextStartingMatch.match.slotStartAt)
    : NaN;
  const {
    secondsRemaining: nextStartingMatchLockedSeconds,
    targetMs: nextStartingMatchTargetMs,
  } = useLockedCountdownTarget({
    key: stableNextStartingMatchKey,
    maxStartSeconds: MATCH_OVERLAY_COUNTDOWN_WINDOW_SECONDS,
    rawRemainingSeconds: nextStartingMatch?.remainingSeconds ?? null,
    rawRemainingMs: Number.isFinite(nextStartingMatchSlotStartMs) ? nextStartingMatchSlotStartMs - syncedNowMs : null,
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
      // Inside the 30s window the locked target drives the overlay's LOCAL countdown
      // (identical absolute instant on both phones); outside it the seed is the stable
      // seconds and the entry is gated off downstream anyway.
      return {
        title: '1대1 대결 곧 시작',
        subtitle: `${duelMatchStatus.opponent?.name ?? '상대'} · ${duelMatchStatus.distanceKm.toFixed(1)}km`,
        remainingSeconds: duelFallbackLockedSeconds ?? duelStartCountdownSeconds,
        targetMs: duelFallbackTargetMs,
        countdownKey: `${duelMatchStatus.matchId ?? 'duel'}:${duelFallbackSlotStartAt}`,
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
        remainingSeconds: groupFallbackLockedSeconds ?? groupStartCountdownSeconds,
        targetMs: groupFallbackTargetMs,
        countdownKey: `${groupMatchStatus.matchId ?? 'group'}:${groupFallbackSlotStartAt}`,
      };
    }

    return null;
  }, [
    duelFallbackLockedSeconds,
    duelFallbackSlotStartAt,
    duelFallbackTargetMs,
    duelMatchState,
    duelMatchStatus,
    duelStartCountdownSeconds,
    groupFallbackLockedSeconds,
    groupFallbackSlotStartAt,
    groupFallbackTargetMs,
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
  // Unified locked target for the runtime room (host AND non-host, duel AND group).
  // The key is the SHARED `${linkedMatchId}:${slotStartAt}` scheme so the lock, the
  // monotonic floor and the finished-key guard persist across the room→runtime and
  // reservation→running-tab handoffs (the room's linkedMatchId/linkedMatchSlotStartAt
  // ARE the direct match's matchId/slotStartAt, so both sides derive the same key —
  // and the same absolute targetMs). A re-queued match with a new slotStartAt yields a
  // new key, so its fresh countdown is never suppressed by the finished guard.
  const runtimeRoomCountdownKey = runtimeRoom?.linkedMatchId && shouldShowRuntimeRoomCountdownNumbers
    ? `${runtimeRoom.linkedMatchId}:${runtimeRoom.linkedMatchSlotStartAt ?? runtimeRoom.slotStartAt}`
    : null;
  const runtimeRoomSlotStartMs = runtimeRoom?.linkedMatchSlotStartAt
    ? Date.parse(runtimeRoom.linkedMatchSlotStartAt)
    : NaN;
  const {
    secondsRemaining: roomCountdownDisplayRemainingSeconds,
    targetMs: roomCountdownTargetMs,
  } = useLockedCountdownTarget({
    key: runtimeRoomCountdownKey,
    maxStartSeconds: MATCH_OVERLAY_COUNTDOWN_WINDOW_SECONDS,
    rawRemainingSeconds: shouldShowRuntimeRoomCountdownNumbers
      ? rawRoomCountdownRemainingSeconds
      : null,
    rawRemainingMs: Number.isFinite(runtimeRoomSlotStartMs) ? runtimeRoomSlotStartMs - syncedNowMs : null,
    nowMs,
  });
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
      // Locked ms-precise target for EVERY start mode (host AND non-host) — both phones
      // run the same LOCAL countdown off the same absolute instant.
      targetMs: roomCountdownTargetMs,
      // Shared key (matches the direct-match fallback's key for the same match) so the
      // monotonic floor + finished-key guard carry across the room→runtime handoff.
      countdownKey: runtimeRoomCountdownKey,
    };
  }, [
    roomCountdownTargetMs,
    roomCountdownDisplayRemainingSeconds,
    runtimeRoom,
    runtimeRoomCountdownKey,
  ]);
  const fallbackVisibleCountdownEntry = shouldShowRuntimeRoomCountdownNumbers
    ? (stableNextStartingMatch
      ? {
          title: stableNextStartingMatch.match.mode === 'duel' ? '1대1 대결 곧 시작' : '그룹 대결 곧 시작',
          subtitle: `${stableNextStartingMatch.match.counterpartLabel} · ${stableNextStartingMatch.match.summary}`,
          remainingSeconds: nextStartingMatchLockedSeconds ?? stableNextStartingMatch.remainingSeconds,
          // Locked ms-precise target + shared `${matchId}:${slotStartAt}` key, so the
          // upcoming-list overlay flips on one absolute instant on both phones and stays
          // continuous if it later hands off to the room/runtime for the same match.
          targetMs: nextStartingMatchTargetMs,
          countdownKey: stableNextStartingMatchKey,
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
