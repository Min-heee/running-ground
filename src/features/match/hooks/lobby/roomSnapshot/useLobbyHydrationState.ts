import { useCallback, useRef, useState } from 'react';
import type { RunningMatchRoom } from '@/lib/api/types';
import {
  consumeOptimisticMatchRoomHydration,
} from '@/features/match/hooks/lobby/optimisticRoomHydration';
import { isMatchRoomDeleted } from '@/features/runs/lifecycle/matchRoomDeletionTombstone';
import {
  parseServerNowMs,
  resolveStableServerClockOffset,
} from '@/features/runs/sync/serverClockSync';
import { buildRoomRenderKey } from '@/features/match/hooks/lobby/roomSnapshot/roomSnapshotKeys';
import { rgPerfMark } from '@/utils/rgPerfTrace';

export function useLobbyHydrationState() {
  const [optimisticRoomHydration] = useState(() => consumeOptimisticMatchRoomHydration());
  const initialOptimisticRoom = optimisticRoomHydration?.room ?? null;
  const initialOptimisticServerNowMs = parseServerNowMs(optimisticRoomHydration?.serverNow) ?? 0;
  const latestRoomServerNowMsRef = useRef(initialOptimisticServerNowMs);
  const roomRenderKeyRef = useRef<string | null>(
    initialOptimisticRoom ? buildRoomRenderKey(initialOptimisticRoom) : null,
  );
  const roomRef = useRef<RunningMatchRoom | null>(initialOptimisticRoom);
  const optimisticRouteKeyLoggedRef = useRef(false);

  const [room, setRoom] = useState<RunningMatchRoom | null>(initialOptimisticRoom);
  const [loading, setLoading] = useState(!initialOptimisticRoom);
  const [serverClockOffsetMs, setServerClockOffsetMs] = useState(
    initialOptimisticServerNowMs ? initialOptimisticServerNowMs - Date.now() : 0,
  );

  const syncServerClock = useCallback((serverNow?: string) => {
    const serverNowMs = parseServerNowMs(serverNow);
    if (serverNowMs === null) {
      return;
    }

    const nextOffsetMs = serverNowMs - Date.now();
    setServerClockOffsetMs((currentOffsetMs) => resolveStableServerClockOffset(currentOffsetMs, nextOffsetMs));
  }, []);

  const commitRoom = useCallback((nextRoom: RunningMatchRoom | null) => {
    const committedRoom = isMatchRoomDeleted(nextRoom?.roomId) ? null : nextRoom;
    if (nextRoom?.roomId && !committedRoom) {
      rgPerfMark('room hydrate skipped deleted room', {
        roomId: nextRoom.roomId,
        source: 'match-room lobby commit',
        state: nextRoom.state,
      });
    }

    const nextKey = buildRoomRenderKey(committedRoom);
    if (roomRenderKeyRef.current === nextKey) {
      return;
    }

    roomRenderKeyRef.current = nextKey;
    roomRef.current = committedRoom;
    setRoom(committedRoom);
  }, []);

  return {
    commitRoom,
    latestRoomServerNowMsRef,
    loading,
    optimisticRoomHydration,
    optimisticRouteKeyLoggedRef,
    room,
    roomRef,
    serverClockOffsetMs,
    setLoading,
    syncServerClock,
  };
}
