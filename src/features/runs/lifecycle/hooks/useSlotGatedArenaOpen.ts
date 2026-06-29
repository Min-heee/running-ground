import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { ScrollView } from 'react-native';
import { resolveActiveMatchSlot } from '@/features/runs/lifecycle/liveMatchSlot';
// TEMPORARY DIAG (revert before ship): observe-only event log for the arena-open skip.
import { pushLiveMatchDiagEvent } from '@/features/runs/runtime/liveMatchDiagStore';

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 3 (clean core) — the SINGLE slot-gated arena force-open. This is the ONLY
// place that flips forceOpenActiveMatch ON for a live match. The gate is the one
// fact the whole rewrite turns on:
//
//   syncedNow >= slot  ||  (serverActive && slotPassed)  ||  routeForceMatchArena
//
// so the measuring arena can NEVER force-open while the countdown is still running.
// The pre-slot navigation paths (useActiveArenaPinEffect, navExecutor, navOwner's
// promoteLiveArena, useMatchEntryEffects, useLinkedMatchSync) may still MOUNT and
// SCROLL the arena page under the countdown overlay — they just no longer flip the
// force-open flag pre-slot. serverActive only corroborates AT/after the slot; it can
// never pre-empt. The explicit route force (forceMatchArena) is the one bypass: an
// intentional user navigation into a live match opens it immediately.
//
// O(1)/client: one server slot + one synced-now scalar, no peer math — scales to 30+.
// ─────────────────────────────────────────────────────────────────────────────

type SlotGatedArenaOpenMatch = {
  matchId?: string | null;
  slotStartAt?: string | null;
  // The server-reported live state. With the Stage-2 backend gate this is already
  // 'active' only at/after the slot, so it is pure corroboration here.
  state?: 'waiting' | 'matched' | 'active' | 'idle' | null;
};

type SlotGatedArenaOpenRoomContext = {
  matchId?: string | null;
  slotStartAt?: string | null;
  state?: 'matched' | 'active' | null;
} | null;

type UseSlotGatedArenaOpenInput = {
  // Whether this runtime is currently focused on a live (duel/group/room) match.
  enabled: boolean;
  matchMode: 'solo' | 'duel' | 'group' | 'room';
  duelMatch: SlotGatedArenaOpenMatch | null;
  groupMatch: SlotGatedArenaOpenMatch | null;
  roomLinkedMatchContext: SlotGatedArenaOpenRoomContext;
  // The explicit route force (forceMatchArena / a route-hydration preferArena). When
  // true the arena opens immediately, bypassing the slot gate — an intentional nav.
  routeForceMatchArena: boolean;
  // The live synced clock (Date.now()+offset). Passed as a reactive dep so the effect
  // re-evaluates as the clock advances and fires the instant it crosses the slot.
  syncedNowMs: number;
  forceOpenActiveMatch: boolean;
  onForceOpenActiveMatchChange: (value: boolean) => void;
  onLiveArenaPageChange: (page: number) => void;
  livePagerRef: RefObject<ScrollView | null>;
};

export function resolveSlotGatedArenaOpen({
  slotStartMs,
  syncedNowMs,
  serverActive,
  routeForceMatchArena,
}: {
  slotStartMs: number | null;
  syncedNowMs: number;
  serverActive: boolean;
  routeForceMatchArena: boolean;
}): boolean {
  if (routeForceMatchArena) {
    return true;
  }

  if (slotStartMs === null) {
    // No parseable slot: serverActive is the only signal (a re-join into an already-
    // running match whose slot is unknown).
    return serverActive;
  }

  // syncedNow>=slot opens; serverActive may corroborate but ONLY at/after the slot,
  // so it can never pre-empt a running countdown (the skip this rewrite removes). With
  // a parseable slot this reduces to slotPassed — serverActive matters only when the
  // slot is unknown (handled above).
  const slotPassed = syncedNowMs >= slotStartMs;
  return slotPassed || (serverActive && slotPassed);
}

export function useSlotGatedArenaOpen({
  enabled,
  matchMode,
  duelMatch,
  groupMatch,
  roomLinkedMatchContext,
  routeForceMatchArena,
  syncedNowMs,
  forceOpenActiveMatch,
  onForceOpenActiveMatchChange,
  onLiveArenaPageChange,
  livePagerRef,
}: UseSlotGatedArenaOpenInput) {
  // Fire the force-open at most once per (matchId:slot) — and re-allow a fresh open
  // for a re-queued match (new slot ⇒ new key). A bare boolean would re-fire every
  // render the gate is open.
  const openedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    // Pick THIS match's slot via the pure core, in the same priority order the
    // countdown uses: room linked slot → direct duel/group match.
    const directMatch = matchMode === 'duel' ? duelMatch : matchMode === 'group' ? groupMatch : null;
    const slot = resolveActiveMatchSlot({
      room: roomLinkedMatchContext
        ? {
            linkedMatchId: roomLinkedMatchContext.matchId,
            linkedMatchSlotStartAt: roomLinkedMatchContext.slotStartAt,
          }
        : null,
      directMatch: directMatch
        ? { matchId: directMatch.matchId, slotStartAt: directMatch.slotStartAt }
        : null,
    });

    const serverActive = Boolean(
      roomLinkedMatchContext?.state === 'active'
      || directMatch?.state === 'active',
    );
    const slotStartMs = slot?.slotStartMs ?? null;

    const shouldOpen = resolveSlotGatedArenaOpen({
      slotStartMs,
      syncedNowMs,
      serverActive,
      routeForceMatchArena,
    });

    if (!shouldOpen) {
      return;
    }

    const openKey = routeForceMatchArena
      ? `route:${slot?.matchId ?? directMatch?.matchId ?? roomLinkedMatchContext?.matchId ?? 'live'}`
      : `${slot?.matchId ?? 'live'}:${slotStartMs ?? 'no-slot'}`;
    if (openedKeyRef.current === openKey && forceOpenActiveMatch) {
      return;
    }
    openedKeyRef.current = openKey;

    // TEMPORARY DIAG (revert before ship): log the SINGLE slot-gated force-open with
    // the decisive values — this should never appear with remaining>0.
    pushLiveMatchDiagEvent('forceOpenActive=true', {
      src: 'useSlotGatedArenaOpen',
      matchId: slot?.matchId ?? directMatch?.matchId ?? null,
      slotStartMs: slotStartMs ?? null,
      syncedNow: syncedNowMs,
      remaining: slotStartMs !== null ? Math.ceil((slotStartMs - syncedNowMs) / 1000) : null,
      serverActive,
      routeForce: routeForceMatchArena,
    });
    onForceOpenActiveMatchChange(true);
    onLiveArenaPageChange(0);
    livePagerRef.current?.scrollTo({ x: 0, animated: false });
  }, [
    duelMatch,
    enabled,
    forceOpenActiveMatch,
    groupMatch,
    livePagerRef,
    matchMode,
    onForceOpenActiveMatchChange,
    onLiveArenaPageChange,
    roomLinkedMatchContext,
    routeForceMatchArena,
    syncedNowMs,
  ]);
}
