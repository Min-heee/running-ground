import { useCallback } from 'react';
import type { RunningMatchRoom } from '@/lib/api/types';
import type { FocusRunningMatchInput } from '@/features/runs/lifecycle/hooks/runningMatchFocus/types';
import type { LiveMatchNavigationResult } from '@/features/runs/lifecycle/liveMatchNavigationGate';

type UseActiveRoomRecoveryInput = {
  focusRunningMatch: (input: FocusRunningMatchInput) => Promise<LiveMatchNavigationResult>;
};

export function useActiveRoomRecovery({
  focusRunningMatch,
}: UseActiveRoomRecoveryInput) {
  const focusRoomLinkedMatch = useCallback(async (room: RunningMatchRoom, options?: { preferArena?: boolean; source?: string }) => {
    if (!room.linkedMatchId) {
      return null;
    }

    return focusRunningMatch({
      mode: room.mode,
      matchId: room.linkedMatchId ?? undefined,
      distanceKm: room.linkedMatchDistanceKm ?? room.distanceKm,
      slotStartAt: room.linkedMatchSlotStartAt ?? room.slotStartAt,
      isTestMatch: false,
      preferArena: Boolean(options?.preferArena),
      roomId: room.roomId,
      roomState: room.state,
      source: options?.source ?? 'room linked match sync',
    });
  }, [focusRunningMatch]);

  return {
    focusRoomLinkedMatch,
  };
}
