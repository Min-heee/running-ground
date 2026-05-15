import { useEffect } from 'react';
import type { RunningMatchRoom } from '@/lib/api/types';
import { rgPerfMark } from '@/utils/rgPerfTrace';
import type { OptimisticMatchRoomHydration } from '../optimisticRoomHydration';
import { shouldSuppressNoRoomStateDuringHydration } from './lobbyHydrationGuard';

export function useLobbyHydrationSuppressionTrace({
  optimisticRoomHydration,
  room,
}: {
  optimisticRoomHydration: OptimisticMatchRoomHydration | null;
  room: RunningMatchRoom | null;
}) {
  useEffect(() => {
    if (!shouldSuppressNoRoomStateDuringHydration({ optimisticRoomHydration, room })) {
      return;
    }

    rgPerfMark('lobby no-room state suppressed during hydration', {
      roomId: optimisticRoomHydration?.room.roomId ?? room?.roomId ?? null,
      source: optimisticRoomHydration?.source ?? 'unknown',
      state: optimisticRoomHydration?.room.state ?? room?.state ?? null,
    });
  }, [optimisticRoomHydration, room]);
}
