import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { getLastActiveRoomCheck } from '@/features/runs/sync/activeRoomCheckRequestRegistry';
import type { RunningMatchRoom } from '@/lib/api/types';
import { rgPerfMark } from '@/utils/rgPerfTrace';
import {
  ROOM_SNAPSHOT_LIFELINE_INTERVAL_MS,
  shouldForceRoomSnapshotLifelineLoad,
} from './roomSnapshotLifelineDecision';

// Room-snapshot lifeline (docs/lobby-room-poll-latch-diag-2026-07-06.md, Piece 2) — the
// registry-free guarantee that a waiting guest's /rooms/my channel can never silently die. The
// lobby's regular poller runs through a single-shot keyed-slot registry whose lose-path (even
// with the Piece 1 retry) plus interaction/debounce starvation can leave the guest blind to the
// host-start; this hook is a plain 3s setInterval (NOT the registry — it cannot be latched) that
// reads ONLY refs each tick, so neither render starvation nor a lost registry acquire can silence
// it. When no completed 'match-room snapshot' active-room check has landed for >6s while the
// lobby is mounted + focused + unpaused and the room has NO linkedMatchId yet (once the guest
// knows the linked match, the lifeline goes silent), it forces ONE guarded loadRoom() through the
// same fetcher funnel every other lobby load uses. Healthy steady state: the normal poller keeps
// the stamp fresh, every tick no-ops — zero added requests, and the hook never sets state, so
// zero added renders.
export function useRoomSnapshotLifeline({
  loadRoom,
  mountedRef,
  pollingPausedRef,
  roomRef,
  screenFocusedRef,
}: {
  loadRoom: () => Promise<RunningMatchRoom | null>;
  mountedRef: MutableRefObject<boolean>;
  pollingPausedRef: MutableRefObject<boolean>;
  roomRef: MutableRefObject<RunningMatchRoom | null>;
  screenFocusedRef: MutableRefObject<boolean>;
}) {
  // Per-render-refreshed loader ref (same pattern as the opponent-sync lifeline's loadersRef):
  // the timer must read the freshest loadRoom closure through a ref instead of re-subscribing the
  // effect every time the fetcher identity changes.
  const loadRoomRef = useRef(loadRoom);
  loadRoomRef.current = loadRoom;
  const lifelineLoadInFlightRef = useRef(false);

  useEffect(() => {
    const timer = setInterval(() => {
      const lastCheck = getLastActiveRoomCheck('match-room snapshot');
      const nowMs = Date.now();
      if (!shouldForceRoomSnapshotLifelineLoad({
        focused: screenFocusedRef.current,
        hasLinkedMatch: Boolean(roomRef.current?.linkedMatchId),
        inFlight: lifelineLoadInFlightRef.current,
        lastCheckMs: lastCheck?.completedAtMs ?? null,
        mounted: mountedRef.current,
        nowMs,
        paused: pollingPausedRef.current,
      })) {
        return;
      }

      rgPerfMark('room snapshot lifeline forced', {
        roomId: roomRef.current?.roomId ?? null,
        sinceLastCheckMs: lastCheck ? nowMs - lastCheck.completedAtMs : null,
        source: 'match-room snapshot',
      });
      lifelineLoadInFlightRef.current = true;
      // Bare call through the normal fetcher: it self-gates on the paused/focus refs and every
      // apply passes the existing monotonic/tombstone/dedup guards, so a redundant fire is a
      // cheap no-op.
      void loadRoomRef.current()
        .catch(() => {})
        .finally(() => {
          lifelineLoadInFlightRef.current = false;
        });
    }, ROOM_SNAPSHOT_LIFELINE_INTERVAL_MS);

    return () => {
      clearInterval(timer);
    };
  }, [mountedRef, pollingPausedRef, roomRef, screenFocusedRef]);
}
