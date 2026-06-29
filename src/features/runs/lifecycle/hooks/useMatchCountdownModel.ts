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
import { selectCountdownDigit } from '@/features/runs/lifecycle/liveMatchSlot';
import {
  clearCountdownLock,
  freezeSlotStartMsForMatch,
  isCountdownKeyFinished,
  markCountdownKeyFinished,
  readCountdownLock,
  readLockedCountdownServerTargetMs,
  resetCountdownLockStoreForTest,
  writeCountdownLock,
} from '@/features/runs/lifecycle/countdownLockStore';

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

// The locked target is the ABSOLUTE SERVER instant (slotStartMs). The overlay ticks it
// against the LIVE shared offset every frame, so a late offset convergence corrects both
// phones continuously — the lock never freezes a baked-in, never-corrected LOCAL instant.
// Exposed via readLockedCountdownServerTargetMs (shared countdownLockStore).
export const readLockedCountdownTargetMs = readLockedCountdownServerTargetMs;

type UseMatchCountdownModelInput = {
  matchMode: RunMatchMode;
  nowMs: number;
  syncedNowMs: number;
  // True only once the shared server clock is trustworthy. The locked countdown target is
  // NOT frozen until this is true, so a phone whose device clock is several seconds off NTP
  // never freezes a skewed start instant during cold-start convergence.
  serverClockReady: boolean;
  visibleUpcomingMatches: UpcomingRunningMatchItem[];
  duelMatchState: RunningMatchStatusResponse['state'];
  groupMatchState: RunningMatchStatusResponse['state'];
  duelMatchStatus: RunningMatchStatusResponse | null;
  groupMatchStatus: RunningMatchStatusResponse | null;
  // Kept in the input shape (the caller still passes them; they're the user's locally
  // selected slot), but the countdown no longer derives its slot from them — the start
  // instant MUST come from the server-authoritative slot so both phones share it. Using the
  // local selection here is exactly what let a phase-dependent per-phone slot leak in.
  activeDuelSlotStartAt?: string;
  activeGroupSlotStartAt?: string;
  visibleMatchRoom: RunningMatchRoom | null;
  matchRoom: RunningMatchRoom | null;
  currentRoomParticipantIsCountdownReady?: boolean | null;
};

