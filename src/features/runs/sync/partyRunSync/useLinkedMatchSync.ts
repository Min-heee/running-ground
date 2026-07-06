import { useEffect, useRef } from 'react';
import { armBlockingMatchStatusPollRetry } from '@/features/runs/sync/matchPolling/useBlockingMatchStatusPolling';
import type { RunningMatchRoom, RunningMatchState } from '@/lib/api/types';
import { getMatchStartRemainingSeconds, shouldAutoOpenMatchArena } from '@/lib/matchCountdown';
import { buildPartyRunFlowSnapshot } from '@/features/runs/lifecycle/matchStateMachine';
import type { PartyRunStartPhase } from '@/features/runs/types/matchStateMachine';
import { rgDiagLog, rgPerfMark } from '@/utils/rgPerfTrace';
import { startRgPollingInterval } from '@/utils/rgPollingRegistry';
import type { LinkedMatchSyncInput } from './types';

export const LINKED_MATCH_ARMING_POLL_MS = 1000;

// A room slot this far in the future (or nearer) is treated as already-delivered, so the
// one-shot re-fetch below stays idle. Generous enough to cover any real countdown slot
// (party ~18s, matched ~30s) yet exclude a missing/stale/far-future room slot.
export const ROOM_SLOT_REFETCH_AHEAD_MS = 600_000;

// Minimum gap between keep-fresh /rooms/my re-fetches while the guest lacks an in-window slot.
// Bounds the re-fetch rate (the linked-status poll itself ticks faster) and stops entirely once
// a fresh slot lands — so a re-stamped slot reaches the guest within ~one of these windows.
export const ROOM_SLOT_REFETCH_THROTTLE_MS = 1500;

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
  // KEEP-FRESH room slot delivery (the party slot fix). Host-start stamps the authoritative
  // party slot (linkedMatchSlotStartAt) into /rooms/my, but the guest stops polling /rooms/my
  // the instant the room links — so a stale snapshot (the slot never delivered, OR RE-STAMPED by
  // a host re-start) leaves the countdown entering late / only flashing at the end. The always-on
  // linked-status poll below re-fetches /rooms/my (THROTTLED) whenever this guest has a linked
  // match but no in-window room slot, pulling the CURRENT slot within ~1 poll. It rides the
  // existing ~1s linked-status cadence (no new timer) and is bounded by the throttle + the
  // has-fresh-slot gate, so it cannot churn the matchRoom identity render-after-render (the churn
  // that — together with the now-fixed openKey oscillation — drove the Maximum-update-depth loop).
  // A no-op refetch is deduped by the loader snapshot key.
  const matchRoomRef = useRef(matchRoom);
  matchRoomRef.current = matchRoom;
  const lastRoomSlotRefetchSyncedNowMsRef = useRef(0);

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

        // KEEP-FRESH: if this guest has a linked match but its current room snapshot carries no
        // in-window slot (the slot was never delivered post-link, or was RE-STAMPED by a host
        // re-start), pull a fresh /rooms/my so the current slot reaches the countdown within ~one
        // throttle window instead of arriving at the last second. Throttled, and skipped the
        // moment a fresh in-window slot is present — a brief burst, never a steady churn.
        const liveRoom = matchRoomRef.current;
        if (liveRoom?.linkedMatchId && !canceled) {
          const roomSlotMs = Date.parse(liveRoom.linkedMatchSlotStartAt ?? liveRoom.slotStartAt ?? '');
          const roomSlotAheadMs = roomSlotMs - syncedNowMs;
          const roomSlotInWindow = Number.isFinite(roomSlotMs)
            && roomSlotAheadMs > 0
            && roomSlotAheadMs <= ROOM_SLOT_REFETCH_AHEAD_MS;
          if (
            !roomSlotInWindow
            && syncedNowMs - lastRoomSlotRefetchSyncedNowMsRef.current >= ROOM_SLOT_REFETCH_THROTTLE_MS
          ) {
            lastRoomSlotRefetchSyncedNowMsRef.current = syncedNowMs;
            void callbacksRef.current.loadMatchRoom().catch(() => {});
          }
        }

        // The arena may still MOUNT under the countdown overlay at the ≤20s handoff window —
        // this only scrolls the proven arena page into place beneath the centered countdown,
        // it does NOT measure yet.
        const shouldPinArenaPage = shouldAutoOpenMatchArena(
          getMatchStartRemainingSeconds(payload.slotStartAt, syncedNowMs),
        );

        if (!currentUserDoneWithLinkedMatch) {
          // Mount + scroll the arena page under the overlay during the handoff window (does not
          // start measuring).
          //
          // STAGE 3 (clean core): the force-open flag is now owned solely by
          // useSlotGatedArenaOpen, which gates on the slot fact (syncedNow>=slot, or
          // serverActive corroborating at/after the slot) — equivalent to
          // resolveLinkedMatchActiveTransition, folded into the single owner. This sync still
          // drives polling cadence + the arena-handoff page pin below; it no longer flips the
          // flag, so it can never pre-empt the guest's countdown.
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
      // Opponent-poll stall fix (docs/opponent-poll-stall-diag-2026-07-06.md) — organ-3 un-latch.
      // A lost acquire used to return a cancel-only cleanup, and every dep of this effect is
      // stable during a stable active match, so the linked poll stayed permanently dead until
      // match end (a zombie runtime instance owning the key starves the visible one). Same df02afc
      // retry seam as the blocking/party-room organs: re-attempt the SAME startRgPollingInterval
      // invocation (identical args) every intervalMs; on re-acquire mark + fire ONE catch-up
      // syncRoomLinkedMatch and hold the real handle. Cleanup stops whichever is live (retry timer
      // or acquired poll handle). The acquired/success path below is untouched.
      rgPerfMark('linked match polling lost acquire', {
        activeOwnerId: polling.ownerId,
        intervalMs,
        matchId: roomLinkedMatchContext.matchId,
        mode: roomLinkedMatchContext.mode,
        pollingKey,
        reason: transitionReason,
        source: 'linked match status',
        state: roomLinkedMatchContext.state ?? null,
      });
      const retry = armBlockingMatchStatusPollRetry({
        intervalMs,
        onReacquired: (handle) => {
          rgPerfMark('linked match polling reacquired after retry', {
            intervalMs,
            matchId: roomLinkedMatchContext.matchId,
            mode: roomLinkedMatchContext.mode,
            ownerId: handle.ownerId,
            pollingKey,
            source: 'linked match status',
          });
        },
        onTick: syncRoomLinkedMatch,
        startPolling: () => startRgPollingInterval({
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
        }),
      });
      return () => {
        canceled = true;
        retry.stop();
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
