import { useEffect, useRef } from 'react';
import type { RunningMatchRoom, RunningMatchState } from '@/lib/api/types';
import { getMatchStartRemainingSeconds, shouldAutoOpenMatchArena } from '@/lib/matchCountdown';
import { buildPartyRunFlowSnapshot } from '@/features/runs/lifecycle/matchStateMachine';
import type { PartyRunStartPhase } from '@/features/runs/types/matchStateMachine';
import { rgDiagLog, rgPerfMark } from '@/utils/rgPerfTrace';
import { startRgPollingInterval } from '@/utils/rgPollingRegistry';
// TEMPORARY DIAG (revert before ship): observe-only event log for the arena-open skip.
import { pushLiveMatchDiagEvent } from '@/features/runs/runtime/liveMatchDiagStore';
import type { LinkedMatchSyncInput } from './types';

export const LINKED_MATCH_ARMING_POLL_MS = 1000;

// Decide whether the linked-match poll should flip THIS phone into the active/measuring
// arena. Pure so it can be reproduced deterministically.
//
// The trap this guards against: in a party run the linked duel/group session is SHARED, and
// the backend hydrates it to `'active'` the instant ANY participant pushes live progress
// (runningMatchSessionStoreHelpers.hydrateMatchSessionState → hasLiveProgress branch) — which
// can happen a beat BEFORE this phone's own slot fires (the host starts measuring slightly
// early / a warm-up heartbeat lands). If we transitioned merely because `serverState ===
// 'active'`, the guest would be yanked into the measuring arena while their OWN countdown
// digit is still on screen — exactly the non-host "skips the countdown" bug.
//
// Fix: the server-active signal may force the transition ONLY once this phone's countdown has
// genuinely reached its slot. Before the slot, the ONLY way to go active is this phone's own
// monotonic clock crossing the slot (`hasCountdownFinished`). After the slot, server-active
// stays a valid backstop (covers a momentary sub-second clock skew where `syncedNow >= slot`
// reads false for a frame). When there is no parseable slot at all, server-active is the only
// signal we have, so it still transitions.
//
// This is purely client-side and derives the decision from the SAME server-authoritative slot
// + this phone's synced clock the countdown already uses — it does NOT re-enable room polling
// and introduces no second state source, so it cannot re-create the dual-source thrash.
export function resolveLinkedMatchActiveTransition({
  serverState,
  slotStartMs,
  syncedNowMs,
}: {
  serverState: RunningMatchState | null | undefined;
  slotStartMs: number;
  syncedNowMs: number;
}) {
  const hasParseableSlot = Number.isFinite(slotStartMs);
  const hasCountdownFinished = hasParseableSlot && syncedNowMs >= slotStartMs;
  // Server-active only counts once this phone's slot has been reached — or when there is no
  // slot to count down to at all. It must never pre-empt a still-running local countdown.
  const serverActiveAfterSlot = serverState === 'active'
    && (!hasParseableSlot || syncedNowMs >= slotStartMs);

  return hasCountdownFinished || serverActiveAfterSlot;
}

export function resolveLinkedMatchPollingCadence({
  fastMatchStatusPollMs,
  idleMatchStatusPollMs,
  phase,
  shouldOpenArena,
}: {
  fastMatchStatusPollMs: number;
  idleMatchStatusPollMs: number;
  phase: PartyRunStartPhase;
  shouldOpenArena: boolean;
}) {
  if (phase === 'arming' || phase === 'readyAcked') {
    return {
      intervalMs: Math.min(fastMatchStatusPollMs, LINKED_MATCH_ARMING_POLL_MS),
      transitionReason: `${phase}-poll-in`,
    };
  }

  if (phase === 'countdown' || shouldOpenArena) {
    return {
      intervalMs: fastMatchStatusPollMs,
      transitionReason: `${phase}-handoff`,
    };
  }

  return {
    intervalMs: idleMatchStatusPollMs,
    transitionReason: 'linked-idle-sync',
  };
}

export function canOpenPartyRunLinkedMatch({
  room,
  currentUserId,
  nowMs,
}: {
  room: RunningMatchRoom;
  currentUserId: string;
  nowMs: number;
}) {
  if (!room.linkedMatchId) {
    return false;
  }

  const participant = room.participants.find((roomParticipant) => (
    roomParticipant.userId === currentUserId || roomParticipant.tag === currentUserId
  )) ?? null;
  const remainingSeconds = getMatchStartRemainingSeconds(
    room.linkedMatchSlotStartAt ?? room.slotStartAt,
    nowMs,
  );
  const flow = buildPartyRunFlowSnapshot({
    room,
    isCountdownReady: participant?.isCountdownReady,
    remainingSeconds,
    syncedNowMs: nowMs,
  });

  return flow.canOpenLinkedMatch;
}

function buildRoomLinkedMatchFocusKey(room: RunningMatchRoom) {
  return [
    room.roomId,
    room.linkedMatchId,
    room.state,
    room.linkedMatchSlotStartAt ?? room.slotStartAt,
  ].join(':');
}

