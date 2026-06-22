import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import type { RunningMatchStatusResponse } from '@/lib/api/types';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import type { PartyRunLinkedMatchContext } from '@/features/runs/types/matchStateMachine';
import {
  getBackgroundRunTrackingSnapshot,
  getBackgroundRunElapsedSeconds,
  subscribeBackgroundRunTracking,
} from '@/features/runs/tracking/background';
import {
  clearLiveCardMatchStatusHook,
  setLiveCardMatchStatusHook,
} from '@/features/runs/tracking/background/backgroundMatchProgressSync';
import {
  endLiveActivityForRun,
  startLiveActivityForRun,
  updateLiveActivityForMatch,
  updateLiveActivityForSolo,
  type LiveActivityRunContext,
} from '@/features/runs/liveActivity/liveActivityController';
import { isLiveActivityAvailable } from '../../../../modules/live-activity';

// Wires the iOS Live Activity (lock-screen live-run card + Dynamic Island) into the run/match
// lifecycle. OTA-SAFE + FIRE-AND-FORGET: every effect first checks isLiveActivityAvailable() (false
// on every current binary + always false on Android), so on production today this hook does
// nothing — it registers/clears module-level callbacks but every callback no-ops. It NEVER awaits,
// NEVER mutates the bg-sync promise / throttle / inflight guards, and NEVER throws into the run
// flow (the controller swallows). iOS-only.

// The runtime's linked-match ref. Typed as the shared PartyRunLinkedMatchContext so the runtime can
// pass its own ref directly (MutableRefObject is invariant — a structural subtype would not assign).
type RoomLinkedMatchContextLike = PartyRunLinkedMatchContext | null;

export type UseLiveActivityBridgeInput = {
  isRunning: boolean;
  matchMode: RunMatchMode;
  // Display name for the current user on the match rank bar.
  myName: string;
  // Per-mode goal distances (the match target / solo goal). Solo with no goal passes undefined.
  duelDistanceKm: number;
  groupDistanceKm: number;
  soloGoalDistanceKm?: number;
  // Live "me" metrics, refreshed by the tracking session (used for the match board's "me" row).
  distanceKm: number;
  elapsedSecondsRef: MutableRefObject<number>;
  // Active match status refs (for the active matchId + slotStartAt = the run's official start).
  duelMatchStatusRef: MutableRefObject<RunningMatchStatusResponse | null>;
  groupMatchStatusRef: MutableRefObject<RunningMatchStatusResponse | null>;
  roomLinkedMatchContextRef: MutableRefObject<RoomLinkedMatchContextLike>;
};

function resolveActiveMatch(
  matchMode: RunMatchMode,
  duelMatchStatusRef: MutableRefObject<RunningMatchStatusResponse | null>,
  groupMatchStatusRef: MutableRefObject<RunningMatchStatusResponse | null>,
  roomLinkedMatchContextRef: MutableRefObject<RoomLinkedMatchContextLike>,
): { matchId: string; slotStartAt: string } | null {
  const roomLinked = roomLinkedMatchContextRef.current;
  if (roomLinked && roomLinked.mode === matchMode) {
    return { matchId: roomLinked.matchId, slotStartAt: roomLinked.slotStartAt };
  }
  const status = matchMode === 'group' ? groupMatchStatusRef.current : duelMatchStatusRef.current;
  if (status?.matchId) {
    return { matchId: status.matchId, slotStartAt: status.slotStartAt };
  }
  return null;
}

