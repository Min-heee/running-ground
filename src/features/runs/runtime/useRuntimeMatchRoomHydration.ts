import { useEffect, useRef } from 'react';
import type { RunningMatchRoom } from '@/lib/api/types';
import type { LiveMatchRouteHydration } from '@/features/runs/lifecycle/liveMatchRouteHydration';
import { rgPerfMark } from '@/utils/rgPerfTrace';

type UseLiveMatchRouteRoomHydrationInput = {
  commitMatchRoom: (nextRoom: RunningMatchRoom | null) => void;
  liveMatchRouteHydration: LiveMatchRouteHydration | null;
};

export function useRuntimeMatchRoomHydration({
  commitMatchRoom,
  liveMatchRouteHydration,
}: UseLiveMatchRouteRoomHydrationInput) {
  const committedRouteRoomKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const hydratedRoom = liveMatchRouteHydration?.room;
    if (!liveMatchRouteHydration || !hydratedRoom?.roomId) {
      return;
    }

    const commitKey = [
      liveMatchRouteHydration.nonce,
      hydratedRoom.roomId,
      hydratedRoom.state,
      hydratedRoom.linkedMatchId ?? 'no-match',
      hydratedRoom.linkedMatchStatus ?? 'no-status',
      hydratedRoom.linkedMatchSlotStartAt ?? hydratedRoom.slotStartAt,
    ].join(':');
    if (committedRouteRoomKeyRef.current === commitKey) {
      return;
    }

    committedRouteRoomKeyRef.current = commitKey;
    rgPerfMark('live match route room committed to runtime', {
      linkedMatchId: hydratedRoom.linkedMatchId ?? null,
      roomId: hydratedRoom.roomId,
      source: liveMatchRouteHydration.source ?? 'live match route hydration',
      state: hydratedRoom.state,
    });
    commitMatchRoom(hydratedRoom);
  }, [
    commitMatchRoom,
    liveMatchRouteHydration,
  ]);
}