export function useLinkedMatchSync({
  currentUserId,
  matchRoom,
  matchRoomFlow,
  visiblePartyRunFlow,
  roomLinkedMatchContext,
  roomCountdownRemainingSeconds,
  currentUserDoneWithLinkedMatch = false,
  duelMatchStatus,
  groupMatchStatus,
  focusedDuelMatchIdRef,
  focusedGroupMatchIdRef,
  livePagerRef,
  fastMatchStatusPollMs,
  idleMatchStatusPollMs,
  callbacksRef,
  enabled = true,
  navigationEnabled = true,
  pollingEnabled = true,
  upcomingRefreshEnabled = true,
}: LinkedMatchSyncInput) {
  const roomLinkedMatchAutoFocusRef = useRef<string | null>(null);
  const roomLinkedArenaPinRef = useRef<string | null>(null);
  const lastLinkedMatchSyncGateKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (enabled && currentUserDoneWithLinkedMatch) {
      callbacksRef.current.onForceOpenActiveMatchChange(false);
    }

    if (
      !enabled
      || !navigationEnabled
      || currentUserDoneWithLinkedMatch
      || !matchRoom?.linkedMatchId
      || !canOpenPartyRunLinkedMatch({
        room: matchRoom,
        currentUserId,
        nowMs: callbacksRef.current.getSyncedNowMs(),
      })
    ) {
      roomLinkedMatchAutoFocusRef.current = null;
      return;
    }

    const shouldPreferArena = matchRoomFlow.shouldPreferArena;
    const nextKey = buildRoomLinkedMatchFocusKey(matchRoom);
    const currentFocusedMatchId = matchRoom.mode === 'duel'
      ? duelMatchStatus?.matchId ?? focusedDuelMatchIdRef.current
      : groupMatchStatus?.matchId ?? focusedGroupMatchIdRef.current;
    const currentFocusedState = matchRoom.mode === 'duel'
      ? duelMatchStatus?.state
      : groupMatchStatus?.state;

    if (
      roomLinkedMatchAutoFocusRef.current === nextKey
      && currentFocusedMatchId === matchRoom.linkedMatchId
      && currentFocusedState === (matchRoom.linkedMatchStatus === 'active' ? 'active' : currentFocusedState)
    ) {
      return;
    }

    roomLinkedMatchAutoFocusRef.current = nextKey;
    rgPerfMark('live match navigation request', {
      matchId: matchRoom.linkedMatchId,
      mode: matchRoom.mode,
      preferArena: shouldPreferArena,
      roomId: matchRoom.roomId,
      source: 'room linked match sync',
    });
    void callbacksRef.current.focusRoomLinkedMatch(matchRoom, {
      preferArena: shouldPreferArena,
      source: 'room linked match sync',
    })
      .catch(() => {
        roomLinkedMatchAutoFocusRef.current = null;
      });
  }, [
    callbacksRef,
    currentUserId,
    currentUserDoneWithLinkedMatch,
    duelMatchStatus?.matchId,
    duelMatchStatus?.state,
    enabled,
    focusedDuelMatchIdRef,
    focusedGroupMatchIdRef,
    groupMatchStatus?.matchId,
    groupMatchStatus?.state,
    matchRoom?.linkedMatchId,
    matchRoom?.linkedMatchStatus,
    matchRoom?.linkedMatchSlotStartAt,
    matchRoom?.mode,
    matchRoom?.roomId,
    matchRoom?.slotStartAt,
    matchRoom?.state,
    matchRoomFlow.shouldPreferArena,
    navigationEnabled,
    roomCountdownRemainingSeconds,
  ]);

  useEffect(() => {
    const gateDetail = {
      enabled,
      hasRoomLinkedMatchContext: Boolean(roomLinkedMatchContext),
      matchId: roomLinkedMatchContext?.matchId ?? null,
      pollingEnabled,
    };
    const gateKey = JSON.stringify(gateDetail);
    if (lastLinkedMatchSyncGateKeyRef.current !== gateKey) {
      lastLinkedMatchSyncGateKeyRef.current = gateKey;
      rgDiagLog('linked match sync gate', gateDetail);
    }

    if (!enabled || !pollingEnabled || !roomLinkedMatchContext) {
      roomLinkedArenaPinRef.current = null;
      return undefined;
    }

    let canceled = false;

    const syncRoomLinkedMatch = async () => {
      try {
        const payload = await callbacksRef.current.syncRoomLinkedMatchStatus(roomLinkedMatchContext);

        if (canceled || !payload) {
          return;
        }

        callbacksRef.current.onMatchModeChange(roomLinkedMatchContext.mode);

        const syncedNowMs = callbacksRef.current.getSyncedNowMs();
        const slotStartMs = Date.parse(payload.slotStartAt);
        // The arena may still MOUNT under the countdown overlay at the ≤20s handoff window —
        // this only scrolls the proven arena page into place beneath the centered countdown,
        // it does NOT measure yet.
        const shouldPinArenaPage = shouldAutoOpenMatchArena(
          getMatchStartRemainingSeconds(payload.slotStartAt, syncedNowMs),
        );
        // The active/measuring TRANSITION must NOT be pre-empted before THIS phone's own
        // countdown has reached its slot — that is exactly what made the non-host skip the
        // countdown and jump to the arena. The naive `payload.state === 'active'` backstop is
        // NOT safe on its own here: the linked duel/group session is SHARED, so the backend
        // flips it to 'active' the instant ANY participant pushes live progress (the host
        // starting a beat early), which would yank the guest past their on-screen countdown.
        // resolveLinkedMatchActiveTransition gates the server-active signal on the slot being
        // reached, so it can never pre-empt the local countdown, while still acting as a
        // backstop at/after the slot (and as the sole signal when there is no parseable slot).
        const shouldTransitionToActive = resolveLinkedMatchActiveTransition({
          serverState: payload.state,
          slotStartMs,
          syncedNowMs,
        });

        if (!currentUserDoneWithLinkedMatch) {
          // Mount + scroll the arena page under the overlay during the handoff window (does not
          // start measuring). This is decoupled from the active transition below.
          if (shouldPinArenaPage) {
            const pinKey = [
              roomLinkedMatchContext.matchId,
              payload.slotStartAt,
              'arena-handoff',
            ].join(':');

            if (roomLinkedArenaPinRef.current !== pinKey) {
              roomLinkedArenaPinRef.current = pinKey;
              callbacksRef.current.onLiveArenaPageChange(0);
              livePagerRef.current?.scrollTo({ x: 0, animated: false });
            }
          }

          // Flip to active/measuring ONLY once the countdown has genuinely finished (or the
          // server says active) — never on the bare ≤20s pre-empt.
          if (shouldTransitionToActive) {
            // TEMPORARY DIAG (revert before ship): log the decisive values at the instant the
            // party-run linked sync opens the measuring arena for the guest. Reads ONLY values
            // already in this effect's closure (no new reactive deps), so it cannot alter the
            // polling/subscription behavior it is observing.
            pushLiveMatchDiagEvent('forceOpenActive=true', {
              src: 'useLinkedMatchSync',
              remaining: getMatchStartRemainingSeconds(payload.slotStartAt, syncedNowMs),
              ctxState: roomLinkedMatchContext?.state ?? null,
              mode: roomLinkedMatchContext?.mode ?? null,
              serverState: payload.state ?? null,
              slotStartAt: payload.slotStartAt,
              syncedNow: syncedNowMs,
            });
            callbacksRef.current.onForceOpenActiveMatchChange(true);
          }
        }
      } catch {
        // The room snapshot still keeps the arena open; retry on the next short poll.
      }
    };

    void syncRoomLinkedMatch();

    const { intervalMs, transitionReason } = resolveLinkedMatchPollingCadence({
      fastMatchStatusPollMs,
      idleMatchStatusPollMs,
      phase: visiblePartyRunFlow.phase,
      shouldOpenArena: visiblePartyRunFlow.shouldOpenArena,
    });
    const pollingKey = `match:${roomLinkedMatchContext.matchId}:linked-match-status`;
    const polling = startRgPollingInterval({
      intervalMs,
      key: pollingKey,
      label: 'linked match status polling',
      onTick: syncRoomLinkedMatch,
      detail: {
        intervalMs,
        matchId: roomLinkedMatchContext.matchId,
        mode: roomLinkedMatchContext.mode,
        owner: 'linked match status',
        reason: transitionReason,
        source: 'linked match status',
        state: roomLinkedMatchContext.state ?? null,
      },
    });

    if (!polling.acquired) {
      return () => {
        canceled = true;
      };
    }

    rgPerfMark('live match recovery polling started', {
      matchId: roomLinkedMatchContext.matchId,
      mode: roomLinkedMatchContext.mode,
      pollingKey,
      reason: transitionReason,
      source: 'linked match status',
      state: roomLinkedMatchContext.state ?? null,
    });
    rgPerfMark('match polling start', {
      intervalMs,
      matchId: roomLinkedMatchContext.matchId,
      owner: 'linked match status',
      pollingKey,
      reason: transitionReason,
      source: 'linked match status',
      state: roomLinkedMatchContext.state ?? null,
    });
    return () => {
      canceled = true;
      polling.stop();
    };
  }, [
    callbacksRef,
    currentUserDoneWithLinkedMatch,
    enabled,
    fastMatchStatusPollMs,
    idleMatchStatusPollMs,
    livePagerRef,
    pollingEnabled,
    roomLinkedMatchContext?.distanceKm,
    roomLinkedMatchContext?.matchId,
    roomLinkedMatchContext?.mode,
    roomLinkedMatchContext?.slotStartAt,
    roomLinkedMatchContext?.state,
    visiblePartyRunFlow.phase,
    visiblePartyRunFlow.shouldOpenArena,
  ]);

  useEffect(() => {
    if (!enabled || !upcomingRefreshEnabled) {
      return;
    }

    void callbacksRef.current.loadUpcomingMatches().catch(() => {});
  }, [callbacksRef, enabled, matchRoom?.linkedMatchId, matchRoom?.state, upcomingRefreshEnabled]);
}