export function useLiveActivityBridge({
  isRunning,
  matchMode,
  myName,
  duelDistanceKm,
  groupDistanceKm,
  soloGoalDistanceKm,
  distanceKm,
  elapsedSecondsRef,
  duelMatchStatusRef,
  groupMatchStatusRef,
  roomLinkedMatchContextRef,
}: UseLiveActivityBridgeInput) {
  // All inputs the fire-and-forget callbacks read flow through this ref so the registered hooks /
  // snapshot listener never close over stale values (mirrors the runtime's applier-ref pattern).
  const inputRef = useRef({
    matchMode,
    myName,
    duelDistanceKm,
    groupDistanceKm,
    soloGoalDistanceKm,
    distanceKm,
    elapsedSecondsRef,
    duelMatchStatusRef,
    groupMatchStatusRef,
    roomLinkedMatchContextRef,
  });
  inputRef.current = {
    matchMode,
    myName,
    duelDistanceKm,
    groupDistanceKm,
    soloGoalDistanceKm,
    distanceKm,
    elapsedSecondsRef,
    duelMatchStatusRef,
    groupMatchStatusRef,
    roomLinkedMatchContextRef,
  };

  // Build the static run context from the CURRENT inputs. Reads refs so the active matchId /
  // slotStartAt are always fresh.
  const buildRunContext = (): LiveActivityRunContext | null => {
    const input = inputRef.current;
    const mode: LiveActivityRunContext['mode'] = input.matchMode === 'solo'
      ? 'solo'
      : input.matchMode === 'group'
        ? 'group'
        : 'duel';

    if (mode === 'solo') {
      const snapshot = getBackgroundRunTrackingSnapshot({ cloneRoute: false });
      if (!snapshot.startedAt) {
        return null;
      }
      return {
        mode: 'solo',
        goalDistanceKm: input.soloGoalDistanceKm,
        startedAt: snapshot.startedAt,
        myName: input.myName,
      };
    }

    const active = resolveActiveMatch(
      input.matchMode,
      input.duelMatchStatusRef,
      input.groupMatchStatusRef,
      input.roomLinkedMatchContextRef,
    );
    if (!active) {
      return null;
    }
    return {
      mode,
      matchId: active.matchId,
      goalDistanceKm: mode === 'group' ? input.groupDistanceKm : input.duelDistanceKm,
      startedAt: active.slotStartAt,
      myName: input.myName,
    };
  };

  // Run start/end + per-run subscriptions. Re-runs when isRunning flips. Every body no-ops on
  // current binaries via isLiveActivityAvailable().
  useEffect(() => {
    if (!isRunning || !isLiveActivityAvailable()) {
      return undefined;
    }

    const context = buildRunContext();
    if (!context) {
      return undefined;
    }

    startLiveActivityForRun(context, {
      distanceKm: inputRef.current.distanceKm,
      elapsedSeconds: inputRef.current.elapsedSecondsRef.current,
    });

    // MATCH path: register the fire-and-forget bg-flush hook so every background match status
    // response (the only POST while the screen is off) refreshes the card WITHOUT a JS timer.
    const matchStatusHook = (status: RunningMatchStatusResponse) => {
      const liveContext = buildRunContext();
      if (!liveContext || liveContext.mode === 'solo') {
        return;
      }
      const snapshot = getBackgroundRunTrackingSnapshot({ cloneRoute: false });
      updateLiveActivityForMatch(liveContext, status, {
        distanceKm: snapshot.distanceKm,
        elapsedSeconds: Math.max(
          inputRef.current.elapsedSecondsRef.current,
          getBackgroundRunElapsedSeconds(snapshot),
        ),
      });
    };
    setLiveCardMatchStatusHook(matchStatusHook);

    // SOLO path (and a foreground match fallback): refresh the card on each tracking snapshot
    // commit. Fire-and-forget; the controller no-ops until a start + native ship.
    const unsubscribe = subscribeBackgroundRunTracking((snapshot) => {
      const liveContext = buildRunContext();
      if (!liveContext) {
        return;
      }
      if (liveContext.mode === 'solo') {
        updateLiveActivityForSolo(liveContext, {
          distanceKm: snapshot.distanceKm,
          elapsedSeconds: Math.max(
            inputRef.current.elapsedSecondsRef.current,
            getBackgroundRunElapsedSeconds(snapshot),
          ),
        });
      }
    }, { cloneRoute: false });

    return () => {
      clearLiveCardMatchStatusHook(matchStatusHook);
      unsubscribe();
      // End + dismiss the card when the run stops (isRunning → false) or this component unmounts.
      endLiveActivityForRun();
    };
  }, [isRunning]);
}