export function resolveShouldShowRoomArmingOverlay({
  linkedMatchId,
  matchMode,
  remainingSeconds,
  shouldShowLoading,
  startMode,
  isMatchActive = false,
  hasLinkedMatchSlotElapsed = false,
}: {
  linkedMatchId?: string | null;
  matchMode: RunMatchMode;
  remainingSeconds?: number | null;
  shouldShowLoading: boolean;
  startMode?: RunningMatchRoom['startMode'] | null;
  // True only when the match is GENUINELY active (server room.state === 'active' or
  // linkedMatchStatus === 'active'). This — together with "a digit is now showing" — is what
  // releases the shared 맞추는중/arming hold. The bare per-phone slot-elapsed inference must
  // NOT release it: a peer whose slot just elapsed but who has no countdown digit yet (cold
  // clock, delayed poll) used to skip straight past the hold to active; now it stays held on
  // 맞추는중 until it actually has a digit to count, so both phones count together.
  isMatchActive?: boolean;
  // Pure-time release CEILING (immune to room-poll liveness). The caller sets this once the
  // synced clock is past slot + ACTIVE_INFERENCE_GRACE — exactly the instant derivePartyRun
  // StartPhase stops inferring 'active' and would otherwise fall back to 'arming' and re-show
  // the opaque loader OVER an already-running arena with no escape (the only window where the
  // loader can re-appear, since within the grace the phase is still 'active' so shouldShow
  // Loading is already false). Releasing only at that boundary — not at the bare slot — is
  // deliberate: a bare-slot ceiling on a cold, not-yet-converged clock could release the hold
  // mid-countdown and re-create the non-host skip.
  hasLinkedMatchSlotElapsed?: boolean;
}) {
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

  // Release the hold ONLY once this phone has a countdown digit to show OR the match is
  // genuinely active. Until one of those is true, keep holding on 맞추는중 — never drop to
  // active merely because this phone's own slot instant elapsed.
  return Boolean(
    linkedMatchId
    && (shouldShowLoading || shouldShowHostStartPollInLoading)
    && (matchMode === 'duel' || matchMode === 'group')
    && !isCountdownNumberVisible
    && !isMatchActive
    && !hasLinkedMatchSlotElapsed,
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

// The SINGLE producer of a locked countdown target for EVERY runtime CountdownEntry (party
// host AND non-host, matched duel, matched group, and both reservation rooms). It freezes
// the lock's target to the ABSOLUTE SERVER instant (slotStartMs) ONCE per countdownKey —
// only on the FIRST render where the server clock is READY and an authoritative slot is
// present. The overlay then ticks that server instant against the LIVE shared offset every
// frame (Date.now()+offset), so two phones with different DEVICE-clock skew but the same
// slotStartMs + the same converged offset compute the SAME remaining each tick.
//
// While !clockReady it returns the LIVE display digit (ceil(remainingMs/1000)) but DOES NOT
// write a lock — so a skewed phone never freezes a multi-second-wrong instant during
// cold-start convergence; the displayed number simply follows the converging offset until
// the clock is trusted, then the lock freezes the (now-correct) server instant.
//
// `rawRemainingMs` is the authoritative remaining (slotStartMs - syncedNowMs). Where the
// slot's absolute instant is known (slotStartMs passed, or derivable as syncedNowMs +
// rawRemainingMs), the lock stores THAT instant; the whole-second rawRemainingSeconds only
// GATES when to lock (within [1, maxStartSeconds]).
export function resolveLockedCountdownTarget({
  key,
  maxStartSeconds,
  rawRemainingSeconds,
  rawRemainingMs = null,
  slotStartMs = null,
  syncedNowMs = null,
  clockReady = true,
}: {
  key: string | null;
  maxStartSeconds: number;
  rawRemainingSeconds: number | null;
  // Millisecond-precise remaining (slotStartMs - syncedNowMs).
  rawRemainingMs?: number | null;
  // The slot start as an absolute instant on the SERVER clock. When omitted it is derived
  // as syncedNowMs + rawRemainingMs (both must then be present).
  slotStartMs?: number | null;
  // The SERVER-synced now (Date.now() + live shared offset) at this render. Used both to
  // derive slotStartMs when not given and to compute the live remaining each call.
  syncedNowMs?: number | null;
  // True only once the shared offset is trustworthy. While false the lock is NOT written.
  clockReady?: boolean;
}) {
  if (!key) {
    return null;
  }

  // A key that already finished is tombstoned: never re-mint a lock for it (closes the
  // one-frame re-flash where the model re-offers the just-finished match).
  if (isCountdownKeyFinished(key)) {
    return null;
  }

  const effectiveSyncedNowMs = typeof syncedNowMs === 'number' ? syncedNowMs : null;
  const effectiveSlotStartMs = typeof slotStartMs === 'number' && Number.isFinite(slotStartMs)
    ? slotStartMs
    : effectiveSyncedNowMs !== null && typeof rawRemainingMs === 'number'
      ? effectiveSyncedNowMs + rawRemainingMs
      : null;

  const clampSeconds = (seconds: number) => Math.max(1, Math.min(maxStartSeconds, seconds));

  // Compute the live remaining (ms) from whatever authoritative source we have: prefer the
  // frozen server instant minus the synced now; else the passed rawRemainingMs; else the
  // whole-second raw.
  const liveRemainingMsFrom = (targetMs: number | null) => {
    if (targetMs !== null && effectiveSyncedNowMs !== null) {
      return targetMs - effectiveSyncedNowMs;
    }
    if (typeof rawRemainingMs === 'number') {
      return rawRemainingMs;
    }
    if (typeof rawRemainingSeconds === 'number') {
      return rawRemainingSeconds * 1000;
    }
    return null;
  };

  const existing = readCountdownLock(key);

  // A digit must appear whenever a server-authoritative slot is present AND the raw remaining
  // is in the window (0, max] — REGARDLESS of clockReady. clockReady gates ONLY whether we
  // FREEZE the precise instant (writeCountdownLock), never whether a number is shown. This is
  // the desync fix: the non-host (cold clock) used to race clockReady and lose, opening the
  // arena with a null digit; now it shows the live digit immediately and the freeze catches
  // up once the offset is trusted.
  const slotInWindow = effectiveSlotStartMs !== null
    && typeof rawRemainingSeconds === 'number'
    && rawRemainingSeconds > 0
    && rawRemainingSeconds <= maxStartSeconds;

  if (!existing) {
    // Only freeze when the clock is READY and an authoritative slot is in the window. Until
    // then, return the LIVE display digit (ceil(liveRemainingMs/1000) off the live synced
    // offset) WITHOUT writing a lock, so a skewed phone never freezes a multi-second-wrong
    // instant — but it still counts down in lock-step with the offset.
    const canFreeze = clockReady && slotInWindow;

    if (!canFreeze) {
      // No lock to freeze yet. If a slot is present + in window, ALWAYS return a live digit
      // (clockReady false is fine — the offset still ticks it down). Return null ONLY when
      // there is genuinely no slot/remaining or it is out of window.
      const liveRemainingMs = liveRemainingMsFrom(effectiveSlotStartMs);
      if (
        liveRemainingMs === null
        || liveRemainingMs <= 0
        || typeof rawRemainingSeconds !== 'number'
        || rawRemainingSeconds <= 0
        || rawRemainingSeconds > maxStartSeconds
      ) {
        return null;
      }
      return clampSeconds(Math.ceil(liveRemainingMs / 1000));
    }

    writeCountdownLock(key, { serverTargetMs: effectiveSlotStartMs });
  }

  const serverTargetMs = readLockedCountdownServerTargetMs(key);
  const remainingMs = liveRemainingMsFrom(serverTargetMs);

  if (remainingMs === null || remainingMs <= 0) {
    // Tombstone-on-finish ONLY when a lock had PREVIOUSLY been frozen for this key (existing
    // !== null at entry). A countdown that genuinely COUNTED DOWN to zero is terminal — the
    // tombstone stops the model re-offering the same match for a frame and re-flashing the
    // digit. But a FIRST observation that is already <=0 (e.g. a slot that elapsed before
    // this phone ever saw it, or a momentarily-stale clock) must NOT tombstone the key: doing
    // so would permanently suppress a countdown that never actually counted down — exactly
    // the trap that skipped the non-host straight to the arena with no countdown.
    if (existing) {
      markCountdownKeyFinished(key);
      clearCountdownLock(key);
    }
    return null;
  }

  return clampSeconds(Math.ceil(remainingMs / 1000));
}

export function resetLockedCountdownTargetForTest() {
  resetCountdownLockStoreForTest();
}

// Shared hook over resolveLockedCountdownTarget: freezes the server-instant target once per
// key (only once clockReady + an authoritative slot is present) and returns BOTH the clamped
// seconds (for the seed) and the locked server targetMs (the overlay's LOCAL countdown
// source). Used by every runtime CountdownEntry — host AND non-host room, duel AND group
// fallback — so they all flip on the same absolute tick.
function useLockedCountdownTarget({
  key,
  maxStartSeconds,
  rawRemainingSeconds,
  rawRemainingMs,
  slotStartMs,
  syncedNowMs,
  clockReady,
}: {
  key: string | null;
  maxStartSeconds: number;
  rawRemainingSeconds: number | null;
  rawRemainingMs?: number | null;
  slotStartMs?: number | null;
  syncedNowMs?: number | null;
  clockReady?: boolean;
}) {
  const previousKeyRef = useRef<string | null>(null);
  if (previousKeyRef.current !== key) {
    clearCountdownLock(previousKeyRef.current);
    previousKeyRef.current = key;
  }

  const secondsRemaining = resolveLockedCountdownTarget({
    key,
    maxStartSeconds,
    rawRemainingSeconds,
    rawRemainingMs,
    slotStartMs,
    syncedNowMs,
    clockReady,
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

// Resolve the FROZEN authoritative slot instant for a match: parse the server slot, then
// freeze the first value observed for this matchId so a later slotStartAt re-stamp (a status
// echo / re-queue) can't rotate the countdownKey and re-flash. Returns null when no
// server-authoritative slot is present yet (the overlay stays armed, no digit).
function resolveAuthoritativeSlot(matchId: string | null | undefined, slotStartAt: string | null | undefined) {
  if (!slotStartAt) {
    return { slotStartAt: null as string | null, slotStartMs: null as number | null };
  }
  const parsedMs = Date.parse(slotStartAt);
  if (!Number.isFinite(parsedMs)) {
    return { slotStartAt: null, slotStartMs: null };
  }
  const frozenMs = freezeSlotStartMsForMatch(matchId, parsedMs);
  return { slotStartAt, slotStartMs: frozenMs };
}

export function useMatchCountdownModel({
  matchMode,
  nowMs,
  syncedNowMs,
  serverClockReady,
  visibleUpcomingMatches,
  duelMatchState,
  groupMatchState,
  duelMatchStatus,
  groupMatchStatus,
  visibleMatchRoom,
  matchRoom,
  currentRoomParticipantIsCountdownReady,
}: UseMatchCountdownModelInput) {
  // Server-authoritative slot ONLY — no local activeDuel/GroupSlotStartAt fallback. The start
  // instant must be shared by both phones; the local selection is per-device.
  const duelAuthoritativeSlot = resolveAuthoritativeSlot(duelMatchStatus?.matchId, duelMatchStatus?.slotStartAt);
  const rawDuelStartCountdownSeconds =
    shouldTrackDirectMatchCountdown(duelMatchState) && duelAuthoritativeSlot.slotStartMs !== null
      ? getMatchStartRemainingSeconds(duelAuthoritativeSlot.slotStartAt as string, syncedNowMs)
      : null;
  const duelStartCountdownSeconds = useStableCountdownSeconds({
    key: shouldTrackDirectMatchCountdown(duelMatchState) && duelAuthoritativeSlot.slotStartAt
      ? `${duelMatchStatus?.matchId ?? 'duel'}:${duelAuthoritativeSlot.slotStartAt}`
      : null,
    rawRemainingSeconds: rawDuelStartCountdownSeconds,
    nowMs,
  });
  const groupAuthoritativeSlot = resolveAuthoritativeSlot(groupMatchStatus?.matchId, groupMatchStatus?.slotStartAt);
  const rawGroupStartCountdownSeconds =
    shouldTrackDirectMatchCountdown(groupMatchState) && groupAuthoritativeSlot.slotStartMs !== null
      ? getMatchStartRemainingSeconds(groupAuthoritativeSlot.slotStartAt as string, syncedNowMs)
      : null;
  const groupStartCountdownSeconds = useStableCountdownSeconds({
    key: shouldTrackDirectMatchCountdown(groupMatchState) && groupAuthoritativeSlot.slotStartAt
      ? `${groupMatchStatus?.matchId ?? 'group'}:${groupAuthoritativeSlot.slotStartAt}`
      : null,
    rawRemainingSeconds: rawGroupStartCountdownSeconds,
    nowMs,
  });
  // Locked server-instant targets for the DIRECT matched duel/group fallback entries (no
  // room). Same shared `${matchId}:${slotStartAt}` key + same 30s window as the room, so a
  // phone handing off room→runtime (or reservation→running-tab) for the SAME match keeps one
  // continuous countdown locked to one absolute SERVER instant — both phones tick it off the
  // live offset, so no per-phone divergence and no re-flash at the boundary. The lock only
  // freezes once clockReady (serverClockReady) is true.
  const duelFallbackSlotStartAt = duelAuthoritativeSlot.slotStartAt;
  const duelFallbackSlotStartMs = duelAuthoritativeSlot.slotStartMs;
  const {
    secondsRemaining: duelFallbackLockedSeconds,
    targetMs: duelFallbackTargetMs,
  } = useLockedCountdownTarget({
    key: shouldTrackDirectMatchCountdown(duelMatchState) && duelMatchStatus && duelFallbackSlotStartAt
      ? `${duelMatchStatus.matchId ?? 'duel'}:${duelFallbackSlotStartAt}`
      : null,
    maxStartSeconds: MATCH_OVERLAY_COUNTDOWN_WINDOW_SECONDS,
    rawRemainingSeconds: rawDuelStartCountdownSeconds,
    rawRemainingMs: duelFallbackSlotStartMs !== null ? duelFallbackSlotStartMs - syncedNowMs : null,
    slotStartMs: duelFallbackSlotStartMs,
    syncedNowMs,
    clockReady: serverClockReady,
  });
  const groupFallbackSlotStartAt = groupAuthoritativeSlot.slotStartAt;
  const groupFallbackSlotStartMs = groupAuthoritativeSlot.slotStartMs;
  const {
    secondsRemaining: groupFallbackLockedSeconds,
    targetMs: groupFallbackTargetMs,
  } = useLockedCountdownTarget({
    key: shouldTrackDirectMatchCountdown(groupMatchState) && groupMatchStatus && groupFallbackSlotStartAt
      ? `${groupMatchStatus.matchId ?? 'group'}:${groupFallbackSlotStartAt}`
      : null,
    maxStartSeconds: MATCH_OVERLAY_COUNTDOWN_WINDOW_SECONDS,
    rawRemainingSeconds: rawGroupStartCountdownSeconds,
    rawRemainingMs: groupFallbackSlotStartMs !== null ? groupFallbackSlotStartMs - syncedNowMs : null,
    slotStartMs: groupFallbackSlotStartMs,
    syncedNowMs,
    clockReady: serverClockReady,
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
  const nextStartingMatchAuthoritativeSlot = resolveAuthoritativeSlot(
    nextStartingMatch?.match.matchId,
    nextStartingMatch?.match.slotStartAt,
  );
  const nextStartingMatchSlotStartMs = nextStartingMatchAuthoritativeSlot.slotStartMs;
  const {
    secondsRemaining: nextStartingMatchLockedSeconds,
    targetMs: nextStartingMatchTargetMs,
  } = useLockedCountdownTarget({
    key: stableNextStartingMatchKey,
    maxStartSeconds: MATCH_OVERLAY_COUNTDOWN_WINDOW_SECONDS,
    rawRemainingSeconds: nextStartingMatch?.remainingSeconds ?? null,
    rawRemainingMs: nextStartingMatchSlotStartMs !== null ? nextStartingMatchSlotStartMs - syncedNowMs : null,
    slotStartMs: nextStartingMatchSlotStartMs,
    syncedNowMs,
    clockReady: serverClockReady,
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
  const runtimeRoomAuthoritativeSlot = resolveAuthoritativeSlot(
    runtimeRoom?.linkedMatchId,
    runtimeRoom?.linkedMatchSlotStartAt,
  );
  const runtimeRoomSlotStartMs = runtimeRoomAuthoritativeSlot.slotStartMs;
  // STAGE 1 (clean core): the RUNTIME ROOM countdown digit derives from ONE fact —
  // selectCountdownDigit(slotStartMs, syncedNowMs) — bypassing resolveLockedCountdownTarget's
  // freeze/clockReady/tombstone path entirely. The digit therefore renders whenever
  // 0<remaining≤30 REGARDLESS of clockReady (a cold, not-yet-trusted clock still shows the
  // number; the offset self-corrects). The overlay ticks the absolute slot instant
  // (runtimeRoomSlotStartMs) against the live offset, so two phones with different device-clock
  // skew but the same slot + converged offset compute the same digit each tick — no lock needed.
  const roomCountdownDisplayRemainingSeconds = shouldShowRuntimeRoomCountdownNumbers
    ? selectCountdownDigit({
        slotStartMs: runtimeRoomSlotStartMs,
        syncedNowMs,
        windowSeconds: MATCH_OVERLAY_COUNTDOWN_WINDOW_SECONDS,
      })
    : null;
  const roomCountdownTargetMs = runtimeRoomSlotStartMs;
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

  // STAGE 2 (clean core): release the 맞추는중 hold EXACTLY at the slot. derivePartyRun
  // StartPhase now flips to 'active' the instant the slot is reached (no inference grace), so
  // the loader (driven by shouldShowLoading, false once phase is countdown/arenaHandoff/active)
  // can never re-cover a running arena. matchRoomFlowSyncedNowMs is itself non-null ONLY post-
  // slot (resolvePartyRunFlowSyncedNowMs feeds slot+1 once syncedNow≥slot), so this backstop
  // reads true exactly at/after the slot — atomically with the phase flip, no 120s ceiling.
  const matchRoomArmingSlotStartAt = matchRoom?.linkedMatchSlotStartAt ?? matchRoom?.slotStartAt;
  const matchRoomArmingSlotStartMs = matchRoomArmingSlotStartAt
    ? Date.parse(matchRoomArmingSlotStartAt)
    : Number.NaN;
  const hasMatchRoomArmingSlotElapsedPastGrace = Number.isFinite(matchRoomArmingSlotStartMs)
    && typeof matchRoomFlowSyncedNowMs === 'number'
    && matchRoomFlowSyncedNowMs >= matchRoomArmingSlotStartMs;

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
      matchMode,
      remainingSeconds: matchRoomCountdownRemainingSeconds,
      shouldShowLoading: matchRoomFlow.shouldShowLoading,
      startMode: matchRoom?.startMode,
      // Genuinely active only — the bare slot-elapsed inference must NOT release the hold
      // DURING the window; the pure-time ceiling below only releases it AT/after the slot.
      isMatchActive: matchRoom?.state === 'active' || matchRoom?.linkedMatchStatus === 'active',
      // Backstop so a stalled room poll can never re-cover a running arena once the
      // active-inference grace expires (the only window where the loader can re-appear).
      hasLinkedMatchSlotElapsed: hasMatchRoomArmingSlotElapsedPastGrace,
    }),
    canOpenRoomArena: visiblePartyRunFlow.shouldOpenArena,
  };
}
